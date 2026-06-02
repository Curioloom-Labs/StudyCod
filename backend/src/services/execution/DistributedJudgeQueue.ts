import { randomUUID } from "crypto";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import type { JudgeRequest, JudgeResponse } from "../judgeWorker/types";
import { JudgeClient } from "../judgeWorker/JudgeClient";
import { getSharedRedisClient, redisKey } from "../redis/sharedRedis";
import type { ExecutionSchedulerSnapshot } from "./ExecutionScheduler";

type SharedRedisMulti = {
  hSet(key: string, values: Record<string, string>): SharedRedisMulti;
  pExpire(key: string, ttlMs: number): SharedRedisMulti;
  zRem(key: string, member: string): SharedRedisMulti;
  hIncrBy(key: string, field: string, increment: number): SharedRedisMulti;
  exec(): Promise<unknown>;
};

type SharedRedisClient = {
  sendCommand(args: string[]): Promise<unknown>;
  hmGet(key: string, fields: string[]): Promise<Array<string | null>>;
  hGet(key: string, field: string): Promise<string | null>;
  hGetAll(key: string): Promise<Record<string, string>>;
  lLen(key: string): Promise<number>;
  zCard(key: string): Promise<number>;
  multi(): SharedRedisMulti;
};

export class DistributedQueueUnavailableError extends Error {
  constructor(message: string = "DISTRIBUTED_QUEUE_UNAVAILABLE") {
    super(message);
    this.name = "DistributedQueueUnavailableError";
  }
}

function getAbortReason(signal: AbortSignal): unknown {
  if ("reason" in signal) {
    return (signal as AbortSignal & { reason?: unknown }).reason;
  }
  return undefined;
}

export function isDistributedQueueUnavailableError(error: unknown): error is DistributedQueueUnavailableError {
  if (!error || typeof error !== "object") return false;
  if (error instanceof DistributedQueueUnavailableError) return true;
  const maybeError = error as Partial<Error>;
  if (maybeError.name === "DistributedQueueUnavailableError") return true;
  const msg = String(maybeError.message ?? "");
  return /DISTRIBUTED_QUEUE_UNAVAILABLE/i.test(msg) || /DISTRIBUTED_QUEUE_DISABLED/i.test(msg);
}

export type DistributedExecuteOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  label?: string;
};

export type DistributedDeadLetterJobItem = {
  jobId: string;
  submissionId: string | null;
  state: string | null;
  attempts: number;
  updatedAtMs: number | null;
  finishedAtMs: number | null;
  error: string | null;
};

export type DistributedDeadLetterListResult = {
  total: number;
  items: DistributedDeadLetterJobItem[];
};

export type DistributedDeadLetterReplayResult = {
  moved: number;
  skipped: number;
  remaining: number;
  queued: number;
};

type DistributedCounters = {
  started: number;
  completed: number;
  rejectedQueueFull: number;
  startedFromQueue: number;
  queueWaitMsTotal: number;
  execMsTotal: number;
  requeuedExpired: number;
  deadLettered: number;
};

function toInt(raw: unknown, fallback = 0): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clampNonNegativeInt(raw: unknown, fallback = 0): number {
  const n = toInt(raw, fallback);
  return n >= 0 ? n : fallback;
}

function nowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateErrorMessage(raw: unknown, max = 16_000): string {
  const text = raw instanceof Error ? (raw.stack || raw.message) : String(raw ?? "Unknown distributed queue error");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function parseEpochMs(raw: unknown): number | null {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ENQUEUE_LUA = `
local queueKey = KEYS[1]
local jobKey = KEYS[2]
local statsKey = KEYS[3]

local maxQueue = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local payload = ARGV[3]
local submissionId = ARGV[4]
local jobId = ARGV[5]
local ttlMs = tonumber(ARGV[6])

local qLen = redis.call('LLEN', queueKey)
if qLen >= maxQueue then
  redis.call('HINCRBY', statsKey, 'rejected_queue_full', 1)
  return {0, qLen}
end

redis.call('HSET', jobKey,
  'id', jobId,
  'state', 'queued',
  'payload', payload,
  'submission_id', submissionId,
  'attempts', 0,
  'created_at', now,
  'updated_at', now,
  'enqueued_at', now
)

if ttlMs and ttlMs > 0 then
  redis.call('PEXPIRE', jobKey, ttlMs)
end

redis.call('RPUSH', queueKey, jobId)
return {1, qLen + 1}
`;

const CLAIM_NEXT_LUA = `
local queueKey = KEYS[1]
local processingKey = KEYS[2]
local statsKey = KEYS[3]

local jobPrefix = ARGV[1]
local now = tonumber(ARGV[2])
local leaseUntil = tonumber(ARGV[3])
local owner = ARGV[4]
local maxConcurrent = tonumber(ARGV[5])

while true do
  if maxConcurrent and maxConcurrent >= 0 then
    local active = redis.call('ZCARD', processingKey)
    if active >= maxConcurrent then
      return nil
    end
  end

  local id = redis.call('LPOP', queueKey)
  if not id then
    return nil
  end

  local jobKey = jobPrefix .. id
  if redis.call('EXISTS', jobKey) == 1 then
    local state = redis.call('HGET', jobKey, 'state')
    if not state or state == 'queued' then
      local enqueuedAt = tonumber(redis.call('HGET', jobKey, 'enqueued_at') or now)
      local waitMs = math.max(0, now - enqueuedAt)
      redis.call('HSET', jobKey,
        'state', 'running',
        'owner', owner,
        'started_at', now,
        'updated_at', now,
        'lease_until', leaseUntil
      )
      redis.call('ZADD', processingKey, leaseUntil, id)
      redis.call('HINCRBY', statsKey, 'started', 1)
      redis.call('HINCRBY', statsKey, 'started_from_queue', 1)
      redis.call('HINCRBY', statsKey, 'queue_wait_ms_total', waitMs)
      return id
    end
  end
end
`;

const REQUEUE_EXPIRED_LUA = `
local processingKey = KEYS[1]
local queueKey = KEYS[2]
local statsKey = KEYS[3]
local deadLetterKey = KEYS[4]

local jobPrefix = ARGV[1]
local now = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local maxRetries = tonumber(ARGV[4])
local resultTtlMs = tonumber(ARGV[5])
local deadLetterMaxItems = tonumber(ARGV[6])

local expired = redis.call('ZRANGEBYSCORE', processingKey, '-inf', now, 'LIMIT', 0, limit)
local requeued = 0
local deadLettered = 0

for _, id in ipairs(expired) do
  local jobKey = jobPrefix .. id
  local state = redis.call('HGET', jobKey, 'state')
  local lease = tonumber(redis.call('HGET', jobKey, 'lease_until') or '0')

  if state == 'running' and lease <= now then
    local attempts = tonumber(redis.call('HGET', jobKey, 'attempts') or '0')
    local nextAttempts = attempts + 1

    if maxRetries and maxRetries >= 0 and nextAttempts > maxRetries then
      redis.call('HSET', jobKey,
        'state', 'dead_letter',
        'owner', '',
        'updated_at', now,
        'finished_at', now,
        'attempts', nextAttempts,
        'error', 'JUDGE_QUEUE_RETRY_EXHAUSTED'
      )
      redis.call('ZREM', processingKey, id)
      redis.call('LPUSH', deadLetterKey, id)
      if deadLetterMaxItems and deadLetterMaxItems > 0 then
        redis.call('LTRIM', deadLetterKey, 0, deadLetterMaxItems - 1)
      end
      if resultTtlMs and resultTtlMs > 0 then
        redis.call('PEXPIRE', jobKey, resultTtlMs)
      end
      redis.call('HINCRBY', statsKey, 'dead_lettered', 1)
      deadLettered = deadLettered + 1
    else
      redis.call('HSET', jobKey,
        'state', 'queued',
        'owner', '',
        'updated_at', now,
        'attempts', nextAttempts
      )
      redis.call('ZREM', processingKey, id)
      redis.call('RPUSH', queueKey, id)
      redis.call('HINCRBY', statsKey, 'requeued_expired', 1)
      requeued = requeued + 1
    end
  elseif state ~= 'running' then
    redis.call('ZREM', processingKey, id)
  end
end

return {requeued, deadLettered}
`;

const CANCEL_QUEUED_LUA = `
local queueKey = KEYS[1]
local jobKey = KEYS[2]

local now = tonumber(ARGV[1])
local reason = ARGV[2]
local ttlMs = tonumber(ARGV[3])

local state = redis.call('HGET', jobKey, 'state')
if not state then
  return 0
end

if state == 'queued' then
  local id = redis.call('HGET', jobKey, 'id')
  if id then
    redis.call('LREM', queueKey, 0, id)
  end
  redis.call('HSET', jobKey,
    'state', 'cancelled',
    'error', reason,
    'updated_at', now,
    'finished_at', now
  )
  if ttlMs and ttlMs > 0 then
    redis.call('PEXPIRE', jobKey, ttlMs)
  end
  return 1
end

return 0
`;

const REPLAY_DEAD_LETTER_LUA = `
local deadLetterKey = KEYS[1]
local queueKey = KEYS[2]
local statsKey = KEYS[3]

local jobPrefix = ARGV[1]
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local maxQueue = tonumber(ARGV[4])

local moved = 0
local skipped = 0

for i = 1, limit do
  local id = redis.call('RPOP', deadLetterKey)
  if not id then
    break
  end

  if maxQueue and maxQueue >= 0 and redis.call('LLEN', queueKey) >= maxQueue then
    redis.call('RPUSH', deadLetterKey, id)
    skipped = skipped + 1
    break
  end

  local jobKey = jobPrefix .. id
  if redis.call('EXISTS', jobKey) == 1 then
    local state = redis.call('HGET', jobKey, 'state')
    if state == 'dead_letter' or state == 'failed' or state == 'cancelled' then
      redis.call('HSET', jobKey,
        'state', 'queued',
        'owner', '',
        'updated_at', now,
        'enqueued_at', now
      )
      redis.call('HDEL', jobKey, 'error', 'result')
      redis.call('RPUSH', queueKey, id)
      moved = moved + 1
    else
      skipped = skipped + 1
    end
  else
    skipped = skipped + 1
  end
end

if moved > 0 then
  redis.call('HINCRBY', statsKey, 'replayed_dead_letter', moved)
end

local remaining = redis.call('LLEN', deadLetterKey)
local queued = redis.call('LLEN', queueKey)
return {moved, skipped, remaining, queued}
`;

export class DistributedJudgeQueue {
  private readonly enabled: boolean;
  /** Per-instance cap: how many jobs THIS process runs concurrently. */
  private readonly maxConcurrent: number;
  /**
   * Cluster-wide cap enforced in the CLAIM Lua against the shared processing
   * set. Defaults to maxConcurrent (preserving historical single-instance
   * behaviour), but operators running N backend replicas must raise this to
   * N * per-instance to actually scale throughput — otherwise the whole
   * cluster is pinned to one instance's worth of concurrency.
   */
  private readonly maxGlobalConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly maxRetries: number;
  private readonly deadLetterMaxItems: number;
  private readonly pollIntervalMs: number;
  private readonly claimTtlMs: number;
  private readonly resultTtlMs: number;
  private readonly resultPollMs: number;
  private readonly logIntervalMs: number;
  private readonly ownerId: string;

  private readonly queueKey = redisKey("execq", "pending");
  private readonly processingKey = redisKey("execq", "processing");
  private readonly deadLetterKey = redisKey("execq", "dead_letter");
  private readonly statsKey = redisKey("execq", "stats");
  private readonly jobKeyPrefix = `${redisKey("execq", "job")}:`;

  private readonly client = new JudgeClient();

  private tickInProgress = false;
  private activeLocal = 0;
  private peakActiveObserved = 0;
  private peakQueueObserved = 0;
  private cachedQueued = 0;
  private cachedActiveGlobal = 0;
  private cachedDeadLetter = 0;
  private cachedEmaExecMs = 0;
  private lastStatRefreshAt = 0;
  private counters: DistributedCounters = {
    started: 0,
    completed: 0,
    rejectedQueueFull: 0,
    startedFromQueue: 0,
    queueWaitMsTotal: 0,
    execMsTotal: 0,
    requeuedExpired: 0,
    deadLettered: 0,
  };

  constructor(params: {
    enabled: boolean;
    maxConcurrent: number;
    maxGlobalConcurrent?: number;
    maxQueueSize: number;
    maxRetries: number;
    deadLetterMaxItems: number;
    pollIntervalMs: number;
    claimTtlMs: number;
    resultTtlMs: number;
    resultPollMs: number;
    logIntervalMs: number;
  }) {
    this.enabled = Boolean(params.enabled);
    this.maxConcurrent = Math.max(1, Math.floor(params.maxConcurrent));
    // Global cap can never be lower than the local cap (that would be
    // self-contradictory); default to the local cap for backward compatibility.
    const requestedGlobal = Number.isFinite(params.maxGlobalConcurrent as number)
      ? Math.floor(params.maxGlobalConcurrent as number)
      : this.maxConcurrent;
    this.maxGlobalConcurrent = Math.max(this.maxConcurrent, requestedGlobal);
    this.maxQueueSize = Math.max(0, Math.floor(params.maxQueueSize));
    this.maxRetries = Math.max(0, Math.floor(params.maxRetries));
    this.deadLetterMaxItems = Math.max(10, Math.floor(params.deadLetterMaxItems));
    this.pollIntervalMs = Math.max(20, Math.floor(params.pollIntervalMs));
    this.claimTtlMs = Math.max(30_000, Math.floor(params.claimTtlMs));
    this.resultTtlMs = Math.max(30_000, Math.floor(params.resultTtlMs));
    this.resultPollMs = Math.max(10, Math.floor(params.resultPollMs));
    this.logIntervalMs = Math.max(1_000, Math.floor(params.logIntervalMs));
    this.ownerId = `${process.pid}:${randomUUID()}`;

    if (this.enabled) {
      const tickTimer = setInterval(() => {
        void this.tick();
      }, this.pollIntervalMs);
      tickTimer.unref?.();

      const logTimer = setInterval(() => {
        const s = this.snapshot();
        logger.info("[exec-redis] load", {
          mode: "distributed",
          active: s.active,
          queued: s.queued,
          peakActive: s.peakActive,
          peakQueueLength: s.peakQueueLength,
          avgMs: Math.round(s.avgExecutionTimeMs),
          emaMs: Math.round(s.emaExecutionTimeMs),
          avgQueueWaitMs: Math.round(s.averageQueueWaitTime),
          rejected: s.totalRejectedQueueFull,
          requeuedExpired: s.totalRequeuedExpired,
          deadLettered: s.totalDeadLettered,
          deadLetterQueueLength: s.deadLetterQueueLength,
          started: s.started,
          completed: s.totalCompleted,
          maxConcurrent: s.maxConcurrent,
          maxQueueSize: s.maxQueueSize,
          maxRetries: s.maxRetries,
        });
      }, this.logIntervalMs);
      logTimer.unref?.();

      void this.tick();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getMode(): "distributed" | "local" {
    return this.enabled ? "distributed" : "local";
  }

  public snapshot(): ExecutionSchedulerSnapshot {
    const completed = Math.max(0, this.counters.completed);
    const startedFromQueue = Math.max(0, this.counters.startedFromQueue);

    const avgExecutionTimeMs = completed > 0
      ? this.counters.execMsTotal / completed
      : 0;

    const avgQueueWaitMs = startedFromQueue > 0
      ? this.counters.queueWaitMsTotal / startedFromQueue
      : 0;

    return {
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      maxRetries: this.maxRetries,
      active: this.cachedActiveGlobal,
      queued: this.cachedQueued,
      deadLetterQueueLength: this.cachedDeadLetter,
      peakActive: this.peakActiveObserved,
      peakQueueLength: this.peakQueueObserved,
      started: this.counters.started,
      totalCompleted: this.counters.completed,
      totalRejectedQueueFull: this.counters.rejectedQueueFull,
      totalRequeuedExpired: this.counters.requeuedExpired,
      totalDeadLettered: this.counters.deadLettered,
      avgExecutionTimeMs,
      emaExecutionTimeMs: this.cachedEmaExecMs,
      averageQueueWaitTime: avgQueueWaitMs,
    };
  }

  public getMetrics(): ExecutionSchedulerSnapshot {
    return this.snapshot();
  }

  public async listDeadLetterJobs(limit = 50): Promise<DistributedDeadLetterListResult> {
    if (!this.enabled) {
      throw new DistributedQueueUnavailableError("DISTRIBUTED_QUEUE_DISABLED");
    }

    const redis = await this.getRedisOrThrow("list-dead-letter");
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

    const [idsRaw, totalRaw] = await Promise.all([
      redis.sendCommand(["LRANGE", this.deadLetterKey, "0", String(safeLimit - 1)]),
      redis.lLen(this.deadLetterKey),
    ]);

    const ids = Array.isArray(idsRaw)
      ? idsRaw.map(id => String(id ?? "").trim()).filter(Boolean)
      : [];

    const items = await Promise.all(ids.map(async jobId => {
      const [submissionIdRaw, stateRaw, attemptsRaw, updatedAtRaw, finishedAtRaw, errorRaw] = await redis.hmGet(
        this.jobKey(jobId),
        ["submission_id", "state", "attempts", "updated_at", "finished_at", "error"]
      );

      return {
        jobId,
        submissionId: submissionIdRaw ? String(submissionIdRaw) : null,
        state: stateRaw ? String(stateRaw) : null,
        attempts: clampNonNegativeInt(attemptsRaw, 0),
        updatedAtMs: parseEpochMs(updatedAtRaw),
        finishedAtMs: parseEpochMs(finishedAtRaw),
        error: errorRaw ? String(errorRaw) : null,
      };
    }));

    return {
      total: clampNonNegativeInt(totalRaw, items.length),
      items,
    };
  }

  public async replayDeadLetter(limit = 20): Promise<DistributedDeadLetterReplayResult> {
    if (!this.enabled) {
      throw new DistributedQueueUnavailableError("DISTRIBUTED_QUEUE_DISABLED");
    }

    const redis = await this.getRedisOrThrow("replay-dead-letter");
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const raw = await redis.sendCommand([
      "EVAL",
      REPLAY_DEAD_LETTER_LUA,
      "3",
      this.deadLetterKey,
      this.queueKey,
      this.statsKey,
      this.jobKeyPrefix,
      String(safeLimit),
      String(nowMs()),
      String(this.maxQueueSize),
    ]);

    const [movedRaw, skippedRaw, remainingRaw, queuedRaw] = Array.isArray(raw)
      ? raw
      : [0, 0, 0, 0];

    const result = {
      moved: clampNonNegativeInt(movedRaw, 0),
      skipped: clampNonNegativeInt(skippedRaw, 0),
      remaining: clampNonNegativeInt(remainingRaw, 0),
      queued: clampNonNegativeInt(queuedRaw, 0),
    };

    await this.refreshStats(redis);
    if (result.moved > 0) {
      void this.tick();
    }

    return result;
  }

  public async execute(request: JudgeRequest, options: DistributedExecuteOptions = {}): Promise<JudgeResponse> {
    if (!this.enabled) {
      throw new DistributedQueueUnavailableError("DISTRIBUTED_QUEUE_DISABLED");
    }

    const redis = await this.getRedisOrThrow("enqueue");
    const now = nowMs();
    const jobId = randomUUID();
    const jobKey = this.jobKey(jobId);
    const payload = JSON.stringify(request);
    const waitTimeoutMs = (() => {
      const raw = Number(options.timeoutMs);
      if (Number.isFinite(raw) && raw > 0) return Math.max(1_000, Math.floor(raw));
      return 120_000;
    })();

    const enqueueTtlMs = Math.max(this.resultTtlMs, waitTimeoutMs + this.claimTtlMs + 10_000);
    const enqueueResult = await redis.sendCommand([
      "EVAL",
      ENQUEUE_LUA,
      "3",
      this.queueKey,
      jobKey,
      this.statsKey,
      String(this.maxQueueSize),
      String(now),
      payload,
      String(request.submission_id ?? ""),
      jobId,
      String(enqueueTtlMs),
    ]);

    const [okRaw, queuedLenRaw] = Array.isArray(enqueueResult)
      ? enqueueResult
      : [0, 0];

    const ok = toInt(okRaw, 0);
    const queuedLen = clampNonNegativeInt(queuedLenRaw, 0);

    if (ok !== 1) {
      await this.refreshStats(redis);
      throw new HttpError(503, "System busy", {
        code: "SYSTEM_BUSY",
        expose: true,
      });
    }

    this.cachedQueued = queuedLen;
    if (queuedLen > this.peakQueueObserved) this.peakQueueObserved = queuedLen;

    void this.tick();
    return this.waitForResult(jobId, jobKey, waitTimeoutMs, options.signal);
  }

  private async waitForResult(jobId: string, jobKey: string, waitTimeoutMs: number, signal?: AbortSignal): Promise<JudgeResponse> {
    const deadline = nowMs() + waitTimeoutMs;

    // Adaptive polling backoff. A fixed short interval means every concurrent
    // submission hammers Redis with O(1/resultPollMs) GET/s purely to wait —
    // under a contest spike that is thousands of GET/s on the shared Redis. Most
    // judge runs take far longer than the floor interval, so we start fast (to
    // keep trivial programs snappy) and grow the interval up to a cap, which
    // cuts steady-state polling ~5-6x while bounding tail latency to maxPollMs.
    const minPollMs = this.resultPollMs;
    const maxPollMs = Math.max(minPollMs, 250);
    let pollMs = minPollMs;
    const backoff = () => { pollMs = Math.min(maxPollMs, Math.ceil(pollMs * 1.5)); };

    while (nowMs() < deadline) {
      if (signal?.aborted) {
        const reason = getAbortReason(signal);
        await this.cancelQueuedJob(jobId, truncateErrorMessage(reason ?? "JUDGE_ABORTED"));
        throw reason ?? new Error("JUDGE_ABORTED");
      }

      const redis = (await getSharedRedisClient()) as SharedRedisClient | null;
      if (!redis) {
        await sleep(pollMs);
        backoff();
        continue;
      }

      const row = await redis.hmGet(jobKey, ["state", "result", "error"]);
      const state = String(row?.[0] ?? "").trim().toLowerCase();
      const resultRaw = row?.[1];
      const errorRaw = row?.[2];

      if (state === "done") {
        if (!resultRaw) {
          throw new Error("JUDGE_QUEUE_RESULT_MISSING");
        }
        try {
          return JSON.parse(resultRaw) as JudgeResponse;
        } catch {
          throw new Error("JUDGE_QUEUE_RESULT_BAD_JSON");
        }
      }

      if (state === "failed" || state === "cancelled" || state === "dead_letter") {
        const msg = String(errorRaw ?? "Judge unavailable").trim() || "Judge unavailable";
        throw new Error(msg);
      }

      await sleep(pollMs);
      backoff();
    }

    const timeoutMessage = `JUDGE_TIMEOUT: distributed queue wait timeout ${waitTimeoutMs}ms`;
    await this.cancelQueuedJob(jobId, timeoutMessage);
    throw new Error(timeoutMessage);
  }

  private async cancelQueuedJob(jobId: string, reason: string): Promise<void> {
    try {
      const redis = (await getSharedRedisClient()) as SharedRedisClient | null;
      if (!redis) return;
      const jobKey = this.jobKey(jobId);
      await redis.sendCommand([
        "EVAL",
        CANCEL_QUEUED_LUA,
        "2",
        this.queueKey,
        jobKey,
        String(nowMs()),
        reason,
        String(this.resultTtlMs),
      ]);
    } catch (error: unknown) {
      logger.warn("[exec-redis] failed to cancel queued job", {
        jobId,
        error: truncateErrorMessage(error),
      });
    }
  }

  private async tick(): Promise<void> {
    if (!this.enabled) return;
    if (this.tickInProgress) return;
    this.tickInProgress = true;

    try {
      const redis = (await getSharedRedisClient()) as SharedRedisClient | null;
      if (!redis) return;

      await this.requeueExpiredJobs(redis);
      await this.refreshStats(redis);

      while (this.activeLocal < this.maxConcurrent) {
        const claimedJobId = await this.claimNextJob(redis);
        if (!claimedJobId) break;

        this.activeLocal++;
        if (this.activeLocal > this.peakActiveObserved) {
          this.peakActiveObserved = this.activeLocal;
        }

        void this.runClaimedJob(claimedJobId)
          .catch(error => {
            logger.error("[exec-redis] claimed job crashed", {
              jobId: claimedJobId,
              error: truncateErrorMessage(error),
            });
          })
          .finally(() => {
            this.activeLocal = Math.max(0, this.activeLocal - 1);
            void this.tick();
          });
      }
    } finally {
      this.tickInProgress = false;
    }
  }

  private async claimNextJob(redis: SharedRedisClient): Promise<string | null> {
    const now = nowMs();
    const claimedRaw = await redis.sendCommand([
      "EVAL",
      CLAIM_NEXT_LUA,
      "3",
      this.queueKey,
      this.processingKey,
      this.statsKey,
      this.jobKeyPrefix,
      String(now),
      String(now + this.claimTtlMs),
      this.ownerId,
      String(this.maxGlobalConcurrent),
    ]);

    if (claimedRaw == null) return null;
    const jobId = String(claimedRaw).trim();
    return jobId || null;
  }

  private async runClaimedJob(jobId: string): Promise<void> {
    const startedAt = nowMs();
    const jobKey = this.jobKey(jobId);

    let request: JudgeRequest | null = null;

    try {
      const redis = await this.getRedisOrThrow("load-job");
      const payload = await redis.hGet(jobKey, "payload");
      if (!payload) {
        throw new Error("JUDGE_QUEUE_PAYLOAD_MISSING");
      }

      request = JSON.parse(payload) as JudgeRequest;
      const result = await this.client.judge(request);
      const execMs = Math.max(0, nowMs() - startedAt);
      this.updateLocalEma(execMs);
      await this.markJobDone(jobId, result, execMs);
    } catch (error: unknown) {
      const execMs = Math.max(0, nowMs() - startedAt);
      this.updateLocalEma(execMs);
      const message = truncateErrorMessage(error);
      await this.markJobFailed(jobId, message, execMs);

      logger.warn("[exec-redis] judge execution failed", {
        jobId,
        submissionId: request?.submission_id,
        language: request?.language,
        tests: request?.tests?.length ?? 0,
        error: message,
      });
    }
  }

  private updateLocalEma(execMs: number): void {
    if (this.cachedEmaExecMs <= 0) {
      this.cachedEmaExecMs = execMs;
      return;
    }
    this.cachedEmaExecMs = this.cachedEmaExecMs * 0.8 + execMs * 0.2;
  }

  private async markJobDone(jobId: string, result: JudgeResponse, execMs: number): Promise<void> {
    try {
      const redis = await this.getRedisOrThrow("mark-done");
      const now = nowMs();
      const jobKey = this.jobKey(jobId);
      const serialized = JSON.stringify(result);

      const tx = redis.multi();
      tx.hSet(jobKey, {
        state: "done",
        result: serialized,
        updated_at: String(now),
        finished_at: String(now),
      });
      tx.pExpire(jobKey, this.resultTtlMs);
      tx.zRem(this.processingKey, jobId);
      tx.hIncrBy(this.statsKey, "completed", 1);
      tx.hIncrBy(this.statsKey, "exec_ms_total", Math.max(0, Math.floor(execMs)));
      await tx.exec();

      await this.refreshStats(redis);
    } catch (error: unknown) {
      logger.error("[exec-redis] failed to mark job as done", {
        jobId,
        error: truncateErrorMessage(error),
      });
    }
  }

  private async markJobFailed(jobId: string, errorMessage: string, execMs: number): Promise<void> {
    try {
      const redis = await this.getRedisOrThrow("mark-failed");
      const now = nowMs();
      const jobKey = this.jobKey(jobId);

      const tx = redis.multi();
      tx.hSet(jobKey, {
        state: "failed",
        error: truncateErrorMessage(errorMessage, 24_000),
        updated_at: String(now),
        finished_at: String(now),
      });
      tx.pExpire(jobKey, this.resultTtlMs);
      tx.zRem(this.processingKey, jobId);
      tx.hIncrBy(this.statsKey, "completed", 1);
      tx.hIncrBy(this.statsKey, "exec_ms_total", Math.max(0, Math.floor(execMs)));
      await tx.exec();

      await this.refreshStats(redis);
    } catch (error: unknown) {
      logger.error("[exec-redis] failed to mark job as failed", {
        jobId,
        error: truncateErrorMessage(error),
      });
    }
  }

  private async requeueExpiredJobs(redis: SharedRedisClient): Promise<void> {
    try {
      const movedRaw = await redis.sendCommand([
        "EVAL",
        REQUEUE_EXPIRED_LUA,
        "4",
        this.processingKey,
        this.queueKey,
        this.statsKey,
        this.deadLetterKey,
        this.jobKeyPrefix,
        String(nowMs()),
        "100",
        String(this.maxRetries),
        String(this.resultTtlMs),
        String(this.deadLetterMaxItems),
      ]);

      const [requeuedRaw, deadLetteredRaw] = Array.isArray(movedRaw)
        ? movedRaw
        : [movedRaw, 0];

      const requeued = clampNonNegativeInt(requeuedRaw, 0);
      const deadLettered = clampNonNegativeInt(deadLetteredRaw, 0);

      if (requeued > 0) {
        logger.warn("[exec-redis] requeued stale jobs", {
          moved: requeued,
          maxRetries: this.maxRetries,
        });
      }

      if (deadLettered > 0) {
        logger.warn("[exec-redis] moved stale jobs to dead-letter queue", {
          deadLettered,
          maxRetries: this.maxRetries,
        });
      }
    } catch (error: unknown) {
      logger.warn("[exec-redis] failed to requeue stale jobs", {
        error: truncateErrorMessage(error),
      });
    }
  }

  private async refreshStats(redis: SharedRedisClient): Promise<void> {
    const now = nowMs();
    if (now - this.lastStatRefreshAt < 250) return;
    this.lastStatRefreshAt = now;

    try {
      const [queuedRaw, activeRaw, deadLetterRaw, statsRaw] = await Promise.all([
        redis.lLen(this.queueKey),
        redis.zCard(this.processingKey),
        redis.lLen(this.deadLetterKey),
        redis.hGetAll(this.statsKey),
      ]);

      this.cachedQueued = clampNonNegativeInt(queuedRaw, this.cachedQueued);
      this.cachedActiveGlobal = clampNonNegativeInt(activeRaw, this.cachedActiveGlobal);
      this.cachedDeadLetter = clampNonNegativeInt(deadLetterRaw, this.cachedDeadLetter);

      if (this.cachedQueued > this.peakQueueObserved) this.peakQueueObserved = this.cachedQueued;
      if (this.cachedActiveGlobal > this.peakActiveObserved) this.peakActiveObserved = this.cachedActiveGlobal;

      this.counters.started = clampNonNegativeInt(statsRaw.started, this.counters.started);
      this.counters.completed = clampNonNegativeInt(statsRaw.completed, this.counters.completed);
      this.counters.rejectedQueueFull = clampNonNegativeInt(statsRaw.rejected_queue_full, this.counters.rejectedQueueFull);
      this.counters.startedFromQueue = clampNonNegativeInt(statsRaw.started_from_queue, this.counters.startedFromQueue);
      this.counters.queueWaitMsTotal = clampNonNegativeInt(statsRaw.queue_wait_ms_total, this.counters.queueWaitMsTotal);
      this.counters.execMsTotal = clampNonNegativeInt(statsRaw.exec_ms_total, this.counters.execMsTotal);
      this.counters.requeuedExpired = clampNonNegativeInt(statsRaw.requeued_expired, this.counters.requeuedExpired);
      this.counters.deadLettered = clampNonNegativeInt(statsRaw.dead_lettered, this.counters.deadLettered);
    } catch (error: unknown) {
      logger.warn("[exec-redis] failed to refresh stats", {
        error: truncateErrorMessage(error),
      });
    }
  }

  private async getRedisOrThrow(operation: string): Promise<SharedRedisClient> {
    const redis = (await getSharedRedisClient()) as SharedRedisClient | null;
    if (!redis) {
      throw new DistributedQueueUnavailableError(`DISTRIBUTED_QUEUE_UNAVAILABLE:${operation}`);
    }
    return redis;
  }

  private jobKey(jobId: string): string {
    return `${this.jobKeyPrefix}${jobId}`;
  }
}
