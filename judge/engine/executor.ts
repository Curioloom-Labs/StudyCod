import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
export interface ExecOptions {
  nsjailPath: string;
  nsjailConfigPath: string;
  useConfig: boolean;
  chroot: string;
  cwd: string;
  hostWorkDir: string;
  stdin: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  // Address space limit (RLIMIT_AS). If omitted, derived from memoryLimitBytes.
  // Some runtimes (e.g. dotnet) reserve large virtual memory and may require a higher RLIMIT_AS.
  addressSpaceLimitBytes?: number;
  outputLimitBytes: number;
  // Limit for files the sandboxed process may create (rlimit_fsize).
  // If omitted, a conservative default is derived from outputLimitBytes.
  fileSizeLimitBytes?: number;
  extraNsJailArgs?: string[];
  argv: string[];
  sandboxId?: string;
}
export interface ExecResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  timeMs: number;
  memoryKb: number | null;
}
export class NsJailExecutor {
  async exec(opts: ExecOptions): Promise<ExecResult> {
    const start = process.hrtime.bigint();
    const timeLimitSec = Math.max(1, Math.ceil(opts.timeLimitMs / 1000));
    const cpuLimitSec = Math.max(1, Math.ceil((opts.timeLimitMs + 50) / 1000));
    const rlimitAs = (() => {
      const override = opts.addressSpaceLimitBytes;
      if (typeof override === "number" && Number.isFinite(override) && override > 0) {
        // Clamp to a reasonable range.
        return Math.floor(Math.max(256 * 1024 * 1024, Math.min(override, 8 * 1024 * 1024 * 1024)));
      }
      // Default: small headroom over memory limit.
      return Math.floor(Math.max(256 * 1024 * 1024, Math.min(opts.memoryLimitBytes + 32 * 1024 * 1024, 8 * 1024 * 1024 * 1024)));
    })();
    const outputCap = opts.outputLimitBytes;
    const rlimitFsize = (() => {
      const v = opts.fileSizeLimitBytes;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        // Clamp to a reasonable range.
        return Math.floor(Math.max(64 * 1024, Math.min(v, 512 * 1024 * 1024)));
      }
      // Default: keep it small to prevent disk abuse, but allow basic compilation artifacts.
      return Math.max(64 * 1024, Math.min(outputCap, 1024 * 1024));
    })();
    const nsArgs: string[] = [];
    if (opts.useConfig) {
      nsArgs.push("--config", opts.nsjailConfigPath);
    } else {
      // No nsjail config => this fallback runs with --disable_clone_newnet, i.e. the
      // sandboxed process SHARES the host network namespace (it can reach the network).
      // That is only acceptable for local/dev. Fail closed in production so a missing or
      // misnamed config can never silently downgrade isolation and let submitted code
      // exfiltrate or SSRF from the judge host. Set JUDGE_ALLOW_INSECURE_FALLBACK=1 to
      // explicitly opt in (trusted, non-production environments only).
      const allowInsecureFallback = process.env.JUDGE_ALLOW_INSECURE_FALLBACK === "1";
      if (process.env.NODE_ENV === "production" && !allowInsecureFallback) {
        throw new Error(
          "judge sandbox: refusing to execute without an nsjail config in production " +
          "(network isolation would be disabled). Provide NSJAIL_CONFIG/useConfig, or set " +
          "JUDGE_ALLOW_INSECURE_FALLBACK=1 for trusted non-prod environments."
        );
      }
      nsArgs.push("--mode", "o", "--chroot", opts.chroot, "--cwd", opts.cwd, "--disable_clone_newnet");
    }
    nsArgs.push("--time_limit", String(timeLimitSec), "--rlimit_cpu", String(cpuLimitSec), "--rlimit_as", String(rlimitAs), "--rlimit_fsize", String(rlimitFsize));
    nsArgs.push("--bindmount", `${opts.hostWorkDir}:/work`);

    // Ensure a UTF-8 locale inside the jail.
    // Without this, some runtimes (notably Java when locale is C/POSIX) may fall back to US-ASCII
    // and replace non-ASCII (e.g., Cyrillic) output with '?'.
    nsArgs.push(
      "--env",
      "LANG=C.UTF-8",
      "--env",
      "LC_ALL=C.UTF-8",
      "--env",
      "LANGUAGE=C.UTF-8",
      // Helpful for Python when locale is misconfigured.
      "--env",
      "PYTHONIOENCODING=UTF-8"
    );
    nsArgs.push("--", ...opts.argv);
    if (opts.extraNsJailArgs?.length) {
      const idx = nsArgs.indexOf("--");
      nsArgs.splice(idx, 0, ...opts.extraNsJailArgs);
    }
    let timedOut = false;
    let outputLimitExceeded = false;
    let killed = false;
    let spawnErrorMessage: string | null = null;
    const child = spawn(opts.nsjailPath, nsArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalOut = 0;
    const killChild = () => {
      if (killed) return;
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    };
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killChild();
    }, opts.timeLimitMs + 30);
    if (opts.stdin && child.stdin) {
      const data = opts.stdin.endsWith("\n") ? opts.stdin : opts.stdin + "\n";
      child.stdin.write(data, "utf8", () => {
        try {
          child.stdin?.end();
        } catch {}
      });
    } else {
      try {
        child.stdin?.end();
      } catch {}
    }
    child.stdout?.on("data", (buf: Buffer) => {
      if (outputLimitExceeded) return;
      totalOut += buf.length;
      if (totalOut > outputCap) {
        outputLimitExceeded = true;
        killChild();
        return;
      }
      stdoutChunks.push(buf);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      if (outputLimitExceeded) return;
      totalOut += buf.length;
      if (totalOut > outputCap) {
        outputLimitExceeded = true;
        killChild();
        return;
      }
      stderrChunks.push(buf);
    });
    const {
      exitCode,
      signal
    } = await new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>(resolve => {
      let resolved = false;
      const done = (code: number | null, sig: NodeJS.Signals | null) => {
        if (resolved) return;
        resolved = true;
        resolve({ exitCode: code, signal: sig });
      };

      child.on("close", (code, sig) => done(code, sig));
      child.on("error", (err) => {
        spawnErrorMessage = err instanceof Error ? err.message : String(err);
        done(1, null);
      });
    });
    clearTimeout(timeoutHandle);
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1_000_000;
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    let stderr = Buffer.concat(stderrChunks).toString("utf8");
    if (spawnErrorMessage && !stderr.trim()) {
      // This typically happens when nsjailPath is wrong or nsjail is not installed.
      // Include a short, actionable message.
      stderr = `SPAWN_ERROR: ${spawnErrorMessage}`;
    }
    const memoryKb = await readCgroupPeakKb();
    return {
      exitCode,
      signal,
      stdout,
      stderr,
      timedOut,
      outputLimitExceeded,
      timeMs,
      memoryKb
    };
  }
}
async function readCgroupPeakKb(): Promise<number | null> {
  const candidates: string[] = [path.posix.join("/sys/fs/cgroup", "studycod", "memory.peak"), path.posix.join("/sys/fs/cgroup", "studycod", "memory.current"), path.posix.join("/sys/fs/cgroup/memory", "studycod", "memory.max_usage_in_bytes"), path.posix.join("/sys/fs/cgroup/memory", "studycod", "memory.usage_in_bytes")];
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const v = Number(String(raw).trim());
      if (Number.isFinite(v) && v > 0) return Math.floor(v / 1024);
    } catch {}
  }
  return null;
}