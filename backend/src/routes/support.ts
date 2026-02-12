import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { SupportTicket } from "../entities/SupportTicket";
import { SupportConversation } from "../entities/SupportConversation";
import { SupportMessage } from "../entities/SupportMessage";
import { SupportAttachment } from "../entities/SupportAttachment";
import { User } from "../entities/User";
import { Student } from "../entities/Student";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger";
const router = Router();
const supportRepo = () => AppDataSource.getRepository(SupportTicket);
const convRepo = () => AppDataSource.getRepository(SupportConversation);
const msgRepo = () => AppDataSource.getRepository(SupportMessage);
const attRepo = () => AppDataSource.getRepository(SupportAttachment);
const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const createTicketSchema = z.object({
  email: z.string().trim().email(),
  subject: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(10_000)
});
router.post("/ticket", async (req, res: Response) => {
  const validated = createTicketSchema.safeParse(req.body);
  if (!validated.success) {
    return res.status(400).json({
      message: "INVALID_INPUT",
      errors: validated.error.issues
    });
  }
  const {
    email,
    subject,
    message
  } = validated.data;
  const ticket = supportRepo().create({
    userEmail: email,
    subject,
    message,
    status: "OPEN",
    answeredAt: null
  });
  await supportRepo().save(ticket);
  return res.status(201).json({
    ok: true,
    ticket: {
      id: ticket.id,
      status: ticket.status,
      createdAt: ticket.createdAt
    }
  });
});

/**
 * Chat-style support (authenticated)
 */
const createConversationSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(20_000)
});

const UPLOADS_ROOT = process.env.UPLOADS_DIR ? String(process.env.UPLOADS_DIR) : path.resolve(process.cwd(), "uploads");
const supportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  }
});

function ensureDir(p: string) {
  fs.mkdirSync(p, {
    recursive: true
  });
}

