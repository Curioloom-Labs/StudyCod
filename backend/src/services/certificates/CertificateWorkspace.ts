import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { AppDataSource } from "../../data-source";
import type { AuthRequest } from "../../middleware/authMiddleware";
import { HttpError } from "../../utils/httpError";
import { env } from "../../env";
import { certificateService } from "./CertificateService";
import { CertificateTemplateEngine } from "./CertificateTemplateEngine";
import type { CertificatePayload, CertificateFieldRecord } from "./types";
import { readConfirmedAwards, requireCurrentAwards } from "../contest/awards";
import { eligibleForCertificate } from "../contest/awardRules";

type Row = Record<string, unknown>;
export type CertificateJobInfo = {
  id: number; queue: string; status: string; participantId: number | null; error: string | null;
};

export function summarizeCertificateJobs(jobs: CertificateJobInfo[]) {
  const pending = jobs.filter(job => job.status === "queued" || job.status === "processing");
  const failed = jobs.filter(job => job.status === "failed");
  return {
    status: pending.length ? (pending.some(job => job.status === "processing") ? "running" : "queued")
      : failed.length ? "failed" : jobs.length ? "completed" : "idle",
    pending: pending.length,
    failed: failed.length,
    rendered: jobs.filter(job => job.queue === "pdf_render" && job.status === "done").length,
    emailed: jobs.filter(job => job.queue === "email_send" && job.status === "done").length,
    errors: failed.map(job => ({ participantId: job.participantId, stage: job.queue, message: job.error || "UNKNOWN_ERROR" })),
  };
}

export async function requireCertificateManager(req: AuthRequest, contestId: number): Promise<Row> {
  if (!Number.isSafeInteger(contestId) || contestId <= 0) throw new HttpError(400, "INVALID_CONTEST_ID");
  if (!req.userId || req.userType !== "USER") throw new HttpError(403, "ACCESS_DENIED");
  const contests: Row[] = await AppDataSource.query(`SELECT c.id, c.title, c.ends_at AS endsAt,
    c.created_by_user_id AS ownerId, u.username AS organizerName,
    EXISTS(SELECT 1 FROM contest_organizers co WHERE co.contest_id = c.id AND co.user_id = ?) AS isOrganizer
    FROM contests c LEFT JOIN users u ON u.id = c.created_by_user_id WHERE c.id = ? LIMIT 1`, [req.userId, contestId]);
  const contest = contests[0];
  if (!contest) throw new HttpError(404, "CONTEST_NOT_FOUND");
  if (req.userRole !== "SYSTEM_ADMIN" && Number(contest.ownerId) !== req.userId && !Number(contest.isOrganizer)) {
    throw new HttpError(403, "ACCESS_DENIED");
  }
  return contest;
}

async function latestJobs(contestId: number): Promise<{ batchId: number | null; jobs: CertificateJobInfo[] }> {
  const batches: Row[] = await AppDataSource.query(`SELECT id FROM certificate_job_queue
    WHERE queue_name = 'generate_batch' AND JSON_EXTRACT(payload_json, '$.contestId') = ? ORDER BY id DESC LIMIT 1`, [contestId]);
  const batchId = Number(batches[0]?.id) || null;
  if (!batchId) return { batchId: null, jobs: [] };
  const jobs: Row[] = await AppDataSource.query(`SELECT id, queue_name AS queue, status,
    JSON_EXTRACT(payload_json, '$.participantId') AS participantId, last_error AS error
    FROM certificate_job_queue WHERE id >= ? AND JSON_EXTRACT(payload_json, '$.contestId') = ? ORDER BY id`, [batchId, contestId]);
  return { batchId, jobs: jobs.map(job => ({ id: Number(job.id), queue: String(job.queue), status: String(job.status),
    participantId: Number(job.participantId) || null, error: job.error ? String(job.error).slice(0, 500) : null })) };
}

