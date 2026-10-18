import { Router, type Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Contest } from "../entities/Contest";
import { ContestParticipant } from "../entities/ContestParticipant";
import { authRequired, type AuthRequest } from "../middleware/authMiddleware";
import { createRouteLimiter } from "../middleware/routeRateLimit";
import { FRONTEND_URL } from "../config";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";

const router = Router();
const sendLimiter = createRouteLimiter({ windowMs: 60_000, limit: 10, message: "RATE_LIMIT" });
const messageSchema = z.object({
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(5_000),
  retryEmails: z.array(z.string().email().max(255)).max(5_000).optional(),
});
let participantEmailColumnsReady: Promise<void> | null = null;

async function ensureParticipantEmailColumn(): Promise<void> {
  if (!participantEmailColumnsReady) {
    participantEmailColumnsReady = (async () => {
      const rows = await AppDataSource.query(
        `SELECT COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contest_participants'
           AND COLUMN_NAME = 'notification_email'`,
      ) as Array<{ columnName: string }>;
      if (!rows.length) {
        await AppDataSource.query("ALTER TABLE `contest_participants` ADD COLUMN `notification_email` VARCHAR(255) NULL");
      }
    })().catch((error) => {
      participantEmailColumnsReady = null;
      throw error;
    });
  }
  await participantEmailColumnsReady;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

router.post("/:id/messages", authRequired, sendLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isSafeInteger(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const contest = await AppDataSource.getRepository(Contest).findOne({
      where: { id: contestId },
      relations: ["createdBy"],
    });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const isOwner = contest.createdBy?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    let organizerIds: number[] = [];
    try {
      const organizers = await AppDataSource.query(
        "SELECT user_id AS userId FROM contest_organizers WHERE contest_id = ?",
        [contestId],
      ) as Array<{ userId: number | string }>;
      organizerIds = organizers.map((row) => Number(row.userId)).filter(Number.isSafeInteger);
    } catch {
      // Older databases may not have the optional co-organizer table yet.
    }
    if (!isOwner && !isAdmin && !organizerIds.includes(req.userId)) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await ensureParticipantEmailColumn();
    const participants = await AppDataSource.getRepository(ContestParticipant).find({
      where: { contest: { id: contestId } },
      select: { id: true, displayName: true, notificationEmail: true, user: { id: true } },
      relations: ["user"],
      order: { id: "ASC" },
      take: 5_001,
    });
    if (participants.length > 5_000) return res.status(413).json({ message: "TOO_MANY_RECIPIENTS" });

    const organizersToExclude = new Set([contest.createdBy?.id ?? 0, ...organizerIds]);
    const recipients = new Map<string, { email: string; name: string }>();
    let skipped = 0;
    let organizerSkipped = 0;
    for (const participant of participants) {
      if (participant.user?.id && organizersToExclude.has(Number(participant.user.id))) {
        organizerSkipped += 1;
        continue;
      }
      const email = String(participant.notificationEmail ?? "").trim().toLowerCase();
      if (!z.string().email().safeParse(email).success) {
        skipped += 1;
        continue;
      }
      if (!recipients.has(email)) recipients.set(email, { email, name: String(participant.displayName ?? "").trim() });
    }

    const contestUrl = `${String(FRONTEND_URL || "https://studycod.space").replace(/\/+$/, "")}/contest/contests/${contestId}`;
    const safeContestTitle = String(contest.title ?? "Контест").replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 120);
    const safeSubjectTitle = parsed.data.title.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 160);
    const retryEmails = parsed.data.retryEmails
      ? new Set(parsed.data.retryEmails.map((email) => email.trim().toLowerCase()))
      : null;
    const emailRecipients = [...recipients.values()].filter((recipient) => !retryEmails || retryEmails.has(recipient.email));
    const failed: Array<{ email: string; name: string }> = [];
    let sent = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < emailRecipients.length) {
        const index = cursor++;
        const recipient = emailRecipients[index];
        const greeting = recipient.name ? `Вітаємо, ${recipient.name}!` : "Вітаємо!";
        const contentHtml = `<p style="margin:0 0 14px 0;">${escapeHtml(greeting)}</p><h2 style="margin:0 0 12px 0;font-size:18px;line-height:1.4;">${escapeHtml(safeSubjectTitle)}</h2><div style="white-space:pre-wrap;line-height:1.7;">${escapeHtml(parsed.data.text)}</div><p style="margin:20px 0 0;"><a href="${escapeHtml(contestUrl)}" style="color:#72edb0;">Відкрити контест «${escapeHtml(safeContestTitle)}»</a></p>`;
        try {
          await emailService.sendNotificationEmail({
            to: recipient.email,
            subject: `[${safeContestTitle}] ${safeSubjectTitle}`.slice(0, 255),
            title: safeSubjectTitle,
            contentHtml,
            text: `${greeting}\n\n${safeSubjectTitle}\n\n${parsed.data.text}\n\nКонтест: ${contestUrl}`,
          });
          sent += 1;
        } catch {
          failed.push({ email: recipient.email, name: recipient.name });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, emailRecipients.length) }, () => worker()));

    return res.json({
      contestId,
      participants: participants.length - organizerSkipped,
      eligible: emailRecipients.length,
      sent,
      failed,
      skipped,
      duplicateAddresses: participants.length - organizerSkipped - skipped - emailRecipients.length,
    });
  } catch (error: unknown) {
    logger.error("[contest-messages] POST /:id/messages error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
