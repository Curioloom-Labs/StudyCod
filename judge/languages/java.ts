import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";
export const javaLanguage: LanguageAdapter = {
  id: "java",
  entryFile: "Main.java",
  defaultLimits: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.java,
  async writeSource(workDir: string, source: string): Promise<void> {
    const filePath = path.join(workDir, "Main.java");
    await writeFile(filePath, source, {
      encoding: "utf8"
    });
  },
  getCompilePlan() {
    return {
      display: "javac Main.java",
      argv: ["/usr/bin/javac", "-J-Xms64m", "-J-Xmx128m", "-encoding", "UTF-8", "Main.java"]
    };
  },
  getRunPlan() {
    return {
      display: "java Main",
      argv: [
        "/usr/bin/java",
        "-Xms64m",
        "-Xmx128m",
        "-XX:+UseSerialGC",
        "-Dfile.encoding=UTF-8",
        "-Dsun.stdout.encoding=UTF-8",
        "-Dsun.stderr.encoding=UTF-8",
        "-Duser.language=en",
        "-Duser.country=US",
        "-cp",
        ".",
        "Main"
      ]
    };
  }
};
