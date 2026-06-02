import { env } from "../env";
import { getRequestContext } from "./requestContextStore";
type LogLevel = "debug" | "info" | "warn" | "error";

const MAX_LOG_STRING = 4096;
function truncateString(s: string, max = MAX_LOG_STRING): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(truncated, ${s.length} chars)`;
}

function redactValue(v: unknown): unknown {
  // Error objects have non-enumerable fields (message/stack), so Object.entries() would drop them.
  // Serialize them explicitly so logs remain useful.
  if (v instanceof Error) {
    const anyErr = v as any;
    return {
      name: v.name,
      message: truncateString(String(v.message || "")),
      stack: v.stack ? truncateString(String(v.stack), 16_384) : undefined,
      code: anyErr?.code,
      errno: anyErr?.errno,
      sqlState: anyErr?.sqlState,
      // Common nested driver error in TypeORM.
      driverError: anyErr?.driverError ? redactValue(anyErr.driverError) : undefined
    };
  }
  if (typeof v === "string") {
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) return "[REDACTED_JWT]";
    // Keep logs useful (judge stdout/stderr, stack traces), but cap size.
    return truncateString(v);
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) {
      if (/secret|token|password|api[_-]?key|authorization|cookie|session[_-]?id|refresh[_-]?token|access[_-]?token|jwt|bearer/i.test(k)) {
        out[k] = "[REDACTED]";
      } else if (/^email$|user[_-]?email|contact[_-]?email|recipient[_-]?email/i.test(k)) {
        // Partial mask: keep first character + domain so support can still
        // correlate, but the full address never lands in logs.
        out[k] = maskEmail(val);
      } else {
        out[k] = redactValue(val);
      }
    }
    return out;
  }
  return v;
}

function maskEmail(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const at = v.indexOf("@");
  if (at <= 0) return "[REDACTED_EMAIL]";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}
function shouldLog(level: LogLevel): boolean {
  if (!env.__isProduction) return true;
  return level !== "debug";
}
// Auto-attach the active request's correlation id so judge/LLM/deep logs are
// traceable without threading requestId through every call. We only enrich
// plain objects (or an absent meta) to avoid changing the shape of the rare
// calls that pass an Error/array/primitive as meta. An explicit requestId in
// the call wins over the ambient one.
function enrichWithRequestId(meta: unknown): unknown {
  const ctx = getRequestContext();
  if (!ctx?.requestId) return meta;
  const ambient: Record<string, unknown> = { requestId: ctx.requestId };
  if (ctx.principalId !== undefined) ambient.principalId = ctx.principalId;

  if (meta === undefined) return ambient;
  if (meta && typeof meta === "object" && !Array.isArray(meta) && !(meta instanceof Error)) {
    const m = meta as Record<string, unknown>;
    // Explicit fields in the call always win over the ambient ones.
    return { ...ambient, ...m };
  }
  return meta;
}

function write(level: LogLevel, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;
  const enriched = enrichWithRequestId(meta);
  const payload = enriched === undefined ? undefined : redactValue(enriched);
  const prefix = `[${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(prefix, message, payload ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(prefix, message, payload ?? "");
    return;
  }
  console.log(prefix, message, payload ?? "");
}
export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta)
};