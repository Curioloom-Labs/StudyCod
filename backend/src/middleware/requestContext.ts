import type { NextFunction, Response } from "express";
import crypto from "crypto";
import type { AuthRequest } from "./authMiddleware";

export function requestContextMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const incoming = (req.headers["x-request-id"] || req.headers["x-correlation-id"]) as string | string[] | undefined;
  const headerId = Array.isArray(incoming) ? incoming[0] : incoming;

  const requestId = (headerId && String(headerId).trim()) || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"));

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}
