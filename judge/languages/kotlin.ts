import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";

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
    // Kotlin/JVM: create a runnable jar.
    return {
      display: "kotlinc Main.kt -include-runtime -d app.jar",
      argv: ["/usr/bin/kotlinc", "Main.kt", "-include-runtime", "-d", "app.jar"]
    };
  },
  getRunPlan() {
    return {
      display: "java -jar app.jar",
      argv: ["/usr/bin/java", "-Xms64m", "-Xmx256m", "-XX:+UseSerialGC", "-Dfile.encoding=UTF-8", "-Duser.language=en", "-Duser.country=US", "-jar", "app.jar"]
    };
  }
};
