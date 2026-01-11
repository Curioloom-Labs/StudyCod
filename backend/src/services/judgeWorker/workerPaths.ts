import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { env } from "../../env";
import { logger } from "../../utils/logger";
async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
export async function resolveJudgeWorkerEntry(): Promise<string> {
  const envPath = env.JUDGE_WORKER_ENTRY?.trim();
  if (envPath && (await exists(envPath))) return envPath;
  const fromDirname = path.resolve(__dirname, "..", "..", "..", "..", "judge", "dist", "index.js");
  if (await exists(fromDirname)) return fromDirname;
  const fromCwd1 = path.resolve(process.cwd(), "..", "judge", "dist", "index.js");
  if (await exists(fromCwd1)) return fromCwd1;
  const fromCwd2 = path.resolve(process.cwd(), "judge", "dist", "index.js");
  if (await exists(fromCwd2)) return fromCwd2;
  throw new Error(`JUDGE_WORKER_NOT_FOUND: set JUDGE_WORKER_ENTRY or build judge at ../judge/dist/index.js (checked: ${fromDirname}, ${fromCwd1}, ${fromCwd2})`);
}
export function resolveJudgeSandboxConfig(): string {
  const envPath = env.NSJAIL_CONFIG?.trim();
  if (envPath) {
    try {
      if (fsSync.existsSync(envPath)) return envPath;
      logger.warn("[judge] NSJAIL_CONFIG is set but file does not exist", {
        path: envPath
      });
    } catch {}
  }
  const fromCwd1 = path.resolve(process.cwd(), "..", "judge", "sandbox", "nsjail.cfg");
  if (fsSync.existsSync(fromCwd1)) return fromCwd1;
  const fromCwd2 = path.resolve(process.cwd(), "judge", "sandbox", "nsjail.cfg");
  if (fsSync.existsSync(fromCwd2)) return fromCwd2;
  const fromDirname = path.resolve(__dirname, "..", "..", "..", "..", "judge", "sandbox", "nsjail.cfg");
  if (fsSync.existsSync(fromDirname)) return fromDirname;
  throw new Error(`NSJAIL_CONFIG_NOT_FOUND: set NSJAIL_CONFIG or ensure judge/sandbox/nsjail.cfg exists (checked: ${fromCwd1}, ${fromCwd2}, ${fromDirname})`);
}