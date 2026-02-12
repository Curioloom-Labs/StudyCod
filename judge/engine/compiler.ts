import { NsJailExecutor } from "./executor";
import { CompileResult, Verdict } from "./result";
import { filterNsJailStderr } from "./stderr";
import type { LanguageId } from "../languages/types";
import { buildUserFacingStderr } from "./userFacingErrors";
export interface CompileParams {
  language: LanguageId;
  nsjailPath: string;
  nsjailConfigPath: string;
  useConfig: boolean;
  chroot: string;
  cwd: string;
  hostWorkDir: string;
  extraNsJailArgs?: string[];
  addressSpaceLimitBytes?: number;
  argv: string[];
  display?: string;
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
      addressSpaceLimitBytes: params.addressSpaceLimitBytes,
      outputLimitBytes: params.outputLimitBytes,
      // Compilers need to be able to write artifacts significantly larger than the
      // stdout/stderr limits (e.g. Kotlin fat jars, dotnet build outputs).
      fileSizeLimitBytes: 256 * 1024 * 1024,
      extraNsJailArgs: params.extraNsJailArgs,
      argv: params.argv,
      sandboxId: "compile"
    });
    const baseStderrForUser = filterNsJailStderr(r.stderr);
    const explained = buildUserFacingStderr(params.language, baseStderrForUser);
    const stderrForUser = (explained.stderr || "").trim();
    const rawStderr = String(r.stderr ?? "").trim();
    const cmd = (params.display || params.argv?.join(" ") || "").trim();
    // If stderr is empty after filtering, keep a small slice of raw stderr.
    // This helps diagnose missing toolchains and nsjail/seccomp violations.
    const rawFallback = !stderrForUser && rawStderr ? `\n\nRaw stderr:\n${truncate(rawStderr, 6000)}` : "";
    const stderrWithCmd = stderrForUser
      ? stderrForUser
      : (cmd ? `Compilation failed while running: ${cmd}${rawFallback}` : (rawFallback ? `Compilation error${rawFallback}` : ""));
    if (r.timedOut) {
      return {
        ok: false,
        verdict: "CE",
        message: "Compilation timed out",
        error_kind: explained.kind,
        stdout: truncate(r.stdout, 4096),
        stderr: truncate(stderrWithCmd, 8192),
        time_ms: Math.round(r.timeMs),
        memory_kb: r.memoryKb
      };
    }
    if (r.outputLimitExceeded) {
      return {
        ok: false,
        verdict: "CE",
        message: "Compilation output limit exceeded",
        error_kind: explained.kind,
        stdout: truncate(r.stdout, 4096),
        stderr: truncate(stderrWithCmd, 8192),
        time_ms: Math.round(r.timeMs),
        memory_kb: r.memoryKb
      };
    }
    if (r.exitCode !== 0) {
      return {
        ok: false,
        verdict: "CE",
        message: "Compilation error",
        error_kind: explained.kind,
        stdout: truncate(r.stdout, 4096),
        stderr: truncate(stderrWithCmd, 8192),
        time_ms: Math.round(r.timeMs),
        memory_kb: r.memoryKb
      };
    }
    return {
      ok: true,
      verdict: "AC",
      message: "Compilation OK",
      error_kind: undefined,
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