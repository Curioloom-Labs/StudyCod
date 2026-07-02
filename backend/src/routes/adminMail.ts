import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { studyCodMailService } from "../services/studycodMailService";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";

const router = Router();

// Persistent (cross-device) signature for the admin mailbox — a small file so it
// survives restarts and doesn't depend on the (flaky) Redis instance.
const SIGNATURE_FILE = process.env.MAIL_SIGNATURE_FILE || path.join(process.cwd(), "data", "mail-signature.txt");
function readSignature(): string {
  try { return fs.readFileSync(SIGNATURE_FILE, "utf8"); } catch { return ""; }
}
function writeSignature(sig: string): void {
  fs.mkdirSync(path.dirname(SIGNATURE_FILE), { recursive: true });
  fs.writeFileSync(SIGNATURE_FILE, sig, "utf8");
}

const listMessagesSchema = z.object({
  folder: z.string().min(1).max(255).optional().default("INBOX"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  cursorUid: z.coerce.number().int().positive().optional(),
});

const uidSchema = z.object({
  uid: z.coerce.number().int().positive(),
});

const searchSchema = z.object({
  folder: z.string().min(1).max(255).optional().default("INBOX"),
  q: z.string().min(1).max(255),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const mailAttachmentsSchema = z
  .array(z.object({
    filename: z.string().min(1).max(255),
    contentType: z.string().max(255).optional(),
    contentBase64: z.string().max(50_000_000)
  }))
  .max(10)
  .optional();

const folderSchema = z.object({
  folder: z.string().min(1).max(255).optional().default("INBOX"),
});

const setReadSchema = z.object({
  folder: z.string().min(1).max(255).optional().default("INBOX"),
  read: z.boolean(),
});

const moveSchema = z.object({
  folder: z.string().min(1).max(255).optional().default("INBOX"),
  destination: z.string().min(1).max(255),
});

const sendSchema = z.object({
  from: z.string().email().optional(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(240),
  text: z.string().optional(),
  html: z.string().optional(),
  replyTo: z.string().email().optional(),
  inReplyTo: z.string().max(998).optional(),
  references: z.string().max(4000).optional(),
  attachments: mailAttachmentsSchema,
});

const draftSchema = z.object({
  from: z.string().email().optional(),
  to: z.array(z.string().email()).optional().default([]),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().max(240).optional().default(""),
  text: z.string().optional(),
  html: z.string().optional(),
  inReplyTo: z.string().max(998).optional(),
  references: z.string().max(4000).optional(),
  attachments: mailAttachmentsSchema,
});

router.get("/status", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const cfg = studyCodMailService.isConfigured();
  return res.json({
    ok: cfg.ok,
    issues: cfg.issues,
  });
});

router.get("/signature", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
  return res.json({ signature: readSignature() });
});

router.put("/signature", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const parsed = z.object({ signature: z.string().max(5000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    writeSignature(parsed.data.signature);
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error("[admin-mail] PUT /signature failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "WRITE_FAILED" });
  }
});

router.get("/folders", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const folders = await studyCodMailService.getFolders();
    return res.json({ folders });
  } catch (err: any) {
    logger.error("[admin-mail] GET /folders failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.get("/messages", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = listMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }
    const result = await studyCodMailService.listMessages(parsed.data);
    return res.json(result);
  } catch (err: any) {
    logger.error("[admin-mail] GET /messages failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.get("/search", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }
    const result = await studyCodMailService.searchMessages(parsed.data.folder, parsed.data.q, parsed.data.limit);
    return res.json(result);
  } catch (err: any) {
    logger.error("[admin-mail] GET /search failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.get("/messages/:uid/attachments/:index", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const uid = Number(req.params.uid);
    const index = Number(req.params.index);
    const folder = String((req.query.folder as string) || "INBOX");
    if (!Number.isFinite(uid) || !Number.isFinite(index)) {
      return res.status(400).json({ message: "INVALID_INPUT" });
    }
    const att = await studyCodMailService.getAttachment(folder, uid, index);
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${att.filename.replace(/["\r\n]/g, "")}"`);
    return res.send(att.content);
  } catch (err: any) {
    logger.error("[admin-mail] GET /attachment failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.get("/messages/:uid", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const uidParsed = uidSchema.safeParse(req.params);
    const folderParsed = folderSchema.safeParse(req.query);
    if (!uidParsed.success || !folderParsed.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: [
          ...(uidParsed.success ? [] : uidParsed.error.issues),
          ...(folderParsed.success ? [] : folderParsed.error.issues),
        ],
      });
    }

    const message = await studyCodMailService.getMessage(folderParsed.data.folder, uidParsed.data.uid);
    return res.json({ message });
  } catch (err: any) {
    logger.error("[admin-mail] GET /messages/:uid failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.post("/messages/draft", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }
    await studyCodMailService.saveDraft(parsed.data);
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error("[admin-mail] POST /messages/draft failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.post("/messages/send", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }

    const info = await studyCodMailService.sendMessage(parsed.data);
    return res.json({ ok: true, ...info });
  } catch (err: any) {
    logger.error("[admin-mail] POST /messages/send failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.post("/messages/:uid/read", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const uidParsed = uidSchema.safeParse(req.params);
    const bodyParsed = setReadSchema.safeParse(req.body);
    if (!uidParsed.success || !bodyParsed.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: [
          ...(uidParsed.success ? [] : uidParsed.error.issues),
          ...(bodyParsed.success ? [] : bodyParsed.error.issues),
        ],
      });
    }

    await studyCodMailService.setRead(bodyParsed.data.folder, uidParsed.data.uid, bodyParsed.data.read);
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error("[admin-mail] POST /messages/:uid/read failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.post("/messages/:uid/move", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const uidParsed = uidSchema.safeParse(req.params);
    const bodyParsed = moveSchema.safeParse(req.body);
    if (!uidParsed.success || !bodyParsed.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: [
          ...(uidParsed.success ? [] : uidParsed.error.issues),
          ...(bodyParsed.success ? [] : bodyParsed.error.issues),
        ],
      });
    }

    await studyCodMailService.moveMessage(bodyParsed.data.folder, uidParsed.data.uid, bodyParsed.data.destination);
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error("[admin-mail] POST /messages/:uid/move failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

router.delete("/messages/:uid", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const uidParsed = uidSchema.safeParse(req.params);
    const folderParsed = folderSchema.safeParse(req.query);
    if (!uidParsed.success || !folderParsed.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: [
          ...(uidParsed.success ? [] : uidParsed.error.issues),
          ...(folderParsed.success ? [] : folderParsed.error.issues),
        ],
      });
    }

    await studyCodMailService.deleteMessage(folderParsed.data.folder, uidParsed.data.uid);
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error("[admin-mail] DELETE /messages/:uid failed", { requestId: req.requestId, userId: req.userId, err });
    return res.status(400).json({ message: err?.message || "MAIL_ERROR" });
  }
});

export default router;
