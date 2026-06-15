import test from "node:test";
import assert from "node:assert/strict";
import { computePullDiff, summarizePullDiff, applyPullUpdates } from "./coursePull";
import { hashCourseItem } from "./courseFork";
import { AppDataSource } from "../../data-source";
import { CourseAssignment } from "../../entities/CourseAssignment";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem } from "../../entities/CourseItem";
import { EduTask } from "../../entities/EduTask";
import { EduLesson } from "../../entities/EduLesson";

// Build an upstream course item and its fork-time origin entry.
function item(id: number, content: Record<string, unknown>, title = "T") {
  return { id, kind: "CODE_TASK" as const, title, content };
}

test("UNCHANGED when neither upstream nor local changed", () => {
  const up = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(up), localHash: "L1", eduTaskId: 1 } };
  const entries = computePullDiff(origin, [up], [{ sourceItemId: 10, localHash: "L1", title: "T" }]);
  assert.equal(entries[0].status, "UNCHANGED");
});

test("TEMPLATE_UPDATED when upstream changed, local intact", () => {
  const forked = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(forked), localHash: "L1", eduTaskId: 1 } };
  const upstreamNow = item(10, { template: "b" }); // changed
  const entries = computePullDiff(origin, [upstreamNow], [{ sourceItemId: 10, localHash: "L1", title: "T" }]);
  assert.equal(entries[0].status, "TEMPLATE_UPDATED");
});

test("LOCALLY_MODIFIED when local changed, upstream intact", () => {
  const up = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(up), localHash: "L1", eduTaskId: 1 } };
  const entries = computePullDiff(origin, [up], [{ sourceItemId: 10, localHash: "L2", title: "T" }]);
  assert.equal(entries[0].status, "LOCALLY_MODIFIED");
});

test("CONFLICT when both changed", () => {
  const forked = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(forked), localHash: "L1", eduTaskId: 1 } };
  const upstreamNow = item(10, { template: "b" });
  const entries = computePullDiff(origin, [upstreamNow], [{ sourceItemId: 10, localHash: "L2", title: "T" }]);
  assert.equal(entries[0].status, "CONFLICT");
});

test("REMOVED_UPSTREAM when the item is gone from the template", () => {
  const forked = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(forked), localHash: "L1", eduTaskId: 1 } };
  const entries = computePullDiff(origin, [], [{ sourceItemId: 10, localHash: "L1", title: "Old" }]);
  assert.equal(entries[0].status, "REMOVED_UPSTREAM");
});

test("NEW_UPSTREAM when an item was added after the fork", () => {
  const existing = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(existing), localHash: "L1", eduTaskId: 1 } };
  const added = item(20, { template: "z" }, "New");
  const entries = computePullDiff(origin, [existing, added], [{ sourceItemId: 10, localHash: "L1", title: "T" }]);
  const newEntry = entries.find((e) => e.sourceItemId === 20);
  assert.equal(newEntry?.status, "NEW_UPSTREAM");
});

test("a deleted-local EduTask counts as locally modified", () => {
  const up = item(10, { template: "a" });
  const origin = { "10": { sourceHash: hashCourseItem(up), localHash: "L1", eduTaskId: 1 } };
  const entries = computePullDiff(origin, [up], [{ sourceItemId: 10, localHash: null, title: null }]);
  assert.equal(entries[0].status, "LOCALLY_MODIFIED");
});

/**
 * Stub harness for applyPullUpdates: dispatches getRepository by entity for the
 * pre-tx reads, and a transaction whose manager dispatches EduTask/assignment.
 */
