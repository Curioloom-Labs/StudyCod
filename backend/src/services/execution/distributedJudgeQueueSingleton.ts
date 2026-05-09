import { env } from "../../env";
import { logger } from "../../utils/logger";
import { isRedisEnabled } from "../redis/sharedRedis";
import { DistributedJudgeQueue } from "./DistributedJudgeQueue";

function readInt(raw: unknown, fallback: number, min: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

const mode = String((env as any).__executionQueueMode ?? "local").trim().toLowerCase();
const distributedRequested = mode === "distributed";
const redisReady = isRedisEnabled();
const distributedEnabled = distributedRequested && redisReady;

if (distributedRequested && !redisReady) {
  logger.warn("[exec-redis] distributed queue requested but redis is disabled; fallback to local scheduler");
}

export const distributedJudgeQueue = new DistributedJudgeQueue({
  enabled: distributedEnabled,
  maxConcurrent: readInt((env as any).__maxConcurrentExecutions, 12, 1),
  maxQueueSize: readInt((env as any).__maxExecutionQueueSize, 50, 0),
  maxRetries: readInt((env as any).__executionQueueMaxRetries, 2, 0),
  deadLetterMaxItems: readInt((env as any).__executionQueueDeadLetterMaxItems, 1000, 10),
  pollIntervalMs: readInt((env as any).__executionQueuePollIntervalMs, 100, 20),
  claimTtlMs: readInt((env as any).__executionQueueClaimTtlMs, 180_000, 30_000),
  resultTtlMs: readInt((env as any).__executionQueueResultTtlMs, 300_000, 30_000),
  resultPollMs: readInt((env as any).__executionQueueResultPollMs, 40, 10),
  logIntervalMs: readInt((env as any).__executionSchedulerLogIntervalMs, 10_000, 1_000),
});

export function getExecutionQueueMode(): "distributed" | "local" {
  return distributedJudgeQueue.getMode();
}
