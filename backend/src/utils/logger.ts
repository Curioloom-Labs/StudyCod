import { env } from "../env";
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
      if (/secret|token|password|api[_-]?key|authorization/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(val);
      }
    }
    return out;
  }
  return v;
}
function shouldLog(level: LogLevel): boolean {
  if (!env.__isProduction) return true;
  return level !== "debug";
}
function write(level: LogLevel, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;
  const payload = meta === undefined ? undefined : redactValue(meta);
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