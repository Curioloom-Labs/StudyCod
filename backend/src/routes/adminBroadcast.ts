import { Router, Response } from "express";
import { z } from "zod";

import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Student } from "../entities/Student";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";
import { In } from "typeorm";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);

const sendBroadcastSchema = z
  .object({
    subject: z.string().min(1).max(160),
    title: z.string().min(1).max(160),

    // Delivery mode:
    // - MARKETING: newsletter/broadcast, respects marketingEmailsEnabled, includes unsubscribe.
    // - NOTIFICATION: announcements/updates, can be sent to explicit targets even if not subscribed.
    delivery: z.enum(["MARKETING", "NOTIFICATION"]).optional().default("MARKETING"),

    // Backwards compatible: callers can still provide ready HTML.
    html: z.string().min(1).optional(),
    // Safer / simpler for UI: plain text body that will be escaped and wrapped into basic HTML.
    content: z.string().min(1).optional(),
    text: z.string().optional(),

    // Subscribers (marketing_emails_enabled=true)
    includeSubscribed: z.boolean().optional().default(true),
    audience: z.enum(["USERS", "STUDENTS", "ALL"]).default("ALL"),

    // Explicit opt-in for a mass notification send (ignores marketing subscription flags).
    // Only allowed for delivery=NOTIFICATION and audience=USERS.
    includeAllUsers: z.boolean().optional().default(false),
    // Safety confirmation for mass notification sends.
    confirm: z.string().optional(),

    // Explicit targeting
    targets: z
      .object({
        userIds: z.array(z.number().int().positive()).optional(),
        studentIds: z.array(z.number().int().positive()).optional(),
        classIds: z.array(z.number().int().positive()).optional(),
        emails: z.array(z.string().email()).optional()
      })
      .optional(),

    dryRun: z.boolean().optional().default(true),
    limit: z.number().int().positive().max(5000).optional()
  })
  .superRefine((v, ctx) => {
    if (!v.html && !v.content) {
      ctx.addIssue({ code: "custom", message: "html_or_content_required", path: ["html"] });
    }

    if (v.delivery === "NOTIFICATION") {
      if (v.includeSubscribed) {
        ctx.addIssue({ code: "custom", message: "includeSubscribed_not_allowed_for_notification", path: ["includeSubscribed"] });
      }

      if (v.includeAllUsers) {
        if (v.audience !== "USERS") {
          ctx.addIssue({ code: "custom", message: "includeAllUsers_requires_users_audience", path: ["audience"] });
        }
        if (!v.dryRun) {
          const expected = "ALL USERS";
          if ((v.confirm ?? "").trim() !== expected) {
            ctx.addIssue({ code: "custom", message: "confirm_required_for_mass_notification", path: ["confirm"] });
          }
        }
      }

      const t = v.targets;
      const hasTargets = !!(
        (t?.userIds?.length ?? 0) > 0 ||
        (t?.studentIds?.length ?? 0) > 0 ||
        (t?.classIds?.length ?? 0) > 0 ||
        (t?.emails?.length ?? 0) > 0
      );
      if (!hasTargets && !v.includeAllUsers) {
        ctx.addIssue({ code: "custom", message: "targets_required_for_notification", path: ["targets"] });
      }
    }
  });

