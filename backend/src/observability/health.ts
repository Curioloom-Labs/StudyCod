/**
 * Readiness + Prometheus metrics for operational visibility.
 *
 * `/health` (elsewhere) is a LIVENESS probe — it answers "is the process up?"
 * and always returns ok. Orchestrators additionally need a READINESS probe that
 * answers "can this instance serve traffic *right now*?" so rolling deploys
 * don't route requests at an instance whose DB is still initializing or whose
 * startup migrations are mid-flight. That is what `checkReadiness` provides.
 *
 * The metrics renderer exposes the judge queue + process counters in Prometheus
 * text format so they can be scraped instead of grepped out of logs.
 */
import { AppDataSource, getDbSlowQueryCount, getDbQueryErrorCount } from "../data-source";
import { getJudgeExecutionMetrics } from "../services/judgeWorker";
import { getExecutionQueueMode } from "../services/execution/distributedJudgeQueueSingleton";
import { isRedisEnabled, getSharedRedisClient } from "../services/redis/sharedRedis";
import { renderHttpMetrics } from "./httpMetrics";

export interface ReadinessResult {
  ready: boolean;
  checks: {
    db: { ok: boolean; error?: string };
    redis: { ok: boolean; enabled: boolean; error?: string };
  };
}

/**
 * Readiness is gated on the DATABASE only: the app cannot serve meaningful
 * traffic without it. Redis is reported but treated as soft — the service
 * degrades gracefully without it (caches miss, sessions fall back), so a
 * transient Redis blip must NOT flap every instance out of rotation.
 */
export async function checkReadiness(): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = {
    db: { ok: false },
    redis: { ok: false, enabled: isRedisEnabled() },
  };

  try {
    if (!AppDataSource.isInitialized) {
      checks.db.error = "not-initialized";
    } else {
      await AppDataSource.query("SELECT 1");
      checks.db.ok = true;
    }
  } catch (err: any) {
    checks.db.error = String(err?.message || "query-failed");
  }

  if (!checks.redis.enabled) {
    checks.redis.ok = true; // "disabled" is a valid, ready state.
  } else {
    try {
      const client = await getSharedRedisClient();
      if (client) {
        await client.ping();
        checks.redis.ok = true;
      } else {
        checks.redis.error = "unavailable";
      }
    } catch (err: any) {
      checks.redis.error = String(err?.message || "ping-failed");
    }
  }

  return { ready: checks.db.ok, checks };
}

function metricLine(out: string[], name: string, help: string, value: number, type: "gauge" | "counter" = "gauge"): void {
  if (!Number.isFinite(value)) return;
  out.push(`# HELP ${name} ${help}`);
  out.push(`# TYPE ${name} ${type}`);
  out.push(`${name} ${value}`);
}

/** Render judge-queue + process metrics in Prometheus text exposition format. */
export function renderPrometheusMetrics(): string {
  const m = getJudgeExecutionMetrics();
  const mem = process.memoryUsage();
  const out: string[] = [];

  metricLine(out, "studycod_process_uptime_seconds", "Process uptime in seconds", Math.floor(process.uptime()));
  metricLine(out, "studycod_process_resident_memory_bytes", "Resident set size in bytes", mem.rss);
  metricLine(out, "studycod_process_heap_used_bytes", "V8 heap used in bytes", mem.heapUsed);

  metricLine(out, "studycod_db_slow_query_total", "Total queries exceeding the slow-query threshold", getDbSlowQueryCount(), "counter");
  metricLine(out, "studycod_db_query_error_total", "Total database query errors", getDbQueryErrorCount(), "counter");

  metricLine(out, "studycod_judge_active", "Currently executing judge jobs", m.active);
  metricLine(out, "studycod_judge_queued", "Judge jobs waiting in queue", m.queued);
  metricLine(out, "studycod_judge_peak_active", "Peak concurrent judge jobs observed", m.peakActive);
  metricLine(out, "studycod_judge_peak_queue_length", "Peak queue length observed", m.peakQueueLength);
  metricLine(out, "studycod_judge_max_concurrent", "Configured per-instance concurrency cap", m.maxConcurrent);
  metricLine(out, "studycod_judge_max_queue_size", "Configured max queue size", m.maxQueueSize);
  metricLine(out, "studycod_judge_completed_total", "Total judge jobs completed", m.totalCompleted, "counter");
  metricLine(out, "studycod_judge_rejected_queue_full_total", "Total jobs rejected (queue full)", m.totalRejectedQueueFull, "counter");
  metricLine(out, "studycod_judge_requeued_expired_total", "Total stale jobs requeued", m.totalRequeuedExpired, "counter");
  metricLine(out, "studycod_judge_dead_lettered_total", "Total jobs sent to dead-letter queue", m.totalDeadLettered, "counter");
  metricLine(out, "studycod_judge_dead_letter_queue_length", "Current dead-letter queue length", m.deadLetterQueueLength);
  metricLine(out, "studycod_judge_avg_execution_ms", "Average judge execution time (ms)", Math.round(m.avgExecutionTimeMs));
  metricLine(out, "studycod_judge_avg_queue_wait_ms", "Average queue wait time (ms)", Math.round(m.averageQueueWaitTime));

  // Distributed vs local mode as a labelled gauge (1 = active mode).
  const mode = getExecutionQueueMode();
  out.push('# HELP studycod_execution_queue_mode Active execution queue mode (1=active)');
  out.push('# TYPE studycod_execution_queue_mode gauge');
  out.push(`studycod_execution_queue_mode{mode="${mode}"} 1`);

  return out.join("\n") + "\n" + renderHttpMetrics();
}
