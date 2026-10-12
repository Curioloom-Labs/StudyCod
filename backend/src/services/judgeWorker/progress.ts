import {
  isJudgeProgress,
  type JudgeProgress,
} from "../../../../shared/judgeProgress";
import {
  getReadyRedisClient,
  getSharedRedisClient,
  redisKey,
} from "../redis/sharedRedis";

const ttlMs = 10 * 60 * 1000;
const local = new Map<string, { progress: JudgeProgress; expires: number }>();
const pending = new Map<string, JudgeProgress>();
const writing = new Set<string>();

/** The attempt prevents a restarted job from reading an earlier worker's progress. */
export function contestProgressId(jobId: string, attempt: number): string {
  return `contest_job_${jobId}:${attempt}`;
}

export async function writeJudgeProgress(
  id: string,
  progress: JudgeProgress,
): Promise<void> {
  for (const [key, entry] of local) {
    if (entry.expires < Date.now()) local.delete(key);
  }
  if (local.size >= 2000 && !local.has(id))
    local.delete(local.keys().next().value!);
  local.set(id, { progress, expires: Date.now() + ttlMs });
  const redis = getReadyRedisClient();
  if (!redis?.isReady) {
    void getSharedRedisClient().catch(() => {});
    return;
  }
  pending.set(id, progress);
  if (writing.has(id)) return;
  writing.add(id);
  try {
    // Coalesce updates while Redis is busy, retaining only the latest snapshot.
    while (pending.has(id)) {
      const latest = pending.get(id)!;
      pending.delete(id);
      await redis.set(redisKey("judge-progress", id), JSON.stringify(latest), {
        EX: ttlMs / 1000,
      });
    }
  } catch {
    pending.delete(id);
  } finally {
    writing.delete(id);
  }
}

export async function readJudgeProgress(
  id: string,
): Promise<JudgeProgress | null> {
  const redis = getReadyRedisClient();
  if (!redis?.isReady) void getSharedRedisClient().catch(() => {});
  let timer: NodeJS.Timeout | undefined;
  // A temporarily unavailable progress cache must not delay the durable job status.
  const raw = redis?.isReady
    ? await Promise.race([
        redis.get(redisKey("judge-progress", id)).catch(() => null),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 200);
        }),
      ])
    : null;
  if (timer) clearTimeout(timer);
  if (raw) {
    try {
      const value: unknown = JSON.parse(raw);
      if (isJudgeProgress(value)) return value;
    } catch {
      /* Progress is optional; a corrupt cache must not fail a job status request. */
    }
  }
  const entry = local.get(id);
  if (entry && entry.expires > Date.now()) return entry.progress;
  local.delete(id);
  return null;
}