function escapeHtml(input: unknown): string {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildBasicHtmlFromText(content: string): string {
  const t = String(content ?? "").trim();
  const parts = t.split(/\n{2,}/g);
  return parts
    .map(p => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

router.post("/broadcast", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sendBroadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }

    const { subject, title, html, content, text, audience, dryRun, limit, includeSubscribed, targets, delivery, includeAllUsers } = parsed.data;

    const contentHtml = html ?? buildBasicHtmlFromText(content || "");

    const shouldRespectSubscription = delivery === "MARKETING";

    const toSend: Array<{ kind: "user" | "student"; id: number; email: string }> = [];

    if (includeSubscribed) {
      if (audience === "USERS" || audience === "ALL") {
        const users = await userRepo().find({
          where: { emailVerified: true },
          take: limit ?? undefined,
          order: { id: "ASC" }
        });
        for (const u of users) {
          const email = String(u.email || "").trim();
          if (!email) continue;
          if (shouldRespectSubscription && !u.marketingEmailsEnabled) continue;
          toSend.push({ kind: "user", id: u.id, email });
        }
      }

      if (audience === "STUDENTS" || audience === "ALL") {
        const students = await studentRepo().find({
          take: limit ?? undefined,
          order: { id: "ASC" }
        });
        for (const s of students) {
          const email = String(s.email || "").trim();
          if (!email) continue;
          if (shouldRespectSubscription && !s.marketingEmailsEnabled) continue;
          toSend.push({ kind: "student", id: s.id, email });
        }
      }
    }

    if (delivery === "NOTIFICATION" && includeAllUsers) {
      // Mass notification send to ALL USERS (emailVerified only). Ignores marketingEmailsEnabled.
      const users = await userRepo().find({
        where: { emailVerified: true },
        take: limit ?? undefined,
        order: { id: "ASC" }
      });
      for (const u of users) {
        const email = String(u.email || "").trim();
        if (!email) continue;
        toSend.push({ kind: "user", id: u.id, email });
      }
    }

    if (targets) {
      const userIds = (targets.userIds ?? []).filter(Boolean);
      const studentIds = (targets.studentIds ?? []).filter(Boolean);
      const classIds = (targets.classIds ?? []).filter(Boolean);
      const emails = (targets.emails ?? []).map(e => String(e).trim()).filter(Boolean);

      if (userIds.length) {
        const users = await userRepo().find({
          where: { id: In(userIds) } as any
        });
        for (const u of users) {
          const email = String(u.email || "").trim();
          if (!email) continue;
          if (shouldRespectSubscription && !u.marketingEmailsEnabled) continue;
          toSend.push({ kind: "user", id: u.id, email });
        }
      }

      if (studentIds.length) {
        const students = await studentRepo().find({
          where: { id: In(studentIds) } as any
        });
        for (const s of students) {
          const email = String(s.email || "").trim();
          if (!email) continue;
          if (shouldRespectSubscription && !s.marketingEmailsEnabled) continue;
          toSend.push({ kind: "student", id: s.id, email });
        }
      }

      if (classIds.length) {
        const students = await studentRepo().find({
          where: { class: { id: In(classIds) } as any } as any
        });
        for (const s of students) {
          const email = String(s.email || "").trim();
          if (!email) continue;
          if (shouldRespectSubscription && !s.marketingEmailsEnabled) continue;
          toSend.push({ kind: "student", id: s.id, email });
        }
      }

      if (emails.length) {
        // Resolve emails to known recipients (user preferred over student).
        for (const e of emails) {
          const u = await userRepo().findOne({ where: { email: e } as any });
          if (u) {
            const email = String(u.email || "").trim();
            if (email) {
              if (!shouldRespectSubscription || u.marketingEmailsEnabled) {
                toSend.push({ kind: "user", id: u.id, email });
              }
            }
            continue;
          }
          const s = await studentRepo().findOne({ where: { email: e } as any });
          if (s) {
            const email = String(s.email || "").trim();
            if (email) {
              if (!shouldRespectSubscription || s.marketingEmailsEnabled) {
                toSend.push({ kind: "student", id: s.id, email });
              }
            }
          }
        }
      }
    }

    // De-duplicate by email (a student may also have a user linked).
    const uniq = new Map<string, { kind: "user" | "student"; id: number; email: string }>();
    for (const r of toSend) {
      const key = r.email.toLowerCase();
      if (!uniq.has(key)) uniq.set(key, r);
    }

    let recipients = Array.from(uniq.values());

    if (limit && recipients.length > limit) {
      recipients = recipients.slice(0, limit);
    }

    if (!recipients.length) {
      return res.status(400).json({ message: "NO_RECIPIENTS" });
    }

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        count: recipients.length,
        sample: recipients.slice(0, 20),
      });
    }

    let sent = 0;
    let failed = 0;

    // Send sequentially to avoid provider throttling; can be improved to a small concurrency pool later.
    for (const r of recipients) {
      try {
        if (delivery === "NOTIFICATION") {
          await emailService.sendNotificationEmail({
            to: r.email,
            subject,
            title,
            contentHtml,
            text,
          });
        } else {
          await emailService.sendBroadcastEmail({
            to: r.email,
            subject,
            title,
            contentHtml,
            text,
            recipient: r,
          });
        }
        sent++;
      } catch (err: any) {
        failed++;
        logger.error("[admin-broadcast] failed", { email: r.email, kind: r.kind, id: r.id, err: err?.message || err });
      }
    }

    return res.json({ ok: true, dryRun: false, recipients: recipients.length, sent, failed });
  } catch (err: any) {
    logger.error("[admin-broadcast] error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
