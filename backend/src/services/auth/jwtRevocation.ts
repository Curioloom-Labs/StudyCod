/**
 * JWT Revocation List Management
 * 
 * Implements JWT token revocation using Redis to maintain a list of invalidated JTIs (JWT IDs).
 * This prevents stolen or compromised tokens from being usable indefinitely.
 */

import { getSharedRedisClient, getRedisKeyPrefix } from "../redis/sharedRedis";
import { logger } from "../../utils/logger";
import { randomBytes } from "crypto";

const JTI_REVOCATION_PREFIX = `${getRedisKeyPrefix()}jwt:revoked:`;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "unknown");
}

/**
 * Generate a unique JWT ID (jti claim)
 */
export function generateJti(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Check if a JWT ID has been revoked
 */
export async function isJtiRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  
  try {
    const redis = await getSharedRedisClient();
    if (!redis) {
      logger.warn("[jwt] Redis unavailable for revocation check");
      return false;
    }
    
    const key = `${JTI_REVOCATION_PREFIX}${jti}`;
    const exists = await redis.exists(key);
    return exists > 0;
  } catch (err: unknown) {
    logger.error("[jwt] Revocation check failed", { jti, error: getErrorMessage(err) });
    return false;
  }
}

/**
 * Revoke a JWT ID immediately
 */
export async function revokeJti(jti: string, ttlSeconds: number = 86400): Promise<void> {
  if (!jti) return;
  
  try {
    const redis = await getSharedRedisClient();
    if (!redis) {
      logger.warn("[jwt] Redis unavailable for revocation");
      return;
    }
    
    const key = `${JTI_REVOCATION_PREFIX}${jti}`;
    await redis.setEx(key, ttlSeconds, "1");
    logger.info("[jwt] Token revoked", { jti, ttlSeconds });
  } catch (err: unknown) {
    logger.error("[jwt] Failed to revoke token", { jti, error: getErrorMessage(err) });
  }
}

/**
 * Revoke all tokens issued to a user (on logout or password change)
 * This is a soft revocation - we use a timestamp to invalidate all older tokens
 */
export async function revokeUserTokensBeforeTime(userId: number, timestamp: number): Promise<void> {
  try {
    const redis = await getSharedRedisClient();
    if (!redis) {
      logger.warn("[jwt] Redis unavailable for user token revocation");
      return;
    }
    
    const key = `${getRedisKeyPrefix()}user:${userId}:token-invalidate-before`;
    await redis.set(key, String(timestamp));
    logger.info("[jwt] User tokens revoked before timestamp", { userId, timestamp });
  } catch (err: unknown) {
    logger.error("[jwt] Failed to revoke user tokens", { userId, error: getErrorMessage(err) });
  }
}

/**
 * Check if a token was issued before the user's token revocation time
 */
export async function wasTokenIssuedBeforeRevocation(userId: number, issuedAtMs: number): Promise<boolean> {
  try {
    const redis = await getSharedRedisClient();
    if (!redis) return false;
    
    const key = `${getRedisKeyPrefix()}user:${userId}:token-invalidate-before`;
    const value = await redis.get(key);
    
    if (!value) return false;
    
    const invalidateBeforeMs = Number.parseInt(value, 10);
    return Number.isFinite(invalidateBeforeMs) && issuedAtMs < invalidateBeforeMs;
  } catch (err: unknown) {
    logger.warn("[jwt] Failed to check token revocation time", { userId, error: getErrorMessage(err) });
    return false;
  }
}

/**
 * Clear all revocation data for a user (on account deletion)
 */
export async function clearUserRevocationData(userId: number): Promise<void> {
  try {
    const redis = await getSharedRedisClient();
    if (!redis) return;
    
    const key = `${getRedisKeyPrefix()}user:${userId}:token-invalidate-before`;
    await redis.del(key);
  } catch (err: unknown) {
    logger.warn("[jwt] Failed to clear user revocation data", { userId, error: getErrorMessage(err) });
  }
}
