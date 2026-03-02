import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { studyCodMailService } from "../services/studycodMailService";
import { logger } from "../utils/logger";

const router = Router();

const listMessagesSchema = z.object({
  folder: z.string().min(1).max(255).optional().default("INBOX"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  cursorUid: z.coerce.number().int().positive().optional(),
});

const uidSchema = z.object({
  uid: z.coerce.number().int().positive(),
});

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
});

router.get("/status", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const cfg = studyCodMailService.isConfigured();
  return res.json({
    ok: cfg.ok,
    issues: cfg.issues,
  });
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
