import { spawn } from "child_process";
import type { JudgeRequest, JudgeResponse } from "./types";
import { resolveJudgeSandboxConfig, resolveJudgeWorkerEntry } from "./workerPaths";
import { env } from "../../env";
import { logger } from "../../utils/logger";

type JudgeClientErrorKind =
  | "SPAWN_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "STDOUT_TOO_LARGE"
  | "STDERR_TOO_LARGE"
  | "NO_OUTPUT"
  | "NON_ZERO_EXIT"
  | "BAD_JSON"
  | "JUDGE_ERROR";

class JudgeClientError extends Error {
  public readonly kind: JudgeClientErrorKind;
  public readonly command: string;
  public readonly args: string[];
  public readonly workerEntry: string;
  public readonly exitCode: number | null;
  public readonly signal: NodeJS.Signals | null;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(params: {
    kind: JudgeClientErrorKind;
    message: string;
    command: string;
    args: string[];
    workerEntry: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }) {
    super(params.message);
    this.name = "JudgeClientError";
    this.kind = params.kind;
    this.command = params.command;
    this.args = params.args;
    this.workerEntry = params.workerEntry;
    this.exitCode = params.exitCode;
    this.signal = params.signal;
    this.stdout = params.stdout;
    this.stderr = params.stderr;
  }

  toDebugJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      command: this.command,
      args: this.args,
      workerEntry: this.workerEntry,
      exitCode: this.exitCode,
      signal: this.signal,
      stdout: truncate(this.stdout, 8192),
      stderr: truncate(this.stderr, 8192)
    };
  }
}
export interface JudgeClientOptions {
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  overallTimeoutMs?: number;
  nsjailPath?: string;
}
export interface JudgeRunOptions {
  signal?: AbortSignal;
}
export class JudgeClient {
  constructor(private opts: JudgeClientOptions = {}) {}
  async judge(request: JudgeRequest, runOptions: JudgeRunOptions = {}): Promise<JudgeResponse> {
    const workerEntry = await resolveJudgeWorkerEntry();
    const nsjailConfig = resolveJudgeSandboxConfig();
    // Defaults are intentionally generous because large test suites can still produce
    // moderately large JSON even when individual fields are truncated.
    const maxStdout = this.opts.maxStdoutBytes ?? 16 * 1024 * 1024;
    const maxStderr = this.opts.maxStderrBytes ?? 2 * 1024 * 1024;
    const estimated = estimateOverallTimeoutMs(request);
    const overallTimeout = this.opts.overallTimeoutMs ?? estimated;
    const payload = JSON.stringify(request);
    const payloadBytes = Buffer.byteLength(payload, "utf8");
    const nodeBin = process.execPath;
    const spawnArgs = [workerEntry];

    if (runOptions.signal?.aborted) {
      const reason = (runOptions.signal as any)?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "aborted");
      throw new Error(`JUDGE_ABORTED: ${msg}`);
    }

