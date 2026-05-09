import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";

export type ExecutionSchedulerSnapshot = {
  maxConcurrent: number;
  maxQueueSize: number;
  maxRetries: number;
  active: number;
  queued: number;
  deadLetterQueueLength: number;
  peakActive: number;
  peakQueueLength: number;
  started: number;
  totalCompleted: number;
  totalRejectedQueueFull: number;
  totalRequeuedExpired: number;
  totalDeadLettered: number;
  avgExecutionTimeMs: number;
  emaExecutionTimeMs: number;
  averageQueueWaitTime: number;
};

export type ScheduleOptions = {
  /** If aborted while queued, the task is removed from the queue and rejected. */
  signal?: AbortSignal;
  /** Optional label used only for logs. */
  label?: string;
};

type QueuedTask<T> = {
  enqueuedAt: number;
  options: ScheduleOptions;
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  onAbort?: () => void;
};

function nowMs(): number {
  return Date.now();
}

/** In-process FIFO scheduler with bounded queue and deterministic 503 overload. */
export class ExecutionScheduler {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;

  private active = 0;
  private peakActive = 0;
  private peakQueueLength = 0;
  private readonly queue: Array<QueuedTask<any>> = [];

  private started = 0;
  private completed = 0;
  private rejectedQueueFull = 0;

  private startedFromQueue = 0;
  private totalQueueWaitMs = 0;

  private totalExecMs = 0;
  private emaExecMs = 0;
  private readonly emaAlpha: number;

  private logTimer: NodeJS.Timeout | null = null;

  constructor(params: {
    maxConcurrent: number;
    maxQueueSize: number;
    /** 0 disables periodic logs. */
    logIntervalMs?: number;
    /** EMA smoothing factor, 0..1. Default 0.2. */
    emaAlpha?: number;
  }) {
    const mc = Math.floor(params.maxConcurrent);
    const mq = Math.floor(params.maxQueueSize);
    if (!Number.isFinite(mc) || mc <= 0) throw new Error("ExecutionScheduler: maxConcurrent must be > 0");
    if (!Number.isFinite(mq) || mq < 0) throw new Error("ExecutionScheduler: maxQueueSize must be >= 0");
    this.maxConcurrent = mc;
    this.maxQueueSize = mq;

    const alpha = params.emaAlpha ?? 0.2;
    this.emaAlpha = alpha > 0 && alpha <= 1 ? alpha : 0.2;

    const interval = Math.floor(params.logIntervalMs ?? 10_000);
    if (Number.isFinite(interval) && interval > 0) {
      this.logTimer = setInterval(() => {
        const s = this.snapshot();
        logger.info("[exec] load", {
          active: s.active,
          queued: s.queued,
          peakActive: s.peakActive,
          peakQueueLength: s.peakQueueLength,
          avgMs: Math.round(s.avgExecutionTimeMs),
          emaMs: Math.round(s.emaExecutionTimeMs),
          avgQueueWaitMs: Math.round(s.averageQueueWaitTime),
          rejected: s.totalRejectedQueueFull,
          started: s.started,
          completed: s.totalCompleted,
          maxConcurrent: s.maxConcurrent,
          maxQueueSize: s.maxQueueSize,
        });
      }, interval);
      (this.logTimer as any).unref?.();
    }
  }

  snapshot(): ExecutionSchedulerSnapshot {
    const avg = this.completed > 0 ? this.totalExecMs / this.completed : 0;
    const avgQueueWait = this.startedFromQueue > 0 ? this.totalQueueWaitMs / this.startedFromQueue : 0;
    return {
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      maxRetries: 0,
      active: this.active,
      queued: this.queue.length,
      deadLetterQueueLength: 0,
      peakActive: this.peakActive,
      peakQueueLength: this.peakQueueLength,
      started: this.started,
      totalCompleted: this.completed,
      totalRejectedQueueFull: this.rejectedQueueFull,
      totalRequeuedExpired: 0,
      totalDeadLettered: 0,
      avgExecutionTimeMs: avg,
      emaExecutionTimeMs: this.emaExecMs,
      averageQueueWaitTime: avgQueueWait,
    };
  }

  /** Alias for external monitoring code. */
  getMetrics(): ExecutionSchedulerSnapshot {
    return this.snapshot();
  }

  /**
   * Schedule a task respecting concurrency and queue limits.
   *
   * - If a slot is available and no queue backlog, starts immediately.
   * - Otherwise enqueues FIFO.
   * - If queue is full, rejects with HttpError(503, "System busy").
   */
  schedule<T>(run: () => Promise<T>, options: ScheduleOptions = {}): Promise<T> {
    const signal = options.signal;
    if (signal?.aborted) {
      const reason = (signal as any)?.reason;
      return Promise.reject(reason ?? new Error("ABORTED"));
    }

    // Strict FIFO: if there is a backlog, new work joins the queue.
    if (this.active < this.maxConcurrent && this.queue.length === 0) {
      return this.startNow(run, options);
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.rejectedQueueFull++;
      logger.warn("[exec] queue full", {
        active: this.active,
        queued: this.queue.length,
        maxConcurrent: this.maxConcurrent,
        maxQueueSize: this.maxQueueSize,
        label: options.label,
        rejectedQueueFull: this.rejectedQueueFull,
      });
      return Promise.reject(new HttpError(503, "System busy", { code: "SYSTEM_BUSY", expose: true }));
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        enqueuedAt: nowMs(),
        options,
        run,
        resolve,
        reject,
      };

      if (signal) {
        const onAbort = () => {
          const idx = this.queue.indexOf(task);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject((signal as any)?.reason ?? new Error("ABORTED"));
        };
        task.onAbort = onAbort;
        try {
          signal.addEventListener("abort", onAbort, { once: true });
        } catch {}
      }

      this.queue.push(task);
      if (this.queue.length > this.peakQueueLength) this.peakQueueLength = this.queue.length;
      this.pump();
    });
  }

  private startNow<T>(run: () => Promise<T>, options: ScheduleOptions): Promise<T> {
    this.active++;
    this.started++;
    if (this.active > this.peakActive) this.peakActive = this.active;

    const startedAt = nowMs();
    const label = options.label;
    const signal = options.signal;

    return (async () => {
      try {
        if (signal?.aborted) {
          const reason = (signal as any)?.reason;
          throw reason ?? new Error("ABORTED");
        }
        return await run();
      } finally {
        const finishedAt = nowMs();
        const dur = Math.max(0, finishedAt - startedAt);
        this.completed++;
        this.totalExecMs += dur;
        this.emaExecMs = this.emaExecMs <= 0 ? dur : this.emaExecMs * (1 - this.emaAlpha) + dur * this.emaAlpha;

        this.active = Math.max(0, this.active - 1);
        if (label && dur >= 5_000) {
          logger.warn("[exec] slow task", {
            label,
            durationMs: dur,
            active: this.active,
            queued: this.queue.length,
          });
        }
        this.pump();
      }
    })();
  }

  private pump() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;

      const waitMs = Math.max(0, nowMs() - task.enqueuedAt);
      this.startedFromQueue++;
      this.totalQueueWaitMs += waitMs;

      if (task.onAbort && task.options.signal) {
        try {
          task.options.signal.removeEventListener("abort", task.onAbort);
        } catch {}
      }

      if (task.options.signal?.aborted) {
        const reason = (task.options.signal as any)?.reason;
        task.reject(reason ?? new Error("ABORTED"));
        continue;
      }

      this.startNow(task.run, task.options)
        .then(task.resolve)
        .catch(task.reject);
    }
  }
}
