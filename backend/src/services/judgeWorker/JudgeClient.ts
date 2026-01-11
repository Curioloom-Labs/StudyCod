import { spawn } from "child_process";
import type { JudgeRequest, JudgeResponse } from "./types";
import { resolveJudgeSandboxConfig, resolveJudgeWorkerEntry } from "./workerPaths";
import { env } from "../../env";
export interface JudgeClientOptions {
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  overallTimeoutMs?: number;
  nsjailPath?: string;
}
export class JudgeClient {
  constructor(private opts: JudgeClientOptions = {}) {}
  async judge(request: JudgeRequest): Promise<JudgeResponse> {
    const workerEntry = await resolveJudgeWorkerEntry();
    const nsjailConfig = resolveJudgeSandboxConfig();
    const maxStdout = this.opts.maxStdoutBytes ?? 1024 * 1024;
    const maxStderr = this.opts.maxStderrBytes ?? 256 * 1024;
    const estimated = estimateOverallTimeoutMs(request);
    const overallTimeout = this.opts.overallTimeoutMs ?? estimated;
    const payload = JSON.stringify(request);
    const nodeBin = process.execPath;
    const childEnv = {
      ...process.env,
      NSJAIL_PATH: this.opts.nsjailPath || env.NSJAIL_PATH || "/usr/bin/nsjail",
      NSJAIL_CONFIG: nsjailConfig
    };
    const child = spawn(nodeBin, [workerEntry], {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
      windowsHide: true
    });
    let killed = false;
    let timedOut = false;
    const kill = () => {
      if (killed) return;
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    };
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
    const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
    const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
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
  const compileHeadroom = req.language === "python" ? 500 : 2500;
  return Math.min(60_000, Math.max(2_000, base + compileHeadroom));
}