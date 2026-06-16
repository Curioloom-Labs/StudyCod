import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { NsJailExecutor } from "./executor";
import { Compiler, mapRuntimeToVerdict } from "./compiler";
import { validateAndResolveLimits } from "./limits";
import { CheckerSpec, GroupScore, JudgeRequest, JudgeResponse, TestRunResult, Verdict } from "./result";
import { cleanPythonRuntimeError, filterNsJailStderr } from "./stderr";
import { buildUserFacingStderr } from "./userFacingErrors";
import { checkExact } from "../checkers/exact";
import { checkNonEmpty } from "../checkers/nonempty";
import { checkWhitespace } from "../checkers/whitespace";
import { checkFloat } from "../checkers/float";
import { getLanguage, isLanguageId } from "../languages/registry";
import { resolveProfile } from "../languages/profiles";
import type { LanguageId } from "../languages/types";

type JudgeFile = { path: string; content: string };

function defaultEntryFile(language: LanguageId): string {
  return getLanguage(language).entryFile;
}

// ---- File-referenced tests --------------------------------------------------
// Large stored-test suites pass test data by file reference instead of inline, so the
// worker streams input (constant memory) and reads expected output lazily.

function intEnv(name: string, fallback: number): number {
  const v = parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Upper bound for a referenced input file (streamed, never fully held in RAM). */
function maxTestInputFileBytes(): number {
  return intEnv("JUDGE_MAX_TEST_INPUT_FILE_BYTES", 256 * 1024 * 1024);
}
/** Upper bound for a referenced expected-output file (read into RAM for the checker). */
function maxTestOutputFileBytes(): number {
  return intEnv("JUDGE_MAX_TEST_OUTPUT_FILE_BYTES", 64 * 1024 * 1024);
}

function testHasRefInput(t: { input_path?: string }): boolean {
  return typeof t.input_path === "string" && t.input_path.length > 0;
}
function testHasRefOutput(t: { output_path?: string }): boolean {
  return typeof t.output_path === "string" && t.output_path.length > 0;
}

/**
 * Defence-in-depth: when JUDGE_TEST_CACHE_DIR is configured, only allow referenced test
 * files that live under it. Paths come from our own backend, not from users, but this keeps
 * a stray/buggy path from reading arbitrary host files.
 */
function assertSafeTestPath(p: string): void {
  const resolved = path.resolve(p);
  const root = (process.env.JUDGE_TEST_CACHE_DIR || "").trim();
  if (root) {
    const r = path.resolve(root);
    if (resolved !== r && !resolved.startsWith(r + path.sep)) {
      throw new Error("INVALID_REQUEST: test file path outside cache root");
    }
  }
}

/** Read up to `maxBytes` from a file as UTF-8 (used for expected output and small samples). */
async function readFileCapped(p: string, maxBytes: number): Promise<string> {
  const fh = await fs.open(p, "r");
  try {
    const st = await fh.stat();
    const len = Math.min(st.size, Math.max(0, maxBytes));
    if (len <= 0) return "";
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, 0);
    return buf.toString("utf8");
  } finally {
    await fh.close();
  }
}

/** Async validation for referenced test files (existence, type, size, path safety). */
async function validateTestRefs(req: JudgeRequest): Promise<void> {
  const maxIn = maxTestInputFileBytes();
  const maxOut = maxTestOutputFileBytes();
  for (const t of req.tests) {
    if (testHasRefInput(t)) {
      const p = t.input_path as string;
      assertSafeTestPath(p);
      let st: import("fs").Stats;
      try {
        st = await fs.stat(p);
      } catch {
        throw new Error("INVALID_REQUEST: test.input_path not found");
      }
      if (!st.isFile()) throw new Error("INVALID_REQUEST: test.input_path not a file");
      if (st.size > maxIn) throw new Error(`INVALID_REQUEST: test.input too large (max ${maxIn} bytes)`);
    }
    if (testHasRefOutput(t)) {
      const p = t.output_path as string;
      assertSafeTestPath(p);
      let st: import("fs").Stats;
      try {
        st = await fs.stat(p);
      } catch {
        throw new Error("INVALID_REQUEST: test.output_path not found");
      }
      if (!st.isFile()) throw new Error("INVALID_REQUEST: test.output_path not a file");
      if (st.size > maxOut) throw new Error(`INVALID_REQUEST: test.output too large (max ${maxOut} bytes)`);
    }
  }
}

