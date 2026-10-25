import test from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { AppDataSource } from "../data-source";
import { Contest } from "../entities/Contest";
import { ContestParticipant } from "../entities/ContestParticipant";
import { ContestProblem } from "../entities/ContestProblem";
import { ContestSubmission } from "../entities/ContestSubmission";
import { LibraryTask } from "../entities/LibraryTask";
import { Task } from "../entities/Task";
import { TestData } from "../entities/TestData";
import type { AuthRequest } from "../middleware/authMiddleware";
import contestsRouter from "./contests";

const organizerId = 42;
const contestId = 71;

async function call(method: string, path: string, body: unknown = {}, identity: object = { userId: organizerId, userType: "USER", userRole: "USER" }) {
  const layer = contestsRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer, `Missing ${method} ${path}`);
  let status = 200;
  let result: any;
  const res = {
    status(code: number) { status = code; return res; },
    json(value: unknown) { result = value; return res; },
    set() { return res; },
  };
  const req = {
    ...identity,
    params: { id: String(contestId), problemId: "201" },
    body,
    headers: {},
  } as unknown as AuthRequest;
  await layer.route.stack.at(-1).handle(req, res as unknown as Response);
  return { status, body: result };
}

function contestRecord(endsAt: Date) {
  return Object.assign(new Contest(), {
    id: contestId,
    title: "Generated practice round",
    createdBy: { id: organizerId },
    visibility: "PUBLIC",
    isPublished: true,
    startsAt: new Date(Date.now() - 60 * 60_000),
    endsAt,
    allowUpsolve: true,
    safetyAlertsEnabled: false,
    safetyManualLocked: false,
  });
}

function generatedTask(id: number, topicKey: string, courseItemId: number) {
  return {
    id,
    type: "TOPIC",
    taskMode: "CODE",
    courseEnrollmentId: 900,
    title: `Generated ${topicKey}`,
    description: `Solve a newly generated ${topicKey} practice problem.`,
    template: "import sys\n\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()\n",
    lang: "PYTHON",
    courseItem: {
      id: courseItemId,
      title: topicKey,
      content: {
        exercise: {
          learningContract: {
            kind: "OLYMPIAD_ALGORITHMIC_PRACTICE",
            version: 3,
            courseKey: "olympiad-python",
            topicKey,
          },
        },
      },
      module: { course: { id: 501 } },
    },
  };
}

test("training contests snapshot only generated Olympiad tasks and keep their tests hidden", async (t) => {
  const tasks = [generatedTask(301, "prefix-sums", 601), generatedTask(302, "binary-search", 602)];
  const sourceTests = new Map(tasks.map((task) => [task.id, Array.from({ length: 12 }, (_, index) => ({
    input: `${task.id} ${index}`,
    expectedOutput: `${index}\n`,
    points: 9,
    subtask: null,
  }))]));
  const snapshots: any[] = [];
  const hiddenTests: any[] = [];
  const problems: any[] = [];
  let nextTaskId = 800;
  let nextProblemId = 900;
  const snapshotRepository = {
    create: (input: any) => ({ ...input }),
    save: async (input: any) => {
      const saved = { ...input, id: ++nextTaskId };
      snapshots.push(saved);
      return saved;
    },
  };
  const testRepository = {
    find: async (options: any) => sourceTests.get(Number(options.where.personalTask.id)) ?? [],
    create: (input: any) => Array.isArray(input) ? input.map((row) => ({ ...row })) : { ...input },
    save: async (input: any) => {
      hiddenTests.push(...(Array.isArray(input) ? input : [input]));
      return input;
    },
  };
  const problemRepository = {
    count: async () => 0,
    create: (input: any) => ({ ...input }),
    save: async (input: any) => {
      const saved = { ...input, id: ++nextProblemId };
      problems.push(saved);
      return saved;
    },
  };
  const manager = {
    getRepository(entity: unknown) {
      if (entity === LibraryTask) return snapshotRepository;
      if (entity === TestData) return testRepository;
      if (entity === ContestProblem) return problemRepository;
      throw new Error("Unexpected transaction repository");
    },
  };

  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Contest) return { findOne: async () => contestRecord(new Date(Date.now() + 60 * 60_000)) };
    if (entity === Task) return { find: async () => tasks };
    if (entity === TestData) return testRepository;
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);
  t.mock.method(AppDataSource, "transaction", (async (work: any) => work(manager)) as typeof AppDataSource.transaction);

  const result = await call("post", "/:id/problems/from-generated-practice-set", {
    mode: "MIXED",
    taskIds: [301, 302],
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { problemIds: [901, 902], firstOrder: 0, count: 2, mode: "MIXED" });
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.map((snapshot) => snapshot.tags.find((tag: string) => tag.startsWith("topic:"))), ["topic:prefix-sums", "topic:binary-search"]);
  assert.ok(snapshots.every((snapshot) => snapshot.status === "DRAFT" && snapshot.isHiddenFromLibrary));
  assert.equal(hiddenTests.length, 24);
  assert.ok(hiddenTests.every((row) => row.isHidden && row.kind === "JUDGE" && row.source === "AI_GENERATED"));
  assert.deepEqual(hiddenTests.slice(0, 12).map((row) => row.input), sourceTests.get(301)!.map((row) => row.input));
  assert.ok(problems.every((problem) => problem.contest.id === contestId));
});

