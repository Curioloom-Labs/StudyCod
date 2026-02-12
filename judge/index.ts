import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Runner } from "./engine/runner";
import type { JudgeRequest, JudgeResponse } from "./engine/result";

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
  if (isProduction && !params.useConfig) problems.push("INVALID_CONFIGURATION: production requires NSJAIL_USE_CONFIG=1");

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
  const useConfig = String(process.env.NSJAIL_USE_CONFIG ?? "").trim() === "1";

  const isProduction = String(process.env.NODE_ENV ?? "").trim() === "production";
  if (isProduction && !useConfig) {
    // Fail-fast: production must never run in weakened CLI-mode.
    logStderr("[judge] FATAL: NSJAIL_USE_CONFIG must be '1' in production", {
      nodeEnv: process.env.NODE_ENV,
      nsjailUseConfig: String(process.env.NSJAIL_USE_CONFIG ?? "")
    });
    writeJson({
      error: "INVALID_CONFIGURATION: production requires NSJAIL_USE_CONFIG=1"
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
    warn: warnCli ? "CLI mode is weaker; use NSJAIL_USE_CONFIG=1" : undefined,
    nsjailPath,
    nsjailExists: safeExists(nsjailPath),
    nsjailConfigPath,
    nsjailConfigExists: safeExists(nsjailConfigPath),
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
  const chrootDefaultSource = envChroot || defaultChrootFallback;
  const chrootDefault = chrootDefaultSource.trim();
  const javaChrootEnv = (process.env.NSJAIL_CHROOT_JAVA || "").trim();
  const javaChrootFallback = hasRootfs ? ROOTFS : "/sandbox/java";
  const javaChrootSource = javaChrootEnv || chrootDefault || javaChrootFallback;
  const cppChrootEnv = (process.env.NSJAIL_CHROOT_CPP || "").trim();
  const cppChrootFallback = hasRootfs ? ROOTFS : "/sandbox/cpp";
  const cppChrootSource = cppChrootEnv || chrootDefault || cppChrootFallback;

  // C typically shares the same toolchain rootfs as C++.
  const cChrootEnv = (process.env.NSJAIL_CHROOT_C || "").trim();
  const cChrootFallback = cppChrootSource.trim() || (hasRootfs ? ROOTFS : "/sandbox/c");
  const cChrootSource = cChrootEnv || chrootDefault || cChrootFallback;

  const kotlinChrootEnv = (process.env.NSJAIL_CHROOT_KOTLIN || "").trim();
  const kotlinChrootFallback = hasRootfs ? ROOTFS : "/sandbox/kotlin";
  const kotlinChrootSource = kotlinChrootEnv || chrootDefault || kotlinChrootFallback;

  const csharpChrootEnv = (process.env.NSJAIL_CHROOT_CSHARP || "").trim();
  const csharpChrootFallback = hasRootfs ? ROOTFS : "/sandbox/csharp";
  const csharpChrootSource = csharpChrootEnv || chrootDefault || csharpChrootFallback;
  const pythonChrootEnv = (process.env.NSJAIL_CHROOT_PYTHON || "").trim();
  const pythonChrootFallback = hasRootfs ? ROOTFS : "/sandbox/python";
  const pythonChrootSource = pythonChrootEnv || chrootDefault || pythonChrootFallback;
  const chrootByLanguage = {
    java: javaChrootSource.trim(),
    cpp: cppChrootSource.trim(),
    c: cChrootSource.trim(),
    python: pythonChrootSource.trim(),
    kotlin: kotlinChrootSource.trim(),
    csharp: csharpChrootSource.trim()
  } as const;
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