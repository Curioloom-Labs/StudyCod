/**
 * Live class monitor — real-time snapshot of who is working on a task/control
 * work and where they are stuck. Teachers poll this during a session.
 *
 * This module is the PURE transform: given the class roster and the latest
 * per-student attempt rows, it produces a teacher-facing snapshot (per-student
 * status + class totals). The DB query that gathers the rows is the wiring
 * step; keeping the transform pure makes it fully unit-testable.
 */
export interface LiveStudent {
  studentId: number;
  name: string;
}

export interface LiveAttempt {
  studentId: number;
  verdict?: string | null;
  testsPassed?: number | null;
  testsTotal?: number | null;
  updatedAtMs?: number | null;
}

export type LiveStatus = "not_started" | "in_progress" | "stuck" | "passed";

export interface LiveStudentStatus {
  studentId: number;
  name: string;
  status: LiveStatus;
  lastVerdict: string | null;
  testsPassed: number | null;
  testsTotal: number | null;
  lastActivityMs: number | null;
}

export interface LiveSnapshot {
  totals: Record<LiveStatus, number>;
  students: LiveStudentStatus[];
  generatedAtMs: number;
}

const DEFAULT_STUCK_AFTER_MS = 5 * 60_000; // no activity for 5 min while in-progress

export function buildLiveSnapshot(
  students: LiveStudent[],
  attempts: LiveAttempt[],
  nowMs: number,
  stuckAfterMs: number = DEFAULT_STUCK_AFTER_MS
): LiveSnapshot {
  // Latest attempt per student (highest updatedAtMs wins).
  const latest = new Map<number, LiveAttempt>();
  for (const a of attempts) {
    if (a == null || typeof a.studentId !== "number") continue;
    const prev = latest.get(a.studentId);
    const at = Number(a.updatedAtMs ?? 0);
    if (!prev || at >= Number(prev.updatedAtMs ?? 0)) latest.set(a.studentId, a);
  }

  const totals: Record<LiveStatus, number> = { not_started: 0, in_progress: 0, stuck: 0, passed: 0 };

  const rows: LiveStudentStatus[] = students.map((s) => {
    const a = latest.get(s.studentId);
    let status: LiveStatus;
    const verdict = a?.verdict ? String(a.verdict).toUpperCase() : null;
    const lastActivityMs = a?.updatedAtMs != null ? Number(a.updatedAtMs) : null;

    if (!a) {
      status = "not_started";
    } else if (verdict === "AC") {
      status = "passed";
    } else if (lastActivityMs != null && nowMs - lastActivityMs > stuckAfterMs) {
      status = "stuck";
    } else {
      status = "in_progress";
    }

    totals[status] += 1;
    return {
      studentId: s.studentId,
      name: s.name,
      status,
      lastVerdict: verdict,
      testsPassed: a?.testsPassed ?? null,
      testsTotal: a?.testsTotal ?? null,
      lastActivityMs,
    };
  });

  // Surface the people who need attention first: stuck, then in-progress,
  // then not-started, then passed; within a group, least recent activity first.
  const order: Record<LiveStatus, number> = { stuck: 0, in_progress: 1, not_started: 2, passed: 3 };
  rows.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return (a.lastActivityMs ?? 0) - (b.lastActivityMs ?? 0);
  });

  return { totals, students: rows, generatedAtMs: nowMs };
}
