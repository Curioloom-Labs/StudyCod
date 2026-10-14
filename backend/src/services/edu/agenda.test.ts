import test from "node:test";
import assert from "node:assert/strict";
import { classifyAgenda, summarizeAgenda, getDeadlinesForClasses, type AgendaItem } from "./agenda";
import { AppDataSource } from "../../data-source";
import { EduTask } from "../../entities/EduTask";
import { ControlWork } from "../../entities/ControlWork";

const now = new Date("2026-06-22T12:00:00.000Z");
const iso = (d: string) => d;

function item(partial: Partial<AgendaItem> & { deadline: string; id: number }): AgendaItem {
  return { kind: "TASK", title: "x", classId: 1, className: "c", ...partial };
}

test("classifyAgenda buckets relative to now and sorts ascending", () => {
  const items: AgendaItem[] = [
    item({ id: 1, deadline: iso("2026-06-21T10:00:00.000Z") }), // yesterday -> overdue
    item({ id: 2, deadline: iso("2026-06-22T18:00:00.000Z") }), // today, later than now -> today
    item({ id: 3, deadline: iso("2026-06-25T09:00:00.000Z") }), // +3d -> soon
    item({ id: 4, deadline: iso("2026-07-30T09:00:00.000Z") })  // +38d -> later
  ];
  const r = classifyAgenda(items, now);
  assert.deepEqual(r.map(x => x.id), [1, 2, 3, 4], "sorted by deadline asc");
  assert.deepEqual(r.map(x => x.bucket), ["overdue", "today", "soon", "later"]);
});

test("classifyAgenda treats a past time today as overdue, drops unparseable", () => {
  const items: AgendaItem[] = [
    item({ id: 1, deadline: iso("2026-06-22T09:00:00.000Z") }), // earlier today -> overdue (past now)
    item({ id: 2, deadline: "not-a-date" })
  ];
  const r = classifyAgenda(items, now);
  assert.equal(r.length, 1, "invalid deadline dropped");
  assert.equal(r[0].bucket, "overdue");
});

test("summarizeAgenda counts per bucket", () => {
  const r = classifyAgenda([
    item({ id: 1, deadline: iso("2026-06-20T09:00:00.000Z") }),
    item({ id: 2, deadline: iso("2026-06-22T20:00:00.000Z") }),
    item({ id: 3, deadline: iso("2026-06-24T09:00:00.000Z") })
  ], now);
  assert.deepEqual(summarizeAgenda(r), { overdue: 1, today: 1, soon: 1, later: 0 });
});

test("student agenda includes topic practices and filters targeted assignments", async t => {
  const row = (id: number, assignedStudentIds: unknown, extra = {}) => ({ id, assignedStudentIds, title: "Work", deadline: "2026-06-25T12:00:00Z", classId: 1, className: "Class", topicId: 10, ...extra });
  const conditions: string[] = [];
  const repo = (rows: unknown[]) => {
    const qb: any = { getRawMany: async () => rows };
    for (const method of ["innerJoin", "where", "andWhere", "select", "addSelect"]) {
      qb[method] = (...args: unknown[]) => { if (method === "andWhere") conditions.push(String(args[0])); return qb; };
    }
    return { createQueryBuilder: () => qb };
  };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === EduTask) return repo([row(1, null, { lessonId: 20 })]);
    if (entity === ControlWork) return repo([row(2, "[7]"), row(3, "[8]"), row(4, null)]);
    return repo([row(5, "[7]"), row(6, "[8]")]);
  });
  const student = await getDeadlinesForClasses([1], now, new Date("2026-07-01"), 7);
  assert.deepEqual(student.map(item => item.id), [1, 2, 4, 5]);
  assert.equal(student.find(item => item.id === 5)?.topicId, 10);
  const teacher = await getDeadlinesForClasses([1], now, new Date("2026-07-01"));
  assert.equal(teacher.length, 6);
  assert.ok(conditions.includes("t.isAssigned = 1"));
  assert.ok(conditions.includes("t.type = :type"));
});
