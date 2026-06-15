/**
 * Ephemeral store for the latest live code snapshot per student — the read-only
 * "editor stream" a teacher watches during a live lesson. This is intentionally
 * NOT persisted to MySQL: it is transient session state, written every few
 * seconds while a student types and read by the teacher's room view. Entries
 * self-expire (TTL) so a closed tab stops surfacing stale code.
 *
 * Backed by {@link ./liveStateStore}: Redis when configured (so multi-replica
 * publish/read stay coherent), in-process Map otherwise.
 */
import { setLiveState, getLiveState } from "./liveStateStore";

export interface LiveCodeSnapshot {
  classId: number;
  taskId: number;
  taskTitle: string | null;
  code: string;
  updatedAtMs: number;
}

const NS = "code";
const TTL_SEC = 120;
const MAX_ENTRIES = 5000;
const MAX_CODE_CHARS = 100_000;

export async function setLiveCode(
  studentId: number,
  input: { classId: number; taskId: number; taskTitle: string | null; code: string }
): Promise<void> {
  const snap: LiveCodeSnapshot = {
    classId: input.classId,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    code: input.code.length > MAX_CODE_CHARS ? input.code.slice(0, MAX_CODE_CHARS) : input.code,
    updatedAtMs: Date.now()
  };
  await setLiveState(NS, studentId, snap, TTL_SEC, { maxEntries: MAX_ENTRIES });
}

export async function getLiveCode(studentId: number): Promise<LiveCodeSnapshot | null> {
  return await getLiveState<LiveCodeSnapshot>(NS, studentId);
}
