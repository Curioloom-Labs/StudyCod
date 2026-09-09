import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface LspConfig {
  port: number;
  secret: string;
  root: string;
  maxSessions: number;
  maxPendingRequests: number;
  maxBodyBytes: number;
  clangdPath: string;
  pyrightLangserver: string;
  jdtlsHome: string;
  jdtlsLauncher: string;
  jdtlsConfiguration: string;
  javaPath: string;
  home: string;
  debug: boolean;
}

/**
 * PM2 must not carry credentials in its serialized process environment. Load
 * the LSP secret from the service's private env file at process startup.
 */
export function loadPrivateEnv(): void {
  const candidates = [
    process.env.LSP_ENV_FILE,
    join(process.cwd(), ".env"),
    join(process.cwd(), "..", "backend", ".env"),
    join(process.cwd(), "..", ".env")
  ].filter((value): value is string => Boolean(value));

  for (const file of candidates) {
    try {
      const raw = readFileSync(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[match[1]] = value.replace(/\\n/g, "\n");
      }
      if (process.env.LSP_SECRET) return;
    } catch {
      // Try the next private env location.
    }
  }
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function readString(name: string, fallback: string): string {
  return readEnv(name) || fallback;
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(readEnv(name), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readAtLeast(name: string, fallback: number, minimum: number): number {
  return Math.max(minimum, readPositiveInt(name, fallback));
}

export function readLspConfig(): LspConfig {
  const jdtlsHome = readString("JDTLS_HOME", "/opt/jdtls");
  return {
    port: readAtLeast("LSP_PORT", 4010, 1),
    secret: readEnv("LSP_SECRET"),
    root: resolve(readString("LSP_DATA_DIR", "/var/lib/studycod-lsp")),
    maxSessions: readAtLeast("LSP_MAX_SESSIONS", 16, 1),
    maxPendingRequests: readAtLeast("LSP_MAX_PENDING_REQUESTS", 64, 1),
    maxBodyBytes: readAtLeast("LSP_MAX_BODY_BYTES", 2 * 1024 * 1024, 64 * 1024),
    clangdPath: readString("CLANGD_PATH", "/opt/swift/usr/bin/clangd"),
    pyrightLangserver: readString("PYRIGHT_LANGSERVER", "/opt/studycod-lsp/node_modules/.bin/pyright-langserver"),
    jdtlsHome,
    jdtlsLauncher: readString("JDTLS_LAUNCHER", join(jdtlsHome, "plugins", "org.eclipse.equinox.launcher.jar")),
    jdtlsConfiguration: readString("JDTLS_CONFIGURATION", join(jdtlsHome, "config_linux")),
    javaPath: readString("JAVA_PATH", "java"),
    home: readString("LSP_HOME", "/tmp"),
    debug: readEnv("LSP_DEBUG") === "1"
  };
}

export function childProcessEnvironment(config: LspConfig): NodeJS.ProcessEnv {
  return { ...process.env, HOME: config.home };
}
