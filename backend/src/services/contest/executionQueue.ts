import { createHash, randomUUID } from "crypto";
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { ContestSubmission } from "../../entities/ContestSubmission";
import type { JudgeRequest, JudgeResponse } from "../judgeWorker/types";
import { judgeWithSemaphore } from "../judgeWorker";
import { executionScheduler } from "../execution/executionSchedulerSingleton";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { publishContestEvent } from "./contestEvents";
import { createAdmissionBatch } from "./admissionBatch";

export type ContestJobPayload = { request: JudgeRequest; context: Record<string, unknown> };
export type JobState = "queued" | "running" | "completed" | "system_error";
export type ContestJob = {
  job_id: string; contest_id: number; participant_id: number; submission_id: number | null;
  kind: "check" | "run"; state: JobState; attempt: number; payload: string;
  result: string | null; error: string | null; request_hash: string;
  created_at?: Date;
};
type Processor = (job: ContestJob, payload: ContestJobPayload, result: JudgeResponse, manager: EntityManager) => Promise<Record<string, unknown>>;
let processor: Processor | null = null;
let timer: NodeJS.Timeout | null = null;
let ticking = false;
let stopped = false;
let nextPollAt = 0;
const owner = `${process.pid}:${randomUUID()}`;
const active = new Map<string, AbortController>();
const admitInTransaction = createAdmissionBatch(work => AppDataSource.transaction(work));

export function registerContestJobProcessor(value: Processor): void { processor = value; }
export function requestHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
type ContestJobStatus = Pick<ContestJob, "job_id" | "contest_id" | "participant_id" | "submission_id" | "kind" | "state" | "attempt" | "created_at" | "result">;
export function jobReceipt(job: Pick<ContestJob, "job_id" | "contest_id" | "submission_id" | "state" | "created_at">): Record<string, unknown> {
  return { jobId: job.job_id, submissionId: job.submission_id, status: job.state,
    acceptedAt: job.created_at,
    statusUrl: `/contests/${job.contest_id}/jobs/${job.job_id}` };
}
export async function getContestJob(id: string): Promise<ContestJobStatus | null> {
  const rows = await AppDataSource.query(`SELECT job_id,contest_id,participant_id,submission_id,kind,state,attempt,created_at,result
    FROM contest_execution_jobs WHERE job_id = ?`, [id]) as ContestJobStatus[];
  return rows[0] ?? null;
}
export async function findContestJobByKey(participantId: number, kind: "check" | "run", key: string): Promise<ContestJob | null> {
  const rows = await AppDataSource.query("SELECT * FROM contest_execution_jobs WHERE participant_id=? AND kind=? AND idempotency_key=?", [participantId,kind,key]) as ContestJob[];
  return rows[0] ?? null;
}

