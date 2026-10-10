import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";
import { readKotlinJavaHome, readEnv } from "../config";
export function kotlinCompilerEnv(): string[] {
  return ["/usr/bin/env", `JAVA_HOME=${readKotlinJavaHome()}`,
    "JAVA_OPTS=-Xmx256M -Xms32M -XX:+UseSerialGC -XX:-UsePerfData -XX:TieredStopAtLevel=1"];
}
export function kotlinCompileArgv(files: string[]): string[] {
  const jar = readEnv("JUDGE_KOTLIN_COMPILER_JAR");
  const dump = readEnv("JUDGE_KOTLIN_CDS_DUMP");
  const archive = readEnv("JUDGE_KOTLIN_CDS_ARCHIVE");
  const sharing = dump ? [`-XX:ArchiveClassesAtExit=${dump}`] : archive ? ["-Xshare:auto", `-XX:SharedArchiveFile=${archive}`] : [];
  if (jar) return [`${readKotlinJavaHome()}/bin/java`, "-Xmx256M", "-Xms32M", "-XX:+UseSerialGC", "-XX:-UsePerfData", "-XX:TieredStopAtLevel=1", ...sharing,
    "--add-opens", "java.base/java.util=ALL-UNNAMED", `-Dkotlin.home=${path.dirname(path.dirname(jar))}`, "-cp", jar,
    "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", ...files, "-include-runtime", "-d", "app.jar"];
  return [...kotlinCompilerEnv(), "/usr/bin/kotlinc", ...files, "-include-runtime", "-d", "app.jar"];
}

export const kotlinLanguage: LanguageAdapter = {
  id: "kotlin",
  entryFile: "Main.kt",
  defaultLimits: { time_limit_ms: 1400, memory_limit_mb: 256, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.kotlin,
  async writeSource(workDir: string, source: string): Promise<void> {
    const filePath = path.join(workDir, "Main.kt");
    await writeFile(filePath, source, { encoding: "utf8" });
  },
  getCompilePlan() {
    // Kotlin/JVM: create a runnable jar. kotlinc (1.9) can't parse newer Java version
    // strings (e.g. "25.0.3"), so pin it to a compatible JDK via JAVA_HOME. Overridable.
    return {
      display: "kotlinc Main.kt -include-runtime -d app.jar",
      argv: kotlinCompileArgv(["Main.kt"])
    };
  },
  getRunPlan() {
    const kotlinJavaHome = readKotlinJavaHome();
    return {
      display: "java -jar app.jar",
      argv: [`${kotlinJavaHome}/bin/java`, "-Xms64m", "-Xmx256m", "-XX:+UseSerialGC", "-Dfile.encoding=UTF-8", "-Duser.language=en", "-Duser.country=US", "-jar", "app.jar"]
    };
  }
};
