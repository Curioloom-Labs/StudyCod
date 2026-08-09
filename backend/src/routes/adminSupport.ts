import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { SupportTicket } from "../entities/SupportTicket";
import { SupportConversation } from "../entities/SupportConversation";
import { SupportMessage } from "../entities/SupportMessage";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { supportAgentGuard } from "../middleware/rolesGuard";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";
const router = Router();
const supportRepo = () => AppDataSource.getRepository(SupportTicket);
const convRepo = () => AppDataSource.getRepository(SupportConversation);
const msgRepo = () => AppDataSource.getRepository(SupportMessage);
const replySchema = z.object({
  replyText: z.string().trim().min(1).max(20_000)
});

const adminChatReplySchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  sendEmail: z.boolean().optional().default(true)
});
const conversationStatusSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"])
});

router.get("/conversations", authRequired, supportAgentGuard, async (req: AuthRequest, res: Response) => {
  try {
    const conversations = await convRepo().find({
      order: { lastMessageAt: "DESC" },
      take: 200
    });

    return res.json({
      conversations: conversations.map(c => ({
        id: c.id,
        userEmail: c.userEmail,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt,
        lastMessageAt: c.lastMessageAt
      }))
    });
  } catch (err: any) {
    logger.error("[support desk] failed to list conversations", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/conversations/:id", authRequired, supportAgentGuard, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
    }

    const conversation = await convRepo().findOne({ where: { id: conversationId } as any });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });

    const messages = await msgRepo().find({
      where: { conversation: { id: conversation.id } } as any,
      order: { createdAt: "ASC" },
      relations: ["attachments"]
    });

    return res.json({
      conversation: {
        id: conversation.id,
        userEmail: conversation.userEmail,
        subject: conversation.subject,
        status: conversation.status,
        createdAt: conversation.createdAt,
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
    logger.error("[support desk] failed to get conversation", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.patch("/conversations/:id/status", authRequired, supportAgentGuard, async (req: AuthRequest, res: Response) => {
  const conversationId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(conversationId) || conversationId <= 0) return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
  const validated = conversationStatusSchema.safeParse(req.body);
  if (!validated.success) return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
  try {
    const conversation = await convRepo().findOne({ where: { id: conversationId } as any });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });
    if (conversation.status !== validated.data.status) {
      await convRepo().update({ id: conversation.id }, { status: validated.data.status } as any);
      const systemMessage = msgRepo().create({
        conversation,
        senderType: "SYSTEM",
        text: validated.data.status === "CLOSED" ? "Conversation closed by support." : "Conversation reopened by support."
      } as Partial<SupportMessage>);
      await msgRepo().save(systemMessage);
      await convRepo().update({ id: conversation.id }, { lastMessageAt: systemMessage.createdAt } as any);
    }
    const updated = await convRepo().findOne({ where: { id: conversation.id } as any });
    return res.json({ ok: true, conversation: {
      id: updated?.id ?? conversation.id,
      userEmail: updated?.userEmail ?? conversation.userEmail,
      subject: updated?.subject ?? conversation.subject,
      status: updated?.status ?? conversation.status,
      createdAt: updated?.createdAt ?? conversation.createdAt,
      lastMessageAt: updated?.lastMessageAt ?? conversation.lastMessageAt
    } });
  } catch (err: any) {
    logger.error("[support desk] failed to change conversation status", { requestId: req.requestId, userId: req.userId, conversationId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/conversations/:id/messages", authRequired, supportAgentGuard, async (req: AuthRequest, res: Response) => {
  const conversationId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return res.status(400).json({ message: "INVALID_CONVERSATION_ID" });
  }
  const validated = adminChatReplySchema.safeParse(req.body);
  if (!validated.success) {
    return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
  }
  try {
    const conversation = await convRepo().findOne({ where: { id: conversationId } as any });
    if (!conversation) return res.status(404).json({ message: "CONVERSATION_NOT_FOUND" });
    if (conversation.status === "CLOSED") return res.status(409).json({ message: "CONVERSATION_CLOSED" });

    const msg = msgRepo().create({
      conversation,
      senderType: "ADMIN",
      text: validated.data.text,
      senderUser: req.userId ? ({ id: req.userId } as any) : null
    } as Partial<SupportMessage>);
    await msgRepo().save(msg);
    await convRepo().update({ id: conversation.id }, { lastMessageAt: msg.createdAt } as any);

    let emailSent = false;
    if (validated.data.sendEmail !== false) {
      try {
        await emailService.sendSupportReply({
          to: conversation.userEmail,
          subject: conversation.subject,
          message: validated.data.text
        });
        emailSent = true;
      } catch (err: any) {
        logger.warn("[support desk] chat reply saved but email delivery failed", {
          requestId: req.requestId,
          userId: req.userId,
          conversationId,
          error: err?.message || String(err)
        });
      }
    }

    return res.json({
      ok: true,
      emailSent,
      message: {
        id: msg.id,
        senderType: msg.senderType,
        text: msg.text || "",
        createdAt: msg.createdAt
      }
    });
  } catch (err: any) {
    logger.error("[support desk] failed to post message", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});
router.get("/", authRequired, supportAgentGuard, async (_req: AuthRequest, res: Response) => {
  const tickets = await supportRepo().find({
    order: {
      createdAt: "DESC"
    }
  });
  return res.json({
    tickets: tickets.map(t => ({
      id: t.id,
      userEmail: t.userEmail,
      subject: t.subject,
      message: t.message,
      status: t.status,
      createdAt: t.createdAt,
      answeredAt: t.answeredAt ?? null
    }))
  });
});
router.post("/:id/reply", authRequired, supportAgentGuard, async (req: AuthRequest, res: Response) => {
  const ticketId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      message: "INVALID_TICKET_ID"
    });
  }
  const validated = replySchema.safeParse(req.body);
  if (!validated.success) {
    return res.status(400).json({
      message: "INVALID_INPUT",
      errors: validated.error.issues
    });
  }
  const ticket = await supportRepo().findOne({
    where: {
      id: ticketId
    }
  });
  if (!ticket) {
    return res.status(404).json({
      message: "TICKET_NOT_FOUND"
    });
  }
    try {
      await emailService.sendSupportReply({
        to: ticket.userEmail,
        subject: ticket.subject,
        message: validated.data.replyText
      });
    } catch (err: any) {
    return res.status(502).json({
      message: "EMAIL_SEND_FAILED",
      ...(process.env.NODE_ENV !== "production" && {
        details: err?.message || String(err)
      })
    });
  }
  ticket.status = "ANSWERED";
  ticket.answeredAt = new Date();
  await supportRepo().save(ticket);
  return res.json({
    ok: true,
    ticket: {
      id: ticket.id,
      userEmail: ticket.userEmail,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      createdAt: ticket.createdAt,
      answeredAt: ticket.answeredAt
    }
  });
});
export default router;
