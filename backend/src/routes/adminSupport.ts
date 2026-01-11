import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { SupportTicket } from "../entities/SupportTicket";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { emailService } from "../services/emailService";
const router = Router();
const supportRepo = () => AppDataSource.getRepository(SupportTicket);
const replySchema = z.object({
  replyText: z.string().trim().min(1).max(20_000)
});
router.get("/", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
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
router.post("/:id/reply", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
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
      errors: validated.error.errors
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
    await emailService.sendSupportReplyEmail({
      to: ticket.userEmail,
      originalSubject: ticket.subject,
      replyText: validated.data.replyText
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