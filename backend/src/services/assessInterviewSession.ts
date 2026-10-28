import { randomUUID } from "crypto";
import { AppDataSource } from "../data-source";
import { assessInterviewHash, assessInterviewJson, interviewFiles } from "./assessInterviewKit";
import { closeAssessInterviewMediaRoom } from "./assessInterviewMedia";
import type { JudgeFile } from "./judgeWorker/types";
import { logger } from "../utils/logger";

type QueryRunnerLike = { query: (sql: string, parameters?: unknown[]) => Promise<any> };
type ExpiredInterviewRow = {
  status: string;
  duration_expired: number | boolean | string;
  candidate_id: number;
  runtime: string;
  room_name: string;
  draft_json: unknown;
};

export async function createAssessInterviewArtifact(runner: QueryRunnerLike, ownerId: number, files: JudgeFile[]) {
  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path));
  const snapshot = { files: sorted, examples: [] };
  const contentHash = assessInterviewHash(snapshot);
  await runner.query(
    "INSERT IGNORE INTO growth_project_artifacts(id,owner_id,content_hash,files_json,examples_json,total_bytes) VALUES(?,?,?,?,?,?)",
    [randomUUID(), ownerId, contentHash, JSON.stringify(sorted), "[]", Buffer.byteLength(JSON.stringify(snapshot), "utf8")]
  );
  const artifacts = await runner.query(
    "SELECT id FROM growth_project_artifacts WHERE owner_id=? AND content_hash=? LIMIT 1",
    [ownerId, contentHash]
  ) as Array<{ id: string }>;
  if (!artifacts[0]) throw new Error("ASSESS_INTERVIEW_ARTIFACT_STORE_FAILED");
  return { id: artifacts[0].id, contentHash };
}

/**
 * Finalize an interview only after its server-recorded live duration has elapsed.
 * The latest validated draft is frozen as a candidate-owned artifact in the same
 * transaction that changes the session state, so expiration cannot lose work.
 */
export async function finalizeExpiredAssessInterview(interviewId: string): Promise<{ status: string | null; finalized: boolean }> {
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  let status: string | null = null;
  let roomName: string | null = null;
  let finalized = false;
  try {
    const rows = await runner.query(
      `SELECT i.status,i.draft_json,i.room_name,i.runtime,a.candidate_id,
              CASE WHEN i.started_at IS NOT NULL
                    AND TIMESTAMPADD(MINUTE,i.duration_minutes,i.started_at)<=UTC_TIMESTAMP(3)
                   THEN 1 ELSE 0 END AS duration_expired
       FROM growth_interviews i
       JOIN growth_company_assessments a ON a.id=i.assessment_id
       WHERE i.id=? FOR UPDATE`,
      [interviewId]
    ) as ExpiredInterviewRow[];
    const row = rows[0];
    status = row?.status ?? null;
    if (row?.status === "LIVE" && Number(row.duration_expired) === 1) {
      const saved = assessInterviewJson<{ files?: JudgeFile[] }>(row.draft_json, { files: [] });
      // Drafts are validated on every write. If an old/corrupt row is encountered,
      // preserve its JSON in place and still close the time-limited session safely.
      const files = interviewFiles(saved.files ?? [], row.runtime) ?? [];
      const artifact = await createAssessInterviewArtifact(runner, Number(row.candidate_id), files);
      const update = await runner.query(
        `UPDATE growth_interviews
         SET status='COMPLETED',completed_at=UTC_TIMESTAMP(3),final_artifact_id=?
         WHERE id=? AND status='LIVE'
           AND TIMESTAMPADD(MINUTE,duration_minutes,started_at)<=UTC_TIMESTAMP(3)`,
        [artifact.id, interviewId]
      );
      if (!update.affectedRows) throw new Error("ASSESS_INTERVIEW_EXPIRY_STATE_CONFLICT");
      status = "COMPLETED";
      roomName = row.room_name;
      finalized = true;
    }
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
  if (roomName) void closeAssessInterviewMediaRoom(roomName);
  return { status, finalized };
}

export async function expireOverdueAssessInterviews(batchSize = 25): Promise<number> {
  const safeBatchSize = Math.max(1, Math.min(100, Math.floor(batchSize)));
  const overdue = await AppDataSource.query(
    `SELECT id FROM growth_interviews
     WHERE status='LIVE' AND started_at IS NOT NULL
       AND TIMESTAMPADD(MINUTE,duration_minutes,started_at)<=UTC_TIMESTAMP(3)
     ORDER BY started_at ASC LIMIT ${safeBatchSize}`
  ) as Array<{ id: string }>;
  let finalized = 0;
  for (const interview of overdue) {
    const result = await finalizeExpiredAssessInterview(interview.id);
    if (result.finalized) finalized++;
  }
  return finalized;
}

let expiryTimer: NodeJS.Timeout | null = null;
let expirySweepRunning = false;

export function startAssessInterviewExpiryWorker(intervalMs = 5_000): void {
  if (expiryTimer) return;
  const tick = async () => {
    if (expirySweepRunning) return;
    expirySweepRunning = true;
    try {
      await expireOverdueAssessInterviews();
    } catch (error) {
      logger.warn("[assess-interviews] expiry sweep failed", { error: error instanceof Error ? error.message : "EXPIRY_SWEEP_FAILED" });
    } finally {
      expirySweepRunning = false;
    }
  };
  void tick();
  expiryTimer = setInterval(() => { void tick(); }, Math.max(1_000, intervalMs));
  expiryTimer.unref?.();
}

export function stopAssessInterviewExpiryWorker(): void {
  if (expiryTimer) clearInterval(expiryTimer);
  expiryTimer = null;
}