function isSafeRootRelativeFilePath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  const s = p.trim();
  if (!s) return false;
  // No directories for now (keeps sandbox + compile plans simple and predictable).
  if (s.includes("/") || s.includes("\\")) return false;
  if (s.startsWith(".")) return false;
  if (s.includes("..")) return false;
  // Keep filenames reasonably short.
  if (s.length > 120) return false;
  return true;
}

function normalizeMultiFiles(input: unknown): JudgeFile[] {
  if (!Array.isArray(input)) return [];
  const out: JudgeFile[] = [];
  for (const f of input) {
    if (!f || typeof f !== "object") continue;
    const pathRaw = (f as any).path;
    const contentRaw = (f as any).content;
    if (!isSafeRootRelativeFilePath(pathRaw)) continue;
    if (typeof contentRaw !== "string") continue;
    out.push({ path: pathRaw.trim(), content: contentRaw });
  }
  // Deduplicate by path (last wins).
  const byPath = new Map<string, JudgeFile>();
  for (const f of out) byPath.set(f.path, f);
  return [...byPath.values()];
}

async function writeFilesToWorkDir(workDir: string, files: JudgeFile[]): Promise<void> {
  for (const f of files) {
    // Extra safety: even though we disallow separators, join defensively.
    const filePath = path.join(workDir, f.path);
    await fs.writeFile(filePath, f.content, { encoding: "utf8" });
  }
}

function buildCompilePlanForFiles(language: LanguageId, files: JudgeFile[]): { argv: string[]; display: string } | null {
  const paths = files.map(f => f.path);
  if (language === "python") {
    // Python: compile only entry file (imports will fail at runtime if broken).
    return {
      display: "python3 -m py_compile main.py",
      argv: ["/usr/bin/python3", "-B", "-m", "py_compile", "main.py"]
    };
  }
  if (language === "java") {
    const javaFiles = paths.filter(p => p.toLowerCase().endsWith(".java"));
    if (javaFiles.length === 0) return null;
    return {
      display: `javac ${javaFiles.join(" ")}`,
      argv: ["/usr/bin/javac", "-J-Xms64m", "-J-Xmx128m", "-encoding", "UTF-8", ...javaFiles]
    };
  }
  if (language === "kotlin") {
    const ktFiles = paths.filter(p => p.toLowerCase().endsWith(".kt"));
    if (ktFiles.length === 0) return null;
    return {
      display: `kotlinc ${ktFiles.join(" ")} -include-runtime -d app.jar`,
      argv: ["/usr/bin/kotlinc", ...ktFiles, "-include-runtime", "-d", "app.jar"]
    };
  }
  if (language === "cpp") {
    const cppFiles = paths.filter(p => /\.(cpp|cc|cxx)$/i.test(p));
    if (cppFiles.length === 0) return null;
    return {
      display: `g++ -B/usr/bin ${cppFiles.join(" ")} -o app`,
      argv: ["/usr/bin/g++", "-B/usr/bin", "-O2", "-pipe", "-std=gnu++17", "-fno-omit-frame-pointer", ...cppFiles, "-o", "app"]
    };
  }
  if (language === "c") {
    const cFiles = paths.filter(p => /\.(c)$/i.test(p));
    if (cFiles.length === 0) return null;
    return {
      display: `gcc -B/usr/bin ${cFiles.join(" ")} -o app`,
      argv: ["/usr/bin/gcc", "-B/usr/bin", "-O2", "-pipe", "-std=gnu11", "-fno-omit-frame-pointer", ...cFiles, "-o", "app"]
    };
  }
  if (language === "go") {
    const goFiles = paths.filter(p => /\.go$/i.test(p));
    if (goFiles.length === 0) return null;
    return {
      display: `go build -o app ${goFiles.join(" ")}`,
      argv: [
        "/usr/bin/env",
        "HOME=/work",
        "GOCACHE=/work/.gocache",
        "GOPATH=/work/.gopath",
        "GO111MODULE=off",
        "GOTOOLCHAIN=local",
        "GOFLAGS=-trimpath",
        "CGO_ENABLED=0",
        "/usr/bin/go",
        "build",
        "-o",
        "app",
        ...goFiles
      ]
    };
  }
  // JS (node --check on entry), Rust and Pascal compile from the single entry file;
  // multi-file builds fall back to the adapter/profile plan.
  if (language === "js" || language === "rust" || language === "pascal") return null;
  // C# compilation handled by dotnet build (project-based). Adding extra files is fine.
  if (language === "csharp") return null;
  return null;
}

