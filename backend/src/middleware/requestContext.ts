import type { NextFunction, Response } from "express";
import crypto from "crypto";
import type { AuthRequest } from "./authMiddleware";
import { runWithRequestContext } from "../utils/requestContextStore";

export function requestContextMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const incoming = (req.headers["x-request-id"] || req.headers["x-correlation-id"]) as string | string[] | undefined;
  // Accept only a bounded, single-value identifier. This prevents CR/LF log
  // pollution and oversized values while preserving proxy correlation IDs.
  const headerId = typeof incoming === "string" ? incoming.trim() : "";
  const safeHeaderId = /^[A-Za-z0-9._:-]{1,128}$/.test(headerId) ? headerId : "";

  const requestId = safeHeaderId || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"));

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Establish the async context so every downstream log (including deep
  // judge/LLM calls that never see `req`) is automatically correlated.
  runWithRequestContext({ requestId }, () => next());
}
