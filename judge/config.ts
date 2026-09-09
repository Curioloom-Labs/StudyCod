import * as path from "path";

/**
 * The judge is a standalone process, so it cannot reuse the backend's env module.
 * Keep its environment contract in one small, dependency-free boundary instead of
 * parsing process.env independently in every engine/language module.
 */
export function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export function readEnvOrDefault(name: string, fallback: string): string {
  return readEnv(name) || fallback;
}

export function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function isProductionEnvironment(): boolean {
  return readEnv("NODE_ENV") === "production";
}

export const JUDGE_DEFAULTS = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxTests: 5000,
  maxTestInputBytes: 1024 * 1024,
  maxTestOutputBytes: 1024 * 1024,
  maxTestInputFileBytes: 256 * 1024 * 1024,
  maxTestOutputFileBytes: 64 * 1024 * 1024,
  maxFiles: 64,
  maxSourceBytes: 1024 * 1024,
  compileMemoryFloorMb: 768,
  maxOutputLimitKb: 64 * 1024
});

export interface JudgeRequestLimits {
  maxInputBytes: number;
  maxTests: number;
  maxTestInputBytes: number;
  maxTestOutputBytes: number;
  maxFiles: number;
  maxSourceBytes: number;
}

export function readJudgeRequestLimits(): JudgeRequestLimits {
  return {
    maxInputBytes: readPositiveIntEnv("JUDGE_MAX_INPUT_BYTES", JUDGE_DEFAULTS.maxInputBytes),
    maxTests: readPositiveIntEnv("JUDGE_MAX_TESTS", JUDGE_DEFAULTS.maxTests),
    maxTestInputBytes: readPositiveIntEnv("JUDGE_MAX_TEST_INPUT_BYTES", JUDGE_DEFAULTS.maxTestInputBytes),
    maxTestOutputBytes: readPositiveIntEnv("JUDGE_MAX_TEST_OUTPUT_BYTES", JUDGE_DEFAULTS.maxTestOutputBytes),
    maxFiles: readPositiveIntEnv("JUDGE_MAX_FILES", JUDGE_DEFAULTS.maxFiles),
    maxSourceBytes: JUDGE_DEFAULTS.maxSourceBytes
  };
}

export function readReferencedTestInputLimit(): number {
  return readPositiveIntEnv("JUDGE_MAX_TEST_INPUT_FILE_BYTES", JUDGE_DEFAULTS.maxTestInputFileBytes);
}

export function readReferencedTestOutputLimit(): number {
  return readPositiveIntEnv("JUDGE_MAX_TEST_OUTPUT_FILE_BYTES", JUDGE_DEFAULTS.maxTestOutputFileBytes);
}

export function readMaxOutputLimitKb(): number {
  return Math.min(
    readPositiveIntEnv("JUDGE_MAX_OUTPUT_LIMIT_KB", JUDGE_DEFAULTS.maxOutputLimitKb),
    256 * 1024
  );
}

export function readCompileMemoryFloorBytes(): number {
  return readPositiveIntEnv("JUDGE_COMPILE_MEMORY_FLOOR_MB", JUDGE_DEFAULTS.compileMemoryFloorMb) * 1024 * 1024;
}

export function readNsjailPath(): string {
  return readEnvOrDefault("NSJAIL_PATH", "/usr/bin/nsjail");
}

export function readNsjailConfigPath(): string {
  return readEnvOrDefault("NSJAIL_CONFIG", path.join(__dirname, "..", "sandbox", "nsjail.cfg"));
}

export function useNsjailConfigFromEnv(): boolean {
  return readEnv("NSJAIL_USE_CONFIG") === "1";
}

export function readNsjailCwd(): string {
  return readEnvOrDefault("NSJAIL_CWD", "/work");
}

export function readNsjailChroot(): string {
  return readEnv("NSJAIL_CHROOT");
}

export function readLanguageChroot(language: string): string {
  return readEnv(`NSJAIL_CHROOT_${language.toUpperCase()}`);
}

export function readJudgeSandboxPath(): string {
  return readEnvOrDefault(
    "JUDGE_SANDBOX_PATH",
    "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  );
}

export function readJudgeTestCacheDir(): string {
  return readEnv("JUDGE_TEST_CACHE_DIR");
}

export function readJudgeGoCacheDir(fallback: string): string {
  return readEnvOrDefault("JUDGE_GO_CACHE_DIR", fallback);
}

export function readKotlinJavaHome(): string {
  return readEnvOrDefault("JUDGE_KOTLIN_JAVA_HOME", "/usr/lib/jvm/java-17-openjdk-amd64");
}

export function readToolPath(name: string, fallback: string): string {
  return readEnvOrDefault(name, fallback);
}

export function disabledJudgeLanguagesRaw(): string {
  return readEnv("JUDGE_DISABLED_LANGUAGES") || readEnv("DISABLED_JUDGE_LANGUAGES");
}

export function allowInsecureSandboxFallback(): boolean {
  return readEnv("JUDGE_ALLOW_INSECURE_FALLBACK") === "1";
}
