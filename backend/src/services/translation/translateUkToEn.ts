import { env } from "../../env";
import { logger } from "../../utils/logger";

type Masked = {
  text: string;
  restore: (s: string) => string;
};

export function looksLikeTranslationProviderErrorText(input: string): boolean {
  const s = String(input ?? "").trim();
  if (!s) return false;
  const lower = s.toLowerCase();

  // Typical provider/edge responses that we never want to persist as a “translation”.
  if (lower.includes("query length limit exceeded")) return true;
  if (lower.includes("max allowed query")) return true;
  if (lower.includes("too many requests")) return true;
  if (lower.includes("rate limit")) return true;
  if (lower.includes("quota")) return true;
  if (lower.includes("available free translations")) return true;
  if (lower.includes("libretranslate")) return true;
  if (lower.includes("mymemory http")) return true;
  if (lower.startsWith("<html") || lower.includes("<html")) return true;
  return false;
}

function maskAll(input: string): Masked {
  const mappings: Array<{ key: string; value: string }> = [];
  let i = 0;

  const replaceAll = (re: RegExp, label: string) => {
    input = input.replace(re, m => {
      const key = `__SC_PROTECT_${label.toUpperCase()}_${i++}__`;
      mappings.push({ key, value: m });
      return key;
    });
  };

  // 1) Fenced code blocks (``` or ~~~)
  // Matches as minimally as possible, including fences.
  replaceAll(/```[\s\S]*?```/g, "fence");
  replaceAll(/~~~[\s\S]*?~~~/g, "fence");

  // 2) Inline code (single or multiple backticks on one line)
  replaceAll(/`{1,3}[^\n`]*`{1,3}/g, "inline");

  // 3) Math (inline and block)
  replaceAll(/\$\$[\s\S]*?\$\$/g, "math");
  replaceAll(/\$[^\n$]+\$/g, "math");

  // 4) HTML tags (rare in our markdown but safe to protect)
  replaceAll(/<[^>]+>/g, "html");

  // 5) Raw URLs (avoid translating query params etc.)
  replaceAll(/https?:\/\/[^\s)\]]+/g, "url");

  // 6) Markdown link destinations: ](destination)
  // Protect destination only, keep link text translatable.
  input = input.replace(/\]\(([^)]+)\)/g, (_m, inner) => {
    const key = `__SC_PROTECT_LINK_${i++}__`;
    mappings.push({ key, value: inner });
    return `](${key})`;
  });

  return {
    text: input,
    restore: (s: string) => {
      let out = s;
      // Restore in reverse order to avoid accidental nested replacements.
      for (let j = mappings.length - 1; j >= 0; j--) {
        const { key, value } = mappings[j];
        out = out.split(key).join(value);
      }
      return out;
    }
  };
}

function endsInsideProtectedPlaceholder(s: string): boolean {
  const start = s.lastIndexOf("__SC_PROTECT_");
  if (start < 0) return false;
  // If the tail from the last placeholder start doesn't contain a complete placeholder,
  // we likely cut it in half.
  const tail = s.slice(start);
  return !/^__SC_PROTECT_[A-Z0-9_]+__/.test(tail);
}

function adjustBreakToAvoidPlaceholderCut(input: string, start: number, breakPos: number): number {
  let bp = breakPos;
  // Move break backward if it would cut a __SC_PROTECT_...__ token.
  while (bp > start) {
    const slice = input.slice(start, bp);
    if (!endsInsideProtectedPlaceholder(slice)) return bp;

    const lastStartInSlice = slice.lastIndexOf("__SC_PROTECT_");
    if (lastStartInSlice <= 0) break;
    bp = start + lastStartInSlice;
  }
  return breakPos;
}

/**
 * Split string into chunks <= maxChars such that concatenating all chunks reproduces the input exactly.
 * We prefer breaking on paragraph/line/word boundaries, and avoid splitting inside our protection tokens.
 */
function splitIntoChunks(input: string, maxChars: number): string[] {
  const s = String(input ?? "");
  if (s.length <= maxChars) return [s];

  const chunks: string[] = [];
  let i = 0;

  const pickBreak = (start: number, hardEnd: number): number => {
    // Prefer boundaries (most to least desirable)
    const window = s.slice(start, hardEnd);

    const findLast = (needle: string) => {
      const idx = window.lastIndexOf(needle);
      return idx >= 0 ? start + idx + needle.length : -1;
    };

    let bp = findLast("\n\n");
    if (bp < 0) bp = findLast("\n");
    if (bp < 0) bp = findLast(". ");
    if (bp < 0) bp = findLast(" ");
    if (bp < 0) bp = hardEnd;

    bp = adjustBreakToAvoidPlaceholderCut(s, start, bp);
    if (bp <= start) bp = hardEnd;
    return bp;
  };

  while (i < s.length) {
    const hardEnd = Math.min(i + maxChars, s.length);
    if (hardEnd >= s.length) {
      chunks.push(s.slice(i));
      break;
    }

    const bp = pickBreak(i, hardEnd);
    chunks.push(s.slice(i, bp));
    i = bp;
  }

  return chunks.length ? chunks : [s];
}

function splitLeadingTrailingWhitespace(input: string): { prefix: string; core: string; suffix: string } {
  const s = String(input ?? "");
  const m1 = s.match(/^\s+/);
  const m2 = s.match(/\s+$/);
  const prefix = m1 ? m1[0] : "";
  const suffix = m2 ? m2[0] : "";
  const core = s.slice(prefix.length, s.length - suffix.length);
  return { prefix, core, suffix };
}

async function translateViaLibreTranslate(text: string, timeoutMs: number): Promise<string> {
  const url = env.__translateUkEnUrl;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        q: text,
        source: "uk",
        target: "en",
        format: "text"
      }),
      signal: ac.signal
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`LibreTranslate HTTP ${resp.status}: ${body.slice(0, 500)}`);
    }

    // Some hosted instances may return HTML with 200 status.
    const ct = String(resp.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("application/json")) {
      const body = await resp.text().catch(() => "");
      throw new Error(`LibreTranslate unexpected content-type '${ct || "(missing)"}': ${body.slice(0, 500)}`);
    }

    const data = (await resp.json()) as any;
    const apiErr = data?.error ?? data?.message;
    if (apiErr) {
      throw new Error(`LibreTranslate error: ${String(apiErr).slice(0, 300)}`);
    }

    const out = String(data?.translatedText ?? "");
    if (!out) throw new Error("LibreTranslate returned empty response");
    if (looksLikeTranslationProviderErrorText(out)) {
      throw new Error(`LibreTranslate returned provider-error-like text: ${out.slice(0, 200)}`);
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}

async function translateViaLibreTranslateChunked(text: string, timeoutMs: number): Promise<string> {
  // Some public LibreTranslate instances enforce small per-request limits (commonly ~500 chars).
  // Chunk conservatively to avoid hard failures while keeping good translation quality.
  // NOTE: Some instances enforce 500 chars *on the raw query string*, and JSON escaping can
  // increase request size; keep a bigger safety margin.
  const MAX_CHARS = 300;
  const chunks = splitIntoChunks(text, MAX_CHARS);
  let out = "";
  for (const c of chunks) {
    const { prefix, core, suffix } = splitLeadingTrailingWhitespace(c);
    if (!core.trim()) {
      out += c;
      continue;
    }
    const translatedCore = await translateViaLibreTranslate(core, timeoutMs);
    out += `${prefix}${translatedCore}${suffix}`;
  }
  return out;
}

async function translateViaMyMemory(text: string, timeoutMs: number): Promise<string> {
  // Free endpoint, no API key required. Limited and should be a fallback.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=uk|en`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: ac.signal
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`MyMemory HTTP ${resp.status}: ${body.slice(0, 300)}`);
    }
    const data = (await resp.json()) as any;
    const status = Number(data?.responseStatus ?? 200);
    const details = String(data?.responseDetails ?? "");
    if (status !== 200) {
      throw new Error(`MyMemory API error ${status}: ${details.slice(0, 300)}`);
    }

    const out = String(data?.responseData?.translatedText ?? "");
    if (!out) throw new Error("MyMemory returned empty response");
    if (looksLikeTranslationProviderErrorText(out)) {
      throw new Error(`MyMemory returned provider-error-like text: ${out.slice(0, 200)}`);
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}

