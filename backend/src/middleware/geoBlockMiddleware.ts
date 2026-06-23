import type { NextFunction, Request, Response } from "express";
import { evaluateGeoBlock, isGeoBlockEnabled } from "../services/geoBlockService";
import { logger } from "../utils/logger";

/**
 * Paths that must stay reachable even from a blocked region:
 * - infra probes (health/ready/metrics) so orchestrators keep working;
 * - the geo status endpoint itself, so the frontend can render the block page.
 */
function isGeoBypassPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/api" || pathname === "/api/") return true;
  const bypass = [
    "/health",
    "/api/health",
    "/ready",
    "/api/ready",
    "/metrics",
    "/api/metrics",
    "/geo",
    "/api/geo",
  ];
  if (bypass.includes(pathname)) return true;
  if (pathname.startsWith("/internal/") || pathname.startsWith("/api/internal/")) return true;
  return false;
}

/**
 * Refuses all API traffic from blocked countries with HTTP 451
 * (Unavailable For Legal Reasons). The body carries `{ geoBlocked: true }`
 * so the SPA can detect it via the axios interceptor and render the dedicated
 * block page. Bypass paths above are exempt so the page can still load.
 */
export function geoBlockMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isGeoBlockEnabled()) return next();

  const originalUrl = (req.originalUrl || req.url || "").toString();
  const pathname = originalUrl.split("?")[0] || "";
  if (isGeoBypassPath(pathname)) return next();

  const verdict = evaluateGeoBlock(req);
  if (!verdict.blocked) return next();

  logger.info("[geoblock] request refused", {
    country: verdict.country,
    source: verdict.source,
    path: pathname,
    method: req.method,
  });

  return res.status(451).json({
    geoBlocked: true,
    country: verdict.country,
    status: 451,
    error: "GEO_BLOCKED",
    message: "Access from your region is not available.",
  });
}
