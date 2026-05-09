import type { IncomingHttpHeaders } from "http";

export type UiLocale = "uk" | "en";

export function normalizeUiLocale(raw: unknown, fallback: UiLocale = "uk"): UiLocale {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v.startsWith("en")) return "en";
  if (v.startsWith("uk")) return "uk";
  return fallback;
}

export function resolveUiLocaleFromHeaders(
  headers: IncomingHttpHeaders | Record<string, unknown> | undefined,
  fallback: UiLocale = "uk"
): UiLocale {
  const explicit = String((headers as any)?.["x-ui-language"] ?? (headers as any)?.["x-lang"] ?? "").trim().toLowerCase();
  if (explicit.startsWith("en")) return "en";
  if (explicit.startsWith("uk")) return "uk";

  const accept = String((headers as any)?.["accept-language"] ?? "").toLowerCase();
  if (accept.includes("en")) return "en";
  if (accept.includes("uk")) return "uk";

  return fallback;
}
