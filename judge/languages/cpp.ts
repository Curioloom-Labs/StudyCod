import * as path from "path";
import { writeFile } from "fs/promises";
import { LanguageAdapter } from "./types";
export const cppLanguage: LanguageAdapter = {
  id: "cpp",
  async writeSource(workDir: string, source: string): Promise<void> {
    const filePath = path.join(workDir, "main.cpp");
    await writeFile(filePath, source, {
      encoding: "utf8"
    });
  },
  getCompilePlan() {
    return {
      display: "g++ -B/usr/bin main.cpp -o app",
      argv: ["/usr/bin/g++", "-B/usr/bin", "-O2", "-pipe", "-std=gnu++17", "-fno-omit-frame-pointer", "main.cpp", "-o", "app"]
    };
  },
  getRunPlan() {
    return {
      display: "./app",
      argv: ["./app"]
    };
  }
};