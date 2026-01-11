import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { SupportTicket } from "../entities/SupportTicket";
const router = Router();
const supportRepo = () => AppDataSource.getRepository(SupportTicket);
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
      errors: validated.error.errors
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
export const supportRouter = router;
export default router;