import { estimateJudgeExecutionTimeoutMs } from "./executionTimeout";
import { JudgeClient } from "./JudgeClient";
import type { JudgeRequest, JudgeResponse } from "./types";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { executionScheduler } from "../execution/executionSchedulerSingleton";
import { distributedJudgeQueue, getExecutionQueueMode } from "../execution/distributedJudgeQueueSingleton";
import {
  isDistributedQueueUnavailableError,
  type DistributedDeadLetterListResult,
  type DistributedDeadLetterReplayResult,
} from "../execution/DistributedJudgeQueue";
import type { ExecutionSchedulerSnapshot } from "../execution/ExecutionScheduler";
import { env } from "../../env";
const client = new JudgeClient();
export interface JudgeWithSemaphoreOptions {
  /**
   * Hard timeout for the backend->judge request. This must stay finite to avoid hangs.
   * Default: auto-calculated from request limits/tests/language, capped.
   */
  timeoutMs?: number;
  /** Optional external cancellation signal (e.g. request aborted). */
  signal?: AbortSignal;
}

function toJudgeUnavailable(err: unknown): HttpError {
  const msg = err instanceof Error ? err.message : String(err);
  const isJudgeClientError = err instanceof Error && err.name === "JudgeClientError";
  const judgeClientDetails = (() => {
    if (!isJudgeClientError) return undefined;
    const debuggableError = err as Error & { toDebugJSON?: () => unknown };
    if (typeof debuggableError.toDebugJSON === "function") {
      try {
        return debuggableError.toDebugJSON();
      } catch {
        return { name: err.name, message: msg };
      }
    }
    return { name: err.name, message: msg };
  })();
  const tooLarge =
    /INPUT_TOO_LARGE/i.test(msg) ||
    /INVALID_REQUEST: (source too large|files too large|too many tests|test\.input too large|test\.output too large|too many files)/i.test(msg) ||
    /JUDGE_(STDOUT|STDERR)_TOO_LARGE/i.test(msg);

  // Configuration errors are not transient outages.
  if (
    /INVALID_CONFIGURATION/i.test(msg) ||
    /production requires NSJAIL_USE_CONFIG=1/i.test(msg) ||
    /production requires NSJAIL_CONFIG/i.test(msg)
  ) {
    logger.error("[judge] invalid configuration", {
      error: msg,
      details: judgeClientDetails
    });
    return new HttpError(500, "JUDGE_INVALID_CONFIGURATION", {
      code: "JUDGE_INVALID_CONFIGURATION",
      expose: true,
      details: env.NODE_ENV === "production"
        ? productionJudgeDetails(judgeClientDetails)
        : (judgeClientDetails ?? msg.slice(0, 2000)),
      cause: err
    });
  }

  if (tooLarge) {
    logger.warn("[judge] request rejected (too large)", { error: msg });
    return new HttpError(413, "JUDGE_REQUEST_TOO_LARGE", {
      code: "JUDGE_REQUEST_TOO_LARGE",
      expose: true,
      details: judgeClientDetails ?? msg.slice(0, 2000),
      cause: err
    });
  }
  return new HttpError(503, "Judge unavailable", {
    code: "JUDGE_UNAVAILABLE",
    expose: true,
    // Keep public surface small in production, but include structured kind/exitCode to aid support.
    details: env.NODE_ENV === "production"
      ? productionJudgeDetails(judgeClientDetails)
      : (judgeClientDetails ?? msg.slice(0, 2000)),
    cause: err
  });
}