test("post-contest review waits for the round and judging, then recommends the participant's weakest topic", async (t) => {
  const participant = Object.assign(new ContestParticipant(), { id: 110, contest: { id: contestId }, user: { id: organizerId } });
  const problems = [
    { id: 201, order: 0, label: "A", libraryTask: { title: "Prefix task", tags: ["generated-practice", "topic:prefix-sums", "course-id:501", "source-item:601"] } },
    { id: 202, order: 1, label: "B", libraryTask: { title: "Search task", tags: ["generated-practice", "topic:binary-search", "course-id:501", "source-item:602"] } },
    { id: 203, order: 2, label: "C", libraryTask: { title: "Array task", tags: ["generated-practice", "topic:array-traversal", "course-id:501", "source-item:603"] } },
  ];
  let submissions: any[] = [
    Object.assign(new ContestSubmission(), { id: 1, problem: { id: 201 }, participant, verdict: "WA", score: 0, maxScore: 100, executionStatus: "finished" }),
    Object.assign(new ContestSubmission(), { id: 2, problem: { id: 201 }, participant, verdict: "AC", score: 100, maxScore: 100, executionStatus: "finished" }),
    Object.assign(new ContestSubmission(), { id: 3, problem: { id: 202 }, participant, verdict: "WA", score: 0, maxScore: 100, executionStatus: "finished" }),
    Object.assign(new ContestSubmission(), { id: 4, problem: { id: 202 }, participant, verdict: "TLE", score: 0, maxScore: 100, executionStatus: "finished" }),
  ];
  let contest = contestRecord(new Date(Date.now() - 1000));
  let queriedParticipantId: number | undefined;
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Contest) return { findOne: async () => contest };
    if (entity === ContestParticipant) return { findOne: async (options: any) => {
      queriedParticipantId = Number(options.where.user.id);
      return participant;
    } };
    if (entity === ContestProblem) return { find: async () => problems };
    if (entity === ContestSubmission) return { find: async (options: any) => {
      assert.equal(options.where.phase, "CONTEST");
      assert.equal(Number(options.where.participant.id), participant.id);
      return submissions;
    } };
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  contest.endsAt = new Date(Date.now() + 60 * 60_000);
  const early = await call("get", "/:id/learning-review");
  assert.equal(early.status, 403);
  assert.equal(early.body.message, "REVIEW_AVAILABLE_AFTER_CONTEST");

  contest.endsAt = new Date(Date.now() - 1000);
  submissions = [Object.assign(new ContestSubmission(), { executionStatus: "queued" })];
  const judging = await call("get", "/:id/learning-review");
  assert.equal(judging.status, 409);
  assert.equal(judging.body.message, "JUDGING_IN_PROGRESS");

  submissions = [
    Object.assign(new ContestSubmission(), { id: 1, problem: { id: 201 }, participant, verdict: "WA", score: 0, maxScore: 100, executionStatus: "finished" }),
    Object.assign(new ContestSubmission(), { id: 2, problem: { id: 201 }, participant, verdict: "AC", score: 100, maxScore: 100, executionStatus: "finished" }),
    Object.assign(new ContestSubmission(), { id: 3, problem: { id: 202 }, participant, verdict: "WA", score: 0, maxScore: 100, executionStatus: "finished" }),
    Object.assign(new ContestSubmission(), { id: 4, problem: { id: 202 }, participant, verdict: "TLE", score: 0, maxScore: 100, executionStatus: "finished" }),
  ];
  const review = await call("get", "/:id/learning-review");
  assert.equal(review.status, 200);
  assert.equal(queriedParticipantId, organizerId);
  assert.deepEqual(review.body.topics.map((topic: any) => topic.topicKey), ["binary-search", "prefix-sums", "array-traversal"]);
  assert.equal(review.body.topics[0].attempts, 2);
  assert.equal(review.body.topics[0].failures, 2);
  assert.equal(review.body.topics[1].solvedProblems, 1);
  assert.deepEqual(review.body.recommendation, {
    topicKey: "binary-search",
    courseId: 501,
    courseItemId: 602,
    reason: "MOST_FAILED_GENERATED_TOPIC",
    suggestedAction: "Generate a fresh course practice variant for this topic, then solve it outside the timed round.",
  });
  assert.equal(JSON.stringify(review.body).includes("expectedOutput"), false);
  assert.equal(JSON.stringify(review.body).includes("hidden test"), false);
});
