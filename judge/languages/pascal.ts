import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";

export const pascalLanguage: LanguageAdapter = {
  id: "pascal",
  entryFile: "main.pas",
  defaultLimits: { time_limit_ms: 1000, memory_limit_mb: 256, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.fast,
  async writeSource(workDir: string, source: string): Promise<void> {
    await writeFile(path.join(workDir, "main.pas"), source, { encoding: "utf8" });
  },
  getCompilePlan() {
    // Free Pascal: -oapp sets the output binary name (no space after -o).
    // -O2 optimisation, -Sg enables goto/label (common in olympiad code), -vewn keeps
    // errors/warnings/notes but trims the verbose banner.
    return {
      display: "fpc -O2 -oapp main.pas",
      argv: ["/usr/bin/fpc", "-O2", "-Sg", "-vewn", "-oapp", "main.pas"]
    };
  },
  getRunPlan() {
    return {
      display: "./app",
      argv: ["./app"]
    };
  }
};