export async function getCertificateWorkspace(contestId: number, userId: number) {
  const [settingsRows, templates, certificates, batch] = await Promise.all([
    AppDataSource.query(`SELECT certificate_mode AS mode, default_template_id AS templateId,
      send_email_enabled AS sendEmailEnabled FROM contest_certificate_settings WHERE contest_id = ? LIMIT 1`, [contestId]) as Promise<Row[]>,
    AppDataSource.query(`SELECT id, name, type, contest_id AS contestId, version FROM certificate_templates
      WHERE is_active = 1 AND (contest_id = ? OR (contest_id IS NULL AND (created_by_user_id = ? OR type = 'studycod')))
      ORDER BY contest_id IS NULL, id DESC LIMIT 100`, [contestId, userId]) as Promise<Row[]>,
    AppDataSource.query(`SELECT p.id AS participantId, COALESCE(NULLIF(p.notification_email, ''), u.email, st.email) AS email,
      c.certificate_id AS certificateId, c.status, c.place_text AS place, c.issued_at AS issuedAt,
      c.email_sent_at AS emailSentAt, c.pdf_storage_key AS storageKey
      FROM contest_participants p LEFT JOIN certificates c ON c.contest_id = p.contest_id AND c.participant_id = p.id
      LEFT JOIN users u ON u.id = p.user_id LEFT JOIN students st ON st.id = p.student_id WHERE p.contest_id = ?`, [contestId]) as Promise<Row[]>,
    latestJobs(contestId),
  ]);
  const settings = settingsRows[0];
  return {
    settings: { mode: settings?.mode || "none", templateId: Number(settings?.templateId) || null,
      sendEmailEnabled: settings ? Boolean(Number(settings.sendEmailEnabled)) : false },
    templates: templates.map(t => ({ ...t, id: Number(t.id), contestId: t.contestId == null ? null : Number(t.contestId), version: Number(t.version) })),
    recipients: certificates.map(c => ({ participantId: Number(c.participantId), email: String(c.email || ""),
      certificateId: c.certificateId || null, status: c.status || null, place: c.place || null,
      issuedAt: c.issuedAt || null, emailSentAt: c.emailSentAt || null, pdfAvailable: Boolean(c.storageKey && c.status !== "revoked") })),
    generation: { batchId: batch.batchId, ...summarizeCertificateJobs(batch.jobs) },
  };
}

export async function retryFailedCertificateJobs(contestId: number) {
  const { jobs } = await latestJobs(contestId);
  const failedIds = jobs.filter(job => job.status === "failed").map(job => job.id);
  if (failedIds.length) await AppDataSource.query(`UPDATE certificate_job_queue SET status = 'queued', attempts = 0,
    last_error = NULL, available_at = NOW(), updated_at = NOW() WHERE id IN (${failedIds.map(() => "?").join(",")}) AND status = 'failed'`, failedIds);
  return { retried: failedIds.length };
}

export async function queueExistingCertificateEmails(contestId: number) {
  const awards = await requireCurrentAwards(contestId);
  const eligible = new Set(awards.rows.filter(eligibleForCertificate).map(row => row.participantId));
  return AppDataSource.transaction(async manager => {
    await manager.query("SELECT contest_id FROM contest_certificate_settings WHERE contest_id = ? FOR UPDATE", [contestId]);
    const active: Row[] = await manager.query(`SELECT id FROM certificate_job_queue WHERE status IN ('queued', 'processing')
      AND JSON_EXTRACT(payload_json, '$.contestId') = ? LIMIT 1`, [contestId]);
    if (active.length) throw new HttpError(409, "CERTIFICATE_GENERATION_IN_PROGRESS");
    const ready: Row[] = await manager.query(`SELECT c.certificate_id AS certificateId, c.participant_id AS participantId
      FROM certificates c JOIN contest_participants p ON p.id = c.participant_id
      LEFT JOIN users u ON u.id = p.user_id LEFT JOIN students st ON st.id = p.student_id
      WHERE c.contest_id = ? AND c.status <> 'revoked' AND c.revoked_at IS NULL AND c.email_sent_at IS NULL
      AND c.pdf_storage_key IS NOT NULL AND COALESCE(NULLIF(p.notification_email, ''), NULLIF(u.email, ''), NULLIF(st.email, '')) IS NOT NULL`, [contestId]);
    const recipients = ready.filter(row => eligible.has(Number(row.participantId)));
    if (!recipients.length) return { queued: 0 };
    const previous: Row[] = await manager.query(`SELECT id FROM certificate_job_queue WHERE queue_name = 'generate_batch'
      AND JSON_EXTRACT(payload_json, '$.contestId') = ? LIMIT 1`, [contestId]);
    if (!previous.length) await manager.query(`INSERT INTO certificate_job_queue
      (queue_name, status, payload_json, attempts, max_attempts, available_at, created_at, updated_at)
      VALUES ('generate_batch', 'done', ?, 0, 3, NOW(), NOW(), NOW())`, [JSON.stringify({ contestId, emailOnly: true })]);
    for (const row of recipients) await manager.query(`INSERT INTO certificate_job_queue
      (queue_name, status, payload_json, attempts, max_attempts, available_at, created_at, updated_at)
      VALUES ('email_send', 'queued', ?, 0, 8, NOW(), NOW(), NOW())`, [JSON.stringify({ contestId,
        participantId: Number(row.participantId), certificateId: String(row.certificateId) })]);
    return { queued: recipients.length };
  });
}

