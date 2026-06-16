/**
 * Execution visualizer — Python line/stack tracer (Tier-A: in-language, no ptrace).
 *
 * Wraps the user's code in a program that runs it under sys.settrace, recording a unified
 * trace step (call stack with per-frame locals + output position) at each line/call/return,
 * bounded by maxSteps, then prints the trace as JSON between sentinels. Deterministic and
 * unit-testable; only the run in between needs the sandbox.
 */
import { TRACE_BEGIN, TRACE_END, DEFAULT_MAX_STEPS, clampMaxSteps, parseTraceOutput } from "./trace";

// Re-export shared API so existing importers (and tests) keep working.
export { TRACE_BEGIN, TRACE_END, DEFAULT_MAX_STEPS, parseTraceOutput };
export type { TraceFrame, TraceStep, TraceResult } from "./trace";

export function buildPythonTracerScript(userCode: string, maxSteps: number = DEFAULT_MAX_STEPS): string {
  const cap = clampMaxSteps(maxSteps);
  const b64 = Buffer.from(String(userCode ?? ""), "utf8").toString("base64");
  // Indentation matters: keep this a flat, top-level Python program.
  return `import sys, json, base64

_STEPS = []
_MAX = ${cap}
_OUT_LEN = [0]

class _CountingOut:
    def __init__(self, real):
        self._real = real
    def write(self, s):
        try:
            _OUT_LEN[0] += len(s)
        except Exception:
            pass
        return self._real.write(s)
    def flush(self):
        try:
            return self._real.flush()
        except Exception:
            pass

_real_stdout = sys.stdout
sys.stdout = _CountingOut(_real_stdout)

# Build a value for the trace: primitives inline; compound objects become {"ref": id} and
# are recorded in the per-step heap (Python Tutor model) so the UI can show aliasing.
def _val(v, heap):
    try:
        if v is None or isinstance(v, (int, float, bool)):
            return v
        if isinstance(v, str):
            return v[:200]
        key = str(id(v))
        if key not in heap:
            heap[key] = {"kind": "object", "type": type(v).__name__}  # placeholder breaks cycles
            if isinstance(v, list):
                heap[key] = {"kind": "list", "items": [_val(x, heap) for x in v[:50]]}
            elif isinstance(v, tuple):
                heap[key] = {"kind": "tuple", "items": [_val(x, heap) for x in list(v)[:50]]}
            elif isinstance(v, set):
                heap[key] = {"kind": "set", "items": [_val(x, heap) for x in list(v)[:50]]}
            elif isinstance(v, dict):
                heap[key] = {"kind": "dict", "entries": [[str(k)[:50], _val(val, heap)] for k, val in list(v.items())[:50]]}
            elif isinstance(v, type) or callable(v) or type(v).__name__ in ("module", "function", "builtin_function_or_method", "method", "getset_descriptor", "type"):
                # Classes/functions/modules/descriptors: show a compact name, don't expand
                # their internals (avoids dunder/descriptor noise in the heap).
                nm = getattr(v, "__name__", None) or repr(v)[:120]
                heap[key] = {"kind": "object", "type": type(v).__name__, "repr": str(nm)[:120]}
            else:
                try:
                    d = vars(v)
                    heap[key] = {"kind": "object", "type": type(v).__name__,
                                 "attrs": [[str(k)[:50], _val(val, heap)] for k, val in list(d.items())[:50] if not str(k).startswith("__")]}
                except Exception:
                    heap[key] = {"kind": "object", "type": type(v).__name__, "repr": repr(v)[:120]}
        return {"ref": key}
    except Exception:
        return "<unrepr>"

def _frame_locals(fr, heap):
    loc = {}
    for k, val in list(fr.f_locals.items()):
        if k.startswith("__"):
            continue
        loc[k] = _val(val, heap)
    return loc

def _stack_from(frame, heap):
    chain = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == "<user>":
            chain.append(f)
        f = f.f_back
        if len(chain) >= 50:
            break
    chain.reverse()
    out = []
    for fr in chain:
        name = fr.f_code.co_name
        out.append({"func": "<module>" if name == "<module>" else name, "line": fr.f_lineno, "locals": _frame_locals(fr, heap)})
    return out

def _tracer(frame, event, arg):
    if frame.f_code.co_filename == "<user>" and event in ("line", "call", "return"):
        if len(_STEPS) < _MAX:
            heap = {}
            stack = _stack_from(frame, heap)
            top = stack[-1] if stack else {"line": frame.f_lineno, "locals": {}}
            _STEPS.append({
                "line": top["line"],
                "event": event,
                "stack": stack,
                "stdoutLen": _OUT_LEN[0],
                "locals": top["locals"],
                "heap": heap,
            })
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

sys.stdout = _real_stdout
print("${TRACE_BEGIN}")
print(json.dumps({"steps": _STEPS, "truncated": len(_STEPS) >= _MAX}))
print("${TRACE_END}")
`;
}
