import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";
export const pythonLanguage: LanguageAdapter = {
  id: "python",
  entryFile: "main.py",
  defaultLimits: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.interpreted,
  async writeSource(workDir: string, source: string): Promise<void> {
    const filePath = path.join(workDir, "main.py");
    await writeFile(filePath, source, {
      encoding: "utf8"
    });
  },
  getCompilePlan() {
    return {
      display: "python3 -m py_compile main.py",
      argv: ["/usr/bin/python3", "-B", "-m", "py_compile", "main.py"]
    };
  },
  getRunPlan() {
    return {
      display: "python3 main.py",
      argv: ["/usr/bin/python3", "-B", "-u", "main.py"]
    };
  }
};
