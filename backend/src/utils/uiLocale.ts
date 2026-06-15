import type { IncomingHttpHeaders } from "http";

export type UiLocale = "uk" | "en";

/**
 * Supported UI locales, in preference order. Adding a language is a one-liner
 * here — the resolver and Accept-Language matcher generalize over this list
 * (international-SaaS direction; en is the base locale).
 */
export const SUPPORTED_UI_LOCALES: UiLocale[] = ["en", "uk"];

function matchSupported(tag: string): UiLocale | null {
  const v = tag.trim().toLowerCase();
  for (const loc of SUPPORTED_UI_LOCALES) {
    if (v === loc || v.startsWith(`${loc}-`)) return loc;
  }
  return null;
}

export function normalizeUiLocale(raw: unknown, fallback: UiLocale = "uk"): UiLocale {
  return matchSupported(String(raw ?? "")) ?? fallback;
}

/**
 * Parse an Accept-Language header into supported locales ordered by quality
 * (q-weight), preserving header order for ties and dropping q=0 entries.
 */
export function parseAcceptLanguage(header: string): UiLocale[] {
  const parts = String(header ?? "")
    .split(",")
    .map((p, index) => {
      const [tagRaw, ...params] = p.trim().split(";");
      const qParam = params.map((x) => x.trim()).find((x) => x.startsWith("q="));
      let q = 1;
      if (qParam) {
        const parsed = Number.parseFloat(qParam.slice(2));
        q = Number.isFinite(parsed) ? parsed : 1;
      }
      return { tag: tagRaw.trim().toLowerCase(), q, index };
    })
    .filter((p) => p.tag && p.q > 0)
    // Higher q first; stable on the original header order for equal q.
    .sort((a, b) => (b.q - a.q) || (a.index - b.index));

  const out: UiLocale[] = [];
  for (const p of parts) {
    const loc = matchSupported(p.tag);
    if (loc && !out.includes(loc)) out.push(loc);
  }
  return out;
}

export function resolveUiLocaleFromHeaders(
  headers: IncomingHttpHeaders | Record<string, unknown> | undefined,
  fallback: UiLocale = "uk"
): UiLocale {
  // Explicit app header wins over Accept-Language.
  const explicit = matchSupported(
    String((headers as any)?.["x-ui-language"] ?? (headers as any)?.["x-lang"] ?? "")
  );
  if (explicit) return explicit;

  const ranked = parseAcceptLanguage(String((headers as any)?.["accept-language"] ?? ""));
  if (ranked.length > 0) return ranked[0];

  return fallback;
}
