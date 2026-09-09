import { AppDataSource } from "../../data-source";
import { logger } from "../../utils/logger";
import { certificateService } from "./CertificateService";
import { env } from "../../env";

type QueueName = "generate_batch" | "pdf_render" | "email_send";
type SqlRow = Record<string, unknown>;
type QueueJob = {
  id: number;
  payload: SqlRow;
};

function isRecord(value: unknown): value is SqlRow {
  return typeof value === "object" && value !== null;
}

function sqlRows(value: unknown): SqlRow[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function batchPayload(value: SqlRow): { contestId: number; forceRegenerate?: boolean } | null {
  const contestId = Number(value.contestId);
  return Number.isFinite(contestId) && contestId > 0
    ? { contestId, forceRegenerate: Boolean(value.forceRegenerate) }
    : null;
}

function renderPayload(value: SqlRow): { contestId: number; participantId: number; forceRegenerate?: boolean } | null {
  const contestId = Number(value.contestId);
  const participantId = Number(value.participantId);
  return Number.isFinite(contestId) && contestId > 0 && Number.isFinite(participantId) && participantId > 0
    ? { contestId, participantId, forceRegenerate: Boolean(value.forceRegenerate) }
    : null;
}

function emailPayload(value: SqlRow): { contestId: number; participantId: number; certificateId: string } | null {
  const contestId = Number(value.contestId);
  const participantId = Number(value.participantId);
  const certificateId = typeof value.certificateId === "string" ? value.certificateId.trim() : "";
  return Number.isFinite(contestId) && contestId > 0 && Number.isFinite(participantId) && participantId > 0 && certificateId
    ? { contestId, participantId, certificateId }
    : null;
}

function readInt(name: string, fallback: number): number {
  const n = Number.parseInt(String((env as unknown as Record<string, unknown>)[name] ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const WORKER_INTERVAL_MS = readInt("CERTIFICATE_WORKER_INTERVAL_MS", 1500);
const PDF_CONCURRENCY = readInt("CERTIFICATE_PDF_WORKER_CONCURRENCY", 2);
const EMAIL_CONCURRENCY = readInt("CERTIFICATE_EMAIL_WORKER_CONCURRENCY", 5);

let started = false;
let timer: NodeJS.Timeout | null = null;
let runningPdf = 0;
let runningEmail = 0;
let runningBatch = 0;

async function reserveJob(queueName: QueueName): Promise<QueueJob | null> {
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const rows = (await qr.query(
      `
      SELECT id, payload_json as payloadJson
      FROM certificate_job_queue
      WHERE queue_name = ?
        AND status = 'queued'
        AND available_at <= NOW()
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
      `,
      [queueName]
    ));
    const typedRows = sqlRows(rows);

    const row = typedRows[0];
    if (!row) {
      await qr.commitTransaction();
      await qr.release();
      return null;
    }

    await qr.query(
      `
      UPDATE certificate_job_queue
      SET status = 'processing', updated_at = NOW()
      WHERE id = ?
      `,
      [row.id]
    );
    await qr.commitTransaction();
    await qr.release();

    let payload: SqlRow = {};
    try {
      const parsed: unknown = JSON.parse(String(row.payloadJson ?? "{}"));
      payload = isRecord(parsed) ? parsed : {};
    } catch {
      payload = {};
    }

    return { id: Number(row.id), payload };
  } catch (error) {
    try {
      await qr.rollbackTransaction();
    } catch {}
    try {
      await qr.release();
    } catch {}
    throw error;
  }
}

async function finishJob(id: number): Promise<void> {
  await AppDataSource.query(
    `UPDATE certificate_job_queue SET status = 'done', updated_at = NOW() WHERE id = ?`,
    [id]
  );
}

async function failJob(id: number, error: unknown): Promise<void> {
  const rows = (await AppDataSource.query(
    `SELECT attempts, max_attempts FROM certificate_job_queue WHERE id = ? LIMIT 1`,
    [id]
  ));
  const typedRows = sqlRows(rows);
  const attempts = Number(typedRows[0]?.attempts ?? 0) + 1;
  const maxAttempts = Number(typedRows[0]?.max_attempts ?? 3) || 3;

  if (attempts >= maxAttempts) {
    await AppDataSource.query(
      `
      UPDATE certificate_job_queue
      SET status = 'failed', attempts = ?, last_error = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [attempts, errorMessage(error).slice(0, 4000), id]
    );
    return;
  }

  await AppDataSource.query(
    `
    UPDATE certificate_job_queue
    SET status = 'queued',
        attempts = ?,
        last_error = ?,
        available_at = DATE_ADD(NOW(), INTERVAL POW(2, LEAST(6, ?)) SECOND),
        updated_at = NOW()
    WHERE id = ?
    `,
    [attempts, errorMessage(error).slice(0, 4000), attempts, id]
  );
}

async function tickBatch(): Promise<void> {
  if (runningBatch >= 1) return;
  const job = await reserveJob("generate_batch");
  if (!job) return;
  runningBatch++;
  try {
    const payload = batchPayload(job.payload);
    if (!payload) throw new Error("INVALID_CERTIFICATE_BATCH_PAYLOAD");
    await certificateService.processBatchJob(payload);
    await finishJob(job.id);
  } catch (error) {
    logger.error("[certificates] batch job failed", { jobId: job.id, err: error });
    await failJob(job.id, error);
  } finally {
    runningBatch--;
  }
}

async function tickPdf(): Promise<void> {
  while (runningPdf < PDF_CONCURRENCY) {
    const job = await reserveJob("pdf_render");
    if (!job) break;
    runningPdf++;
    void (async () => {
      try {
        const payload = renderPayload(job.payload);
        if (!payload) throw new Error("INVALID_CERTIFICATE_RENDER_PAYLOAD");
        await certificateService.processRenderJob(payload);
        await finishJob(job.id);
      } catch (error) {
        logger.error("[certificates] render job failed", { jobId: job.id, err: error });
        await failJob(job.id, error);
      } finally {
        runningPdf--;
      }
    })();
  }
}

async function tickEmail(): Promise<void> {
  while (runningEmail < EMAIL_CONCURRENCY) {
    const job = await reserveJob("email_send");
    if (!job) break;
    runningEmail++;
    void (async () => {
      try {
        const payload = emailPayload(job.payload);
        if (!payload) throw new Error("INVALID_CERTIFICATE_EMAIL_PAYLOAD");
        await certificateService.processEmailJob(payload);
        await finishJob(job.id);
      } catch (error) {
        logger.error("[certificates] email job failed", { jobId: job.id, err: error });
        await failJob(job.id, error);
      } finally {
        runningEmail--;
      }
    })();
  }
}

async function tick(): Promise<void> {
  await tickBatch();
  await tickPdf();
  await tickEmail();
}

export function startCertificateQueueWorker(): void {
  if (started) return;
  started = true;

  timer = setInterval(() => {
    void tick().catch((error) => {
      logger.error("[certificates] worker tick failed", { err: error });
    });
  }, WORKER_INTERVAL_MS);

  void tick().catch((error) => {
    logger.error("[certificates] initial tick failed", { err: error });
  });

  logger.info("[certificates] queue worker started", {
    intervalMs: WORKER_INTERVAL_MS,
    pdfConcurrency: PDF_CONCURRENCY,
    emailConcurrency: EMAIL_CONCURRENCY,
  });
}

export function stopCertificateQueueWorker(): void {
  if (!started) return;
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
