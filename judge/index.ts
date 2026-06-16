import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { spawnSync } from "child_process";
import { Runner } from "./engine/runner";
import type { JudgeRequest, JudgeResponse } from "./engine/result";
import { LANGUAGE_IDS } from "./languages/registry";
import type { LanguageId } from "./languages/types";

function readIntEnv(name: string, fallback: number): number {
  const raw = parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function safeExecutable(p: string): boolean {
  if (!p) return false;
  if (!safeExists(p)) return false;
  // Windows doesn't have POSIX executable bits; treat existence as executable.
  if (process.platform === "win32") return true;
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function logStderr(line: string, meta?: Record<string, any>) {
  try {
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    // IMPORTANT: do not use stdout, it is reserved for JSON responses.
    process.stderr.write(`${line}${payload}\n`);
  } catch {
    // ignore logging failures
  }
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function buildHealthPayload(params: {
  nsjailPath: string;
  nsjailConfigPath: string;
  useConfig: boolean;
  cwd: string;
  chrootByLanguage: Record<string, string>;
  limits: {
    maxInputBytes: number;
    maxTests: number;
    maxTestInputBytes: number;
    maxTestOutputBytes: number;
    maxFiles: number;
    maxSourceBytes: number;
  };
}) {
  const isProduction = String(process.env.NODE_ENV ?? "").trim() === "production";
  const nsjailExists = safeExists(params.nsjailPath);
  const nsjailExecutable = safeExecutable(params.nsjailPath);
  const configExists = safeExists(params.nsjailConfigPath);
  const mode = params.useConfig ? "config" : "cli";

  const problems: string[] = [];
  if (!params.nsjailPath || !nsjailExists) problems.push(`NSJAIL_NOT_FOUND: ${params.nsjailPath || "(empty)"}`);
  if (params.nsjailPath && nsjailExists && !nsjailExecutable) problems.push(`NSJAIL_NOT_EXECUTABLE: ${params.nsjailPath}`);
  if (params.useConfig && !configExists) problems.push(`NSJAIL_CONFIG_NOT_FOUND: ${params.nsjailConfigPath}`);
  // In production we require config-mode, but it is inferred automatically when NSJAIL_CONFIG exists.
  if (isProduction && !params.useConfig) problems.push("INVALID_CONFIGURATION: production requires NSJAIL_CONFIG (config-mode)");

  const tempCheck = (() => {
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studycod-judge-health-"));
      const f = path.join(dir, "tmp.txt");
      fs.writeFileSync(f, "ok", { encoding: "utf8" });
      fs.unlinkSync(f);
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || String(e) };
    }
  })();
  if (!tempCheck.ok) problems.push(`TMP_WRITE_FAILED: ${tempCheck.error}`);

  type NsJailConfigCheck =
    | { skipped: true }
    | { ok: true }
    | { ok: false; error: string };

  const nsjailConfigCheck: NsJailConfigCheck = (() => {
    // Only run the real nsjail check in production. In local/dev environments nsjail is
    // often unavailable or unprivileged, and we don't want health to become noisy.
    if (!isProduction) return { skipped: true as const };
    if (process.platform === "win32") return { skipped: true as const };
    if (!params.useConfig) return { skipped: true as const };
    if (!nsjailExecutable) return { skipped: true as const };
    if (!configExists) return { skipped: true as const };

    try {
      const r = spawnSync(params.nsjailPath, ["--config", params.nsjailConfigPath, "--", "/bin/true"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1500
      });
      const stderr = String(r.stderr ?? "").trim();
      const stdout = String(r.stdout ?? "").trim();
      const out = (stderr || stdout).trim();
      if (r.error) {
        return { ok: false as const, error: r.error.message || String(r.error) };
      }
      if (r.status === 0) {
        return { ok: true as const };
      }
      return {
        ok: false as const,
        error: out || `exit ${r.status ?? "(null)"}${r.signal ? ` (signal ${r.signal})` : ""}`
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || String(e) };
    }
  })();

  if ("ok" in nsjailConfigCheck && nsjailConfigCheck.ok === false) {
    problems.push(`NSJAIL_RUNTIME_CHECK_FAILED: ${nsjailConfigCheck.error || "unknown"}`);
  }

  const chrootChecks: Record<string, { path: string; ok: boolean; error?: string }> = {};
  const chrootEntries = (() => {
    const byLang = Object.entries(params.chrootByLanguage || {});
    if (!params.useConfig) return byLang;
    // In config-mode, per-language chroots are typically defined inside nsjail config.
    // Validate the default rootfs used by Runner and any explicit overrides.
    const explicit = byLang.filter(([, p]) => String(p || "").trim().length > 0);
    return [["default", "/sandbox/rootfs"], ...explicit];
  })();
  for (const [lang, rawPath] of chrootEntries) {
    const chrootPath = String(rawPath || "").trim() || "/sandbox/rootfs";
    try {
      const st = fs.statSync(chrootPath);
      if (!st.isDirectory()) throw new Error("not a directory");
      // Ensure directory is at least readable.
      try {
        fs.readdirSync(chrootPath);
      } catch (e: any) {
        throw new Error(e?.message || "unreadable");
      }
      chrootChecks[lang] = { path: chrootPath, ok: true };
    } catch (e: any) {
      chrootChecks[lang] = { path: chrootPath, ok: false, error: e?.message || String(e) };
      problems.push(`CHROOT_UNAVAILABLE: ${lang} ${chrootPath}`);
    }
  }

  const ok = problems.length === 0;

  return {
    status: ok ? "ok" : "error",
    service: "studycod-judge",
    nodeEnv: process.env.NODE_ENV ?? null,
    sandboxMode: mode,
    ...(ok ? {} : { reason: problems[0] }),
    nsjail: {
      path: params.nsjailPath,
      exists: nsjailExists,
      executable: nsjailExecutable
    },
    config: {
      path: params.nsjailConfigPath,
      exists: configExists
    },
    cwd: params.cwd,
    chrootByLanguage: params.chrootByLanguage,
    runtimeChecks: {
      tmp: tempCheck,
      nsjailConfig: nsjailConfigCheck,
      chrootByLanguage: chrootChecks
    },
    limits: params.limits,
    productionRequirements: {
      requireConfigMode: true,
      satisfied: !isProduction || params.useConfig
    }
  };
}

async function main() {
  const nsjailPath = process.env.NSJAIL_PATH || "/usr/bin/nsjail";
  const nsjailConfigPath = process.env.NSJAIL_CONFIG || path.join(__dirname, "..", "sandbox", "nsjail.cfg");
  const isProduction = String(process.env.NODE_ENV ?? "").trim() === "production";
  const configExists = safeExists(nsjailConfigPath);
  const useConfigFromEnv = String(process.env.NSJAIL_USE_CONFIG ?? "").trim() === "1";
  // Production should always use config-mode. We infer it automatically when NSJAIL_CONFIG exists,
  // so production does not depend on NSJAIL_USE_CONFIG being set.
  const useConfig = useConfigFromEnv || (isProduction && configExists);

  if (isProduction && !useConfig) {
    logStderr("[judge] FATAL: production requires NSJAIL_CONFIG (config-mode)", {
      nodeEnv: process.env.NODE_ENV,
      nsjailUseConfig: String(process.env.NSJAIL_USE_CONFIG ?? ""),
      nsjailConfigPath,
      nsjailConfigExists: configExists
    });
    writeJson({
      error: "INVALID_CONFIGURATION: production requires NSJAIL_CONFIG (config-mode)"
    });
    process.exit(1);
  }

  const maxInputBytes = readIntEnv("JUDGE_MAX_INPUT_BYTES", 32 * 1024 * 1024);
  const maxTests = readIntEnv("JUDGE_MAX_TESTS", 5000);
  const maxTestInputBytes = readIntEnv("JUDGE_MAX_TEST_INPUT_BYTES", 1024 * 1024);
  const maxTestOutputBytes = readIntEnv("JUDGE_MAX_TEST_OUTPUT_BYTES", 1024 * 1024);
  const maxFiles = readIntEnv("JUDGE_MAX_FILES", 64);
  const maxSourceBytes = 1024 * 1024;

  const mode = useConfig ? "config" : "cli";
  const warnCli = !useConfig;
  logStderr("[judge] sandbox mode", {
    mode,
    warn: warnCli ? "CLI mode is weaker; provide NSJAIL_CONFIG or set NSJAIL_USE_CONFIG=1" : undefined,
    nsjailPath,
    nsjailExists: safeExists(nsjailPath),
    nsjailConfigPath,
    nsjailConfigExists: safeExists(nsjailConfigPath),
    nsjailUseConfigEnv: String(process.env.NSJAIL_USE_CONFIG ?? ""),
    limits: {
      maxInputBytes,
      maxTests,
      maxTestInputBytes,
      maxTestOutputBytes,
      maxFiles,
      maxSourceBytes
    }
  });

  const ROOTFS = "/sandbox/rootfs";
  const hasRootfs = fs.existsSync(ROOTFS);
  const envChroot = (process.env.NSJAIL_CHROOT || "").trim();
  const defaultChrootFallback = hasRootfs ? ROOTFS : "";
  const chrootDefault = (envChroot || defaultChrootFallback).trim();

  // Per-language chroot resolution. Every family resolves to: explicit
  // NSJAIL_CHROOT_<LANG> env → shared default (NSJAIL_CHROOT / rootfs) → per-language
  // fallback dir. Driven by the language registry so new families need no edits here.
  const resolveLangChroot = (lang: LanguageId): string => {
    const explicit = (process.env[`NSJAIL_CHROOT_${lang.toUpperCase()}`] || "").trim();
    const fallback = hasRootfs ? ROOTFS : `/sandbox/${lang}`;
    return (explicit || chrootDefault || fallback).trim();
  };
  const chrootByLanguage = Object.fromEntries(
    LANGUAGE_IDS.map(lang => [lang, resolveLangChroot(lang)])
  ) as Record<LanguageId, string>;
  const cwd = (process.env.NSJAIL_CWD || "/work").trim();

  if (hasArg("--health")) {
    const health = buildHealthPayload({
      nsjailPath,
      nsjailConfigPath,
      useConfig,
      cwd,
      chrootByLanguage: { ...chrootByLanguage },
      limits: {
        maxInputBytes,
        maxTests,
        maxTestInputBytes,
        maxTestOutputBytes,
        maxFiles,
        maxSourceBytes
      }
    });
    writeJson(health as any);
    process.exit(health.status === "ok" ? 0 : 1);
  }

  const input = await readStdinLimited(maxInputBytes);
  const req = parseJSON(input) as JudgeRequest;

  const runner = new Runner({
    nsjailPath,
    nsjailConfigPath,
    useConfig,
    chrootByLanguage,
    cwd
  });
  const res = await runner.run(req);
  writeJson(res);
}
function writeJson(obj: JudgeResponse | { error: string } | Record<string, any>) {
  process.stdout.write(JSON.stringify(obj));
  process.stdout.write("\n");
}
function parseJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e: any) {
    throw new Error(`INVALID_JSON: ${e?.message || "parse error"}`);
  }
}
async function readStdinLimited(maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    process.stdin.on("data", (buf: Buffer) => {
      size += buf.length;
      if (size > maxBytes) {
        reject(new Error(`INPUT_TOO_LARGE: limit=${maxBytes}`));
        process.stdin.destroy();
        return;
      }
      chunks.push(buf);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", err => reject(err));
  });
}
main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  writeJson({
    error: msg
  });
  process.exitCode = 1;
});