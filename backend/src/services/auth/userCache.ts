/**
 * Short-lived Redis cache for User rows looked up in authMiddleware.
 *
 * authMiddleware previously hit MySQL on every request to fetch
 * (id, lang, role, userMode). For poll-heavy endpoints (judge status, EDU
 * dashboard refresh) that's an O(N requests) load on the connection pool.
 *
 * Cache shape: a single JSON blob per userId under `auth:user:<id>` with a
 * short TTL (default 30s). On logout / role-change / token revocation the
 * row is invalidated via `invalidateCachedUser(userId)`.
 *
 * Falls back to DB transparently when Redis is unavailable.
 */
import { UserMode, UserRole } from "../../entities/User";
import { runWithRedis, redisKey } from "../redis/sharedRedis";
import { logger } from "../../utils/logger";

export type CachedUser = {
  id: number;
  role: UserRole | null;
  userMode: UserMode | null;
};

const USER_CACHE_TTL_SECONDS = (() => {
  const raw = String(process.env.AUTH_USER_CACHE_TTL_SECONDS ?? "").trim();
  if (!raw) return 30;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 600 ? n : 30;
})();

function userCacheKey(userId: number): string {
  return redisKey("auth", "user", String(userId));
}

export async function getCachedUser(userId: number): Promise<CachedUser | null> {
  if (!Number.isFinite(userId) || userId <= 0) return null;
  const raw = await runWithRedis("authUserCache.get", async redis => {
    return await redis.get(userCacheKey(userId));
  });
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as CachedUser;
    if (!parsed || typeof parsed !== "object" || parsed.id !== userId) return null;
    return parsed;
  } catch (err: any) {
    logger.warn("[authUserCache] parse error, ignoring entry", { userId, error: err?.message });
    return null;
  }
}

export async function setCachedUser(user: CachedUser): Promise<void> {
  if (!user || !Number.isFinite(user.id) || user.id <= 0) return;
  await runWithRedis("authUserCache.set", async redis => {
    await redis.set(userCacheKey(user.id), JSON.stringify(user), {
      EX: USER_CACHE_TTL_SECONDS
    });
    return true;
  });
}

export async function invalidateCachedUser(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return;
  await runWithRedis("authUserCache.del", async redis => {
    await redis.del(userCacheKey(userId));
    return true;
  });
}