export async function previewCertificate(contestId: number, contest: Row, draft: {
  templateId?: number; htmlTemplate?: string; cssTemplate?: string; participantId?: number;
  place?: "1" | "2" | "3" | null;
}) {
  let name = "Ім’я та прізвище учасника";
  let score = 0;
  let maxScore = 0;
  if (draft.participantId) {
    const participants: Row[] = await AppDataSource.query(`SELECT display_name AS displayName,
      notification_full_name AS fullName FROM contest_participants WHERE id = ? AND contest_id = ? LIMIT 1`, [draft.participantId, contestId]);
    if (!participants[0]) throw new HttpError(404, "PARTICIPANT_NOT_FOUND");
    name = String(participants[0].fullName || participants[0].displayName || name);
    // Names and scores come from the same confirmed allocation used by generation.
    const awards = await readConfirmedAwards(contestId);
    const decision = awards?.rows.find(row => row.participantId === draft.participantId);
    if (decision) {
      if (draft.place === undefined) draft.place = decision.awardPlace == null ? null : String(decision.awardPlace) as "1" | "2" | "3";
      score = decision.totalScore; maxScore = decision.maxScore;
    }
  }
  const template = draft.htmlTemplate !== undefined ? null : draft.templateId ? await certificateService.getTemplateById(draft.templateId) : null;
  if (draft.templateId && !template && draft.htmlTemplate === undefined) throw new HttpError(404, "TEMPLATE_NOT_FOUND");
  if (template?.contestId != null && template.contestId !== contestId) throw new HttpError(403, "ACCESS_DENIED");
  const payload: CertificatePayload = {
    name, full_name: name, contest_name: String(contest.title), score, max_score: maxScore,
    place: draft.place || null, organizer: String(contest.organizerName || "StudyCod"), signature: "StudyCod",
    date: contest.endsAt ? new Date(String(contest.endsAt)).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }) : "",
    certificate_id: "SC-PREVIEW", qr_code: await QRCode.toDataURL("https://studycod.space", { margin: 1, width: 160 }),
  };
  const engine = new CertificateTemplateEngine();
  const htmlTemplate = draft.htmlTemplate ?? template?.htmlTemplate;
  const cssTemplate = draft.cssTemplate ?? template?.cssTemplate;
  const fields: CertificateFieldRecord[] = ["name", "contest_name", "place", "date", "organizer", "certificate_id", "qr_code"].map(fieldKey => ({ fieldKey: fieldKey as CertificateFieldRecord["fieldKey"], isEnabled: true, isRequired: false }));
  try {
    return { html: htmlTemplate ? engine.renderCustomTemplate({ htmlTemplate, cssTemplate, payload })
      : engine.renderStudyCodTemplate({ payload, cssTemplate, fields }) };
  } catch { throw new HttpError(400, "TEMPLATE_SYNTAX_ERROR"); }
}

export async function certificatePdfPath(contestId: number, participantId: number): Promise<string> {
  const certificates: Row[] = await AppDataSource.query(`SELECT pdf_storage_key AS storageKey FROM certificates
    WHERE contest_id = ? AND participant_id = ? AND status <> 'revoked' AND revoked_at IS NULL LIMIT 1`, [contestId, participantId]);
  const key = certificates[0]?.storageKey;
  if (!key) throw new HttpError(404, "CERTIFICATE_FILE_NOT_FOUND");
  const root = path.resolve(env.CERTIFICATES_STORAGE_DIR || path.join(process.cwd(), "uploads", "certificates"));
  const resolved = path.resolve(process.cwd(), String(key));
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) throw new HttpError(404, "CERTIFICATE_FILE_NOT_FOUND");
  return resolved;
}
