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
    // Many competitive-programming environments provide these two helpers. Keep
    // them available for JavaScript solutions while leaving Node's normal APIs intact.
    await writeFile(path.join(workDir, "studycod-io.cjs"), `
const input = require("node:fs").readFileSync(0, "utf8").replace(/\\r\\n/g, "\\n");
const lines = input.split("\\n");
if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
let lineIndex = 0;
globalThis.readline = () => lineIndex < lines.length ? lines[lineIndex++] : "";
globalThis.print = (...values) => console.log(...values);
`, { encoding: "utf8" });
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
      display: "node main.js (with readline/print helpers)",
      // Keep heap modest so a runaway allocation hits MLE rather than thrashing the host.
      argv: ["/usr/bin/node", "--max-old-space-size=256", "--require", "./studycod-io.cjs", "main.js"]
    };
  }
};
