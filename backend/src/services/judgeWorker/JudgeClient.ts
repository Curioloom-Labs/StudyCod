import { spawn } from "child_process";
import type { JudgeRequest, JudgeResponse } from "./types";
import { resolveJudgeSandboxConfig, resolveJudgeWorkerEntry } from "./workerPaths";
import { env } from "../../env";
import { logger } from "../../utils/logger";
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
      // Propagate config-mode explicitly (do not rely on parent env inheritance).
      NSJAIL_USE_CONFIG: env.__nsjailUseConfig ? "1" : "0",
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
      logger.warn('[judge] spawn', {
        submissionId: request.submission_id,
        language: request.language,
        workerEntry,
        payloadBytes,
        maxInputBytes: childEnv.JUDGE_MAX_INPUT_BYTES,
        maxStdout,
        maxStderr,
        timeoutMs: overallTimeout,
        useConfig: childEnv.NSJAIL_USE_CONFIG
      });
    }
    const child = spawn(nodeBin, [workerEntry], {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
      windowsHide: true
    });
    let killed = false;
    let timedOut = false;
    let aborted = false;
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
      exitCode
    } = await new Promise<{
      exitCode: number | null;
    }>(resolve => {
      child.on("close", code => resolve({
        exitCode: code
      }));
      child.on("error", () => resolve({
        exitCode: 1
      }));
    });
    clearTimeout(timeoutHandle);
    if (signal) {
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {}
    }
    const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
    const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
    if (aborted) {
      const reason = (signal as any)?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "aborted");
      throw new Error(`JUDGE_ABORTED: ${msg}`);
    }
    if (timedOut) {
      throw new Error(`JUDGE_TIMEOUT: exceeded overall timeout ${overallTimeout}ms`);
    }
    if (stdoutTruncated) {
      throw new Error(`JUDGE_STDOUT_TOO_LARGE: exceeded ${maxStdout} bytes`);
    }
    if (stderrTruncated) {
      throw new Error(`JUDGE_STDERR_TOO_LARGE: exceeded ${maxStderr} bytes`);
    }
    if (!stdout) {
      throw new Error(`JUDGE_NO_OUTPUT: exit=${exitCode ?? "null"} stderr=${truncate(stderr, 4096)}`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (e: any) {
      throw new Error(`JUDGE_BAD_JSON: ${e?.message || "parse error"} stdout=${truncate(stdout, 2048)} stderr=${truncate(stderr, 2048)}`);
    }
    if (parsed && typeof parsed === "object" && typeof parsed.error === "string") {
      throw new Error(`JUDGE_ERROR: ${parsed.error}`);
    }
    return parsed as JudgeResponse;
  }
}
function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max);
}
function estimateOverallTimeoutMs(req: JudgeRequest): number {
  const perTest = Math.max(1, req.limits.time_limit_ms);
  const tests = Math.max(1, req.tests.length);
  const base = tests * (perTest + 80);
  const compileHeadroom =
    req.language === "python" ? 500 :
    req.language === "cpp" || req.language === "c" ? 2500 :
    req.language === "java" ? 4000 :
    // Kotlin/C# toolchains can be slow in sandboxed environments.
    req.language === "kotlin" ? 30_000 :
    req.language === "csharp" ? 35_000 :
    3000;

  const capRaw = parseInt(String(process.env.JUDGE_CLIENT_TIMEOUT_CAP_MS ?? ""), 10);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 60_000;
  return Math.min(cap, Math.max(2_000, base + compileHeadroom));
}