    const inferredMaxInputBytes = Math.max(64 * 1024 * 1024, payloadBytes + 2 * 1024 * 1024);
    const childEnv = {
      ...process.env,
      // dotnet inside chroot: make framework discovery and caches deterministic.
      DOTNET_ROOT: process.env.DOTNET_ROOT || "/usr/share/dotnet",
      DOTNET_CLI_HOME: process.env.DOTNET_CLI_HOME || "/tmp",
      NUGET_PACKAGES: process.env.NUGET_PACKAGES || "/tmp/nuget",
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: process.env.DOTNET_SKIP_FIRST_TIME_EXPERIENCE || "1",
      DOTNET_NOLOGO: process.env.DOTNET_NOLOGO || "1",
      DOTNET_CLI_TELEMETRY_OPTOUT: process.env.DOTNET_CLI_TELEMETRY_OPTOUT || "1",
      DOTNET_GCConserveMemory: process.env.DOTNET_GCConserveMemory || "9",
      NSJAIL_PATH: this.opts.nsjailPath || env.NSJAIL_PATH || "/usr/bin/nsjail",
      NSJAIL_CONFIG: nsjailConfig,
      // Production should always run in config-mode.
      // In non-production, allow opting into CLI-mode via NSJAIL_USE_CONFIG.
      NSJAIL_USE_CONFIG: process.env.NODE_ENV === "production" ? "1" : (env.__nsjailUseConfig ? "1" : "0"),
      NSJAIL_CWD: env.__nsjailCwd || "/work",
      // Keep chroot vars available for CLI-mode fallback and for older judge builds.
      NSJAIL_CHROOT: env.__nsjailChroot || "",
      NSJAIL_CHROOT_JAVA: env.__nsjailChrootJava || "",
      NSJAIL_CHROOT_CPP: env.__nsjailChrootCpp || "",
      NSJAIL_CHROOT_PYTHON: env.__nsjailChrootPython || "",
      // Defaults that enable large libraries tasks even if the host environment
      // doesn't explicitly configure them.
      JUDGE_MAX_INPUT_BYTES: process.env.JUDGE_MAX_INPUT_BYTES || String(inferredMaxInputBytes),
      JUDGE_MAX_TESTS: process.env.JUDGE_MAX_TESTS || "5000",
      JUDGE_MAX_TEST_INPUT_BYTES: process.env.JUDGE_MAX_TEST_INPUT_BYTES || String(1024 * 1024),
      JUDGE_MAX_TEST_OUTPUT_BYTES: process.env.JUDGE_MAX_TEST_OUTPUT_BYTES || String(1024 * 1024)
    };

