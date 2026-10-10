import { spawn } from "child_process";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { allowInsecureSandboxFallback, isProductionEnvironment, readJudgeSandboxPath, readEnv } from "../config";
export interface ExecOptions {
  nsjailPath: string;
  nsjailConfigPath: string;
  useConfig: boolean;
  chroot: string;
  cwd: string;
  hostWorkDir: string;
  /** Inline stdin. Ignored when `stdinFile` is provided. */
  stdin: string;
  /**
   * When set, stdin is streamed from this host file (constant memory) instead of `stdin`.
   * A trailing newline is appended if the file doesn't already end with one.
   */
  stdinFile?: string;
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
  cpuTimeMs: number | null;
  oomKilled: boolean;
  sandboxLog: string;
}
export class NsJailExecutor {
  async exec(opts: ExecOptions): Promise<ExecResult> {
    const start = process.hrtime.bigint();
    // nsjail uses integer epoch seconds; give it headroom so our monotonic timer
    // owns the exact deadline and a second boundary cannot kill a valid program early.
    const timeLimitSec = Math.max(1, Math.ceil(opts.timeLimitMs / 1000) + 1);
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
      const allowInsecureFallback = allowInsecureSandboxFallback();
      if (isProductionEnvironment() && !allowInsecureFallback) {
        throw new Error(
          "judge sandbox: refusing to execute without an nsjail config in production " +
          "(network isolation would be disabled). Provide NSJAIL_CONFIG/useConfig, or set " +
          "JUDGE_ALLOW_INSECURE_FALLBACK=1 for trusted non-prod environments."
        );
      }
      nsArgs.push("--mode", "o", "--chroot", opts.chroot, "--cwd", opts.cwd, "--disable_clone_newnet");
    }
    // nsjail parses these two CLI limits in MiB; cgroup memory limits are bytes.
    nsArgs.push("--time_limit", String(timeLimitSec), "--rlimit_cpu", String(cpuLimitSec), "--rlimit_as", opts.addressSpaceLimitBytes === Infinity ? "inf" : String(Math.ceil(rlimitAs / 1048576)), "--rlimit_fsize", String(Math.ceil(rlimitFsize / 1048576)));
    nsArgs.push("--bindmount", `${opts.hostWorkDir}:/work`);

