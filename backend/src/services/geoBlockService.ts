import geoip from "geoip-lite";
import type { Request } from "express";
import { env } from "../env";
import { logger } from "../utils/logger";

/**
 * Geo-blocking service.
 *
 * The platform must refuse traffic originating from sanctioned/aggressor
 * states (Russia and Belarus by default). Country resolution is hybrid:
 *
 *   1. A trusted proxy country header (Cloudflare `CF-IPCountry`, nginx GeoIP,
 *      etc.) is consulted first when present — it is the most accurate signal
 *      and costs nothing. Only honoured when TRUST_PROXY is configured so a
 *      direct client cannot spoof the header.
 *   2. An offline geoip-lite lookup of the client IP is used as a fallback, so
 *      the block still works when no geo-aware proxy sits in front of us.
 *
 * The resolver fails OPEN: an unknown / private / loopback IP is never blocked.
 * This guarantees a lookup bug or a missing database can never lock out the
 * entire world, and keeps local development unaffected.
 */

export type GeoVerdict = {
  /** Resolved ISO-3166 alpha-2 country code, uppercased, or null if unknown. */
  country: string | null;
  /** Where the country came from — useful for diagnostics. */
  source: "header" | "geoip" | "unknown";
  /** True when the resolved country is on the block list. */
  blocked: boolean;
};

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function normalizeIp(raw: string | undefined | null): string | null {
  let ip = String(raw ?? "").trim();
  if (!ip) return null;
  // Express may hand back IPv4-mapped IPv6 ("::ffff:1.2.3.4"); geoip-lite wants
  // the bare IPv4. Also drop a zone id / port if one slipped through.
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);
  return ip || null;
}

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(re => re.test(ip));
}

function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

function resolveFromHeader(req: Request): string | null {
  // Honour proxy-provided country only when we actually trust the proxy chain;
  // otherwise a direct client could forge CF-IPCountry to bypass the block.
  if (!env.__trustProxy) return null;
  for (const headerName of env.__geoCountryHeaders) {
    const value = req.headers[headerName];
    const raw = Array.isArray(value) ? value[0] : value;
    const code = String(raw ?? "").trim().toUpperCase();
    if (!code) continue;
    // Cloudflare uses XX (unknown) and T1 (Tor); treat as "no signal".
    if (code === "XX" || code === "T1") continue;
    if (isValidCountryCode(code)) return code;
  }
  return null;
}

function resolveFromGeoip(ip: string): string | null {
  try {
    const hit = geoip.lookup(ip);
    const code = String(hit?.country ?? "").trim().toUpperCase();
    return isValidCountryCode(code) ? code : null;
  } catch (err) {
    logger.warn("[geoblock] geoip lookup failed", { err: (err as any)?.message });
    return null;
  }
}

/** Resolve the visitor's country from the request (header first, geoip fallback). */
export function resolveClientCountry(req: Request): { country: string | null; source: GeoVerdict["source"] } {
  const fromHeader = resolveFromHeader(req);
  if (fromHeader) return { country: fromHeader, source: "header" };

  const ip = normalizeIp(req.ip);
  if (!ip || isPrivateIp(ip)) return { country: null, source: "unknown" };

  const fromGeoip = resolveFromGeoip(ip);
  if (fromGeoip) return { country: fromGeoip, source: "geoip" };

  return { country: null, source: "unknown" };
}

export function isBlockedCountry(country: string | null): boolean {
  if (!country) return false;
  if (!env.__geoBlockEnabled) return false;
  return env.__geoBlockedCountries.includes(country);
}

/** Full verdict for a request: country, where it came from, and block decision. */
export function evaluateGeoBlock(req: Request): GeoVerdict {
  if (!env.__geoBlockEnabled) {
    return { country: null, source: "unknown", blocked: false };
  }
  const { country, source } = resolveClientCountry(req);
  return { country, source, blocked: isBlockedCountry(country) };
}

export function isGeoBlockEnabled(): boolean {
  return env.__geoBlockEnabled;
}

export function getBlockedCountries(): string[] {
  return [...env.__geoBlockedCountries];
}
