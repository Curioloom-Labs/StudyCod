import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { AuthRequest, authOptional, authRequired } from "../middleware/authMiddleware";
import { certificateService } from "../services/certificates/CertificateService";
import { CertificateVerificationService } from "../services/certificates/CertificateVerificationService";
import { logger } from "../utils/logger";

const certificateRouter = Router();
const verificationService = new CertificateVerificationService();

const CERTIFICATE_TEMPLATE_TEXT_LIMIT = 5_000_000;

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
          fieldKey: z.enum([
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
          ]),
          isEnabled: z.boolean().optional(),
          isRequired: z.boolean().optional(),
        })
      ).optional(),
    });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const tooLargeIssue = parsed.error.issues.find((issue: z.ZodIssue) => {
        const key = String(issue.path?.[0] ?? "");
        return issue.code === "too_big" && (key === "htmlTemplate" || key === "cssTemplate");
      });

      if (tooLargeIssue) {
        return res.status(413).json({
          message: "TEMPLATE_TOO_LARGE",
          detail: `Template HTML/CSS is too large. Max allowed per field is ${CERTIFICATE_TEMPLATE_TEXT_LIMIT} characters.`,
          limit: CERTIFICATE_TEMPLATE_TEXT_LIMIT,
          errors: parsed.error.issues,
        });
      }

      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }

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
  } catch (error: any) {
    logger.error("[certificate] failed to create template", {
      userId: req.userId ?? null,
      userType: req.userType ?? null,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      message: error?.message,
    });
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

    const manageRows = (await AppDataSource.query(
      `SELECT created_by_user_id as createdByUserId FROM contests WHERE id = ? LIMIT 1`,
      [contestId]
    )) as Array<any>;
    const contestRow = manageRows[0];
    if (!contestRow) return res.status(404).json({ message: "CONTEST_NOT_FOUND" });

    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const isOwner = Number(contestRow.createdByUserId) === req.userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({
      mode: z.enum(["none", "studycod", "custom"]),
      defaultTemplateId: z.number().int().positive().nullable().optional(),
      sendEmailEnabled: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    await certificateService.upsertContestSettings({
      contestId,
      mode: parsed.data.mode,
      defaultTemplateId: parsed.data.defaultTemplateId ?? null,
      sendEmailEnabled: parsed.data.sendEmailEnabled,
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

certificateRouter.get("/:certificateId", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const certificateId = String(req.params.certificateId ?? "").trim();
    if (!certificateId) return res.status(400).json({ message: "INVALID_CERTIFICATE_ID" });

    const payload = await verificationService.getByCertificateId(certificateId);
    if (!payload) return res.status(404).json({ message: "CERTIFICATE_NOT_FOUND" });

    return res.json(payload);
  } catch {
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default certificateRouter;
