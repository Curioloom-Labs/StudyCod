import type { Response } from "express";
import { env } from "../env";
import { HttpError } from "../utils/httpError";

export function setRetryAfterForOverload(err: unknown, res: Response): boolean {
  if (res.headersSent) return false;

  const errorRecord = err && typeof err === "object" ? err as Record<string, unknown> : {};
  const status = Number(errorRecord.statusCode ?? errorRecord.status);
  const code = err instanceof HttpError ? err.code : errorRecord.code;
  const message = String(errorRecord.message ?? "");

  if (status === 503 && (code === "SYSTEM_BUSY" || message === "System busy")) {
    res.setHeader("Retry-After", String(env.__overloadRetryAfterSeconds ?? 3));
    return true;
  }

  return false;
}
