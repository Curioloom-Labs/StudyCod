import { env } from "../../env";
import { ExecutionScheduler } from "./ExecutionScheduler";

function readInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Defaults chosen for stability on a single node. Tune via env.
// Requested range: 8–16.
const DEFAULT_MAX_CONCURRENT = 12;
const DEFAULT_MAX_QUEUE = 50;
const DEFAULT_LOG_INTERVAL_MS = 10_000;

const maxConcurrent = readInt("MAX_CONCURRENT_EXECUTIONS", (env as any).__maxConcurrentExecutions ?? DEFAULT_MAX_CONCURRENT);
const maxQueueSize = readInt("MAX_EXECUTION_QUEUE_SIZE", (env as any).__maxExecutionQueueSize ?? DEFAULT_MAX_QUEUE);
const logIntervalMs = readInt(
  "EXECUTION_SCHEDULER_LOG_INTERVAL_MS",
  (env as any).__executionSchedulerLogIntervalMs ?? DEFAULT_LOG_INTERVAL_MS
);

/**
 * Global singleton scheduler for all code executions.
 *
 * This is intentionally isolated so we can later replace it with Redis queue
 * or multiple judge backends.
 */
export const executionScheduler = new ExecutionScheduler({
  maxConcurrent,
  maxQueueSize,
  logIntervalMs,
});