export async function enqueueContestJob(input: {
  contestId: number; problemId: number; participantId: number; kind: "check" | "run";
  key: string; fingerprint: string; payload: ContestJobPayload;
  submission?: Partial<ContestSubmission>;
  contestWindow?: { endsAt?: Date | null; allowUpsolve: boolean };
}): Promise<ContestJob> {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(input.key)) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY");
  const size = Buffer.byteLength(JSON.stringify(input.payload.request.files ?? input.payload.request.source ?? ""));
  if (size > 1024 * 1024) throw new HttpError(413, "SOURCE_TOO_LARGE");
  const jobId = randomUUID();
  const job = await admitInTransaction(async manager => {
    // Serialise admission, not execution. The bounded table makes these counts cheap.
    await manager.query("SELECT id FROM contest_execution_admission WHERE id = 1 FOR UPDATE");
    const existing = await manager.query(
      "SELECT * FROM contest_execution_jobs WHERE participant_id=? AND kind=? AND idempotency_key=?",
      [input.participantId, input.kind, input.key]) as ContestJob[];
    if (existing[0]) {
      if (existing[0].request_hash !== input.fingerprint) throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
      return existing[0];
    }
    const acceptedAt = new Date();
    if (input.contestWindow?.endsAt && acceptedAt > input.contestWindow.endsAt) {
      if (!input.contestWindow.allowUpsolve) throw new HttpError(403, "CONTEST_NOT_ACTIVE");
      if (input.submission) input.submission.phase = "UPSOLVE";
      input.payload.context.submissionPhase = "UPSOLVE";
    }
    const payload = JSON.stringify({ ...input.payload,
      request: { ...input.payload.request, submission_id: `contest_job_${jobId}`, cache_owner: `participant_${input.participantId}` } });
    const counts = await manager.query(`SELECT COUNT(*) total,
      COALESCE(SUM(kind='run'),0) runs,
      COALESCE(SUM(participant_id=? AND kind=?),0) own
      FROM contest_execution_jobs WHERE state IN ('queued','running')`, [input.participantId, input.kind]);
    if (Number(counts[0].own) >= (input.kind === "check" ? 2 : 1)) throw new HttpError(429, "PARTICIPANT_QUEUE_LIMIT");
    if (Number(counts[0].total) >= 200 || (input.kind === "run" && Number(counts[0].runs) >= 100)) {
      throw new HttpError(503, "CONTEST_QUEUE_FULL");
    }
    let submissionId: number | null = null;
    if (input.submission) {
      const entity = manager.getRepository(ContestSubmission).create({ ...input.submission,
        compiler: input.payload.request.compiler ?? input.payload.request.language, snapshotHash: requestHash(input.payload),
        executionStatus: "queued", createdAt: acceptedAt });
      const inserted = await manager.createQueryBuilder().insert().into(ContestSubmission)
        .values({ contest: { id: input.contestId }, problem: { id: input.problemId },
          participant: { id: input.participantId }, language: entity.language,
          submittedCode: entity.submittedCode, phase: entity.phase, maxScore: entity.maxScore,
          compiler: entity.compiler, snapshotHash: entity.snapshotHash, executionStatus: "queued", createdAt: acceptedAt })
        .updateEntity(false).execute();
      submissionId = Number(inserted.raw.insertId);
    }
    await manager.query(`INSERT INTO contest_execution_jobs
      (job_id,contest_id,problem_id,participant_id,submission_id,kind,idempotency_key,request_hash,payload,snapshot,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [jobId,input.contestId,input.problemId,input.participantId,submissionId,input.kind,input.key,input.fingerprint,payload,
        JSON.stringify({ ...input.payload, request: { ...input.payload.request, source: undefined, files: undefined,
          source_hash: requestHash({ source: input.payload.request.source, files: input.payload.request.files }) } }), acceptedAt]);
    return { job_id: jobId, contest_id: input.contestId, participant_id: input.participantId,
      submission_id: submissionId, kind: input.kind, state: "queued" as const, attempt: 0,
      payload, result: null, error: null, request_hash: input.fingerprint, created_at: acceptedAt };
  });
  nextPollAt = 0;
  publishContestEvent(input.contestId, { kind: "job", jobId: job.job_id, participantId: input.participantId, status: job.state, at: Date.now() });
  return job;
}

export async function waitContestJob(id: string, timeoutMs = 330_000): Promise<Record<string, unknown>> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const job = await getContestJob(id);
    if (!job) throw new HttpError(404, "JOB_NOT_FOUND");
    if (job.state === "completed") return JSON.parse(job.result!);
    if (job.state === "system_error") throw new HttpError(503, "CONTEST_EXECUTION_FAILED");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new HttpError(503, "CONTEST_JOB_STILL_QUEUED", { details: { jobId: id }, expose: true });
}

async function tick(): Promise<void> {
  if (ticking || stopped || !processor || !AppDataSource.isInitialized) return;
  if (Date.now() < nextPollAt) return;
  // Do not load 100 payloads into RAM or start their execution deadlines while queued.
  const slots = executionScheduler.snapshot();
  if (slots.active + slots.queued >= slots.maxConcurrent || active.size >= slots.maxConcurrent) return;
  ticking = true;
  try {
    const job = await AppDataSource.transaction(async manager => {
      await manager.query(`UPDATE contest_execution_jobs SET state='queued',lease_owner=NULL,lease_until=NULL
        WHERE state='running' AND lease_until < NOW(3)`);
      const rows = await manager.query(`SELECT j.* FROM contest_execution_jobs j WHERE j.state='queued'
        ORDER BY (SELECT MAX(other.started_at) FROM contest_execution_jobs other
          WHERE other.participant_id=j.participant_id),j.created_at,j.job_id
        LIMIT 1 FOR UPDATE SKIP LOCKED`) as ContestJob[];
      if (!rows[0]) return null;
      await manager.query(`UPDATE contest_execution_jobs SET state='running',attempt=attempt+1,
        lease_owner=?,lease_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND),started_at=NOW(3) WHERE job_id=?`, [owner,rows[0].job_id]);
      if (rows[0].submission_id) await manager.update(ContestSubmission, rows[0].submission_id, { executionStatus: "running" });
      return { ...rows[0], attempt: Number(rows[0].attempt) + 1 };
    });
    if (job) void run(job).catch(error => logger.error("[contest-queue] worker failed", { error }));
    else nextPollAt = Date.now() + 1000;
  } finally { ticking = false; }
}

async function run(job: ContestJob): Promise<void> {
  const controller = new AbortController();
  active.set(job.job_id, controller);
  publishContestEvent(job.contest_id, { kind: "job", jobId: job.job_id, participantId: job.participant_id, status: "running", at: Date.now() });
  const heartbeat = setInterval(() => {
    void AppDataSource.query(`UPDATE contest_execution_jobs SET lease_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND)
      WHERE job_id=? AND state='running' AND lease_owner=? AND attempt=?`, [job.job_id,owner,job.attempt])
      .then(update => { if (!update.affectedRows) controller.abort(new Error("CONTEST_LEASE_LOST")); })
      .catch(() => controller.abort(new Error("CONTEST_LEASE_LOST")));
  }, 10_000);
  heartbeat.unref();
  try {
    const payload = JSON.parse(job.payload) as ContestJobPayload;
    const response = await judgeWithSemaphore(payload.request, { signal: controller.signal });
    let committed = false;
    await AppDataSource.transaction(async manager => {
      const rows = await manager.query(`SELECT job_id FROM contest_execution_jobs
        WHERE job_id=? AND state='running' AND lease_owner=? AND attempt=? FOR UPDATE`, [job.job_id,owner,job.attempt]);
      if (!rows.length) return;
      const result = await processor!(job, payload, response, manager);
      await manager.query(`UPDATE contest_execution_jobs SET state='completed',result=?,diagnostics=?,payload='',
        finished_at=NOW(3),lease_until=NULL WHERE job_id=?`, [JSON.stringify(result),JSON.stringify({ compile: response.compile,
          tests: response.tests.map(t => ({ test_id: t.test_id, verdict: t.verdict, cpu_time_ms: t.cpu_time_ms,
            time_ms: t.time_ms, memory_kb: t.memory_kb, exit_code: t.exit_code, termination_reason: t.termination_reason, stderr: t.stderr })) }),job.job_id]);
      if (job.submission_id) await manager.update(ContestSubmission, job.submission_id, { executionStatus: "completed" });
      committed = true;
    });
    if (committed) {
      publishContestEvent(job.contest_id, { kind: "job", jobId: job.job_id, participantId: job.participant_id, status: "completed", at: Date.now() });
      if (job.kind === "check") publishContestEvent(job.contest_id, { kind: "scoreboard", at: Date.now() });
    }
  } catch (error) {
    logger.error("[contest-queue] execution error", { jobId: job.job_id, error });
    let committed = false;
    const nextState = stopped ? "queued" : "system_error";
    await AppDataSource.transaction(async manager => {
      const update = await manager.query(`UPDATE contest_execution_jobs SET state=?,error=?,
        finished_at=IF(?='queued',NULL,NOW(3)),lease_until=NULL WHERE job_id=? AND lease_owner=? AND attempt=? AND state='running'`,
        [nextState,String(error instanceof Error ? error.message : error).slice(0,8000),nextState,job.job_id,owner,job.attempt]);
      committed = Boolean(update.affectedRows);
      if (committed && job.submission_id) await manager.update(ContestSubmission,job.submission_id,{ executionStatus: nextState });
    });
    if (committed) publishContestEvent(job.contest_id, { kind: "job", jobId: job.job_id, participantId: job.participant_id, status: nextState, at: Date.now() });
  } finally {
    clearInterval(heartbeat); active.delete(job.job_id);
    void tick().catch(error => logger.error("[contest-queue] tick failed", { error }));
  }
}

export function startContestQueueWorker(): void {
  if (timer) return;
  stopped = false;
  timer = setInterval(() => { void tick().catch(error => logger.error("[contest-queue] tick failed", { error })); },250);
  timer.unref();
}
export async function stopContestQueueWorker(): Promise<void> {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  for (const controller of active.values()) controller.abort(new Error("CONTEST_WORKER_STOPPING"));
  const until = Date.now() + 5000;
  while (active.size && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
}
