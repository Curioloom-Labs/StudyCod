import { randomUUID, createHash } from "crypto";
import { AppDataSource } from "../data-source";
import { judgeWithSemaphore } from "./judgeWorker";
import { GROWTH_PROJECT_RUNTIME_INFO } from "../data/growthProjects";
import type { JudgeFile, JudgeResponse, JudgeTestCase } from "./judgeWorker/types";
import { logger } from "../utils/logger";
import { executionScheduler } from "./execution/executionSchedulerSingleton";
import { summarizeGrowthProjectCheck } from "./growthProjectCheckSummary";
import { summarizeTalentInterviewExecution } from "./talentInterviewResult";

let started = false;
let active = false;
let timer: NodeJS.Timeout | undefined;
const workerId = randomUUID();
const jobControllers = new Map<string, AbortController>();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

type ClaimedJob = {
  id: string; project_id: string | null; interview_id?: string | null; execution_kind?: string | null; owner_id: number; context_key: string; artifact_id: string;
  tests_json: string; files_json: string; examples_json: string; runtime: "PYTHON" | "JAVA" | "CPP";
};

async function claimOne(): Promise<ClaimedJob | null> {
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("UPDATE growth_project_jobs SET state='FAILED',error_code='WORKER_LOST',completed_at=NOW(3),lease_until=NULL,lease_owner=NULL WHERE state='RUNNING' AND lease_until<NOW(3) AND attempts>=2");
    const guardRows = await runner.query("SELECT lease_owner,(lease_until>NOW(3)) AS lease_active FROM growth_project_queue_guard WHERE id=1 FOR UPDATE") as Array<{ lease_owner: string | null; lease_active: number | boolean }>;
    const guard = guardRows[0];
    if (guard?.lease_owner && Boolean(guard.lease_active) && guard.lease_owner !== workerId) {
      await runner.commitTransaction();
      return null;
    }
    const jobs = await runner.query(
      `SELECT j.id, j.project_id, j.interview_id, j.execution_kind, j.owner_id, j.context_key, j.artifact_id, j.tests_json,
              COALESCE(j.runtime_override,p.runtime) AS runtime, a.files_json, a.examples_json
       FROM growth_project_jobs j
       LEFT JOIN growth_projects p ON p.id = j.project_id
       JOIN growth_project_artifacts a ON a.id = j.artifact_id
       WHERE (j.state = 'QUEUED' OR (j.state = 'RUNNING' AND j.lease_until < NOW(3) AND j.attempts < 2))
       ORDER BY j.created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
    ) as ClaimedJob[];
    const job = jobs[0];
    if (!job) { await runner.commitTransaction(); return null; }
    await runner.query(
      `UPDATE growth_project_jobs SET state='RUNNING', attempts=attempts+1, lease_owner=?,
       lease_until=DATE_ADD(NOW(3), INTERVAL 60 SECOND), started_at=COALESCE(started_at,NOW(3)), error_code=NULL WHERE id=?`,
      [workerId, job.id]
    );
    await runner.query("UPDATE growth_project_queue_guard SET lease_owner=?,lease_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND) WHERE id=1", [workerId]);
    await runner.commitTransaction();
    return job;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

async function runJob(job: ClaimedJob): Promise<void> {
  let heartbeat: NodeJS.Timeout | undefined;
  const controller = new AbortController();
  jobControllers.set(job.id, controller);
  heartbeat = setInterval(() => {
    void Promise.all([
      AppDataSource.query(`UPDATE growth_project_jobs SET lease_until=DATE_ADD(NOW(3), INTERVAL 60 SECOND) WHERE id=? AND state='RUNNING' AND lease_owner=?`, [job.id, workerId]),
      AppDataSource.query("UPDATE growth_project_queue_guard SET lease_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND) WHERE id=1 AND lease_owner=?", [workerId]),
    ]).catch(error => logger.warn("[growth-projects] lease renewal failed", { jobId: job.id, error }));
  }, 10_000);
  heartbeat.unref?.();
  try {
    const files = JSON.parse(job.files_json) as JudgeFile[];
    const tests = JSON.parse(job.tests_json) as JudgeTestCase[];
    const result = await judgeWithSemaphore({
      submission_id: `growth_${job.id.replace(/-/g, "")}`,
      cache_owner: `growth-user-${job.owner_id}`,
      language: GROWTH_PROJECT_RUNTIME_INFO[job.runtime].judge,
      files,
      entry: GROWTH_PROJECT_RUNTIME_INFO[job.runtime].entryFile,
      tests,
      run_all: true,
      limits: { time_limit_ms: 5_000, memory_limit_mb: 256, output_limit_kb: 64 },
      checker: { type: "exact" },
    }, { signal: controller.signal });
    const summary = job.interview_id ? summarizeTalentInterviewExecution(result, tests, job.execution_kind) : summarizeGrowthProjectCheck(result, tests);
    await AppDataSource.query(
      `UPDATE growth_project_jobs SET state='COMPLETED', result_json=?, completed_at=NOW(3), lease_until=NULL, lease_owner=NULL WHERE id=? AND lease_owner=? AND state='RUNNING'`,
      [JSON.stringify(summary), job.id, workerId]
    );
  } catch (error) {
    const attemptRows = await AppDataSource.query(`SELECT attempts,state FROM growth_project_jobs WHERE id=? AND lease_owner=?`, [job.id, workerId]) as Array<{ attempts: number; state: string }>;
    if (attemptRows[0]?.state === "CANCELLED") return;
    const attempts = Number(attemptRows[0]?.attempts ?? 1);
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0;
    const isInfrastructureFailure = statusCode >= 500 || error instanceof Error && /JUDGE_UNAVAILABLE|JUDGE_TIMEOUT|JUDGE_INVALID_CONFIGURATION|System busy|503|502/i.test(error.message);
    const retry = isInfrastructureFailure && attempts < 2;
    const code = isInfrastructureFailure ? "INFRASTRUCTURE_FAILURE" : "EXECUTION_FAILED";
    await AppDataSource.query(
      `UPDATE growth_project_jobs SET state=?, error_code=?, lease_until=NULL, lease_owner=NULL,
       created_at=IF(?,NOW(3),created_at), completed_at=IF(?,NULL,NOW(3)) WHERE id=? AND lease_owner=?`,
      [retry ? "QUEUED" : "FAILED", code, retry ? 1 : 0, retry ? 1 : 0, job.id, workerId]
    );
    logger.warn("[growth-projects] job execution failed", { jobId: job.id, code, retry, error });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    jobControllers.delete(job.id);
    await AppDataSource.query("UPDATE growth_project_queue_guard SET lease_owner=NULL,lease_until=NULL WHERE id=1 AND lease_owner=?", [workerId]).catch(error => logger.warn("[growth-projects] lease release failed", { jobId: job.id, error }));
  }
}

export async function cancelGrowthProjectJob(jobId: string, ownerId: number): Promise<"CANCELLED" | "NOT_CANCELLABLE" | "NOT_FOUND"> {
  const rows = await AppDataSource.query("SELECT state,lease_owner FROM growth_project_jobs WHERE id=? AND owner_id=? LIMIT 1", [jobId, ownerId]) as Array<{ state: string; lease_owner: string | null }>;
  const row = rows[0];
  if (!row) return "NOT_FOUND";
  if (row.state === "QUEUED") {
    const result = await AppDataSource.query("UPDATE growth_project_jobs SET state='CANCELLED',completed_at=NOW(3),error_code='CANCELLED' WHERE id=? AND owner_id=? AND state='QUEUED'", [jobId, ownerId]);
    return result.affectedRows ? "CANCELLED" : "NOT_CANCELLABLE";
  }
  if (row.state === "RUNNING") {
    const result = await AppDataSource.query("UPDATE growth_project_jobs SET state='CANCELLED',completed_at=NOW(3),error_code='CANCELLED' WHERE id=? AND owner_id=? AND state='RUNNING' AND lease_owner=?", [jobId, ownerId, row.lease_owner]);
    if (!result.affectedRows) return "NOT_CANCELLABLE";
    jobControllers.get(jobId)?.abort(new Error("GROWTH_PROJECT_CANCELLED"));
    return "CANCELLED";
  }
  return "NOT_CANCELLABLE";
}

async function tick(): Promise<void> {
  if (active || !AppDataSource.isInitialized) return;
  active = true;
  let nextDelayMs = 5_000;
  try {
    const pendingRows = await AppDataSource.query(
      "SELECT COUNT(*) AS pending FROM growth_project_jobs WHERE state='QUEUED' OR (state='RUNNING' AND lease_until<NOW(3))"
    ) as Array<{ pending: number | string }>;
    const hasPending = Number(pendingRows[0]?.pending ?? 0) > 0;
    nextDelayMs = hasPending ? 1_000 : 5_000;
    if (!hasPending) return;

    const judgeState = executionScheduler.snapshot();
    if (judgeState.active > 0 || judgeState.queued > 0) return;

    const job = await claimOne();
    if (job) {
      await runJob(job);
      nextDelayMs = 0;
    }
  } catch (error) {
    logger.warn("[growth-projects] queue poll failed", { error });
  } finally {
    active = false;
    scheduleGrowthProjectQueueTick(nextDelayMs);
  }
}

function scheduleGrowthProjectQueueTick(delayMs: number): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void tick();
  }, delayMs);
  timer.unref?.();
}

export function wakeGrowthProjectQueue(): void {
  if (!started) return;
  scheduleGrowthProjectQueueTick(0);
}

export function startGrowthProjectQueueWorker(): void {
  if (started) return;
  started = true;
  scheduleGrowthProjectQueueTick(0);
}

export function stopGrowthProjectQueueWorker(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  started = false;
}

export function hashGrowthTestSet(tests: JudgeTestCase[]): string {
  return sha(JSON.stringify(tests));
}