    const wantsSpawnLog = String(process.env.JUDGE_LOG_SPAWN ?? "").trim() === "1";
    if (wantsSpawnLog || payloadBytes >= 8 * 1024 * 1024) {
      // Avoid logging payload contents.
      logger.warn("[judge] spawn", {
        submissionId: request.submission_id,
        language: request.language,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        payloadBytes,
        maxInputBytes: childEnv.JUDGE_MAX_INPUT_BYTES,
        maxStdout,
        maxStderr,
        timeoutMs: overallTimeout,
        useConfig: childEnv.NSJAIL_USE_CONFIG
      });
    }
    const child = spawn(nodeBin, spawnArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
      windowsHide: true
    });
    let killed = false;
    let timedOut = false;
    let aborted = false;
    let spawnError: unknown = null;
    const kill = () => {
      if (killed) return;
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    };

    const signal = runOptions.signal;
    const onAbort = () => {
      aborted = true;
      kill();
    };
    if (signal) {
      try {
        signal.addEventListener("abort", onAbort, { once: true });
      } catch {
        // ignore listener failures
      }
    }
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      kill();
    }, overallTimeout);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outSize = 0;
    let errSize = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    child.stdout?.on("data", (buf: Buffer) => {
      if (stdoutTruncated) return;
      outSize += buf.length;
      if (outSize > maxStdout) {
        stdoutTruncated = true;
        kill();
        return;
      }
      stdoutChunks.push(buf);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      if (stderrTruncated) return;
      errSize += buf.length;
      if (errSize > maxStderr) {
        stderrTruncated = true;
        kill();
        return;
      }
      stderrChunks.push(buf);
    });
    if (child.stdin) {
      child.stdin.write(payload, "utf8", () => {
        try {
          child.stdin?.end();
        } catch {}
      });
    }
    const {
      exitCode,
      exitSignal
    } = await new Promise<{
      exitCode: number | null;
      exitSignal: NodeJS.Signals | null;
    }>(resolve => {
      child.on("close", (code, signal) => resolve({
        exitCode: code,
        exitSignal: signal ?? null
      }));
      child.on("error", err => {
        spawnError = err;
        resolve({
          exitCode: 1,
          exitSignal: null
        });
      });
    });
    clearTimeout(timeoutHandle);
    if (signal) {
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {}
    }
    const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
    const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

    const logFailureContext = (kind: JudgeClientErrorKind, message: string) => {
      logger.error("[judge] client failure", {
        kind,
        message,
        submissionId: request.submission_id,
        language: request.language,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        exitSignal,
        stdout: truncate(stdout, 8192),
        stderr: truncate(stderr, 8192),
        spawnError: spawnError instanceof Error ? spawnError.message : spawnError ? String(spawnError) : undefined
      });
    };
    if (spawnError) {
      const spawnMsg = spawnError instanceof Error ? spawnError.message : String(spawnError);
      const message = `JUDGE_SPAWN_ERROR: ${spawnMsg}`;
      logFailureContext("SPAWN_ERROR", message);
      throw new JudgeClientError({
        kind: "SPAWN_ERROR",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }

    if (aborted) {
      const reason = (signal as any)?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "aborted");
      const message = `JUDGE_ABORTED: ${msg}`;
      logFailureContext("ABORTED", message);
      throw new JudgeClientError({
        kind: "ABORTED",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    if (timedOut) {
      const message = `JUDGE_TIMEOUT: exceeded overall timeout ${overallTimeout}ms`;
      logFailureContext("TIMEOUT", message);
      throw new JudgeClientError({
        kind: "TIMEOUT",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    if (stdoutTruncated) {
      const message = `JUDGE_STDOUT_TOO_LARGE: exceeded ${maxStdout} bytes`;
      logFailureContext("STDOUT_TOO_LARGE", message);
      throw new JudgeClientError({
        kind: "STDOUT_TOO_LARGE",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    if (stderrTruncated) {
      const message = `JUDGE_STDERR_TOO_LARGE: exceeded ${maxStderr} bytes`;
      logFailureContext("STDERR_TOO_LARGE", message);
      throw new JudgeClientError({
        kind: "STDERR_TOO_LARGE",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    if (!stdout) {
      const message = `JUDGE_NO_OUTPUT: exit=${exitCode ?? "null"} stderr=${truncate(stderr, 4096)}`;
      logFailureContext("NO_OUTPUT", message);
      throw new JudgeClientError({
        kind: "NO_OUTPUT",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (e: any) {
      const message = `JUDGE_BAD_JSON: ${e?.message || "parse error"}`;
      logFailureContext("BAD_JSON", message);
      throw new JudgeClientError({
        kind: "BAD_JSON",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    if (parsed && typeof parsed === "object" && typeof parsed.error === "string") {
      const message = `JUDGE_ERROR: ${parsed.error}`;
      logFailureContext("JUDGE_ERROR", message);
      throw new JudgeClientError({
        kind: "JUDGE_ERROR",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    if (exitCode !== 0) {
      const message = `JUDGE_NON_ZERO_EXIT: exit=${exitCode ?? "null"} signal=${exitSignal ?? "null"}`;
      logFailureContext("NON_ZERO_EXIT", message);
      throw new JudgeClientError({
        kind: "NON_ZERO_EXIT",
        message,
        command: nodeBin,
        args: spawnArgs,
        workerEntry,
        exitCode,
        signal: exitSignal,
        stdout,
        stderr
      });
    }
    return parsed as JudgeResponse;
  }
}
function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max);
}
// Per-language compile-phase headroom (ms) for the backend→judge request timeout.
const CLIENT_COMPILE_HEADROOM_MS: Partial<Record<JudgeRequest["language"], number>> = {
  python: 500, js: 500, dart: 500, lisp: 500, lua: 500, perl: 500, php: 500, ruby: 500,
  cpp: 2500, c: 2500, pascal: 2500, d: 2500,
  java: 4000, go: 10_000,
  rust: 18_000, swift: 18_000, haskell: 18_000,
  // Kotlin/C# toolchains can be slow in sandboxed environments.
  kotlin: 30_000, csharp: 35_000
};

function estimateOverallTimeoutMs(req: JudgeRequest): number {
  const perTest = Math.max(1, req.limits.time_limit_ms);
  const tests = Math.max(1, req.tests.length);
  const base = tests * (perTest + 80);
  const compileHeadroom = CLIENT_COMPILE_HEADROOM_MS[req.language] ?? 3000;

  const capRaw = parseInt(String(process.env.JUDGE_CLIENT_TIMEOUT_CAP_MS ?? ""), 10);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 60_000;
  return Math.min(cap, Math.max(2_000, base + compileHeadroom));
}