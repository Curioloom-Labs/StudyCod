import test from "node:test";
import assert from "node:assert/strict";
import { classifyAgenda, summarizeAgenda, type AgendaItem } from "./agenda";

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
