import { randomBytes } from "crypto";

/**
 * Ephemeral "live challenge" state — the timed mini-task a teacher fires during
 * a live lesson ("solve this in 90s"). One active challenge per class, held in
 * memory: it is transient session state, not a gradebook artifact. The actual
 * solving reuses the normal task/judge/grade pipeline; this only records WHICH
 * task is the current challenge and WHEN it started, so the leaderboard can rank
 * passes that happened after the start.
 *
 * Single-instance scope (same caveat as liveCode): move to Redis for multi-node.
 */
export interface LiveChallenge {
  id: string;
  classId: number;
  taskId: number;
  taskTitle: string;
  startedAtMs: number;
  durationSec: number;
}

// Hard ceiling: even if a teacher never ends it, a challenge stops being
// "active" well after its timer so it can't linger across days.
const HARD_EXPIRY_GRACE_MS = 30 * 60_000;

const byClass = new Map<number, LiveChallenge>();

function isExpired(ch: LiveChallenge, nowMs: number): boolean {
  return nowMs > ch.startedAtMs + ch.durationSec * 1000 + HARD_EXPIRY_GRACE_MS;
}

export function startChallenge(input: {
  classId: number;
  taskId: number;
  taskTitle: string;
  durationSec: number;
}): LiveChallenge {
  const challenge: LiveChallenge = {
    id: randomBytes(8).toString("hex"),
    classId: input.classId,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    startedAtMs: Date.now(),
    durationSec: input.durationSec
  };
  byClass.set(input.classId, challenge);
  return challenge;
}

export function getChallenge(classId: number): LiveChallenge | null {
  const ch = byClass.get(classId);
  if (!ch) return null;
  if (isExpired(ch, Date.now())) {
    byClass.delete(classId);
    return null;
  }
  return ch;
}

export function endChallenge(classId: number): void {
  byClass.delete(classId);
}
