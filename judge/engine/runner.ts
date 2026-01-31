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
import { checkWhitespace } from "../checkers/whitespace";
import { checkFloat } from "../checkers/float";
import { cppLanguage } from "../languages/cpp";
import { javaLanguage } from "../languages/java";
import { pythonLanguage } from "../languages/python";
import type { LanguageAdapter, LanguageId } from "../languages/types";
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
    const adapter = getLanguage(req.language);
    const limits = validateAndResolveLimits(req.language, req.limits);
    const checker = normalizeChecker(req.checker);
    const chroot = this.resolveChroot(req.language);
    await this.assertChrootAvailable(req.language, chroot);
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "studycod-judge-"));
    try {
      await adapter.writeSource(workDir, req.source);
      const compilePlan = adapter.getCompilePlan();
      const scoringPlan = computeScoringPlan(req);
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
          argv: compilePlan.argv,
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

      const runPlan = adapter.getRunPlan();
      for (let i = 0; i < req.tests.length; i++) {
        const test = req.tests[i];
        const group = normalizeGroup(test.group, test.hidden);
        const weight = normalizeWeight(test.weight);
        const input = test.input ?? "";
        const expected = test.output ?? "";
        const r = await this.exec.exec({
          nsjailPath: this.cfg.nsjailPath,
          nsjailConfigPath: this.cfg.nsjailConfigPath,
          useConfig: this.cfg.useConfig,
          chroot,
          cwd: this.cfg.cwd,
          hostWorkDir: workDir,
          stdin: input,
          timeLimitMs: limits.timeLimitMs,
          memoryLimitBytes: limits.memoryLimitBytes,
          outputLimitBytes: limits.outputLimitBytes,
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
              stdin: input,
              timeLimitMs: limits.timeLimitMs,
              memoryLimitBytes: limits.memoryLimitBytes,
              outputLimitBytes: limits.outputLimitBytes,
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
              base.input = truncate(input, 4096);
              base.expected = truncate(expected, 4096);
              base.actual = truncate(r.stdout, 4096);
              base.stderr = truncate(stderrForUser, 2048);
            }
            tests.push(base);
            finalVerdict = worsen(finalVerdict, "WA");
            if (!runAll) return finalize(req.submission_id, finalVerdict, totalTime, peakMemKb, tests, score, scoringPlan.maxScore, groupAgg);
            continue;
          }
          score += weight;
          const agg = groupAgg[group];
          if (agg) {
            agg.score += weight;
          }
          if (allowDetails) {
            base.actual = truncate(r.stdout, 2048);
          }
          tests.push(base);
          continue;
        }
        base.message = runtimeVerdict === "TLE" ? "Time limit exceeded" : runtimeVerdict === "MLE" ? "Memory limit exceeded" : r.outputLimitExceeded ? "Output limit exceeded" : runtimeVerdict === "CE" ? "Compilation error" : "Runtime error";
        if (allowDetails) {
          base.input = truncate(input, 4096);
          base.expected = truncate(expected, 4096);
          base.actual = truncate(r.stdout, 4096);
          base.stderr = truncate(stderrForUser, 4096);
        }
        tests.push(base);
        finalVerdict = worsen(finalVerdict, runtimeVerdict);
        if (!runAll) return finalize(req.submission_id, finalVerdict, totalTime, peakMemKb, tests, score, scoringPlan.maxScore, groupAgg);
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
  const base = Math.max(500, Math.min(30_000, runTimeLimitMs));
  switch (language) {
    case "java":
      return Math.min(20_000, Math.max(8_000, base * 2 + 1_000));
    case "cpp":
      return Math.min(15_000, Math.max(4_000, base * 2));
    case "python":
      return Math.min(8_000, Math.max(2_000, base + 500));
  }
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
function getLanguage(id: LanguageId): LanguageAdapter {
  switch (id) {
    case "java":
      return javaLanguage;
    case "python":
      return pythonLanguage;
    case "cpp":
      return cppLanguage;
  }
}
function normalizeChecker(spec?: CheckerSpec): CheckerSpec {
  if (!spec) return {
    type: "whitespace"
  };
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
  if (req.language !== "java" && req.language !== "python" && req.language !== "cpp") throw new Error("INVALID_REQUEST: language must be java|python|cpp");
  if (typeof req.source !== "string" || req.source.length === 0) throw new Error("INVALID_REQUEST: source required");
  if (req.source.length > 1024 * 1024) throw new Error("INVALID_REQUEST: source too large");
  if (!Array.isArray(req.tests) || req.tests.length === 0) throw new Error("INVALID_REQUEST: tests required");
  if (req.tests.length > 200) throw new Error("INVALID_REQUEST: too many tests");
  for (const t of req.tests) {
    if (!t) throw new Error("INVALID_REQUEST: bad test");
    if (t.output === undefined || t.output === null) throw new Error("INVALID_REQUEST: test.output required");
    const inp = t.input ?? "";
    if (typeof inp !== "string") throw new Error("INVALID_REQUEST: test.input must be string");
    if (typeof t.output !== "string") throw new Error("INVALID_REQUEST: test.output must be string");
    if (inp.length > 256 * 1024) throw new Error("INVALID_REQUEST: test.input too large");
    if (t.output.length > 256 * 1024) throw new Error("INVALID_REQUEST: test.output too large");

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