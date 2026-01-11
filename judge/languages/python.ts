import * as path from "path";
import { writeFile } from "fs/promises";
import { LanguageAdapter } from "./types";
export const pythonLanguage: LanguageAdapter = {
  id: "python",
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