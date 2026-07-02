export type LanguageId =
  | "java"
  | "python"
  | "cpp"
  | "c"
  | "csharp"
  | "kotlin"
  | "js"
  | "go"
  | "rust"
  | "pascal"
  | "d"
  | "dart"
  | "haskell"
  | "lisp"
  | "lua"
  | "perl"
  | "php"
  | "ruby"
  | "swift";

export interface CompilePlan {
  argv: string[];
  display: string;
}
export interface RunPlan {
  argv: string[];
  display: string;
}

/** Resource defaults for a language family (overridable per request). */
export interface LanguageLimits {
  time_limit_ms: number;
  memory_limit_mb: number;
  output_limit_kb: number;
}

export interface LanguageAdapter {
  id: LanguageId;
  /** Single-file entry filename written into the work dir (e.g. "Main.java"). */
  entryFile: string;
  /** Default execution limits when the request doesn't specify them. */
  defaultLimits: LanguageLimits;
  /** Compile-phase wall-clock budget (ms) derived from the per-test run limit. */
  compileTimeLimitMs(runTimeLimitMs: number): number;
  writeSource(workDir: string, source: string): Promise<void>;
  getCompilePlan(): CompilePlan | null;
  getRunPlan(): RunPlan;
}

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

/**
 * Shared compile-time-budget presets keyed by toolchain "speed class". Each takes the raw
 * per-test run limit and returns a wall-clock compile budget. `base` mirrors the historical
 * normalisation (500..30000ms) so existing languages keep their exact budgets.
 */
export const COMPILE_BUDGET = {
  /** Interpreted / syntax-check only (python, js, lua, perl, php, ruby, lisp, dart). */
  interpreted: (run: number) => clamp(2_000, 8_000, clamp(500, 30_000, run) + 500),
  /** Fast native compile (c, pascal, d). */
  fast: (run: number) => clamp(3_000, 12_000, clamp(500, 30_000, run) * 2),
  /** C++ (template-heavy, a bit slower than C). */
  cpp: (run: number) => clamp(4_000, 15_000, clamp(500, 30_000, run) * 2),
  /** JVM javac. */
  java: (run: number) => clamp(8_000, 20_000, clamp(500, 30_000, run) * 2 + 1_000),
  /** Slow optimising compilers (rust, haskell, swift). */
  slow: (run: number) => clamp(12_000, 45_000, clamp(500, 30_000, run) * 3 + 4_000),
  /**
   * Go toolchain. With the persistent bind-mounted GOCACHE (see runner) warm builds are
   * ~0.5s; the floor covers a one-time cold build (~18s, recompiling the stdlib).
   */
  go: (run: number) => clamp(20_000, 45_000, clamp(500, 30_000, run) * 3 + 10_000),
  /** Kotlin (kotlinc -include-runtime is heavy). */
  kotlin: (run: number) => clamp(25_000, 60_000, clamp(500, 30_000, run) * 3 + 5_000),
  /** dotnet build. */
  csharp: (run: number) => clamp(30_000, 60_000, clamp(500, 30_000, run) * 3 + 7_000)
} as const;

/** Common limit presets to cut down per-adapter boilerplate. */
export const LIMIT_PRESETS = {
  native: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  scripting: { time_limit_ms: 2_000, memory_limit_mb: 256, output_limit_kb: 64 }
} as const;
