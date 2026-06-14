import crypto from "crypto";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { AppDataSource } from "../../data-source";
import { FRONTEND_URL } from "../../config";
import { logger } from "../../utils/logger";
import { CertificateEmailService } from "./CertificateEmailService";
import { CertificateRenderer } from "./CertificateRenderer";
import {
  CertificateFieldRecord,
  CertificateMode,
  CertificatePayload,
  CertificateRenderInput,
  CertificateTemplateRecord,
} from "./types";

const CERTIFICATES_ROOT = process.env.CERTIFICATES_STORAGE_DIR
  ? String(process.env.CERTIFICATES_STORAGE_DIR)
  : path.resolve(process.cwd(), "uploads", "certificates");

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function toIsoDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function normalizeMode(raw: unknown): CertificateMode {
  const v = String(raw ?? "none").trim().toLowerCase();
  if (v === "studycod" || v === "custom" || v === "none") return v;
  return "none";
}

export class CertificateService {
  private readonly renderer = new CertificateRenderer();
  private readonly emailService = new CertificateEmailService();

  async listTemplates(params?: {
    type?: "studycod" | "custom";
    contestId?: number | null;
    includeInactive?: boolean;
    limit?: number;
  }): Promise<CertificateTemplateRecord[]> {
    const where: string[] = [];
    const args: unknown[] = [];

    if (params?.type) {
      where.push("type = ?");
      args.push(params.type);
    }

    if (params?.contestId != null && Number.isFinite(Number(params.contestId))) {
      where.push("contest_id = ?");
      args.push(Number(params.contestId));
    }

    if (!params?.includeInactive) {
      where.push("is_active = 1");
    }

    const limit = Math.max(1, Math.min(500, Number(params?.limit ?? 200)));
    const sql = `
      SELECT id,
             contest_id as contestId,
             name,
             type,
             html_template as htmlTemplate,
             css_template as cssTemplate,
             is_active as isActive,
             version
      FROM certificate_templates
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY id DESC
      LIMIT ${limit}
    `;

    const rows = (await AppDataSource.query(sql, args)) as Array<any>;
    return rows.map((row) => this.mapTemplate(row));
  }

