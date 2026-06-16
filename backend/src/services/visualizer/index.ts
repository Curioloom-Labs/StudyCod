/**
 * Execution-visualizer dispatcher. Maps a judge language family to its Tier-A tracer
 * (in-language, runs as ordinary "source" in the sandbox). Languages without a tracer
 * gracefully have no visualizer (the frontend hides the Visualize button for them).
 *
 * Tier-B (gdb/jdb for compiled/JVM languages) will plug in here later behind the judge's
 * typed trace mode.
 */
import type { JudgeLanguage } from "../judgeWorker/types";
import { buildPythonTracerScript } from "./pythonTracer";
import { buildRubyTracerScript } from "./rubyTracer";
import { buildLuaTracerScript } from "./luaTracer";
import { buildPhpTracerScript } from "./phpTracer";
import { DEFAULT_MAX_STEPS } from "./trace";

export interface TracerPlan {
  /** Judge language family used to run the wrapper script. */
  judgeLanguage: JudgeLanguage;
  /** The self-tracing program (source) to run in the sandbox. */
  source: string;
}

type TracerBuilder = (code: string, maxSteps: number) => string;

// Tier-A tracers keyed by judge language family (in-language, run as ordinary source).
// Perl is deferred: PadWalker (for lexicals) isn't in the rootfs, so only sub names/lines
// would be available. JS is deferred: faithful stepping needs an out-of-process inspector
// controller (in-process self-debug blocks the thread), i.e. a Tier-B-style driver. Both
// degrade gracefully (no Visualize button) until added.
const TIER_A: Partial<Record<JudgeLanguage, TracerBuilder>> = {
  python: buildPythonTracerScript,
  ruby: buildRubyTracerScript,
  lua: buildLuaTracerScript,
  php: buildPhpTracerScript,
};

// Tier-B: compiled families step-traced by gdb inside the judge (judge trace mode).
// Kept in sync with judge/engine/runner.ts GDB_TRACEABLE.
const GDB_TRACEABLE = new Set<JudgeLanguage>(["c", "cpp", "pascal", "go"]);

/** True if the language is traced via the judge's gdb trace mode (not an in-language wrapper). */
export function isGdbTraceLanguage(language: string): language is JudgeLanguage {
  return GDB_TRACEABLE.has(language as JudgeLanguage);
}

/** All languages that support step visualization (Tier-A wrappers + Tier-B gdb). */
export function visualizerLanguages(): JudgeLanguage[] {
  return Array.from(new Set<JudgeLanguage>([...(Object.keys(TIER_A) as JudgeLanguage[]), ...GDB_TRACEABLE]));
}

export function isVisualizerSupported(language: string): language is JudgeLanguage {
  return Object.prototype.hasOwnProperty.call(TIER_A, language) || GDB_TRACEABLE.has(language as JudgeLanguage);
}

/** Build the tracer wrapper for a language, or null when visualization isn't supported. */
export function buildTracer(language: string, code: string, maxSteps: number = DEFAULT_MAX_STEPS): TracerPlan | null {
  const builder = TIER_A[language as JudgeLanguage];
  if (!builder) return null;
  return { judgeLanguage: language as JudgeLanguage, source: builder(code, maxSteps) };
}
