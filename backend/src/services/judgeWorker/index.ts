import { JudgeClient } from "./JudgeClient";
import type { JudgeRequest, JudgeResponse } from "./types";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { executionScheduler } from "../execution/executionSchedulerSingleton";
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
    const anyErr = err as any;
    if (typeof anyErr?.toDebugJSON === "function") {
      try {
        return anyErr.toDebugJSON();
      } catch {
        return { name: anyErr?.name, message: msg };
      }
    }
    return { name: anyErr?.name, message: msg };
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
      details: process.env.NODE_ENV === "production"
        ? { kind: (judgeClientDetails as any)?.kind, exitCode: (judgeClientDetails as any)?.exitCode }
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
    details: process.env.NODE_ENV === "production"
      ? (judgeClientDetails ? { kind: (judgeClientDetails as any).kind, exitCode: (judgeClientDetails as any).exitCode } : undefined)
      : (judgeClientDetails ?? msg.slice(0, 2000)),
    cause: err
  });
}

export async function judgeWithSemaphore(req: JudgeRequest, options: JudgeWithSemaphoreOptions = {}): Promise<JudgeResponse> {
  const startedAt = Date.now();
  try {
    const enqueueLabel = `judge submission=${req.submission_id} lang=${req.language} tests=${req.tests?.length ?? 0}`;
    const timeoutMsRaw = Number(process.env.JUDGE_BACKEND_TIMEOUT_MS ?? "");
    const dynamicTimeoutMs = estimateBackendHardTimeoutMs(req);
    const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? (options.timeoutMs as number)
      : Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? timeoutMsRaw
        : dynamicTimeoutMs;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`JUDGE_TIMEOUT: backend hard timeout ${timeoutMs}ms`));
    }, timeoutMs);

    let detachExternalAbort = () => undefined;
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort((options.signal as any).reason ?? new Error("JUDGE_ABORTED"));
      } else {
        const onAbort = () => controller.abort((options.signal as any).reason ?? new Error("JUDGE_ABORTED"));
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

    let res: JudgeResponse;
    try {
      res = await executionScheduler.schedule(
        () => client.judge(req, { signal: controller.signal }),
        {
          signal: controller.signal,
          label: enqueueLabel,
        }
      );
    } catch (e: any) {
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
    const slowMs = Number(process.env.JUDGE_LOG_SLOW_MS || 1500);
    if (Number.isFinite(slowMs) && finishedAt - startedAt >= slowMs) {
      const totalMs = finishedAt - startedAt;
      const snap = executionScheduler.snapshot();
      logger.warn('[judge] slow', {
        submissionId: req.submission_id,
        language: req.language,
        tests: req.tests?.length ?? 0,
        totalMs,
        verdict: res.verdict,
        active: snap.active,
        queued: snap.queued,
        avgExecutionTimeMs: Math.round(snap.avgExecutionTimeMs)
      });
    }
    return res;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    throw toJudgeUnavailable(e);
  }
}

function estimateBackendHardTimeoutMs(req: JudgeRequest): number {
  const tests = Math.max(1, req.tests?.length ?? 0);
  const perTestMs = Math.max(1, req.limits?.time_limit_ms ?? 1000);

  // Backend timeout should exceed expected worker timeout to avoid premature aborts,
  // especially for compile-heavy languages and larger test suites.
  const baseMs = tests * (perTestMs + 120);
  const compileHeadroomMs =
    req.language === "python" ? 1_000 :
    req.language === "cpp" || req.language === "c" ? 4_000 :
    req.language === "java" ? 8_000 :
    req.language === "kotlin" ? 35_000 :
    req.language === "csharp" ? 40_000 :
    5_000;

  // Small fixed margin for scheduler/process overhead.
  const estimatedMs = baseMs + compileHeadroomMs + 3_000;

  const capRaw = Number.parseInt(String(process.env.JUDGE_BACKEND_TIMEOUT_CAP_MS ?? ""), 10);
  const capMs = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 120_000;

  return Math.min(capMs, Math.max(15_000, estimatedMs));
}