function parseDisabledLanguagesEnv(): Set<LanguageId> {
  const raw = String(process.env.JUDGE_DISABLED_LANGUAGES ?? process.env.DISABLED_JUDGE_LANGUAGES ?? "").trim();
  if (!raw) return new Set();
  const parts = raw
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const disabled = new Set<LanguageId>();
  for (const p of parts) {
    if (isLanguageId(p)) {
      disabled.add(p);
    }
  }
  return disabled;
}
export interface RunnerConfig {
  nsjailPath: string;
  nsjailConfigPath: string;
  useConfig: boolean;
  chrootByLanguage: Partial<Record<LanguageId, string>>;
  cwd: string;
}
export class Runner {
  private exec = new NsJailExecutor();
  private compiler = new Compiler(this.exec);
  constructor(private cfg: RunnerConfig) {}
  async run(req: JudgeRequest): Promise<JudgeResponse> {
    validateRequest(req);
    await validateTestRefs(req);
    const adapter = getLanguage(req.language);
    // Optional compiler/version selection. Falls back to the family default.
    const profile = resolveProfile(req.language, (req as any).compiler);
    const limits = validateAndResolveLimits(req.language, req.limits);
    const checker = normalizeChecker(req.checker);
    const chroot = this.resolveChroot(req.language);
    await this.assertChrootAvailable(req.language, chroot);
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "studycod-judge-"));
    // When nsjail runs with uidmap/gidmap (config mode), the sandboxed process may not
    // map to the same host UID as this Node process. Ensure the bind-mounted /work is
    // writable from inside the jail.
    try {
      await fs.chmod(workDir, 0o777);
    } catch {
      // Best-effort; if chmod fails, compilation may still succeed depending on uid mapping.
    }
    try {
      const reqFiles = normalizeMultiFiles((req as any).files);
      const wantsFiles = reqFiles.length > 0;
      const entry = ((req as any).entry && typeof (req as any).entry === "string" ? String((req as any).entry).trim() : "") || defaultEntryFile(req.language);

      if (wantsFiles) {
        if (entry !== defaultEntryFile(req.language)) {
          throw new Error(`INVALID_REQUEST: entry must be ${defaultEntryFile(req.language)} for language ${req.language}`);
        }
        const hasEntry = reqFiles.some(f => f.path === entry);
        if (!hasEntry) throw new Error(`INVALID_REQUEST: entry file missing: ${entry}`);

        if (req.language === "csharp") {
          // Ensure csproj exists. Delegate to adapter to create it.
          const program = reqFiles.find(f => f.path === "Program.cs")?.content ?? "";
          await adapter.writeSource(workDir, program);
          const rest = reqFiles.filter(f => f.path !== "Program.cs");
          await writeFilesToWorkDir(workDir, rest);
        } else {
          await writeFilesToWorkDir(workDir, reqFiles);
        }
      } else {
        const source = (req as any).source;
        await adapter.writeSource(workDir, String(source ?? ""));
      }

      // Compile/run plans: a selected compiler profile overrides the family default.
      // Multi-file submissions still prefer the per-files compile plan when available.
      const profileCompilePlan = profile.compile ? profile.compile() : adapter.getCompilePlan();
      const compilePlan = wantsFiles ? (buildCompilePlanForFiles(req.language, reqFiles) ?? profileCompilePlan) : profileCompilePlan;
      const scoringPlan = computeScoringPlan(req);
      const needsDotnetFixes = !this.cfg.useConfig && req.language === "csharp";
      const extraNsJailArgs = needsDotnetFixes
        ? [
            "--bindmount",
            "/proc:/proc",
            "--bindmount",
            "/dev:/dev",
            // Named mutexes / POSIX semaphores are typically backed by /dev/shm.
            // dotnet/nuget uses a global mutex like 'NuGet-Migrations' during first-time setup.
            "--bindmount",
            "/dev/shm:/dev/shm",
            // dotnet opens many files and spawns threads; be generous here.
            // These flags appear after the default rlimits, so they override them.
            "--rlimit_nofile",
            "4096",
            "--rlimit_nproc",
            "512"
          ]
        : undefined;
      const addressSpaceLimitBytes = req.language === "csharp" ? 4 * 1024 * 1024 * 1024 : undefined;
      if (compilePlan) {
        const compileTimeLimitMs = resolveCompileTimeLimitMs(req.language, limits.timeLimitMs);
        const compileRes = await this.compiler.compile({
          language: req.language,
          nsjailPath: this.cfg.nsjailPath,
          nsjailConfigPath: this.cfg.nsjailConfigPath,
          useConfig: this.cfg.useConfig,
          chroot,
          cwd: this.cfg.cwd,
          hostWorkDir: workDir,
          extraNsJailArgs,
          addressSpaceLimitBytes,
          argv: compilePlan.argv,
          display: compilePlan.display,
          timeLimitMs: compileTimeLimitMs,
          memoryLimitBytes: limits.memoryLimitBytes,
          outputLimitBytes: Math.max(64 * 1024, limits.outputLimitBytes)
        });
        if (!compileRes.ok) {
          return {
            submission_id: req.submission_id,
            verdict: "CE",
            time_ms: compileRes.time_ms,
            memory_kb: compileRes.memory_kb,
            compile: compileRes,
            score: 0,
            max_score: scoringPlan.maxScore,
            group_scores: scoringPlan.groupScoresTemplate,
            tests: []
          };
        }
      }
      const tests: TestRunResult[] = [];
      let totalTime = 0;
      let peakMemKb: number | null = null;
      const runAll = req.run_all !== false;
      let finalVerdict: Verdict = "AC";

      let score = 0;
      const groupAgg = scoringPlan.groupAgg;
      const groupScoringMode = req.group_scoring_mode ?? "SUM";
      // Binary subtask scoring requires all tests in a group to be executed, so we only enable it when `run_all=true`.
      const binaryGroupScoring = groupScoringMode === "BINARY_ALL_OR_NOT" && runAll;
      const groupFailed: Record<string, boolean> = {};

      const runPlan = profile.run ? profile.run() : adapter.getRunPlan();
      for (let i = 0; i < req.tests.length; i++) {
        const test = req.tests[i];
        const group = normalizeGroup(test.group, test.hidden);
        const weight = normalizeWeight(test.weight);
        const useRefInput = testHasRefInput(test);
        const useRefOutput = testHasRefOutput(test);
        const inlineInput = test.input ?? "";
        // Expected output: streamed inputs keep input out of RAM, but expected must be
        // materialised for the checker (bounded by the output-file cap).
        const expected = useRefOutput
          ? await readFileCapped(test.output_path as string, maxTestOutputFileBytes())
          : (test.output ?? "");
        const execStdin = useRefInput ? "" : inlineInput;
        const execStdinFile = useRefInput ? (test.input_path as string) : undefined;
        const r = await this.exec.exec({
          nsjailPath: this.cfg.nsjailPath,
          nsjailConfigPath: this.cfg.nsjailConfigPath,
          useConfig: this.cfg.useConfig,
          chroot,
          cwd: this.cfg.cwd,
          hostWorkDir: workDir,
          stdin: execStdin,
          stdinFile: execStdinFile,
          timeLimitMs: limits.timeLimitMs,
          memoryLimitBytes: limits.memoryLimitBytes,
          addressSpaceLimitBytes,
          outputLimitBytes: limits.outputLimitBytes,
          fileSizeLimitBytes: req.language === "csharp" ? 256 * 1024 * 1024 : 32 * 1024 * 1024,
          extraNsJailArgs,
          argv: runPlan.argv,
          sandboxId: `t${i + 1}`
        });
        const timeMs = Math.round(r.timeMs);
        totalTime += timeMs;
        if (r.memoryKb !== null) {
          peakMemKb = peakMemKb === null ? r.memoryKb : Math.max(peakMemKb, r.memoryKb);
        }
        let runtimeVerdict = mapRuntimeToVerdict({
          timedOut: r.timedOut,
          outputLimitExceeded: r.outputLimitExceeded,
          exitCode: r.exitCode,
          signal: r.signal,
          stderr: r.stderr
        });

        if (req.rerun_failed_once && (runtimeVerdict === "RE" || runtimeVerdict === "TLE" || runtimeVerdict === "MLE")) {
          try {
            const rr = await this.exec.exec({
              nsjailPath: this.cfg.nsjailPath,
              nsjailConfigPath: this.cfg.nsjailConfigPath,
              useConfig: this.cfg.useConfig,
              chroot,
              cwd: this.cfg.cwd,
              hostWorkDir: workDir,
              stdin: execStdin,
              stdinFile: execStdinFile,
              timeLimitMs: limits.timeLimitMs,
              memoryLimitBytes: limits.memoryLimitBytes,
              addressSpaceLimitBytes,
              outputLimitBytes: limits.outputLimitBytes,
              fileSizeLimitBytes: req.language === "csharp" ? 256 * 1024 * 1024 : 32 * 1024 * 1024,
              extraNsJailArgs,
              argv: runPlan.argv,
              sandboxId: `t${i + 1}r`
            });
            const rerunVerdict = mapRuntimeToVerdict({
              timedOut: rr.timedOut,
              outputLimitExceeded: rr.outputLimitExceeded,
              exitCode: rr.exitCode,
              signal: rr.signal,
              stderr: rr.stderr
            });
            runtimeVerdict = worsen(runtimeVerdict, rerunVerdict);
          } catch {}
        }

        const baseStderrForUser = req.language === "python" ? cleanPythonRuntimeError(r.stderr) || filterNsJailStderr(r.stderr) : filterNsJailStderr(r.stderr);
        const explained = buildUserFacingStderr(req.language, baseStderrForUser);
        const stderrForUser = explained.stderr;

        if (req.language === "python" && explained.kind === "syntax") {
          runtimeVerdict = "CE";
        }
        const allowDetails = !!req.debug || !test.hidden;
        const base: TestRunResult = {
          test_id: test.id,
          verdict: runtimeVerdict,
          time_ms: timeMs,
          memory_kb: r.memoryKb,
          error_kind: explained.kind,
          group,
          weight
        };
        if (runtimeVerdict === "AC") {
          const ok = checkOutput(checker, r.stdout, expected);
          if (!ok) {
            base.verdict = "WA";
            base.message = "Wrong answer";
            if (allowDetails) {
              // For referenced inputs, read only a small prefix for the user-facing sample.
              const inputSample = useRefInput
                ? await readFileCapped(test.input_path as string, 4096)
                : inlineInput;
              base.input = truncate(inputSample, 4096);
              base.expected = truncate(expected, 4096);
              base.actual = truncate(r.stdout, 4096);
              base.stderr = truncate(stderrForUser, 2048);
            }
            tests.push(base);
            finalVerdict = worsen(finalVerdict, "WA");
            if (binaryGroupScoring) {
              groupFailed[group] = true;
            }
            if (!runAll) return finalize(req.submission_id, finalVerdict, totalTime, peakMemKb, tests, score, scoringPlan.maxScore, groupAgg);
            continue;
          }
          if (!binaryGroupScoring) {
            score += weight;
            const agg = groupAgg[group];
            if (agg) {
              agg.score += weight;
            }
          }
          if (allowDetails && req.debug) {
            base.actual = truncate(r.stdout, 2048);
          }
          tests.push(base);
          continue;
        }
        base.message = runtimeVerdict === "TLE" ? "Time limit exceeded" : runtimeVerdict === "MLE" ? "Memory limit exceeded" : r.outputLimitExceeded ? "Output limit exceeded" : runtimeVerdict === "CE" ? "Compilation error" : "Runtime error";
        if (binaryGroupScoring) {
          groupFailed[group] = true;
        }
        if (allowDetails) {
          const inputSample = useRefInput
            ? await readFileCapped(test.input_path as string, 4096)
            : inlineInput;
          base.input = truncate(inputSample, 4096);
          base.expected = truncate(expected, 4096);
          base.actual = truncate(r.stdout, 4096);
          base.stderr = truncate(stderrForUser, 4096);
        }
        tests.push(base);
        finalVerdict = worsen(finalVerdict, runtimeVerdict);
        if (!runAll) return finalize(req.submission_id, finalVerdict, totalTime, peakMemKb, tests, score, scoringPlan.maxScore, groupAgg);
      }
      if (binaryGroupScoring) {
        // Convert group pass/fail into 0/full scoring.
        for (const [groupName, agg] of Object.entries(groupAgg)) {
          const failed = groupFailed[groupName] === true;
          agg.score = failed ? 0 : agg.max_score;
        }
        score = Object.values(groupAgg).reduce((sum, agg) => sum + (agg.score || 0), 0);
      }
      return finalize(req.submission_id, finalVerdict, totalTime, peakMemKb, tests, score, scoringPlan.maxScore, groupAgg);
    } finally {
      await safeRm(workDir);
    }
  }
  private resolveChroot(language: LanguageId): string {
    if (this.cfg.useConfig) return this.cfg.chrootByLanguage[language] || "/sandbox/rootfs";
    const v = (this.cfg.chrootByLanguage[language] || "").trim();
    if (!v) {
      return "/sandbox/rootfs";
    }
    return v;
  }
  private async assertChrootAvailable(language: LanguageId, chroot: string): Promise<void> {
    if (this.cfg.useConfig) return;
    const hostPath = (chroot || "").trim();
    if (!hostPath) {
      throw new Error(`NSJAIL_CHROOT_NOT_SET: set NSJAIL_CHROOT_${language.toUpperCase()} (or NSJAIL_CHROOT) to an existing directory on the host (e.g. /sandbox/${language})`);
    }
    try {
      const st = await fs.stat(hostPath);
      if (!st.isDirectory()) {
        throw new Error(`NSJAIL_CHROOT_NOT_A_DIRECTORY: ${hostPath} (set NSJAIL_CHROOT_${language.toUpperCase()} to a directory)`);
      }
    } catch {
      throw new Error(`NSJAIL_CHROOT_NOT_FOUND: ${hostPath}. Create it on the server or set NSJAIL_CHROOT_${language.toUpperCase()} to the correct existing path (e.g. /sandbox/${language}).`);
    }
  }
}
function resolveCompileTimeLimitMs(language: LanguageId, runTimeLimitMs: number): number {
  return getLanguage(language).compileTimeLimitMs(runTimeLimitMs);
}
type GroupAgg = Record<string, { score: number; max_score: number }>;

