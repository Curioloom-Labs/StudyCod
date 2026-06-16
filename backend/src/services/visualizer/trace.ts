/**
 * Shared execution-trace types + output parsing, language-agnostic.
 *
 * Every language tracer (Python settrace, Ruby TracePoint, Lua debug hook, ...) wraps the
 * user's code in a self-tracing program that runs once in the judge sandbox and prints a
 * JSON trace between sentinels. The schema is unified so one frontend visualizer renders
 * all of them; drivers fill what their runtime can expose (top-frame locals always; some
 * also give per-frame locals for the whole call stack).
 */
export const TRACE_BEGIN = "__SC_TRACE_BEGIN__";
export const TRACE_END = "__SC_TRACE_END__";
export const DEFAULT_MAX_STEPS = 1000;

/** One call-stack frame at a trace step (bottom = module, top = current function). */
export interface TraceFrame {
  func: string;
  line: number;
  locals: Record<string, unknown>;
}

/**
 * A heap object referenced from frames by id. `kind` drives rendering; `items`/`entries`/
 * `attrs` hold child values (primitives or `{ref}` links). Only set by tracers that emit a
 * heap (Python); others inline values directly.
 */
export interface HeapObject {
  kind: "list" | "tuple" | "set" | "dict" | "object";
  type?: string;
  items?: unknown[];
  entries?: [string, unknown][];
  attrs?: [string, unknown][];
  repr?: string;
}

export interface TraceStep {
  /** Current line (top frame). Kept flat for back-compat with older UIs. */
  line: number;
  /** Trace event for this step. */
  event?: "call" | "line" | "return";
  /** Call stack, bottom (module) → top (current frame). */
  stack?: TraceFrame[];
  /** Bytes of program stdout emitted up to this step (for synced output). */
  stdoutLen?: number;
  /** Top-frame locals (back-compat mirror of stack[last].locals). */
  locals: Record<string, unknown>;
  /** Heap snapshot for this step: object id → object. Compound locals are `{ref:id}`. */
  heap?: Record<string, HeapObject>;
}

export interface TraceResult {
  steps: TraceStep[];
  truncated: boolean;
  programOutput: string;
}

/** Clamp a requested step budget to a safe range. */
export function clampMaxSteps(maxSteps: number): number {
  return Math.max(1, Math.min(5000, Math.floor(maxSteps)));
}

/**
 * Extract the program's own stdout + the JSON trace from sandbox stdout. Language-agnostic:
 * relies only on the sentinels and the unified JSON shape, so it works for every tracer.
 */
export function parseTraceOutput(stdout: string): TraceResult | null {
  const s = String(stdout ?? "");
  const begin = s.indexOf(TRACE_BEGIN);
  const end = s.indexOf(TRACE_END);
  if (begin < 0 || end < 0 || end < begin) return null;

  const preSentinel = s.slice(0, begin).replace(/\n$/, "");
  const jsonPart = s.slice(begin + TRACE_BEGIN.length, end).trim();
  try {
    const parsed = JSON.parse(jsonPart) as { steps?: unknown; truncated?: unknown; programOutput?: unknown };
    // Drivers that mix tooling noise into stdout (e.g. gdb) carry the program's own output
    // inside the JSON; prefer it. In-language tracers leave it as the pre-sentinel slice.
    const programOutput = typeof parsed.programOutput === "string" ? parsed.programOutput.replace(/\n$/, "") : preSentinel;
    const steps: TraceStep[] = Array.isArray(parsed.steps)
      ? parsed.steps
          .filter((x: any) => x && typeof x === "object" && Number.isFinite(x.line))
          .map((x: any) => {
            const stack: TraceFrame[] | undefined = Array.isArray(x.stack)
              ? x.stack
                  .filter((f: any) => f && typeof f === "object")
                  .map((f: any) => ({
                    func: typeof f.func === "string" ? f.func : "?",
                    line: Number.isFinite(f.line) ? Number(f.line) : 0,
                    locals: f.locals && typeof f.locals === "object" ? f.locals : {},
                  }))
              : undefined;
            const topLocals = stack && stack.length ? stack[stack.length - 1].locals : (x.locals && typeof x.locals === "object" ? x.locals : {});
            return {
              line: Number(x.line),
              event: x.event === "call" || x.event === "return" || x.event === "line" ? x.event : undefined,
              stack,
              stdoutLen: Number.isFinite(x.stdoutLen) ? Number(x.stdoutLen) : undefined,
              locals: topLocals,
              heap: x.heap && typeof x.heap === "object" ? (x.heap as Record<string, HeapObject>) : undefined,
            };
          })
      : [];
    return { steps, truncated: Boolean(parsed.truncated), programOutput };
  } catch {
    return null;
  }
}
