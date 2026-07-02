/**
 * Execution visualizer — PHP tracer (Tier-A: in-language via declare(ticks), no ptrace).
 *
 * Inlines the user code after a prelude that registers a per-statement tick function. The
 * tick records the current line and call stack: function frames (from debug_backtrace, with
 * call arguments) + the top-level frame's user globals. Reported lines are offset back to the
 * user's 1-based numbering. The trace is emitted from a shutdown function, so it survives even
 * a fatal error in user code. (declare(ticks) does not propagate into eval(), hence inlining.)
 */
import { TRACE_BEGIN, TRACE_END, DEFAULT_MAX_STEPS, clampMaxSteps } from "./trace";

export function buildPhpTracerScript(userCode: string, maxSteps: number = DEFAULT_MAX_STEPS): string {
  const cap = clampMaxSteps(maxSteps);
  // Strip a leading <?php / <? so we can inline the user body inside our own program.
  let body = String(userCode ?? "");
  body = body.replace(/^﻿?\s*<\?php\b/i, "").replace(/^﻿?\s*<\?=?/, "");

  const prelude = `<?php
$__SC = array();
$__MAX = ${cap};
$__OFFSET = __SC_OFFSET__;

function __sc_safe($v, $d = 0) {
    if (is_int($v) || is_float($v) || is_bool($v) || is_null($v)) return $v;
    if (is_string($v)) return substr($v, 0, 200);
    if ($d >= 2) return gettype($v);
    if (is_array($v)) {
        $out = array(); $n = 0;
        foreach ($v as $k => $vv) { $out[substr((string)$k,0,50)] = __sc_safe($vv,$d+1); if (++$n >= 50) break; }
        return $out;
    }
    return gettype($v);
}
function __sc_line($n) { $v = $n - $GLOBALS['__OFFSET']; return $v > 0 ? $v : 0; }
function __sc_tick() {
    global $__SC, $__MAX;
    if (count($__SC) >= $__MAX) return;
    $bt = debug_backtrace(DEBUG_BACKTRACE_PROVIDE_OBJECT);
    $frames = array();
    for ($i = count($bt) - 1; $i >= 1; $i--) {
        $f = $bt[$i];
        $fn = isset($f['function']) ? $f['function'] : '?';
        if ($fn === '__sc_tick') continue;
        $loc = array();
        if (!empty($f['args'])) { $j = 0; foreach ($f['args'] as $a) { $loc['arg' . $j] = __sc_safe($a); $j++; } }
        $frames[] = array('func' => $fn, 'line' => __sc_line(isset($f['line']) ? $f['line'] : 0), 'locals' => $loc);
    }
    $g = array();
    foreach ($GLOBALS as $k => $v) {
        if (strpos($k, '__') === 0) continue; // our own tracer state ($__SC, $__MAX, $__OFFSET)
        if (in_array($k, array('GLOBALS','argv','argc','_GET','_POST','_SERVER','_ENV','_FILES','_COOKIE','_SESSION','_REQUEST'), true)) continue;
        $g[$k] = __sc_safe($v);
    }
    $line = __sc_line(isset($bt[0]['line']) ? $bt[0]['line'] : 0);
    array_unshift($frames, array('func' => '<module>', 'line' => $line, 'locals' => $g));
    $top = $frames[count($frames) - 1];
    $__SC[] = array('line' => $top['line'], 'event' => 'line', 'stack' => $frames, 'locals' => $top['locals']);
}
register_shutdown_function(function () {
    global $__SC, $__MAX;
    echo "\\n" . ${JSON.stringify(TRACE_BEGIN)} . "\\n";
    echo json_encode(array('steps' => $__SC, 'truncated' => count($__SC) >= $__MAX));
    echo "\\n" . ${JSON.stringify(TRACE_END)} . "\\n";
});
register_tick_function('__sc_tick');
declare(ticks=1);
`;
  // The user body starts on the line right after the prelude; its first line maps to user
  // line 1, so the offset is (prelude line count).
  const offset = prelude.split("\n").length - 1;
  return prelude.replace("__SC_OFFSET__", String(offset)) + body + "\n";
}
