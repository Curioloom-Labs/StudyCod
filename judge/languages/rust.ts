import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";

export const rustLanguage: LanguageAdapter = {
  id: "rust",
  entryFile: "main.rs",
  defaultLimits: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.slow,
  async writeSource(workDir: string, source: string): Promise<void> {
    await writeFile(path.join(workDir, "main.rs"), source, { encoding: "utf8" });
  },
  getCompilePlan() {
    return {
      display: "rustc -O --edition 2021 main.rs -o app",
      argv: ["/usr/bin/rustc", "-O", "--edition", "2021", "-C", "panic=abort", "-o", "app", "main.rs"]
    };
  },
  getRunPlan() {
    return {
      display: "./app",
      argv: ["./app"]
    };
  }
};
