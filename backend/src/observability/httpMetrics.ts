/**
 * Per-route HTTP latency + count metrics in Prometheus histogram format.
 *
 * Why: liveness/readiness tell you the process is up, but not which endpoints are
 * slow. This middleware times every request and buckets it by the matched ROUTE
 * PATTERN (e.g. "/edu/classes/:classId/gradebook") rather than the concrete URL,
 * so path params/ids don't blow up label cardinality. Output is scraped via
 * /metrics alongside the existing judge + process gauges.
 */
import type { Request, Response, NextFunction } from "express";

// Standard latency buckets (ms), cumulative "le" semantics on render.
const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

interface Series {
  method: string;
  route: string;
  status: string;
  count: number;
  sumMs: number;
  buckets: number[]; // per-bucket (non-cumulative) counts; last slot = +Inf overflow
}

// Hard cap on distinct series so pathological cardinality can't exhaust memory on
// a small box. Once reached, new label combos fold into a single "__other__" route.
const MAX_SERIES = 2000;
const series = new Map<string, Series>();

function statusClass(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "1xx";
}

function resolveRoute(req: Request): string {
  // req.route is only populated when a handler matched. Combine the router mount
  // path (baseUrl) with the matched route pattern to get the full template.
  const r: any = (req as any).route;
  let pattern = "";
  if (r && typeof r.path === "string") pattern = r.path;
  else if (r && Array.isArray(r.path)) pattern = r.path.join("|");
  else if (r) pattern = "(complex)";
  if (!pattern) return "unmatched";
  const base = (req as any).baseUrl || "";
  const full = `${base}${pattern}` || "/";
  return full.length > 120 ? full.slice(0, 120) : full;
}

function record(method: string, route: string, status: string, durationMs: number): void {
  let key = `${method}\t${route}\t${status}`;
  let s = series.get(key);
  if (!s) {
    if (series.size >= MAX_SERIES) {
      route = "__other__";
      key = `${method}\t${route}\t${status}`;
      s = series.get(key);
    }
    if (!s) {
      s = { method, route, status, count: 0, sumMs: 0, buckets: new Array(BUCKETS_MS.length + 1).fill(0) };
      series.set(key, s);
    }
  }
  s.count += 1;
  s.sumMs += durationMs;
  let placed = false;
  for (let i = 0; i < BUCKETS_MS.length; i++) {
    if (durationMs <= BUCKETS_MS[i]) {
      s.buckets[i] += 1;
      placed = true;
      break;
    }
  }
  if (!placed) s.buckets[BUCKETS_MS.length] += 1; // +Inf overflow
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    try {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      record(req.method, resolveRoute(req), statusClass(res.statusCode), durationMs);
    } catch {
      /* metrics must never break a request */
    }
  });
  next();
}

function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Render the collected HTTP metrics in Prometheus text exposition format. */
export function renderHttpMetrics(): string {
  const out: string[] = [];
  out.push("# HELP studycod_http_request_duration_ms Request latency by route (histogram)");
  out.push("# TYPE studycod_http_request_duration_ms histogram");
  for (const s of series.values()) {
    const labels = `method="${esc(s.method)}",route="${esc(s.route)}",status="${s.status}"`;
    let cumulative = 0;
    for (let i = 0; i < BUCKETS_MS.length; i++) {
      cumulative += s.buckets[i];
      out.push(`studycod_http_request_duration_ms_bucket{${labels},le="${BUCKETS_MS[i]}"} ${cumulative}`);
    }
    cumulative += s.buckets[BUCKETS_MS.length];
    out.push(`studycod_http_request_duration_ms_bucket{${labels},le="+Inf"} ${cumulative}`);
    out.push(`studycod_http_request_duration_ms_sum{${labels}} ${Math.round(s.sumMs)}`);
    out.push(`studycod_http_request_duration_ms_count{${labels}} ${s.count}`);
  }
  return out.join("\n") + (out.length ? "\n" : "");
}