function makeHarness(opts: {
  assignment: any;
  modules: any[];
  itemsByModule: Record<number, any[]>;
  task: any;
}) {
  const savedTasks: any[] = [];
  let savedAssignment: any = null;

  const baseRepo = (entity: unknown): any => {
    if (entity === CourseAssignment) return { findOne: async () => opts.assignment };
    if (entity === CourseModule) return { find: async () => opts.modules };
    if (entity === CourseItem) {
      return {
        find: async (q: any) => opts.itemsByModule[q.where.module.id] ?? []
      };
    }
    throw new Error("unexpected entity (pre-tx)");
  };

  const createdLessons: any[] = [];
  let lessonSeq = 900;
  const managerRepo = (entity: unknown): any => {
    if (entity === EduTask) {
      return {
        findOne: async () => opts.task,
        create: (t: any) => t,
        save: async (t: any) => {
          if (t.id == null) t.id = 500 + savedTasks.length;
          savedTasks.push({ ...t });
          return t;
        }
      };
    }
    if (entity === EduLesson) {
      return {
        create: (l: any) => l,
        save: async (l: any) => {
          l.id = ++lessonSeq;
          createdLessons.push({ ...l });
          return l;
        }
      };
    }
    if (entity === CourseAssignment) {
      return {
        save: async (a: any) => {
          savedAssignment = a;
          return a;
        }
      };
    }
    throw new Error("unexpected entity (tx)");
  };

  const orig = {
    getRepository: AppDataSource.getRepository.bind(AppDataSource),
    transaction: (AppDataSource as any).transaction.bind(AppDataSource)
  };
  (AppDataSource as any).getRepository = baseRepo;
  (AppDataSource as any).transaction = async (fn: any) => fn({ getRepository: managerRepo });

  return {
    restore() {
      (AppDataSource as any).getRepository = orig.getRepository;
      (AppDataSource as any).transaction = orig.transaction;
    },
    get savedTasks() {
      return savedTasks;
    },
    get savedAssignment() {
      return savedAssignment;
    },
    get createdLessons() {
      return createdLessons;
    }
  };
}

test("applyPullUpdates overwrites a task when upstream changed and updates origin", async () => {
  const forked = item(10, { description: "old", template: "a" });
  const upstreamNow = { ...item(10, { description: "new", template: "b" }), kind: "CODE_TASK" };
  const assignment: any = {
    class: { organizationId: 1 },
    courseId: 5,
    originMap: { "10": { sourceHash: hashCourseItem(forked), localHash: "L1", eduTaskId: 100 } }
  };
  const task: any = { id: 100, title: "T", description: "old", template: "a", taskMode: "CODE" };

  const h = makeHarness({
    assignment,
    modules: [{ id: 1 }],
    itemsByModule: { 1: [upstreamNow] },
    task
  });
  try {
    const result = await applyPullUpdates(1, 1, [10]);
    assert.equal(result.applied, 1);
    assert.equal(result.skipped, 0);
    assert.equal(h.savedTasks[0].template, "b", "task template pulled from upstream");
    assert.equal(h.savedTasks[0].description, "new");
    // origin hash refreshed to the new upstream hash
    assert.equal(h.savedAssignment.originMap["10"].sourceHash, hashCourseItem(upstreamNow as any));
  } finally {
    h.restore();
  }
});

test("applyPullUpdates skips an item whose upstream did not change", async () => {
  const unchanged = { ...item(10, { description: "same", template: "a" }), kind: "CODE_TASK" };
  const assignment: any = {
    class: { organizationId: 1 },
    courseId: 5,
    originMap: { "10": { sourceHash: hashCourseItem(unchanged as any), localHash: "L1", eduTaskId: 100 } }
  };
  const h = makeHarness({
    assignment,
    modules: [{ id: 1 }],
    itemsByModule: { 1: [unchanged] },
    task: { id: 100, title: "T" }
  });
  try {
    const result = await applyPullUpdates(1, 1, [10]);
    assert.equal(result.applied, 0);
    assert.equal(result.skipped, 1, "unchanged upstream is not clobbered");
    assert.equal(h.savedTasks.length, 0);
  } finally {
    h.restore();
  }
});

test("applyPullUpdates creates a task for a NEW_UPSTREAM item under its module's lesson", async () => {
  const newItem = { ...item(30, { description: "fresh", template: "z" }, "New Task"), kind: "CODE_TASK" };
  const assignment: any = {
    class: { id: 1, organizationId: 1 },
    courseId: 5,
    originMap: {}, // item 30 not tracked → NEW_UPSTREAM
    moduleMap: { "7": 200 } // module 7 already has lesson 200
  };
  const h = makeHarness({
    assignment,
    modules: [{ id: 7, title: "Mod 7" }],
    itemsByModule: { 7: [newItem] },
    task: null
  });
  try {
    const result = await applyPullUpdates(1, 1, [30]);
    assert.equal(result.applied, 1);
    assert.equal(h.savedTasks.length, 1);
    assert.equal(h.savedTasks[0].template, "z");
    assert.equal(h.savedTasks[0].lesson.id, 200, "placed under the module's existing lesson");
    assert.equal(h.createdLessons.length, 0, "no new lesson needed");
    assert.ok(h.savedAssignment.originMap["30"], "origin map now tracks the new item");
  } finally {
    h.restore();
  }
});