  async getTemplateById(templateId: number): Promise<CertificateTemplateRecord | null> {
    const id = Number(templateId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const rows = (await AppDataSource.query(
      `
      SELECT id,
             contest_id as contestId,
             name,
             type,
             html_template as htmlTemplate,
             css_template as cssTemplate,
             is_active as isActive,
             version
      FROM certificate_templates
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    )) as Array<any>;

    const row = rows[0];
    if (!row) return null;
    return this.mapTemplate(row);
  }

  async createTemplate(params: {
    contestId?: number | null;
    createdByUserId: number;
    name: string;
    type: "studycod" | "custom";
    htmlTemplate?: string | null;
    cssTemplate?: string | null;
    fields?: Array<{ fieldKey: string; isEnabled?: boolean; isRequired?: boolean }>;
  }): Promise<{ templateId: number }> {
    const result: any = await AppDataSource.query(
      `
      INSERT INTO certificate_templates (
        contest_id, name, type, html_template, css_template, is_active, version, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, NOW(), NOW())
      `,
      [
        params.contestId ?? null,
        params.name.trim().slice(0, 180),
        params.type,
        params.htmlTemplate ?? null,
        params.cssTemplate ?? null,
        params.createdByUserId,
      ]
    );
    const templateId = Number(result?.insertId ?? 0);

    const fields = Array.isArray(params.fields) ? params.fields : [];
    for (const f of fields) {
      const key = String(f.fieldKey ?? "").trim();
      if (!key) continue;
      await AppDataSource.query(
        `
        INSERT INTO certificate_fields (template_id, field_key, is_enabled, is_required, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
        `,
        [templateId, key, f.isEnabled === false ? 0 : 1, f.isRequired === true ? 1 : 0]
      );
    }

    return { templateId };
  }

  async upsertContestSettings(params: {
    contestId: number;
    mode: CertificateMode;
    defaultTemplateId?: number | null;
    sendEmailEnabled?: boolean;
  }): Promise<void> {
    await AppDataSource.query(
      `
      INSERT INTO contest_certificate_settings (
        contest_id, certificate_mode, default_template_id, send_email_enabled, generation_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'idle', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        certificate_mode = VALUES(certificate_mode),
        default_template_id = VALUES(default_template_id),
        send_email_enabled = VALUES(send_email_enabled),
        updated_at = NOW()
      `,
      [
        params.contestId,
        params.mode,
        params.defaultTemplateId ?? null,
        params.sendEmailEnabled === false ? 0 : 1,
      ]
    );
  }

  async enqueueContestGeneration(params: {
    contestId: number;
    requestedByUserId: number;
    forceRegenerate?: boolean;
  }): Promise<{ jobId: number }> {
    const settingsRows = (await AppDataSource.query(
      `SELECT certificate_mode as mode FROM contest_certificate_settings WHERE contest_id = ? LIMIT 1`,
      [params.contestId]
    )) as Array<any>;
    const mode = normalizeMode(settingsRows[0]?.mode);
    if (mode === "none") {
      throw new Error("CERTIFICATES_DISABLED_FOR_CONTEST");
    }

    const payload = {
      contestId: params.contestId,
      requestedByUserId: params.requestedByUserId,
      forceRegenerate: Boolean(params.forceRegenerate),
    };

    const result: any = await AppDataSource.query(
      `
      INSERT INTO certificate_job_queue (
        queue_name, status, payload_json, attempts, max_attempts, available_at, created_at, updated_at
      ) VALUES ('generate_batch', 'queued', ?, 0, 3, NOW(), NOW(), NOW())
      `,
      [JSON.stringify(payload)]
    );

    await AppDataSource.query(
      `UPDATE contest_certificate_settings SET generation_status = 'queued', updated_at = NOW() WHERE contest_id = ?`,
      [params.contestId]
    );

    return { jobId: Number(result?.insertId ?? 0) };
  }

  async processBatchJob(payload: { contestId: number; forceRegenerate?: boolean }): Promise<void> {
    const contestId = Number(payload.contestId);
    if (!Number.isFinite(contestId) || contestId <= 0) return;

    await AppDataSource.query(
      `UPDATE contest_certificate_settings SET generation_status = 'running', updated_at = NOW() WHERE contest_id = ?`,
      [contestId]
    );

    const participants = (await AppDataSource.query(
      `
      SELECT p.id as participantId
      FROM contest_participants p
      WHERE p.contest_id = ?
        AND COALESCE(p.is_disqualified, 0) = 0
      ORDER BY p.id ASC
      `,
      [contestId]
    )) as Array<any>;

    for (const row of participants) {
      const participantId = Number(row.participantId);
      if (!Number.isFinite(participantId) || participantId <= 0) continue;

      await AppDataSource.query(
        `
        INSERT INTO certificate_job_queue (
          queue_name, status, payload_json, attempts, max_attempts, available_at, created_at, updated_at
        ) VALUES ('pdf_render', 'queued', ?, 0, 5, NOW(), NOW(), NOW())
        `,
        [JSON.stringify({ contestId, participantId, forceRegenerate: Boolean(payload.forceRegenerate) })]
      );
    }

    await AppDataSource.query(
      `UPDATE contest_certificate_settings SET generation_status = 'queued', updated_at = NOW() WHERE contest_id = ?`,
      [contestId]
    );
  }

  async processRenderJob(payload: { contestId: number; participantId: number; forceRegenerate?: boolean }): Promise<void> {
    const contestId = Number(payload.contestId);
    const participantId = Number(payload.participantId);
    if (!Number.isFinite(contestId) || !Number.isFinite(participantId)) return;

    const contextRows = (await AppDataSource.query(
      `
      SELECT c.id as contestId,
             c.title as contestTitle,
             c.created_by_user_id as organizerUserId,
             u.username as organizerName,
             p.id as participantId,
             p.display_name as displayName,
             p.notification_email as notificationEmail,
             p.notification_full_name as notificationFullName,
             p.user_id as userId,
             p.student_id as studentId,
             s.certificate_mode as certificateMode,
             s.default_template_id as defaultTemplateId,
             s.send_email_enabled as sendEmailEnabled
      FROM contests c
      JOIN contest_participants p ON p.contest_id = c.id
      LEFT JOIN users u ON u.id = c.created_by_user_id
      LEFT JOIN contest_certificate_settings s ON s.contest_id = c.id
      WHERE c.id = ? AND p.id = ?
      LIMIT 1
      `,
      [contestId, participantId]
    )) as Array<any>;
    const ctx = contextRows[0];
    if (!ctx) return;

    const mode = normalizeMode(ctx.certificateMode);
    if (mode === "none") return;

    const existingRows = (await AppDataSource.query(
      `SELECT id, status FROM certificates WHERE contest_id = ? AND participant_id = ? LIMIT 1`,
      [contestId, participantId]
    )) as Array<any>;
    const existingId = Number(existingRows[0]?.id ?? 0) || null;
    if (existingId && !payload.forceRegenerate) {
      return;
    }

    const scoreRows = (await AppDataSource.query(
      `
      SELECT COALESCE(SUM(t.bestScore), 0) as totalScore,
             COALESCE(SUM(t.bestMaxScore), 0) as participantMaxScore
      FROM (
        SELECT cs.problem_id as problemId,
               MAX(COALESCE(cs.score, 0)) as bestScore,
               MAX(COALESCE(cs.max_score, 0)) as bestMaxScore
        FROM contest_submissions cs
        WHERE cs.contest_id = ?
          AND cs.participant_id = ?
          AND cs.phase = 'CONTEST'
        GROUP BY cs.problem_id
      ) t
      `,
      [contestId, participantId]
    )) as Array<any>;

    const contestMaxRows = (await AppDataSource.query(
      `
      SELECT COALESCE(SUM(COALESCE(cp.points, mx.problemMaxScore, 0)), 0) as totalMaxScore
      FROM contest_problems cp
      LEFT JOIN (
        SELECT cs.problem_id as problemId,
               MAX(COALESCE(cs.max_score, 0)) as problemMaxScore
        FROM contest_submissions cs
        WHERE cs.contest_id = ?
          AND cs.phase = 'CONTEST'
        GROUP BY cs.problem_id
      ) mx ON mx.problemId = cp.id
      WHERE cp.contest_id = ?
      `,
      [contestId, contestId]
    )) as Array<any>;

    const totalScore = Number(scoreRows[0]?.totalScore ?? 0) || 0;
    const totalMaxScore =
      Number(contestMaxRows[0]?.totalMaxScore ?? 0) ||
      Number(scoreRows[0]?.participantMaxScore ?? 0) ||
      0;

    const certificateId = `SC-${contestId}-${participantId}-${crypto.randomBytes(4).toString("hex")}`;
    const verifyUrl = `${String(FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "")}/certificate/${certificateId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 320 });

    const template = await this.resolveTemplate(contestId, Number(ctx.defaultTemplateId ?? 0) || null, mode);
    const fields = await this.resolveTemplateFields(template?.id ?? null);
    const payloadData: CertificatePayload = {
      contest_name: String(ctx.contestTitle ?? ""),
      name: String(ctx.notificationFullName ?? ctx.displayName ?? "Participant"),
      full_name: String(ctx.notificationFullName ?? ctx.displayName ?? "Participant"),
      place: await this.resolvePlace(contestId, participantId),
      score: totalScore,
      max_score: totalMaxScore,
      date: toIsoDate(new Date()),
      organizer: String(ctx.organizerName ?? "StudyCod Organizer"),
      signature: "StudyCod",
      certificate_id: certificateId,
      qr_code: qrDataUrl,
    };

    const renderInput: CertificateRenderInput = {
      mode: mode === "custom" ? "custom" : "studycod",
      payload: payloadData,
      template,
      fields,
    };

    const pdfBuffer = await this.renderer.renderPdf(renderInput);

    const contestFolder = path.join(CERTIFICATES_ROOT, String(contestId));
    ensureDir(contestFolder);
    const fileName = `${certificateId}.pdf`;
    const absPath = path.join(contestFolder, fileName);
    fs.writeFileSync(absPath, pdfBuffer);

    const checksum = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const relativeStorageKey = path.relative(process.cwd(), absPath).split(path.sep).join("/");

    if (existingId) {
      await AppDataSource.query(
        `
        UPDATE certificates
        SET certificate_id = ?,
            template_id = ?,
            score = ?,
            max_score = ?,
            participant_name = ?,
            organizer_name = ?,
            issued_at = NOW(),
            pdf_storage_key = ?,
            qr_code_data_url = ?,
            checksum_sha256 = ?,
            status = 'rendered',
            revoked_at = NULL,
            updated_at = NOW()
        WHERE id = ?
        `,
        [
          certificateId,
          template?.id ?? null,
          totalScore,
          totalMaxScore,
          payloadData.name,
          payloadData.organizer,
          relativeStorageKey,
          qrDataUrl,
          checksum,
          existingId,
        ]
      );
    } else {
      await AppDataSource.query(
        `
        INSERT INTO certificates (
          certificate_id, contest_id, participant_id, user_id, student_id, template_id, status,
          score, max_score, place_text, participant_name, organizer_name,
          issued_at, pdf_storage_key, qr_code_data_url, checksum_sha256,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'rendered', ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          certificate_id = VALUES(certificate_id),
          template_id = VALUES(template_id),
          status = 'rendered',
          score = VALUES(score),
          max_score = VALUES(max_score),
          place_text = VALUES(place_text),
          participant_name = VALUES(participant_name),
          organizer_name = VALUES(organizer_name),
          issued_at = NOW(),
          pdf_storage_key = VALUES(pdf_storage_key),
          qr_code_data_url = VALUES(qr_code_data_url),
          checksum_sha256 = VALUES(checksum_sha256),
          revoked_at = NULL,
          updated_at = NOW()
        `,
        [
          certificateId,
          contestId,
          participantId,
          ctx.userId ?? null,
          ctx.studentId ?? null,
          template?.id ?? null,
          totalScore,
          totalMaxScore,
          payloadData.place,
          payloadData.name,
          payloadData.organizer,
          relativeStorageKey,
          qrDataUrl,
          checksum,
        ]
      );
    }

    if (Number(ctx.sendEmailEnabled ?? 1) === 1) {
      await AppDataSource.query(
        `
        INSERT INTO certificate_job_queue (
          queue_name, status, payload_json, attempts, max_attempts, available_at, created_at, updated_at
        ) VALUES ('email_send', 'queued', ?, 0, 8, NOW(), NOW(), NOW())
        `,
        [JSON.stringify({ contestId, participantId, certificateId })]
      );
    }
  }

  async processEmailJob(payload: { contestId: number; participantId: number; certificateId: string }): Promise<void> {
    const contestId = Number(payload.contestId);
    const participantId = Number(payload.participantId);

    const rows = (await AppDataSource.query(
      `
      SELECT c.id as id,
             c.certificate_id as certificateId,
             c.pdf_storage_key as pdfStorageKey,
             c.participant_name as participantName,
             c.email_sent_at as emailSentAt,
             ct.title as contestTitle,
             p.notification_email as notificationEmail,
             u.email as userEmail,
             st.email as studentEmail
      FROM certificates c
      JOIN contests ct ON ct.id = c.contest_id
      LEFT JOIN contest_participants p ON p.id = c.participant_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN students st ON st.id = c.student_id
      WHERE c.contest_id = ? AND c.participant_id = ? AND c.certificate_id = ?
      LIMIT 1
      `,
      [contestId, participantId, payload.certificateId]
    )) as Array<any>;

    const row = rows[0];
    if (!row) return;

    const recipient = String(row.notificationEmail ?? row.userEmail ?? row.studentEmail ?? "").trim().toLowerCase();
    if (!recipient) {
      logger.warn("[certificates] email recipient missing", { contestId, participantId, certificateId: payload.certificateId });
      return;
    }

    const storageKey = String(row.pdfStorageKey ?? "");
    if (!storageKey) return;
    const absPath = path.join(process.cwd(), ...storageKey.split("/"));
    if (!fs.existsSync(absPath)) {
      throw new Error("CERTIFICATE_FILE_NOT_FOUND");
    }

    const buffer = fs.readFileSync(absPath);
    const verifyUrl = `${String(FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "")}/certificate/${String(row.certificateId)}`;
    await this.emailService.sendCertificateEmail({
      to: recipient,
      participantName: String(row.participantName ?? "Participant"),
      contestName: String(row.contestTitle ?? "Contest"),
      pdfBuffer: buffer,
      certificateId: String(row.certificateId),
      verifyUrl,
    });

    await AppDataSource.query(
      `
      UPDATE certificates
      SET email_sent_at = NOW(), status = 'emailed', updated_at = NOW()
      WHERE id = ?
      `,
      [row.id]
    );
  }

  private async resolveTemplate(
    contestId: number,
    defaultTemplateId: number | null,
    mode: CertificateMode
  ): Promise<CertificateTemplateRecord | null> {
    if (defaultTemplateId) {
      const rows = (await AppDataSource.query(
        `
        SELECT id,
               contest_id as contestId,
               name,
               type,
               html_template as htmlTemplate,
               css_template as cssTemplate,
               is_active as isActive,
               version
        FROM certificate_templates
        WHERE id = ?
        LIMIT 1
        `,
        [defaultTemplateId]
      )) as Array<any>;
      const row = rows[0];
      if (row) return this.mapTemplate(row);
    }

    const rows = (await AppDataSource.query(
      `
      SELECT id,
             contest_id as contestId,
             name,
             type,
             html_template as htmlTemplate,
             css_template as cssTemplate,
             is_active as isActive,
             version
      FROM certificate_templates
      WHERE is_active = 1
        AND type = ?
        AND (contest_id = ? OR contest_id IS NULL)
      ORDER BY contest_id IS NULL ASC, id DESC
      LIMIT 1
      `,
      [mode === "custom" ? "custom" : "studycod", contestId]
    )) as Array<any>;

    const row = rows[0];
    if (row) return this.mapTemplate(row);

    if (mode === "studycod") {
      const insert: any = await AppDataSource.query(
        `
        INSERT INTO certificate_templates (
          contest_id, name, type, html_template, css_template, is_active, version, created_by_user_id, created_at, updated_at
        ) VALUES (NULL, 'StudyCod Default', 'studycod', NULL, NULL, 1, 1, NULL, NOW(), NOW())
        `
      );
      const id = Number(insert?.insertId ?? 0);
      return {
        id,
        contestId: null,
        name: "StudyCod Default",
        type: "studycod",
        htmlTemplate: null,
        cssTemplate: null,
        isActive: true,
        version: 1,
      };
    }

    return null;
  }

  private mapTemplate(row: any): CertificateTemplateRecord {
    return {
      id: Number(row.id),
      contestId: row.contestId == null ? null : Number(row.contestId),
      name: String(row.name ?? "Template"),
      type: row.type === "custom" ? "custom" : "studycod",
      htmlTemplate: row.htmlTemplate == null ? null : String(row.htmlTemplate),
      cssTemplate: row.cssTemplate == null ? null : String(row.cssTemplate),
      isActive: Number(row.isActive ?? 1) === 1,
      version: Number(row.version ?? 1) || 1,
    };
  }

  private async resolveTemplateFields(templateId: number | null): Promise<CertificateFieldRecord[]> {
    if (!templateId) {
      return [
        { fieldKey: "contest_name", isEnabled: true, isRequired: false },
        { fieldKey: "name", isEnabled: true, isRequired: true },
        { fieldKey: "full_name", isEnabled: true, isRequired: false },
        { fieldKey: "score", isEnabled: true, isRequired: true },
        { fieldKey: "signature", isEnabled: true, isRequired: true },
        { fieldKey: "date", isEnabled: true, isRequired: false },
        { fieldKey: "organizer", isEnabled: true, isRequired: false },
        { fieldKey: "certificate_id", isEnabled: true, isRequired: false },
        { fieldKey: "qr_code", isEnabled: true, isRequired: false },
      ];
    }

    const rows = (await AppDataSource.query(
      `
      SELECT field_key as fieldKey,
             is_enabled as isEnabled,
             is_required as isRequired
      FROM certificate_fields
      WHERE template_id = ?
      ORDER BY id ASC
      `,
      [templateId]
    )) as Array<any>;

    if (!rows.length) {
      return [
        { fieldKey: "contest_name", isEnabled: true, isRequired: false },
        { fieldKey: "name", isEnabled: true, isRequired: true },
        { fieldKey: "full_name", isEnabled: true, isRequired: false },
        { fieldKey: "score", isEnabled: true, isRequired: true },
        { fieldKey: "signature", isEnabled: true, isRequired: true },
      ];
    }

    return rows.map((r) => ({
      fieldKey: String(r.fieldKey) as any,
      isEnabled: Number(r.isEnabled ?? 1) === 1,
      isRequired: Number(r.isRequired ?? 0) === 1,
    }));
  }

  private async resolvePlace(contestId: number, participantId: number): Promise<string | null> {
    const rows = (await AppDataSource.query(
      `
      SELECT ranked.participantId,
             ranked.rankPos
      FROM (
        SELECT totals.participantId,
               ROW_NUMBER() OVER (ORDER BY totals.totalScore DESC, totals.participantId ASC) as rankPos
        FROM (
          SELECT p.id as participantId,
                 COALESCE(SUM(best.bestScore), 0) as totalScore
          FROM contest_participants p
          LEFT JOIN (
            SELECT cs.participant_id as participantId,
                   cs.problem_id as problemId,
                   MAX(COALESCE(cs.score, 0)) as bestScore
            FROM contest_submissions cs
            WHERE cs.contest_id = ?
              AND cs.phase = 'CONTEST'
            GROUP BY cs.participant_id, cs.problem_id
          ) best ON best.participantId = p.id
          WHERE p.contest_id = ?
            AND COALESCE(p.is_disqualified, 0) = 0
          GROUP BY p.id
        ) totals
      ) ranked
      WHERE ranked.participantId = ?
      LIMIT 1
      `,
      [contestId, contestId, participantId]
    )) as Array<any>;

    const rank = Number(rows[0]?.rankPos ?? 0);
    if (!Number.isFinite(rank) || rank <= 0) return null;
    return String(rank);
  }
}

export const certificateService = new CertificateService();