export async function judgeWithSemaphore(req: JudgeRequest, options: JudgeWithSemaphoreOptions = {}): Promise<JudgeResponse> {
  const startedAt = Date.now();
  try {
    const enqueueLabel = `judge submission=${req.submission_id} lang=${req.language} tests=${req.tests?.length ?? 0}`;
    const timeoutMsRaw = Number(env.JUDGE_BACKEND_TIMEOUT_MS ?? "");
    const dynamicTimeoutMs = estimateBackendHardTimeoutMs(req);
    const requestedTimeoutMs = options.timeoutMs;
    const timeoutMs = typeof requestedTimeoutMs === "number" && Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
      ? requestedTimeoutMs
      : Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? timeoutMsRaw
        : dynamicTimeoutMs;

    const controller = new AbortController();
    let timeoutHandle: NodeJS.Timeout | undefined;
    const startExecutionDeadline = () => { timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`JUDGE_TIMEOUT: backend hard timeout ${timeoutMs}ms`));
    }, timeoutMs); };

    let detachExternalAbort = () => undefined;
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason ?? new Error("JUDGE_ABORTED"));
      } else {
        const onAbort = () => controller.abort(options.signal?.reason ?? new Error("JUDGE_ABORTED"));
        try {
          options.signal.addEventListener("abort", onAbort, { once: true });
          detachExternalAbort = () => {
            try {
              options.signal?.removeEventListener("abort", onAbort);
            } catch {}
          };
        } catch {}
      }
    }

    const scheduleLocal = () =>
      executionScheduler.schedule(
        () => { startExecutionDeadline(); return client.judge(req, { signal: controller.signal }); },
        {
          signal: controller.signal,
          label: enqueueLabel,
        }
      );

    let res: JudgeResponse;
    try {
      if (distributedJudgeQueue.isEnabled()) {
        startExecutionDeadline();
        try {
          res = await distributedJudgeQueue.execute(req, {
            signal: controller.signal,
            timeoutMs,
            label: enqueueLabel,
          });
        } catch (distributedError: unknown) {
          if (isDistributedQueueUnavailableError(distributedError)) {
            clearTimeout(timeoutHandle);
            logger.warn("[judge] distributed queue unavailable, fallback to local scheduler", {
              submissionId: req.submission_id,
              language: req.language,
              error: distributedError instanceof Error ? distributedError.message : String(distributedError)
            });
            res = await scheduleLocal();
          } else {
            throw distributedError;
          }
        }
      } else {
        res = await scheduleLocal();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/JUDGE_TIMEOUT/i.test(msg) || /JUDGE_ABORTED/i.test(msg)) {
        logger.error("[judge] timeout", {
          submissionId: req.submission_id,
          language: req.language,
          tests: req.tests?.length ?? 0,
          error: msg
        });
      } else {
        logger.error("[judge] crash/unavailable", {
          submissionId: req.submission_id,
          language: req.language,
          tests: req.tests?.length ?? 0,
          error: msg
        });
      }
      // Keep overload semantics.
      if (e instanceof HttpError) throw e;
      throw toJudgeUnavailable(e);
    } finally {
      clearTimeout(timeoutHandle);
      detachExternalAbort();
    }
    const finishedAt = Date.now();
    const slowMs = Number(env.JUDGE_LOG_SLOW_MS || 1500);
    if (Number.isFinite(slowMs) && finishedAt - startedAt >= slowMs) {
      const totalMs = finishedAt - startedAt;
      const snap = getJudgeExecutionMetrics();
      logger.warn('[judge] slow', {
        submissionId: req.submission_id,
        language: req.language,
        tests: req.tests?.length ?? 0,
        totalMs,
        verdict: res.verdict,
        mode: getExecutionQueueMode(),
        active: snap.active,
        queued: snap.queued,
        avgExecutionTimeMs: Math.round(snap.avgExecutionTimeMs)
      });
    }
    return res;
  } catch (e: unknown) {
    if (e instanceof HttpError) throw e;
    throw toJudgeUnavailable(e);
  }
}

export function getJudgeExecutionMetrics(): ExecutionSchedulerSnapshot {
  if (distributedJudgeQueue.isEnabled()) {
    return distributedJudgeQueue.snapshot();
  }
  return executionScheduler.snapshot();
}

type JudgeDeadLetterItem = {
  jobId: string;
  submissionId: string | null;
  state: string | null;
  attempts: number;
  updatedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type JudgeDeadLetterListResponse = {
  mode: "distributed" | "local";
  total: number;
  items: JudgeDeadLetterItem[];
};

export type JudgeDeadLetterReplayResponse = {
  mode: "distributed" | "local";
  moved: number;
  skipped: number;
  remaining: number;
  queued: number;
  limit: number;
};

function toIso(ms: number | null): string | null {
  if (!Number.isFinite(ms ?? NaN) || (ms ?? 0) <= 0) return null;
  return new Date(ms as number).toISOString();
}

function mapDeadLetterItems(data: DistributedDeadLetterListResult): JudgeDeadLetterItem[] {
  return data.items.map(item => ({
    jobId: item.jobId,
    submissionId: item.submissionId,
    state: item.state,
    attempts: item.attempts,
    updatedAt: toIso(item.updatedAtMs),
    finishedAt: toIso(item.finishedAtMs),
    error: item.error,
  }));
}

export async function getJudgeDeadLetterQueue(limit = 50): Promise<JudgeDeadLetterListResponse> {
  const mode = getExecutionQueueMode();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;

  if (!distributedJudgeQueue.isEnabled()) {
    return {
      mode,
      total: 0,
      items: [],
    };
  }

  try {
    const data = await distributedJudgeQueue.listDeadLetterJobs(safeLimit);
    return {
      mode,
      total: data.total,
      items: mapDeadLetterItems(data),
    };
  } catch (error: unknown) {
    if (isDistributedQueueUnavailableError(error)) {
      return {
        mode: "local",
        total: 0,
        items: [],
      };
    }
    throw error;
  }
}

export async function replayJudgeDeadLetterQueue(limit = 20): Promise<JudgeDeadLetterReplayResponse> {
  const mode = getExecutionQueueMode();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 20;

  if (!distributedJudgeQueue.isEnabled()) {
    return {
      mode,
      moved: 0,
      skipped: 0,
      remaining: 0,
      queued: executionScheduler.snapshot().queued,
      limit: safeLimit,
    };
  }

  try {
    const result: DistributedDeadLetterReplayResult = await distributedJudgeQueue.replayDeadLetter(safeLimit);
    return {
      mode,
      moved: result.moved,
      skipped: result.skipped,
      remaining: result.remaining,
      queued: result.queued,
      limit: safeLimit,
    };
  } catch (error: unknown) {
    if (isDistributedQueueUnavailableError(error)) {
      return {
        mode: "local",
        moved: 0,
        skipped: 0,
        remaining: 0,
        queued: executionScheduler.snapshot().queued,
        limit: safeLimit,
      };
    }
    throw error;
  }
}

function estimateBackendHardTimeoutMs(req: JudgeRequest): number {
  return estimateJudgeExecutionTimeoutMs(req, env.JUDGE_BACKEND_TIMEOUT_CAP_MS);
}

function productionJudgeDetails(value: unknown): { kind?: unknown; exitCode?: unknown } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const details = value as Record<string, unknown>;
  return { kind: details.kind, exitCode: details.exitCode };
}
