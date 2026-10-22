import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { AuthRequest, authOptional, authRequired } from "../middleware/authMiddleware";
import { certificateService } from "../services/certificates/CertificateService";
import { CertificateVerificationService } from "../services/certificates/CertificateVerificationService";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { certificatePdfPath, getCertificateWorkspace, previewCertificate, requireCertificateManager, retryFailedCertificateJobs, queueExistingCertificateEmails } from "../services/certificates/CertificateWorkspace";
import { requireCurrentAwards } from "../services/contest/awards";

const certificateRouter = Router();
const verificationService = new CertificateVerificationService();

const CERTIFICATE_TEMPLATE_TEXT_LIMIT = 50 * 1024 * 1024;

function workspaceError(error: unknown, res: Response) {
  if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.code });
  const message = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
  if (["AWARDS_STALE", "AWARDS_NOT_CONFIRMED", "CERTIFICATE_GENERATION_IN_PROGRESS"].includes(message)) return res.status(409).json({ message });
  logger.error("[certificates] workspace request failed", { error });
  return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
}

certificateRouter.get("/contest/:contestId/workspace", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.contestId);
    await requireCertificateManager(req, contestId);
    return res.json(await getCertificateWorkspace(contestId, req.userId!));
  } catch (error) { return workspaceError(error, res); }
});

certificateRouter.post("/contest/:contestId/preview", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.contestId);
    const contest = await requireCertificateManager(req, contestId);
    const parsed = z.object({
      templateId: z.number().int().positive().optional(),
      htmlTemplate: z.string().max(CERTIFICATE_TEMPLATE_TEXT_LIMIT).optional(),
      cssTemplate: z.string().max(CERTIFICATE_TEMPLATE_TEXT_LIMIT).optional(),
      participantId: z.number().int().positive().optional(),
      place: z.enum(["1", "2", "3"]).nullable().optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return certificateTemplateValidationError(parsed, res);
    if (hasOversizedCertificateTemplate(parsed.data)) return certificateTemplateTooLargeResponse(res);
    return res.json(await previewCertificate(contestId, contest, parsed.data));
  } catch (error) { return workspaceError(error, res); }
});

certificateRouter.post("/contest/:contestId/retry", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.contestId);
    await requireCertificateManager(req, contestId);
    await requireCurrentAwards(contestId);
    return res.json(await retryFailedCertificateJobs(contestId));
  } catch (error) { return workspaceError(error, res); }
});

certificateRouter.post("/contest/:contestId/send", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.contestId);
    await requireCertificateManager(req, contestId);
    return res.json(await queueExistingCertificateEmails(contestId));
  } catch (error) { return workspaceError(error, res); }
});

