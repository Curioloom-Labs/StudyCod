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
  outputLimitBytes: number;
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
    const rlimitAs = Math.min(opts.memoryLimitBytes + 32 * 1024 * 1024, 1024 * 1024 * 1024);
    const outputCap = opts.outputLimitBytes;
    const nsArgs: string[] = [];
    if (opts.useConfig) {
      nsArgs.push("--config", opts.nsjailConfigPath);
    } else {
      nsArgs.push("--mode", "o", "--chroot", opts.chroot, "--cwd", opts.cwd, "--disable_clone_newnet");
    }
    nsArgs.push("--time_limit", String(timeLimitSec), "--rlimit_cpu", String(cpuLimitSec), "--rlimit_as", String(rlimitAs), "--rlimit_fsize", String(Math.max(64 * 1024, Math.min(outputCap, 1024 * 1024))));
    nsArgs.push("--bindmount", `${opts.hostWorkDir}:/work`);
    nsArgs.push("--", ...opts.argv);
    if (opts.extraNsJailArgs?.length) {
      const idx = nsArgs.indexOf("--");
      nsArgs.splice(idx, 0, ...opts.extraNsJailArgs);
    }
    let timedOut = false;
    let outputLimitExceeded = false;
    let killed = false;
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
      child.on("close", (code, sig) => resolve({
        exitCode: code,
        signal: sig
      }));
      child.on("error", () => resolve({
        exitCode: 1,
        signal: null
      }));
    });
    clearTimeout(timeoutHandle);
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1_000_000;
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");
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