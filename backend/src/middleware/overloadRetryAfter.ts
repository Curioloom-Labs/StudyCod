import type { Response } from "express";
import { env } from "../env";
import { HttpError } from "../utils/httpError";

export function setRetryAfterForOverload(err: unknown, res: Response): boolean {
  if ((res as any)?.headersSent) return false;

  const status = Number((err as any)?.statusCode ?? (err as any)?.status);
  const code = err instanceof HttpError ? err.code : (err as any)?.code;
  const message = String((err as any)?.message ?? "");

  if (status === 503 && (code === "SYSTEM_BUSY" || message === "System busy")) {
    res.setHeader("Retry-After", String((env as any).__overloadRetryAfterSeconds ?? 3));
    return true;
  }

  return false;
}
