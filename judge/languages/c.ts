import * as path from "path";
import { writeFile } from "fs/promises";
import { LanguageAdapter } from "./types";

export const cLanguage: LanguageAdapter = {
  id: "c",
  async writeSource(workDir: string, source: string): Promise<void> {
    const filePath = path.join(workDir, "main.c");
    await writeFile(filePath, source, { encoding: "utf8" });
  },
  getCompilePlan() {
    return {
      display: "gcc -B/usr/bin main.c -o app",
      argv: ["/usr/bin/gcc", "-B/usr/bin", "-O2", "-pipe", "-std=gnu11", "-fno-omit-frame-pointer", "main.c", "-o", "app"]
    };
  },
  getRunPlan() {
    return {
      display: "./app",
      argv: ["./app"]
    };
  }
};