async function translateViaMyMemoryChunked(text: string, timeoutMs: number): Promise<string> {
  // MyMemory is GET-only and has URL length constraints (can 414 on big inputs).
  // Chunk conservatively; URL encoding can easily expand the query.
  const MAX_CHARS = 250;
  const chunks = splitIntoChunks(text, MAX_CHARS);
  let out = "";
  for (const c of chunks) {
    const { prefix, core, suffix } = splitLeadingTrailingWhitespace(c);
    if (!core.trim()) {
      out += c;
      continue;
    }
    const translatedCore = await translateViaMyMemory(core, timeoutMs);
    out += `${prefix}${translatedCore}${suffix}`;
  }
  return out;
}

export async function translateTextUkToEn(text: string): Promise<string> {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;

  const timeoutMs = env.__translateUkEnTimeoutMs;

  // Try LibreTranslate first (better for longer text).
  try {
    const { prefix, core, suffix } = splitLeadingTrailingWhitespace(raw);
    if (!core.trim()) return raw;
    // Always go through chunked path for stability against per-instance limits.
    const translatedCore = await translateViaLibreTranslateChunked(core, timeoutMs);
    return `${prefix}${translatedCore}${suffix}`;
  } catch (err) {
    logger.warn("[translate] LibreTranslate failed, falling back to MyMemory", {
      err: (err as any)?.message ?? String(err)
    });
  }

  return await translateViaMyMemoryChunked(raw, timeoutMs);
}

export async function translateMarkdownUkToEn(markdown: string): Promise<string> {
  const raw = String(markdown ?? "");
  if (!raw.trim()) return raw;

  const masked = maskAll(raw);
  const chunks = splitIntoChunks(masked.text, env.__translateUkEnMaxChunkChars);

  const translatedChunks: string[] = [];
  for (const c of chunks) {
    // If chunk contains only protected placeholders and whitespace, skip.
    const withoutPlaceholders = c.replace(/__SC_PROTECT_[A-Z0-9_]+__/g, "").trim();
    if (!withoutPlaceholders) {
      translatedChunks.push(c);
      continue;
    }

    const translated = await translateTextUkToEn(c);
    translatedChunks.push(translated);
  }

  const joined = translatedChunks.join("");
  return masked.restore(joined);
}
