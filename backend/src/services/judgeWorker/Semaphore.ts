import * as fs from "fs/promises";
import * as path from "path";
export class JudgeBusyError extends Error {
  constructor(message = "JUDGE_BUSY") {
    super(message);
    this.name = "JudgeBusyError";
  }
}
export interface SemaphoreHandle {
  release(): Promise<void>;
}
export class GlobalFileSemaphore {
  constructor(private lockPath: string, private staleAfterMs: number) {}
  static fromEnv(): GlobalFileSemaphore {
    const lockPath = process.env.JUDGE_LOCK_PATH || path.join("/tmp", "studycod_judge.lock");
    const staleMs = Number(process.env.JUDGE_LOCK_STALE_MS || 120_000);
    return new GlobalFileSemaphore(lockPath, Number.isFinite(staleMs) ? staleMs : 120_000);
  }
  async tryAcquire(): Promise<SemaphoreHandle> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await fs.open(this.lockPath, "wx");
        await handle.writeFile(JSON.stringify({
          pid: process.pid,
          startedAt: Date.now()
        }), {
          encoding: "utf8"
        });
        await handle.close();
        return {
          release: async () => {
            try {
              await fs.unlink(this.lockPath);
            } catch {}
          }
        };
      } catch (e: any) {
        if (e?.code !== "EEXIST") throw e;
        const staleCleaned = await this.tryCleanupStale();
        if (!staleCleaned || attempt === 1) {
          throw new JudgeBusyError();
        }
      }
    }
    throw new JudgeBusyError();
  }
  private async tryCleanupStale(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.lockPath, "utf8");
      const parsed = safeParse(raw);
      const pid = typeof parsed?.pid === "number" ? parsed.pid : null;
      const startedAt = typeof parsed?.startedAt === "number" ? parsed.startedAt : null;
      const ageOk = startedAt !== null ? Date.now() - startedAt <= this.staleAfterMs : false;
      const alive = pid !== null ? isPidAlive(pid) : false;
      if (!alive || !ageOk) {
        await fs.unlink(this.lockPath).catch(() => undefined);
        return true;
      }
      return false;
    } catch {
      try {
        await fs.unlink(this.lockPath);
        return true;
      } catch {
        return false;
      }
    }
  }
}
function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}