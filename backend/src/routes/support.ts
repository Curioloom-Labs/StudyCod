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
  message: z.string().trim().max(20_000).optional().default("")
});

const closeConversationSchema = z.object({
  reason: z.string().trim().max(2000).optional()
});

const UPLOADS_ROOT = process.env.UPLOADS_DIR ? String(process.env.UPLOADS_DIR) : path.resolve(process.cwd(), "uploads");
// Generous allowlist for support attachments. Files are stored via memoryStorage
// (no path traversal) and served with `res.download` (attachment disposition, so no
// inline render), so this is defense-in-depth: it keeps out script/markup types that
// could be abused if the serving behaviour ever changes, while still accepting the
// screenshots, logs, docs and archives users legitimately attach to tickets.
const ALLOWED_SUPPORT_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/tiff", "image/heic", "image/heif",
  "application/pdf", "text/plain", "application/json", "text/csv",
  "application/zip", "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
const supportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_SUPPORT_MIME.has(String(file.mimetype || "").toLowerCase())) cb(null, true);
    else cb(new Error("UNSUPPORTED_MEDIA_TYPE"));
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

type SavedSupportAttachment = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

async function saveSupportAttachments(message: SupportMessage, files: any[]): Promise<SavedSupportAttachment[]> {
  const saved: SavedSupportAttachment[] = [];
  if (!Array.isArray(files) || files.length === 0) return saved;
  const messageDirectory = path.posix.join("support", String(message.conversation.id), String(message.id));
  ensureDir(path.join(UPLOADS_ROOT, ...messageDirectory.split("/")));

  for (const file of files) {
    const originalName = safeFilename(file.originalname);
    const extension = path.extname(originalName);
    const storedName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}${extension || ""}`;
    const storageKey = path.posix.join(messageDirectory, storedName);
    fs.writeFileSync(path.join(UPLOADS_ROOT, ...storageKey.split("/")), file.buffer);
    const attachment = attRepo().create({
      message,
      originalName,
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
      storageKey
    } as Partial<SupportAttachment>);
    await attRepo().save(attachment);
    saved.push({ id: attachment.id, originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes });
  }
  return saved;
}

const maybeParseMultipartFiles = (req: any, res: any, next: any) => {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return supportUpload.array("files", 5)(req, res, (err: any) => {
      if (err) {
        const code = err instanceof multer.MulterError ? err.code : undefined;
        const message = err?.message === "UNSUPPORTED_MEDIA_TYPE"
          ? "UNSUPPORTED_MEDIA_TYPE"
          : code === "LIMIT_FILE_SIZE"
            ? "FILE_TOO_LARGE"
            : code === "LIMIT_FILE_COUNT"
              ? "TOO_MANY_FILES"
              : "UPLOAD_FAILED";
        return res.status(400).json({ message });
      }
      return next();
    });
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

    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const [conversations, total] = await convRepo().findAndCount({
      where,
      order: { lastMessageAt: "DESC" },
      take: limit,
      skip: offset
    });

    return res.json({
      conversations: conversations.map(c => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessageAt: c.lastMessageAt
      })),
      total,
      hasMore: offset + conversations.length < total
    });
  } catch (err: any) {
    logger.error("[support chat] failed to list conversations", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/chat/conversations", authRequired, maybeParseMultipartFiles, async (req: AuthRequest, res: Response) => {
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
    const files = (req as any).files as any[] | undefined;
    if (!message && (!Array.isArray(files) || files.length === 0)) {
      return res.status(400).json({ message: "TEXT_OR_FILES_REQUIRED" });
    }
    let email: string | null = null;
    let user: User | null = null;
    let student: Student | null = null;

    if (req.userType === "STUDENT" && req.studentId) {
      student = await studentRepo().findOne({ where: { id: req.studentId } });
      if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
      email = student.email || `student-${student.id}@support.local`;
    } else {
      user = await userRepo().findOne({ where: { id: req.userId } });
      if (!user) return res.status(404).json({ message: "USER_NOT_FOUND" });
      email = user.email || `user-${user.id}@support.local`;
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
    const attachments = await saveSupportAttachments(firstMsg, files || []);

    await convRepo().update({ id: conversation.id }, { lastMessageAt: firstMsg.createdAt } as any);

    return res.status(201).json({
      ok: true,
      conversation: {
        id: conversation.id,
        subject: conversation.subject,
        status: conversation.status,
        createdAt: conversation.createdAt,
        lastMessageAt: firstMsg.createdAt,
        attachments
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

router.patch("/chat/conversations/:id/close", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userType) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "USER" && !req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const conversationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
    }

    const validated = closeConversationSchema.safeParse(req.body ?? {});
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const conversation = await convRepo().findOne({
      where: { id: conversationId } as any,
      relations: ["user", "student"]
    });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });

    const isOwner = req.userType === "STUDENT" && req.studentId ? (conversation.student as any)?.id === req.studentId : (conversation.user as any)?.id === req.userId;
    if (!isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    if (conversation.status !== "CLOSED") {
      await convRepo().update({ id: conversation.id }, { status: "CLOSED" } as any);

      const reason = String(validated.data.reason ?? "").trim();
      const text = reason
        ? `Conversation closed by user. Reason: ${reason}`
        : "Conversation closed by user.";

      const sys = msgRepo().create({
        conversation,
        senderType: "SYSTEM",
        text
      } as Partial<SupportMessage>);
      await msgRepo().save(sys);
      await convRepo().update({ id: conversation.id }, { lastMessageAt: sys.createdAt } as any);
    }

    const updated = await convRepo().findOne({ where: { id: conversation.id } as any });
    return res.json({
      ok: true,
      conversation: {
        id: updated?.id ?? conversation.id,
        subject: updated?.subject ?? conversation.subject,
        status: updated?.status ?? "CLOSED",
        createdAt: updated?.createdAt ?? conversation.createdAt,
        updatedAt: updated?.updatedAt ?? conversation.updatedAt,
        lastMessageAt: updated?.lastMessageAt ?? conversation.lastMessageAt
      }
    });
  } catch (err: any) {
    logger.error("[support chat] failed to close conversation", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.patch("/chat/conversations/:id/reopen", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userType) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "USER" && !req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const conversationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(conversationId) || conversationId <= 0) return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
    const conversation = await convRepo().findOne({ where: { id: conversationId } as any, relations: ["user", "student"] });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });

    const isOwner = req.userType === "STUDENT" && req.studentId
      ? (conversation.student as any)?.id === req.studentId
      : (conversation.user as any)?.id === req.userId;
    if (!isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    if (conversation.status !== "OPEN") {
      await convRepo().update({ id: conversation.id }, { status: "OPEN" } as any);
      const systemMessage = msgRepo().create({ conversation, senderType: "SYSTEM", text: "Conversation reopened by user." } as Partial<SupportMessage>);
      await msgRepo().save(systemMessage);
      await convRepo().update({ id: conversation.id }, { lastMessageAt: systemMessage.createdAt } as any);
    }

    const updated = await convRepo().findOne({ where: { id: conversation.id } as any });
    return res.json({
      ok: true,
      conversation: {
        id: updated?.id ?? conversation.id,
        subject: updated?.subject ?? conversation.subject,
        status: updated?.status ?? "OPEN",
        createdAt: updated?.createdAt ?? conversation.createdAt,
        updatedAt: updated?.updatedAt ?? conversation.updatedAt,
        lastMessageAt: updated?.lastMessageAt ?? conversation.lastMessageAt
      }
    });
  } catch (err: any) {
    logger.error("[support chat] failed to reopen conversation", { requestId: req.requestId, principalId: req.principalId, err });
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

    const savedAttachments = await saveSupportAttachments(msg, files || []);

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
    const isSupportAgent = req.userRole === "SYSTEM_ADMIN" || req.userRole === "SUPPORT";
    const isOwner = req.userType === "STUDENT" && req.studentId ? (conversation.student as any)?.id === req.studentId : (conversation.user as any)?.id === req.userId;
    if (!isSupportAgent && !isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

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