function finalize(
  submissionId: string,
  verdict: Verdict,
  timeMs: number,
  memoryKb: number | null,
  tests: TestRunResult[],
  score: number,
  maxScore: number,
  groupAgg: GroupAgg
): JudgeResponse {
  return {
    submission_id: submissionId,
    verdict,
    time_ms: timeMs,
    memory_kb: memoryKb,
    score,
    max_score: maxScore,
    group_scores: buildGroupScores(groupAgg),
    tests
  };
}

function buildGroupScores(groupAgg: GroupAgg): GroupScore[] {
  const entries = Object.entries(groupAgg);
  entries.sort(([a], [b]) => {
    const aa = a === "public" ? "\u0000" : a === "hidden" ? "\uffff" : a;
    const bb = b === "public" ? "\u0000" : b === "hidden" ? "\uffff" : b;
    return aa.localeCompare(bb);
  });
  return entries.map(([group, v]) => ({
    group,
    score: v.score,
    max_score: v.max_score
  }));
}
function worsen(current: Verdict, next: Verdict): Verdict {
  const rank: Record<Verdict, number> = {
    AC: 0,
    WA: 1,
    TLE: 2,
    MLE: 3,
    RE: 4,
    CE: 5
  };
  return rank[next] > rank[current] ? next : current;
}
function normalizeChecker(spec?: CheckerSpec): CheckerSpec {
  if (!spec) return {
    type: "whitespace"
  };
  if (spec.type === "nonempty") return { type: "nonempty" };
  if (spec.type === "float") {
    const eps = Number((spec as any).epsilon);
    if (!Number.isFinite(eps) || eps <= 0 || eps > 1) return {
      type: "float",
      epsilon: 1e-6
    };
    return {
      type: "float",
      epsilon: eps
    };
  }
  return spec;
}
function checkOutput(spec: CheckerSpec, actual: string, expected: string): boolean {
  switch (spec.type) {
    case "exact":
      return checkExact(actual, expected);
    case "whitespace":
      return checkWhitespace(actual, expected);
    case "nonempty":
      return checkNonEmpty(actual);
    case "float":
      return checkFloat(actual, expected, spec.epsilon);
  }
}
function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max);
}
async function safeRm(dir: string) {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  } catch {}
}
function validateRequest(req: JudgeRequest) {
  if (!req || typeof req !== "object") throw new Error("INVALID_REQUEST: not an object");
  if (!req.submission_id || typeof req.submission_id !== "string") throw new Error("INVALID_REQUEST: submission_id required");
  if (!isLanguageId(req.language)) {
    throw new Error("INVALID_REQUEST: unsupported language");
  }
  const compiler = (req as any).compiler;
  if (compiler !== undefined && compiler !== null && typeof compiler !== "string") {
    throw new Error("INVALID_REQUEST: compiler must be a string");
  }

  const disabled = parseDisabledLanguagesEnv();
  if (disabled.has(req.language)) {
    throw new Error(`INVALID_REQUEST: language disabled: ${req.language}`);
  }

  const files = normalizeMultiFiles((req as any).files);
  const hasFiles = files.length > 0;
  const source = (req as any).source;
  const hasSource = typeof source === "string" && source.length > 0;

  if (!hasFiles && !hasSource) throw new Error("INVALID_REQUEST: source or files required");
  if (hasSource && typeof source === "string" && source.length > 1024 * 1024) throw new Error("INVALID_REQUEST: source too large");

  if (hasFiles) {
    const entryDefault = defaultEntryFile(req.language);
    const entry = ((req as any).entry && typeof (req as any).entry === "string" ? String((req as any).entry).trim() : "") || entryDefault;
    if (entry !== entryDefault) {
      throw new Error(`INVALID_REQUEST: entry must be ${entryDefault} for language ${req.language}`);
    }
    if (!files.some(f => f.path === entryDefault)) {
      throw new Error(`INVALID_REQUEST: entry file missing: ${entryDefault}`);
    }

    // Limit: total source size.
    const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content || "", "utf8"), 0);
    if (totalBytes > 1024 * 1024) throw new Error("INVALID_REQUEST: files too large");

    const maxFilesRaw = parseInt(String(process.env.JUDGE_MAX_FILES ?? ""), 10);
    const maxFiles = Number.isFinite(maxFilesRaw) && maxFilesRaw > 0 ? maxFilesRaw : 64;
    if (files.length > maxFiles) throw new Error(`INVALID_REQUEST: too many files (max ${maxFiles})`);
  }
  if (!Array.isArray(req.tests) || req.tests.length === 0) throw new Error("INVALID_REQUEST: tests required");

  const maxTestsRaw = parseInt(String(process.env.JUDGE_MAX_TESTS ?? ""), 10);
  const maxTests = Number.isFinite(maxTestsRaw) && maxTestsRaw > 0 ? maxTestsRaw : 5000;
  if (req.tests.length > maxTests) throw new Error(`INVALID_REQUEST: too many tests (max ${maxTests})`);

  const maxTestInputBytesRaw = parseInt(String(process.env.JUDGE_MAX_TEST_INPUT_BYTES ?? ""), 10);
  const maxTestOutputBytesRaw = parseInt(String(process.env.JUDGE_MAX_TEST_OUTPUT_BYTES ?? ""), 10);
  const maxTestInputBytes =
    Number.isFinite(maxTestInputBytesRaw) && maxTestInputBytesRaw > 0 ? maxTestInputBytesRaw : 1024 * 1024;
  const maxTestOutputBytes =
    Number.isFinite(maxTestOutputBytesRaw) && maxTestOutputBytesRaw > 0 ? maxTestOutputBytesRaw : 1024 * 1024;
  for (const t of req.tests) {
    if (!t) throw new Error("INVALID_REQUEST: bad test");
    const hasRefInput = testHasRefInput(t);
    const hasRefOutput = testHasRefOutput(t);
    if ((t as any).input_path !== undefined && typeof (t as any).input_path !== "string") {
      throw new Error("INVALID_REQUEST: test.input_path must be string");
    }
    if ((t as any).output_path !== undefined && typeof (t as any).output_path !== "string") {
      throw new Error("INVALID_REQUEST: test.output_path must be string");
    }
    // Expected output may be inline OR referenced by file.
    if (!hasRefOutput && (t.output === undefined || t.output === null)) {
      throw new Error("INVALID_REQUEST: test.output required");
    }
    // Inline input/output are size-checked here; referenced files are validated (size +
    // path safety) asynchronously before the run loop.
    if (!hasRefInput) {
      const inp = t.input ?? "";
      if (typeof inp !== "string") throw new Error("INVALID_REQUEST: test.input must be string");
      if (inp.length > maxTestInputBytes) throw new Error(`INVALID_REQUEST: test.input too large (max ${maxTestInputBytes} bytes)`);
    }
    if (!hasRefOutput) {
      if (typeof t.output !== "string") throw new Error("INVALID_REQUEST: test.output must be string");
      if (t.output.length > maxTestOutputBytes) throw new Error(`INVALID_REQUEST: test.output too large (max ${maxTestOutputBytes} bytes)`);
    }

    if (t.group !== undefined && t.group !== null && typeof t.group !== "string") {
      throw new Error("INVALID_REQUEST: test.group must be string");
    }
    if (t.weight !== undefined && t.weight !== null && typeof t.weight !== "number") {
      throw new Error("INVALID_REQUEST: test.weight must be number");
    }
  }
  if (!req.limits) throw new Error("INVALID_REQUEST: limits required");

  if (req.debug !== undefined && typeof req.debug !== "boolean") throw new Error("INVALID_REQUEST: debug must be boolean");
  if (req.run_all !== undefined && typeof req.run_all !== "boolean") throw new Error("INVALID_REQUEST: run_all must be boolean");
  if (req.rerun_failed_once !== undefined && typeof req.rerun_failed_once !== "boolean") throw new Error("INVALID_REQUEST: rerun_failed_once must be boolean");
  if (req.group_scoring_mode !== undefined) {
    if (req.group_scoring_mode !== "SUM" && req.group_scoring_mode !== "BINARY_ALL_OR_NOT") {
      throw new Error("INVALID_REQUEST: group_scoring_mode must be SUM|BINARY_ALL_OR_NOT");
    }
  }
}

function computeScoringPlan(req: JudgeRequest): {
  maxScore: number;
  groupAgg: GroupAgg;
  groupScoresTemplate: GroupScore[];
} {
  const groupAgg: GroupAgg = {};
  let maxScore = 0;

  for (const t of req.tests) {
    const group = normalizeGroup(t.group, t.hidden);
    const weight = normalizeWeight(t.weight);
    maxScore += weight;
    if (!groupAgg[group]) {
      groupAgg[group] = {
        score: 0,
        max_score: 0
      };
    }
    groupAgg[group].max_score += weight;
  }

  const groupScoresTemplate = buildGroupScores(groupAgg);
  return {
    maxScore,
    groupAgg,
    groupScoresTemplate
  };
}

function normalizeGroup(group: unknown, hidden?: boolean): string {
  const raw = typeof group === "string" ? group.trim() : "";
  if (raw) {
    const normalized = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
    return normalized.slice(0, 32) || (hidden ? "hidden" : "public");
  }
  return hidden ? "hidden" : "public";
}

function normalizeWeight(weight: unknown): number {
  const n = typeof weight === "number" ? weight : Number.NaN;
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 1;
  if (n > 1000) return 1000;
  return Math.round(n * 1000) / 1000;
}