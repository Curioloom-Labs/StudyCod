import { NsJailExecutor } from "./executor";
import { CompileResult, Verdict } from "./result";
import { filterNsJailStderr } from "./stderr";
export interface CompileParams {
  nsjailPath: string;
  nsjailConfigPath: string;
  useConfig: boolean;
  chroot: string;
  cwd: string;
  hostWorkDir: string;
  argv: string[];
  timeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
}
export class Compiler {
  constructor(private exec: NsJailExecutor = new NsJailExecutor()) {}
  async compile(params: CompileParams): Promise<CompileResult> {
    const r = await this.exec.exec({
      nsjailPath: params.nsjailPath,
      nsjailConfigPath: params.nsjailConfigPath,
      useConfig: params.useConfig,
      chroot: params.chroot,
      cwd: params.cwd,
      hostWorkDir: params.hostWorkDir,
      stdin: "",
      timeLimitMs: params.timeLimitMs,
      memoryLimitBytes: params.memoryLimitBytes,
      outputLimitBytes: params.outputLimitBytes,
      argv: params.argv,
      sandboxId: "compile"
    });
    const stderrForUser = filterNsJailStderr(r.stderr);
    if (r.timedOut) {
      return {
        ok: false,
        verdict: "CE",
        message: "Compilation timed out",
        stdout: truncate(r.stdout, 4096),
        stderr: truncate(stderrForUser, 8192),
        time_ms: Math.round(r.timeMs),
        memory_kb: r.memoryKb
      };
    }
    if (r.outputLimitExceeded) {
      return {
        ok: false,
        verdict: "CE",
        message: "Compilation output limit exceeded",
        stdout: truncate(r.stdout, 4096),
        stderr: truncate(stderrForUser, 8192),
        time_ms: Math.round(r.timeMs),
        memory_kb: r.memoryKb
      };
    }
    if (r.exitCode !== 0) {
      return {
        ok: false,
        verdict: "CE",
        message: "Compilation error",
        stdout: truncate(r.stdout, 4096),
        stderr: truncate(stderrForUser, 8192),
        time_ms: Math.round(r.timeMs),
        memory_kb: r.memoryKb
      };
    }
    return {
      ok: true,
      verdict: "AC",
      message: "Compilation OK",
      stdout: truncate(r.stdout, 2048),
      stderr: truncate(stderrForUser, 2048),
      time_ms: Math.round(r.timeMs),
      memory_kb: r.memoryKb
    };
  }
}
export function mapRuntimeToVerdict(opts: {
  timedOut: boolean;
  outputLimitExceeded: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}): Verdict {
  if (opts.timedOut) return "TLE";
  if (opts.outputLimitExceeded) return "RE";
  if (opts.exitCode === 0) return "AC";
  const err = (opts.stderr || "").toLowerCase();
  if (opts.exitCode === 137 || opts.signal === "SIGKILL") {
    if (err.includes("oom") || err.includes("out of memory") || err.includes("memory")) return "MLE";
  }
  return "RE";
}
function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max);
}