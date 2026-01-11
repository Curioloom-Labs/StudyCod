import { JudgeClient } from "./JudgeClient";
import type { JudgeRequest, JudgeResponse } from "./types";
import { GlobalFileSemaphore } from "./Semaphore";
const semaphore = GlobalFileSemaphore.fromEnv();
const client = new JudgeClient();
export async function judgeWithSemaphore(req: JudgeRequest): Promise<JudgeResponse> {
  const startedAt = Date.now();
  const token = await semaphore.tryAcquire();
  const acquiredAt = Date.now();
  try {
    const res = await client.judge(req);
    const finishedAt = Date.now();
    const slowMs = Number(process.env.JUDGE_LOG_SLOW_MS || 1500);
    if (Number.isFinite(slowMs) && finishedAt - startedAt >= slowMs) {
      const acquireMs = acquiredAt - startedAt;
      const runMs = finishedAt - acquiredAt;
      console.warn(`[judge] slow submission=${req.submission_id} lang=${req.language} tests=${req.tests?.length ?? 0} acquire_ms=${acquireMs} run_ms=${runMs} total_ms=${finishedAt - startedAt} verdict=${res.verdict}`);
    }
    return res;
  } finally {
    await token.release();
  }
}