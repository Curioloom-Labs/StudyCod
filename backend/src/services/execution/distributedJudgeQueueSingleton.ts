import { env } from "../../env";
import { logger } from "../../utils/logger";
import { isRedisEnabled } from "../redis/sharedRedis";
import { DistributedJudgeQueue } from "./DistributedJudgeQueue";

function readInt(raw: unknown, fallback: number, min: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

const mode = String(env.__executionQueueMode ?? "local").trim().toLowerCase();
const distributedRequested = mode === "distributed";
const redisReady = isRedisEnabled();
const distributedEnabled = distributedRequested && redisReady;

if (distributedRequested && !redisReady) {
  logger.warn("[exec-redis] distributed queue requested but redis is disabled; fallback to local scheduler");
}

export const distributedJudgeQueue = new DistributedJudgeQueue({
  enabled: distributedEnabled,
  maxConcurrent: readInt(env.__maxConcurrentExecutions, 12, 1),
  // 0 => queue clamps to the per-instance cap (preserves single-instance behaviour).
  maxGlobalConcurrent: readInt(env.__maxGlobalConcurrentExecutions, 0, 0),
  maxQueueSize: readInt(env.__maxExecutionQueueSize, 50, 0),
  maxRetries: readInt(env.__executionQueueMaxRetries, 2, 0),
  deadLetterMaxItems: readInt(env.__executionQueueDeadLetterMaxItems, 1000, 10),
  pollIntervalMs: readInt(env.__executionQueuePollIntervalMs, 100, 20),
  claimTtlMs: readInt(env.__executionQueueClaimTtlMs, 180_000, 30_000),
  resultTtlMs: readInt(env.__executionQueueResultTtlMs, 300_000, 30_000),
  resultPollMs: readInt(env.__executionQueueResultPollMs, 40, 10),
  logIntervalMs: readInt(env.__executionSchedulerLogIntervalMs, 10_000, 1_000),
});

export function getExecutionQueueMode(): "distributed" | "local" {
  return distributedJudgeQueue.getMode();
}
