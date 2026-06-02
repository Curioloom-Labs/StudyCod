/**
 * Execution visualizer — Python line tracer.
 *
 * We can't safely run untrusted code in-process, so the actual execution goes
 * through the judge sandbox. This module is the pure middle:
 *  - buildPythonTracerScript(userCode): wraps the user's code in a program that
 *    runs it under sys.settrace, recording (line, locals) at each line, bounded
 *    by maxSteps, then prints the trace as JSON between sentinels.
 *  - parseTraceOutput(stdout): extracts the program's own output + the JSON
 *    trace from the sandbox stdout.
 *
 * Both are deterministic and unit-testable; only the run in between needs the
 * sandbox.
 */
export const TRACE_BEGIN = "__SC_TRACE_BEGIN__";
export const TRACE_END = "__SC_TRACE_END__";
export const DEFAULT_MAX_STEPS = 1000;

export interface TraceStep {
  line: number;
  locals: Record<string, unknown>;
}

export interface TraceResult {
  steps: TraceStep[];
  truncated: boolean;
  programOutput: string;
}

export function buildPythonTracerScript(userCode: string, maxSteps: number = DEFAULT_MAX_STEPS): string {
  const cap = Math.max(1, Math.min(5000, Math.floor(maxSteps)));
  const b64 = Buffer.from(String(userCode ?? ""), "utf8").toString("base64");
  // Indentation matters: keep this a flat, top-level Python program.
  return `import sys, json, base64

_STEPS = []
_MAX = ${cap}

def _safe(v, _depth=0):
    try:
        if v is None or isinstance(v, (int, float, bool)):
            return v
        if isinstance(v, str):
            return v[:200]
        if _depth >= 2:
            return repr(v)[:120]
        if isinstance(v, (list, tuple)):
            return [_safe(x, _depth + 1) for x in list(v)[:50]]
        if isinstance(v, dict):
            return {str(k)[:50]: _safe(val, _depth + 1) for k, val in list(v.items())[:50]}
        if isinstance(v, set):
            return [_safe(x, _depth + 1) for x in list(v)[:50]]
        return repr(v)[:120]
    except Exception:
        return "<unrepr>"

def _tracer(frame, event, arg):
    if event == "line" and frame.f_code.co_filename == "<user>":
        if len(_STEPS) < _MAX:
            loc = {}
            for k, val in list(frame.f_locals.items()):
                if k.startswith("__"):
                    continue
                loc[k] = _safe(val)
            _STEPS.append({"line": frame.f_lineno, "locals": loc})
    return _tracer

_USER_SOURCE = base64.b64decode("${b64}").decode("utf-8")
_user_globals = {}
try:
    _compiled = compile(_USER_SOURCE, "<user>", "exec")
    sys.settrace(_tracer)
    try:
        exec(_compiled, _user_globals)
    finally:
        sys.settrace(None)
except Exception as _e:
    import traceback
    sys.stderr.write(traceback.format_exc())

print("${TRACE_BEGIN}")
print(json.dumps({"steps": _STEPS, "truncated": len(_STEPS) >= _MAX}))
print("${TRACE_END}")
`;
}

export function parseTraceOutput(stdout: string): TraceResult | null {
  const s = String(stdout ?? "");
  const begin = s.indexOf(TRACE_BEGIN);
  const end = s.indexOf(TRACE_END);
  if (begin < 0 || end < 0 || end < begin) return null;

  const programOutput = s.slice(0, begin).replace(/\n$/, "");
  const jsonPart = s.slice(begin + TRACE_BEGIN.length, end).trim();
  try {
    const parsed = JSON.parse(jsonPart) as { steps?: unknown; truncated?: unknown };
    const steps: TraceStep[] = Array.isArray(parsed.steps)
      ? parsed.steps
          .filter((x: any) => x && typeof x === "object" && Number.isFinite(x.line))
          .map((x: any) => ({ line: Number(x.line), locals: x.locals && typeof x.locals === "object" ? x.locals : {} }))
      : [];
    return { steps, truncated: Boolean(parsed.truncated), programOutput };
  } catch {
    return null;
  }
}
