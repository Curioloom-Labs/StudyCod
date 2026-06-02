/**
 * Circuit breaker for AI/LLM generation, shared across backend instances.
 *
 * Previously the breaker lived in a per-process Map: when one instance tripped
 * after 5 failures, the other replicas kept hammering the already-degraded
 * provider. This module keeps the SAME semantics (rolling failure window →
 * open for a cool-down) but stores the counters in Redis so all instances see
 * one breaker. When Redis is unavailable it transparently falls back to the
 * original in-memory breaker, so behaviour never depends on Redis.
 *
 * Keyed by an opaque string (the AI mode); no coupling to the AIMode union.
 */
import { runWithRedis, redisKey } from "../redis/sharedRedis";

export const CIRCUIT_WINDOW_MS = 60_000;
export const CIRCUIT_OPEN_MS = 30_000;
export const CIRCUIT_FAILURES_TO_OPEN = 5;
// Hard cap so the local fallback map cannot grow unboundedly.
const CIRCUIT_MAX_TRACKED_MODES = 32;

function nowMs(): number {
  return Date.now();
}

function circuitKey(mode: string): string {
  return redisKey("ai", "circuit", mode);
}

// --- Local (in-memory) fallback — identical semantics to the original ---------

type CircuitState = {
  openUntil: number;
  failures: number;
  firstFailureAt: number;
};

const localByMode = new Map<string, CircuitState>();

function gcLocal(): void {
  if (localByMode.size <= CIRCUIT_MAX_TRACKED_MODES) return;
  const now = nowMs();
  for (const [mode, st] of localByMode.entries()) {
    if (now - st.firstFailureAt > CIRCUIT_WINDOW_MS && st.openUntil <= now) {
      localByMode.delete(mode);
    }
  }
}

function isLocalOpen(mode: string): boolean {
  const st = localByMode.get(mode);
  if (!st) return false;
  return st.openUntil > nowMs();
}

function recordLocalSuccess(mode: string): void {
  localByMode.delete(mode);
}

function recordLocalFailure(mode: string): void {
  const now = nowMs();
  const st = localByMode.get(mode);
  if (!st) {
    localByMode.set(mode, { openUntil: 0, failures: 1, firstFailureAt: now });
    return;
  }
  if (now - st.firstFailureAt > CIRCUIT_WINDOW_MS) {
    st.failures = 1;
    st.firstFailureAt = now;
    st.openUntil = 0;
    return;
  }
  st.failures += 1;
  if (st.failures >= CIRCUIT_FAILURES_TO_OPEN) {
    st.openUntil = now + CIRCUIT_OPEN_MS;
  }
  gcLocal();
}

// --- Shared (Redis) implementation -------------------------------------------

// Atomically apply the rolling-window failure logic and return the new
// openUntil. Mirrors recordLocalFailure exactly.
const RECORD_FAILURE_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local openMs = tonumber(ARGV[3])
local threshold = tonumber(ARGV[4])

local failures = tonumber(redis.call('HGET', key, 'failures') or '0')
local firstFailureAt = tonumber(redis.call('HGET', key, 'firstFailureAt') or '0')
local openUntil = tonumber(redis.call('HGET', key, 'openUntil') or '0')

if firstFailureAt == 0 or (now - firstFailureAt) > windowMs then
  failures = 1
  firstFailureAt = now
  openUntil = 0
else
  failures = failures + 1
  if failures >= threshold then
    openUntil = now + openMs
  end
end

redis.call('HSET', key, 'failures', failures, 'firstFailureAt', firstFailureAt, 'openUntil', openUntil)
redis.call('PEXPIRE', key, windowMs + openMs + 5000)
return tostring(openUntil)
`;

type ClientLike = {
  sendCommand(args: string[]): Promise<unknown>;
  hGet(key: string, field: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
};

// runWithRedis returns null when Redis is UNAVAILABLE. To distinguish that from
// a valid "key absent" reply we wrap successful results in a sentinel object.
async function withRedis<T>(op: string, fn: (c: ClientLike) => Promise<T>): Promise<{ value: T } | null> {
  return await runWithRedis(op, async (client) => ({ value: await fn(client as unknown as ClientLike) }));
}

// --- Public async API ---------------------------------------------------------

/** True if the breaker for `mode` is currently open (requests should short-circuit). */
export async function isAiCircuitOpen(mode: string): Promise<boolean> {
  const res = await withRedis("aiCircuit.isOpen", async (c) => c.hGet(circuitKey(mode), "openUntil"));
  if (res === null) {
    // Redis unavailable → consult the local fallback.
    return isLocalOpen(mode);
  }
  const openUntil = Number(res.value ?? 0);
  return Number.isFinite(openUntil) && openUntil > nowMs();
}

/** Record a successful call — closes (resets) the breaker. */
export async function recordAiCircuitSuccess(mode: string): Promise<void> {
  const res = await withRedis("aiCircuit.success", async (c) => c.del(circuitKey(mode)));
  if (res === null) {
    recordLocalSuccess(mode);
  } else {
    // Keep the local fallback coherent for a future Redis outage.
    recordLocalSuccess(mode);
  }
}

/** Record a (retryable) failure — may open the breaker after the threshold. */
export async function recordAiCircuitFailure(mode: string): Promise<void> {
  const res = await withRedis("aiCircuit.failure", async (c) =>
    c.sendCommand([
      "EVAL",
      RECORD_FAILURE_LUA,
      "1",
      circuitKey(mode),
      String(nowMs()),
      String(CIRCUIT_WINDOW_MS),
      String(CIRCUIT_OPEN_MS),
      String(CIRCUIT_FAILURES_TO_OPEN),
    ])
  );
  if (res === null) {
    // Redis unavailable → degrade to per-instance protection.
    recordLocalFailure(mode);
  }
}

/** Test/diagnostics helper. */
export function __resetLocalAiCircuitForTests(): void {
  localByMode.clear();
}
