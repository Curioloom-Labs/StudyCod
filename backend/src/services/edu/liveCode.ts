/**
 * Ephemeral, in-memory store for the latest live code snapshot per student —
 * the read-only "editor stream" a teacher watches during a live lesson. This is
 * intentionally NOT persisted: it is transient session state, written every few
 * seconds while a student types and read by the teacher's room view. Entries
 * self-expire so a closed tab stops surfacing stale code.
 *
 * Single-instance scope: on a multi-replica backend a student's publish and the
 * teacher's read must land on the same instance, or this should move to Redis.
 * For the current single-node dev/run target an in-memory map is sufficient and
 * avoids a high-frequency write load on MySQL.
 */
export interface LiveCodeSnapshot {
  classId: number;
  taskId: number;
  taskTitle: string | null;
  code: string;
  updatedAtMs: number;
}

const TTL_MS = 2 * 60_000;
const MAX_ENTRIES = 5000;
const MAX_CODE_CHARS = 100_000;

const store = new Map<number, LiveCodeSnapshot>();

function isFresh(snap: LiveCodeSnapshot, nowMs: number): boolean {
  return nowMs - snap.updatedAtMs <= TTL_MS;
}

/** Drop expired entries; if still over capacity, evict the oldest. */
function prune(nowMs: number): void {
  for (const [studentId, snap] of store) {
    if (!isFresh(snap, nowMs)) store.delete(studentId);
  }
  if (store.size <= MAX_ENTRIES) return;
  const oldestFirst = [...store.entries()].sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);
  for (const [studentId] of oldestFirst) {
    if (store.size <= MAX_ENTRIES) break;
    store.delete(studentId);
  }
}

export function setLiveCode(
  studentId: number,
  input: { classId: number; taskId: number; taskTitle: string | null; code: string }
): void {
  const nowMs = Date.now();
  prune(nowMs);
  store.set(studentId, {
    classId: input.classId,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    code: input.code.length > MAX_CODE_CHARS ? input.code.slice(0, MAX_CODE_CHARS) : input.code,
    updatedAtMs: nowMs
  });
}

export function getLiveCode(studentId: number): LiveCodeSnapshot | null {
  const snap = store.get(studentId);
  if (!snap) return null;
  if (!isFresh(snap, Date.now())) {
    store.delete(studentId);
    return null;
  }
  return snap;
}