function safeFilename(name: string): string {
  const base = path.basename(String(name || "file"));
  return base.replace(/[\\/<>:"|?*\x00-\x1F]/g, "_").slice(0, 180) || "file";
}

const maybeParseMultipartFiles = (req: any, res: any, next: any) => {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return supportUpload.array("files", 5)(req, res, next);
  }
  return next();
};

router.get("/chat/conversations", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userType) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "USER" && !req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const where: any = {};
    if (req.userType === "STUDENT" && req.studentId) {
      where.student = { id: req.studentId };
    } else {
      where.user = { id: req.userId };
    }

    const conversations = await convRepo().find({
      where,
      order: { lastMessageAt: "DESC" },
      take: 50
    });

    return res.json({
      conversations: conversations.map(c => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessageAt: c.lastMessageAt
      }))
    });
  } catch (err: any) {
    logger.error("[support chat] failed to list conversations", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/chat/conversations", authRequired, async (req: AuthRequest, res: Response) => {
  const validated = createConversationSchema.safeParse(req.body);
  if (!validated.success) {
    return res.status(400).json({
      message: "INVALID_INPUT",
      errors: validated.error.issues
    });
  }

  try {
    if (!req.userType) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "USER" && !req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const { subject, message } = validated.data;
    let email: string | null = null;
    let user: User | null = null;
    let student: Student | null = null;

    if (req.userType === "STUDENT" && req.studentId) {
      student = await studentRepo().findOne({ where: { id: req.studentId } });
      if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
      email = student.email;
    } else {
      user = await userRepo().findOne({ where: { id: req.userId } });
      if (!user) return res.status(404).json({ message: "USER_NOT_FOUND" });
      email = user.email || null;
    }

    if (!email) {
      return res.status(400).json({ message: "EMAIL_REQUIRED" });
    }

    const now = new Date();
    const conversation = convRepo().create({
      user: user || null,
      student: student || null,
      userEmail: email,
      subject,
      status: "OPEN",
      lastMessageAt: now
    } as Partial<SupportConversation>);
    await convRepo().save(conversation);

    const firstMsg = msgRepo().create({
      conversation,
      senderType: "USER",
      senderUser: user || null,
      senderStudent: student || null,
      text: message
    } as Partial<SupportMessage>);
    await msgRepo().save(firstMsg);

    await convRepo().update({ id: conversation.id }, { lastMessageAt: firstMsg.createdAt } as any);

    return res.status(201).json({
      ok: true,
      conversation: {
        id: conversation.id,
        subject: conversation.subject,
        status: conversation.status,
        createdAt: conversation.createdAt,
        lastMessageAt: firstMsg.createdAt
      }
    });
  } catch (err: any) {
    logger.error("[support chat] failed to create conversation", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/chat/conversations/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userType) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "USER" && !req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });
    const conversationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
    }

    const conversation = await convRepo().findOne({
      where: { id: conversationId } as any,
      relations: ["user", "student"]
    });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });

    const isOwner = req.userType === "STUDENT" && req.studentId ? (conversation.student as any)?.id === req.studentId : (conversation.user as any)?.id === req.userId;
    if (!isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    const messages = await msgRepo().find({
      where: { conversation: { id: conversation.id } } as any,
      order: { createdAt: "ASC" },
      relations: ["attachments"]
    });

    return res.json({
      conversation: {
        id: conversation.id,
        subject: conversation.subject,
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt
      },
      messages: messages.map(m => ({
        id: m.id,
        senderType: m.senderType,
        text: m.text || "",
        createdAt: m.createdAt,
        attachments: (m.attachments || []).map(a => ({
          id: a.id,
          originalName: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes
        }))
      }))
    });
  } catch (err: any) {
    logger.error("[support chat] failed to get conversation", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/chat/conversations/:id/messages", authRequired, maybeParseMultipartFiles, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userType) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "USER" && !req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });
    const conversationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
    }

    const conversation = await convRepo().findOne({
      where: { id: conversationId } as any,
      relations: ["user", "student"]
    });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });

    const isOwner = req.userType === "STUDENT" && req.studentId ? (conversation.student as any)?.id === req.studentId : (conversation.user as any)?.id === req.userId;
    if (!isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });
    if (conversation.status === "CLOSED") return res.status(409).json({ message: "CONVERSATION_CLOSED" });

    const files = (req as any).files as any[] | undefined;
    const rawText = (req as any).body?.text;
    const text = typeof rawText === "string" ? rawText.trim() : "";
    const hasFiles = Array.isArray(files) && files.length > 0;
    if (!text && !hasFiles) {
      return res.status(400).json({ message: "TEXT_OR_FILES_REQUIRED" });
    }
    if (text.length > 20_000) {
      return res.status(400).json({ message: "TEXT_TOO_LONG" });
    }

    let user: User | null = null;
    let student: Student | null = null;
    if (req.userType === "STUDENT" && req.studentId) {
      student = await studentRepo().findOne({ where: { id: req.studentId } });
    } else {
      user = await userRepo().findOne({ where: { id: req.userId } });
    }

    const msg = msgRepo().create({
      conversation,
      senderType: "USER",
      senderUser: user || null,
      senderStudent: student || null,
      text: text || null
    } as Partial<SupportMessage>);
    await msgRepo().save(msg);

    const savedAttachments: Array<{
      id: number;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];
    if (hasFiles) {
      const msgDirRel = path.posix.join("support", String(conversation.id), String(msg.id));
      const msgDirAbs = path.join(UPLOADS_ROOT, ...msgDirRel.split("/"));
      ensureDir(msgDirAbs);
      for (const f of files!) {
        const originalName = safeFilename(f.originalname);
        const ext = path.extname(originalName);
        const token = crypto.randomBytes(8).toString("hex");
        const storedName = `${Date.now()}_${token}${ext || ""}`;
        const storageKey = path.posix.join(msgDirRel, storedName);
        const abs = path.join(UPLOADS_ROOT, ...storageKey.split("/"));
        fs.writeFileSync(abs, f.buffer);
        const att: SupportAttachment = attRepo().create({
          message: msg,
          originalName,
          mimeType: f.mimetype || "application/octet-stream",
          sizeBytes: f.size,
          storageKey
        } as Partial<SupportAttachment>);
        await attRepo().save(att);
        savedAttachments.push({
          id: att.id,
          originalName: att.originalName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes
        });
      }
    }

    await convRepo().update({ id: conversation.id }, { lastMessageAt: msg.createdAt } as any);

    return res.status(201).json({
      ok: true,
      message: {
        id: msg.id,
        senderType: msg.senderType,
        text: msg.text || "",
        createdAt: msg.createdAt,
        attachments: savedAttachments
      }
    });
  } catch (err: any) {
    logger.error("[support chat] failed to post message", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/chat/attachments/:attachmentId/download", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const attachmentId = Number.parseInt(String(req.params.attachmentId), 10);
    if (!Number.isFinite(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ message: "INVALID_ATTACHMENT_ID" });
    }
    const attachment = await attRepo().findOne({
      where: { id: attachmentId } as any,
      relations: ["message", "message.conversation", "message.conversation.user", "message.conversation.student"]
    });
    if (!attachment) return res.status(404).json({ message: "ATTACHMENT_NOT_FOUND" });

    const conversation = (attachment.message as any)?.conversation as SupportConversation;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const isOwner = req.userType === "STUDENT" && req.studentId ? (conversation.student as any)?.id === req.studentId : (conversation.user as any)?.id === req.userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    const abs = path.join(UPLOADS_ROOT, ...String(attachment.storageKey).split("/"));
    if (!fs.existsSync(abs)) return res.status(404).json({ message: "FILE_NOT_FOUND" });

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    return res.download(abs, attachment.originalName);
  } catch (err: any) {
    logger.error("[support chat] failed to download attachment", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export const supportRouter = router;
export default router;