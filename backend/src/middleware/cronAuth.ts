import crypto from "node:crypto";
import type { Request } from "express";
import { CRON_SECRET } from "../config";

/**
 * Compare a scheduled-job secret without leaking whether the configured secret
 * is missing or only partially correct. Missing configuration always denies.
 */
export function secretsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || !expected) return false;
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) return false;
  return crypto.timingSafeEqual(providedBytes, expectedBytes);
}

/** Cron credentials are accepted only in a header, never in a request body. */
export function isCronAuthorized(req: Request): boolean {
  const provided = req.headers["x-cron-secret"];
  return secretsMatch(provided, CRON_SECRET);
}
