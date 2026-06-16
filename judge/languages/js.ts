import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";

export const jsLanguage: LanguageAdapter = {
  id: "js",
  entryFile: "main.js",
  defaultLimits: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  async writeSource(workDir: string, source: string): Promise<void> {
    await writeFile(path.join(workDir, "main.js"), source, { encoding: "utf8" });
  },
  getCompilePlan() {
    // Node is interpreted; a syntax pre-check surfaces obvious errors as CE early.
    return {
      display: "node --check main.js",
      argv: ["/usr/bin/node", "--check", "main.js"]
    };
  },
  getRunPlan() {
    return {
      display: "node main.js",
      // Keep heap modest so a runaway allocation hits MLE rather than thrashing the host.
      argv: ["/usr/bin/node", "--max-old-space-size=256", "main.js"]
    };
  }
};