certificateRouter.get("/contest/:contestId/pdf/:participantId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.contestId);
    await requireCertificateManager(req, contestId);
    const filePath = await certificatePdfPath(contestId, Number(req.params.participantId));
    return res.download(filePath);
  } catch (error) { return workspaceError(error, res); }
});
const certificateFieldKeySchema = z.enum([
  "contest_name",
  "name",
  "full_name",
  "place",
  "score",
  "max_score",
  "date",
  "organizer",
  "signature",
  "certificate_id",
  "qr_code",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function errorProperty(error: unknown, key: string): unknown {
  return isRecord(error) ? error[key] : undefined;
}

function certificateTemplateValidationError(parsed: z.ZodSafeParseError<unknown>, res: Response) {
  const tooLargeIssue = parsed.error.issues.find((issue: z.ZodIssue) => {
    const key = String(issue.path?.[0] ?? "");
    return issue.code === "too_big" && (key === "htmlTemplate" || key === "cssTemplate");
  });

  if (tooLargeIssue) {
    return certificateTemplateTooLargeResponse(res);
  }

  return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
}

function certificateTemplateTooLargeResponse(res: Response) {
  return res.status(413).json({
    message: "TEMPLATE_TOO_LARGE",
    detail: `Template HTML/CSS is too large. Max allowed per field is ${CERTIFICATE_TEMPLATE_TEXT_LIMIT} UTF-8 bytes.`,
    limit: CERTIFICATE_TEMPLATE_TEXT_LIMIT,
  });
}

function hasOversizedCertificateTemplate(payload: { htmlTemplate?: string | null; cssTemplate?: string | null }): boolean {
  return [payload.htmlTemplate, payload.cssTemplate].some(
    value => typeof value === "string" && Buffer.byteLength(value, "utf8") > CERTIFICATE_TEMPLATE_TEXT_LIMIT
  );
}

certificateRouter.post("/template", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const schema = z.object({
      contestId: z.number().int().positive().optional(),
      name: z.string().min(2).max(180),
      type: z.enum(["studycod", "custom"]),
      htmlTemplate: z.string().max(CERTIFICATE_TEMPLATE_TEXT_LIMIT).optional(),
      cssTemplate: z.string().max(CERTIFICATE_TEMPLATE_TEXT_LIMIT).optional(),
      fields: z.array(
        z.object({
          fieldKey: certificateFieldKeySchema,
          isEnabled: z.boolean().optional(),
          isRequired: z.boolean().optional(),
        })
      ).optional(),
    });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return certificateTemplateValidationError(parsed, res);
    }
    if (hasOversizedCertificateTemplate(parsed.data)) return certificateTemplateTooLargeResponse(res);
    if (parsed.data.contestId) await requireCertificateManager(req, parsed.data.contestId);

    if (parsed.data.type === "custom" && !String(parsed.data.htmlTemplate ?? "").trim()) {
      return res.status(400).json({ message: "HTML_TEMPLATE_REQUIRED" });
    }

    const result = await certificateService.createTemplate({
      contestId: parsed.data.contestId ?? null,
      createdByUserId: req.userId,
      name: parsed.data.name,
      type: parsed.data.type,
      htmlTemplate: parsed.data.htmlTemplate ?? null,
      cssTemplate: parsed.data.cssTemplate ?? null,
      fields: parsed.data.fields,
    });

    return res.json(result);
  } catch (error: unknown) {
    if (error instanceof HttpError) return workspaceError(error, res);
    logger.error("[certificate] failed to create template", {
      userId: req.userId ?? null,
      userType: req.userType ?? null,
      code: errorProperty(error, "code"),
      errno: errorProperty(error, "errno"),
      sqlState: errorProperty(error, "sqlState"),
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

certificateRouter.put("/template/:templateId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const templateId = Number(req.params.templateId);
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return res.status(400).json({ message: "INVALID_TEMPLATE_ID" });
    }

    const templateRows = rows(await AppDataSource.query(
      `
      SELECT
        t.id,
        t.contest_id as contestId,
        t.created_by_user_id as createdByUserId,
        c.created_by_user_id as contestOwnerId
      FROM certificate_templates t
      LEFT JOIN contests c ON c.id = t.contest_id
      WHERE t.id = ?
      LIMIT 1
      `,
      [templateId]
    ));
    const templateRow = templateRows[0];
    if (!templateRow) return res.status(404).json({ message: "TEMPLATE_NOT_FOUND" });

    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (templateRow.contestId) await requireCertificateManager(req, Number(templateRow.contestId));
    const isCreator = Number(templateRow.createdByUserId ?? 0) === req.userId;
    const isContestOwner = Number(templateRow.contestOwnerId ?? 0) === req.userId;
    if (!templateRow.contestId && !isAdmin && !isCreator && !isContestOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({
      name: z.string().min(2).max(180).optional(),
      type: z.enum(["studycod", "custom"]).optional(),
      htmlTemplate: z.string().max(CERTIFICATE_TEMPLATE_TEXT_LIMIT).nullable().optional(),
      cssTemplate: z.string().max(CERTIFICATE_TEMPLATE_TEXT_LIMIT).nullable().optional(),
      isActive: z.boolean().optional(),
      fields: z.array(
        z.object({
          fieldKey: certificateFieldKeySchema,
          isEnabled: z.boolean().optional(),
          isRequired: z.boolean().optional(),
        })
      ).optional(),
    }).refine((value) => Object.keys(value).length > 0, { message: "EMPTY_UPDATE" });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return certificateTemplateValidationError(parsed, res);
    if (hasOversizedCertificateTemplate(parsed.data)) return certificateTemplateTooLargeResponse(res);

    const current = await certificateService.getTemplateById(templateId);
    const resultingType = parsed.data.type ?? current?.type;
    const resultingHtml = parsed.data.htmlTemplate !== undefined ? parsed.data.htmlTemplate : current?.htmlTemplate;
    if (resultingType === "custom" && !String(resultingHtml ?? "").trim()) {
      return res.status(400).json({ message: "HTML_TEMPLATE_REQUIRED" });
    }

    const result = await certificateService.updateTemplate({
      templateId,
      name: parsed.data.name,
      type: parsed.data.type,
      htmlTemplate: parsed.data.htmlTemplate,
      cssTemplate: parsed.data.cssTemplate,
      isActive: parsed.data.isActive,
      fields: parsed.data.fields,
    });

    return res.json({ ok: true, ...result });
  } catch (error: unknown) {
    if (error instanceof HttpError) return workspaceError(error, res);
    logger.error("[certificate] failed to update template", {
      templateId: req.params.templateId,
      userId: req.userId ?? null,
      userType: req.userType ?? null,
      code: errorProperty(error, "code"),
      errno: errorProperty(error, "errno"),
      sqlState: errorProperty(error, "sqlState"),
      message: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : String(error);
    if (message === "TEMPLATE_NOT_FOUND") return res.status(404).json({ message: "TEMPLATE_NOT_FOUND" });
    if (message === "INVALID_TEMPLATE_ID") return res.status(400).json({ message: "INVALID_TEMPLATE_ID" });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

certificateRouter.get("/template/:templateId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const templateId = Number(req.params.templateId);
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return res.status(400).json({ message: "INVALID_TEMPLATE_ID" });
    }

    const template = await certificateService.getTemplateById(templateId);
    if (!template) return res.status(404).json({ message: "TEMPLATE_NOT_FOUND" });
    const fieldRows = (await AppDataSource.query(
      `
      SELECT
        field_key as fieldKey,
        is_enabled as isEnabled,
        is_required as isRequired
      FROM certificate_fields
      WHERE template_id = ?
      ORDER BY id ASC
      `,
      [template.id]
    )) as Array<{
      fieldKey: string;
      isEnabled: number | boolean;
      isRequired: number | boolean;
    }>;

    return res.json({
      template: {
        id: template.id,
        contestId: template.contestId,
        name: template.name,
        type: template.type,
        htmlTemplate: template.htmlTemplate,
        cssTemplate: template.cssTemplate,
        fields: fieldRows.map((row) => ({
          fieldKey: row.fieldKey,
          isEnabled: Boolean(Number(row.isEnabled)),
          isRequired: Boolean(Number(row.isRequired)),
        })),
        isActive: template.isActive,
        version: template.version,
      },
    });
  } catch {
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

certificateRouter.get("/templates", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const typeRaw = String(req.query.type ?? "").trim().toLowerCase();
    const type = typeRaw === "studycod" || typeRaw === "custom" ? typeRaw : undefined;
    const contestIdRaw = String(req.query.contestId ?? "").trim();
    const contestId = contestIdRaw ? Number(contestIdRaw) : null;
    const includeInactiveRaw = String(req.query.includeInactive ?? "").trim().toLowerCase();
    const includeInactive = includeInactiveRaw === "1" || includeInactiveRaw === "true";
    const limitRaw = String(req.query.limit ?? "").trim();
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const templates = await certificateService.listTemplates({
      type,
      contestId: Number.isFinite(contestId) ? contestId : null,
      includeInactive,
      limit,
    });

    return res.json({
      templates: templates.map((template) => ({
        id: template.id,
        contestId: template.contestId,
        name: template.name,
        type: template.type,
        isActive: template.isActive,
        version: template.version,
      })),
    });
  } catch {
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

certificateRouter.put("/contest/:contestId/settings", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const contestId = Number(req.params.contestId);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_CONTEST_ID" });

    await requireCertificateManager(req, contestId);

    const schema = z.object({
      mode: z.enum(["none", "studycod", "custom"]),
      defaultTemplateId: z.number().int().positive().nullable().optional(),
      sendEmailEnabled: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    if (parsed.data.defaultTemplateId) {
      const template = await certificateService.getTemplateById(parsed.data.defaultTemplateId);
      if (!template || !template.isActive) return res.status(400).json({ message: "TEMPLATE_NOT_FOUND" });
      if (template.contestId != null && template.contestId !== contestId) return res.status(403).json({ message: "ACCESS_DENIED" });
    } else if (parsed.data.mode === "custom") {
      return res.status(400).json({ message: "HTML_TEMPLATE_REQUIRED" });
    }

    await certificateService.upsertContestSettings({
      contestId,
      mode: parsed.data.mode,
      defaultTemplateId: parsed.data.defaultTemplateId ?? null,
      sendEmailEnabled: parsed.data.sendEmailEnabled,
    });

    return res.json({ ok: true });
  } catch (error) {
    return workspaceError(error, res);
  }
});

certificateRouter.post("/verify", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const certificateId = String(body.certificateId ?? "").trim();
    if (!certificateId) return res.status(400).json({ message: "INVALID_CERTIFICATE_ID" });

    const payload = await verificationService.getByCertificateId(certificateId);
    if (!payload) return res.status(404).json({ message: "CERTIFICATE_NOT_FOUND" });

    return res.json(payload);
  } catch {
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default certificateRouter;