test("applyPullUpdates creates a lesson when the NEW_UPSTREAM item's module is new", async () => {
  const newItem = { ...item(40, { template: "q" }, "T"), kind: "CODE_TASK" };
  const assignment: any = {
    class: { id: 1, organizationId: 1 },
    courseId: 5,
    originMap: {},
    moduleMap: {} // module 9 not mapped → lesson must be created
  };
  const h = makeHarness({
    assignment,
    modules: [{ id: 9, title: "Brand New Module" }],
    itemsByModule: { 9: [newItem] },
    task: null
  });
  try {
    const result = await applyPullUpdates(1, 1, [40]);
    assert.equal(result.applied, 1);
    assert.equal(h.createdLessons.length, 1, "a lesson was created for the new module");
    assert.equal(h.createdLessons[0].title, "Brand New Module");
    assert.equal(h.savedAssignment.moduleMap["9"], h.createdLessons[0].id);
  } finally {
    h.restore();
  }
});

test("applyPullUpdates skips a REMOVED_UPSTREAM item unless removeDeleted is set", async () => {
  const assignment: any = {
    class: { id: 1, organizationId: 1 },
    courseId: 5,
    originMap: { "50": { sourceHash: "h", localHash: "L", eduTaskId: 500 } },
    moduleMap: {}
  };
  const h = makeHarness({
    assignment,
    modules: [{ id: 1 }],
    itemsByModule: { 1: [] }, // item 50 no longer upstream
    task: { id: 500, isClosed: false }
  });
  try {
    const result = await applyPullUpdates(1, 1, [50]); // no removeDeleted
    assert.equal(result.applied, 0);
    assert.equal(result.skipped, 1);
    assert.equal(h.savedTasks.length, 0, "task untouched without opt-in");
    assert.ok(h.savedAssignment.originMap["50"], "still tracked");
  } finally {
    h.restore();
  }
});

test("applyPullUpdates closes (not deletes) a removed task with removeDeleted and stops tracking it", async () => {
  const assignment: any = {
    class: { id: 1, organizationId: 1 },
    courseId: 5,
    originMap: { "50": { sourceHash: "h", localHash: "L", eduTaskId: 500 } },
    moduleMap: {}
  };
  const task: any = { id: 500, isClosed: false };
  const h = makeHarness({
    assignment,
    modules: [{ id: 1 }],
    itemsByModule: { 1: [] },
    task
  });
  try {
    const result = await applyPullUpdates(1, 1, [50], { removeDeleted: true });
    assert.equal(result.applied, 1);
    assert.equal(h.savedTasks[0].isClosed, true, "task closed, grades preserved (no delete)");
    assert.equal(h.savedAssignment.originMap["50"], undefined, "no longer tracked");
  } finally {
    h.restore();
  }
});

test("summarizePullDiff counts actionable items", () => {
  const entries = [
    { sourceItemId: 1, status: "UNCHANGED" as const, title: null },
    { sourceItemId: 2, status: "TEMPLATE_UPDATED" as const, title: null },
    { sourceItemId: 3, status: "CONFLICT" as const, title: null },
    { sourceItemId: 4, status: "LOCALLY_MODIFIED" as const, title: null },
    { sourceItemId: 5, status: "NEW_UPSTREAM" as const, title: null }
  ];
  const s = summarizePullDiff(entries);
  assert.equal(s.total, 5);
  // actionable = TEMPLATE_UPDATED + CONFLICT + NEW_UPSTREAM + REMOVED_UPSTREAM = 3
  assert.equal(s.actionable, 3);
  assert.equal(s.byStatus.LOCALLY_MODIFIED, 1);
});
