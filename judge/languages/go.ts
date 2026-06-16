import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";

// Go needs writable caches; keep them under /work (the per-submission bind mount).
// GO111MODULE=off lets us build a single main.go without a go.mod, GOTOOLCHAIN=local
// prevents any network toolchain auto-download, and CGO_ENABLED=0 uses the internal
// linker so no system C toolchain is required.
function goEnv(args: string[]): string[] {
  return [
    "/usr/bin/env",
    "HOME=/work",
    "GOCACHE=/work/.gocache",
    "GOPATH=/work/.gopath",
    "GO111MODULE=off",
    "GOTOOLCHAIN=local",
    "GOFLAGS=-trimpath",
    "CGO_ENABLED=0",
    "/usr/bin/go",
    ...args
  ];
}

export const goLanguage: LanguageAdapter = {
  id: "go",
  entryFile: "main.go",
  defaultLimits: { time_limit_ms: 1000, memory_limit_mb: 256, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.go,
  async writeSource(workDir: string, source: string): Promise<void> {
    await writeFile(path.join(workDir, "main.go"), source, { encoding: "utf8" });
  },
  getCompilePlan() {
    return {
      display: "go build -o app main.go",
      argv: goEnv(["build", "-o", "app", "main.go"])
    };
  },
  getRunPlan() {
    return {
      display: "./app",
      argv: ["./app"]
    };
  }
};
