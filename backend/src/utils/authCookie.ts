import type { Response } from "express";

export const AUTH_COOKIE_NAME = "__studycod_token";

const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function parseBool(raw: unknown, fallback: boolean): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function normalizeSameSite(raw: unknown): "lax" | "strict" | "none" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "strict") return "strict";
  if (s === "none") return "none";
  return "lax";
}

const authCookieSameSite = normalizeSameSite(process.env.AUTH_COOKIE_SAMESITE);
const authCookieSecure = parseBool(
  process.env.AUTH_COOKIE_SECURE,
  process.env.NODE_ENV === "production" || authCookieSameSite === "none"
);

function getCookieDomain(): string | undefined {
  return (process.env.COOKIE_DOMAIN || "").trim() || undefined;
}

export function setSharedAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: authCookieSecure,
    sameSite: authCookieSameSite,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: "/",
    domain: getCookieDomain()
  });
}

export function clearSharedAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    path: "/",
    domain: getCookieDomain()
  });
}
