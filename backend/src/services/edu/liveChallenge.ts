import { randomBytes } from "crypto";
import { setLiveState, getLiveState, deleteLiveState } from "./liveStateStore";

/**
 * Ephemeral "live challenge" state — the timed mini-task a teacher fires during
 * a live lesson ("solve this in 90s"). One active challenge per class. It is
 * transient session state, not a gradebook artifact: the actual solving reuses
 * the normal task/judge/grade pipeline; this only records WHICH task is the
 * current challenge and WHEN it started, so the leaderboard can rank passes that
 * happened after the start.
 *
 * Backed by {@link ./liveStateStore} (Redis when configured, in-process Map
 * otherwise). The entry's TTL = duration + grace, so a challenge a teacher never
 * ends still stops being "active" instead of lingering across days.
 */
export interface LiveChallenge {
  id: string;
  classId: number;
  taskId: number;
  taskTitle: string;
  startedAtMs: number;
  durationSec: number;
}

const NS = "challenge";
// Hard ceiling beyond the timer: still resolvable for late leaderboard reads,
// but auto-expires afterward.
const HARD_EXPIRY_GRACE_SEC = 30 * 60;

export async function startChallenge(input: {
  classId: number;
  taskId: number;
  taskTitle: string;
  durationSec: number;
}): Promise<LiveChallenge> {
  const challenge: LiveChallenge = {
    id: randomBytes(8).toString("hex"),
    classId: input.classId,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    startedAtMs: Date.now(),
    durationSec: input.durationSec
  };
  const ttlSec = Math.max(1, Math.ceil(input.durationSec)) + HARD_EXPIRY_GRACE_SEC;
  await setLiveState(NS, input.classId, challenge, ttlSec);
  return challenge;
}

export async function getChallenge(classId: number): Promise<LiveChallenge | null> {
  return await getLiveState<LiveChallenge>(NS, classId);
}

export async function endChallenge(classId: number): Promise<void> {
  await deleteLiveState(NS, classId);
}