    // PATH/HOME inside the jail. nsjail starts with a clean environment, so compilers that
    // shell out to helper tools by bare name (rust→`cc`, fpc/dmd/gdc/swift→`ld`/`as`,
    // go→its linker) fail with "cc/ld not found" unless PATH is set. gcc/g++ work without
    // this only because our adapters pass `-B/usr/bin`. HOME=/work gives toolchains a
    // writable home (the per-submission bind mount).
    const sandboxPath = readJudgeSandboxPath();
    nsArgs.push(
      "--env",
      `PATH=${sandboxPath}`,
      "--env",
      "HOME=/work",
      // Ensure a UTF-8 locale inside the jail. Without this, some runtimes (notably Java when
      // locale is C/POSIX) may fall back to US-ASCII and replace non-ASCII (e.g. Cyrillic)
      // output with '?'.
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
    // Keep INFO termination records without the per-mount DEBUG transcript.
    // Niceness 19 starves the only judge whenever ordinary services wake up.
    const niceLevel = Number(readEnv("NSJAIL_NICE_LEVEL") || 5);
    nsArgs.push("--nice_level", String(Number.isInteger(niceLevel) && niceLevel >= 0 && niceLevel <= 19 ? niceLevel : 5), "--log_fd", "3");
    if (readEnv("NSJAIL_VERBOSE") === "1") nsArgs.push("--verbose");
    nsArgs.push("--", ...opts.argv);
    if (opts.extraNsJailArgs?.length) {
      const idx = nsArgs.indexOf("--");
      nsArgs.splice(idx, 0, ...opts.extraNsJailArgs);
    }
    let timedOut = false;
    let outputLimitExceeded = false;
    let killed = false;
    let spawnErrorMessage: string | null = null;
    const cgroup = process.platform === "linux" && isProductionEnvironment()
      ? path.join("/sys/fs/cgroup/studycod-executions", `exec-${process.pid}-${randomUUID()}`) : null;
    if (cgroup) {
      await fs.mkdir(cgroup);
      try {
        await fs.writeFile(path.join(cgroup, "memory.max"), String(opts.memoryLimitBytes));
        await fs.writeFile(path.join(cgroup, "memory.swap.max"), "0");
        await fs.writeFile(path.join(cgroup, "pids.max"), "512");
        await fs.writeFile(path.join(cgroup, "memory.oom.group"), "1");
      } catch (error) {
        await fs.rmdir(cgroup).catch(() => undefined);
        throw new Error(`JUDGE_CGROUP_SETUP_FAILED: ${String(error)}`);
      }
    }
    // Enter the cgroup before exec/fork: moving a running compiler later races its children.
    const prepared = process.hrtime.bigint();
    const child = spawn(cgroup ? "/bin/sh" : opts.nsjailPath, cgroup
      ? ["-c", 'printf "%s" "$$" > "$1/cgroup.procs" || { echo JUDGE_CGROUP_ENTER_FAILED >&2; exit 125; }; shift; exec "$@"', "judge", cgroup, opts.nsjailPath, ...nsArgs]
      : nsArgs, {
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const sandboxLogChunks: Buffer[] = [];
    let sandboxLogBytes = 0;
    (child.stdio[3] as Readable | null)?.on("data", (data: Buffer) => {
      const room = 1024 * 1024 - sandboxLogBytes;
      if (room > 0) { const part = data.subarray(0, room); sandboxLogChunks.push(part); sandboxLogBytes += part.length; }
    });
    let totalOut = 0;
    const killChild = () => {
      if (killed) return;
      killed = true;
      if (cgroup) void fs.writeFile(path.join(cgroup, "cgroup.kill"), "1").catch(() => undefined);
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {}
    };
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killChild();
    }, opts.timeLimitMs + 30);
    // Swallow EPIPE etc.: a solution may exit before consuming all of stdin.
    child.stdin?.on("error", () => {});
    if (opts.stdinFile && child.stdin) {
      const stdinPipe = child.stdin;
      // Determine whether a trailing newline is needed without reading the whole file.
      let needTrailingNewline = false;
      try {
        const st = await fs.stat(opts.stdinFile);
        if (st.size > 0) {
          const fh = await fs.open(opts.stdinFile, "r");
          try {
            const last = Buffer.alloc(1);
            await fh.read(last, 0, 1, st.size - 1);
            needTrailingNewline = last[0] !== 0x0a;
          } finally {
            await fh.close();
          }
        }
      } catch {
        needTrailingNewline = false;
      }
      const rs = createReadStream(opts.stdinFile);
      rs.on("error", () => {
        try {
          stdinPipe.end();
        } catch {}
      });
      // Pipe without auto-ending so we can append the trailing newline ourselves.
      rs.pipe(stdinPipe, { end: false });
      rs.on("end", () => {
        try {
          if (needTrailingNewline) stdinPipe.write("\n");
          stdinPipe.end();
        } catch {}
      });
    } else if (opts.stdin && child.stdin) {
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
    let memoryKb: number | null = null;
    let cpuTimeMs: number | null = null;
    let oomKilled = false;
    if (cgroup) {
      try {
        memoryKb = Math.ceil(Number((await fs.readFile(path.join(cgroup, "memory.peak"), "utf8")).trim()) / 1024);
        const cpu = await fs.readFile(path.join(cgroup, "cpu.stat"), "utf8");
        cpuTimeMs = Number(cpu.match(/^usage_usec\s+(\d+)/m)?.[1] ?? 0) / 1000;
        const events = await fs.readFile(path.join(cgroup, "memory.events"), "utf8");
        oomKilled = Number(events.match(/^oom_kill\s+(\d+)/m)?.[1] ?? 0) > 0;
      } finally {
        await fs.writeFile(path.join(cgroup, "cgroup.kill"), "1").catch(() => undefined);
        await fs.rmdir(cgroup).catch(() => undefined);
      }
    }
    const sandboxLog = Buffer.concat(sandboxLogChunks).toString("utf8");
    if (readEnv("JUDGE_PROFILE_PHASES") === "1") {
      console.error("[judge-profile]", JSON.stringify({ stage: opts.sandboxId, argv: opts.argv[0],
        setupMs: Number(prepared - start) / 1e6, processMs: Number(end - prepared) / 1e6,
        cleanupMs: Number(process.hrtime.bigint() - end) / 1e6, cpuTimeMs }));
    }
    const sandboxSignal = sandboxLog.match(/terminated with signal:\s+(SIG[A-Z0-9]+)/)?.[1];
    if (/run time >= time limit|terminated with signal: SIGXCPU/.test(sandboxLog)) timedOut = true;
    if (spawnErrorMessage || (!sandboxLog && exitCode === 125 && stderr.startsWith("JUDGE_CGROUP_ENTER_FAILED")) ||
      /(?:Couldn't|Could not|Failed to) (?:mount|initialize)|execve\(.*(?:No such file|Permission denied)/i.test(sandboxLog)) {
      throw new Error(`JUDGE_INFRASTRUCTURE_ERROR: ${sandboxLog}\n${stderr}`);
    }
    return {
      exitCode,
      signal: sandboxSignal ? sandboxSignal as NodeJS.Signals : signal,
      stdout,
      stderr,
      timedOut,
      outputLimitExceeded,
      timeMs,
      memoryKb,
      cpuTimeMs,
      oomKilled,
      sandboxLog,
    };
  }
}
