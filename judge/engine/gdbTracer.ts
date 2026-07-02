/**
 * gdb-based step tracer for compiled (native) languages — the Tier-B driver.
 *
 * Generates a gdb Python script that breaks at `main`, single-steps the program, and at each
 * stop records the user-visible call stack (frames whose source file is the user's entry
 * file) with per-frame locals, emitting the unified trace JSON between sentinels. One driver
 * covers the whole native family (C/C++/Rust/...); only the debug-compile flags differ.
 *
 * The program must be compiled with debug info and no optimisation (-g -O0 equivalent) so
 * line/locals are accurate.
 */
export const GDB_TRACE_BEGIN = "__SC_TRACE_BEGIN__";
export const GDB_TRACE_END = "__SC_TRACE_END__";

/**
 * @param entryFile   user source basename (e.g. "main.cpp") used to filter user frames.
 * @param maxSteps    step cap.
 * @param breakSpecs  candidate breakpoint locations to try in order (first that resolves wins),
 *                    e.g. ["main"] for C, ["main::main","main"] for Rust, ["main.main"] for Go.
 */
export function buildGdbDriver(entryFile: string, maxSteps: number, breakSpecs: string[] = ["main"]): string {
  const cap = Math.max(1, Math.min(5000, Math.floor(maxSteps)));
  // entryFile is a safe basename (validated upstream); embed as a Python string literal.
  const safeEntry = JSON.stringify(String(entryFile || "main"));
  const safeBreaks = JSON.stringify(breakSpecs && breakSpecs.length ? breakSpecs : ["main"]);
  return `import gdb, json
_STEPS = []
_MAX = ${cap}
_ENTRY = ${safeEntry}
_BREAKS = ${safeBreaks}

def _is_user(sal):
    try:
        if sal is None or sal.symtab is None:
            return False
        fn = sal.symtab.filename or ""
        return fn == _ENTRY or fn.endswith("/" + _ENTRY)
    except Exception:
        return False

def _val(v):
    try:
        s = str(v)
        return s[:200]
    except Exception:
        return "<unrepr>"

def _frame_locals(f):
    loc = {}
    try:
        blk = f.block()
        seen = 0
        while blk is not None and not blk.is_global and not blk.is_static:
            for sym in blk:
                if sym.is_variable or sym.is_argument:
                    nm = sym.name
                    if nm in loc:
                        continue
                    try:
                        loc[nm] = _val(f.read_var(sym))
                    except Exception:
                        pass
                    seen += 1
                    if seen >= 60:
                        return loc
            blk = blk.superblock
    except Exception:
        pass
    return loc

def _snapshot():
    frames = []
    f = gdb.newest_frame()
    depth = 0
    while f is not None and depth < 60:
        try:
            sal = f.find_sal()
        except Exception:
            sal = None
        if _is_user(sal):
            frames.append({"func": (f.name() or "?"), "line": (sal.line if sal else 0), "locals": _frame_locals(f)})
        try:
            f = f.older()
        except Exception:
            break
        depth += 1
    frames.reverse()
    return frames

def _alive():
    try:
        return len(gdb.inferiors()[0].threads()) > 0
    except Exception:
        return False

def _x(cmd):
    # Run a gdb command, swallowing gdb's own annotations (the inferior's stdout is unaffected).
    return gdb.execute(cmd, to_string=True)

def _in_user():
    try:
        return _is_user(gdb.newest_frame().find_sal())
    except Exception:
        return False

def _step_user():
    # Single source-step that stays in user code: step once; if we descended into library/
    # runtime code (statically linked with debug info in Rust/Go/Swift/D), finish back out
    # until we're in the user file again or the program ends. C/C++ rarely need the climb.
    _x("step")
    guard = 0
    while _alive() and not _in_user() and guard < 400:
        try:
            _x("finish")
        except gdb.error:
            break
        guard += 1

try:
    _x("set pagination off")
    _x("set print pretty off")
    _x("set confirm off")
    _x("set verbose off")
    # Break at the first candidate symbol that resolves (user entry differs per language:
    # C/C++ "main", Rust "main::main", Go "main.main", ...).
    _bp_ok = False
    for _spec in _BREAKS:
        try:
            _x("break " + _spec)
            _bp_ok = True
            break
        except gdb.error:
            continue
    if not _bp_ok:
        _x("break main")
    # Redirect the inferior's own stdout to a file so it isn't mixed with gdb's annotations.
    _x("run > __prog_out.txt")
    # If we stopped below the user entry (e.g. C runtime), advance to the first user frame.
    _guard = 0
    while _alive() and not _in_user() and _guard < 5000:
        try:
            _step_user()
        except gdb.error:
            break
        _guard += 1
    while len(_STEPS) < _MAX and _alive():
        try:
            stack = _snapshot()
            if stack:
                top = stack[-1]
                _STEPS.append({"line": top["line"], "event": "line", "stack": stack, "locals": top["locals"]})
        except Exception:
            pass
        try:
            _step_user()
        except gdb.error:
            break
    # Let the program run to completion so its stdout flushes (program output precedes the trace).
    try:
        if _alive():
            _x("continue")
    except Exception:
        pass
except Exception as _e:
    try:
        gdb.write(str(_e), gdb.STDERR)
    except Exception:
        pass

_prog_out = ""
try:
    with open("__prog_out.txt", "r") as _fh:
        _prog_out = _fh.read()[:65536]
except Exception:
    _prog_out = ""

print("${GDB_TRACE_BEGIN}")
print(json.dumps({"steps": _STEPS, "truncated": len(_STEPS) >= _MAX, "programOutput": _prog_out}))
print("${GDB_TRACE_END}")
try:
    gdb.execute("quit")
except Exception:
    pass
`;
}
