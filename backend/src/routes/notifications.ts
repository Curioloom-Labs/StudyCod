import { Router, Response } from "express";
import { z } from "zod";
import { IsNull } from "typeorm";

import { AppDataSource } from "../data-source";
import { Notification } from "../entities/Notification";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import type { PrincipalType } from "../utils/blogPrincipals";

const router = Router();
const repo = () => AppDataSource.getRepository(Notification);

function principalOf(req: AuthRequest): { type: PrincipalType; id: number } | null {
  if (req.userType === "STUDENT" && req.studentId) return { type: "STUDENT", id: req.studentId };
  if (req.userType === "USER" && req.userId) return { type: "USER", id: req.userId };
  return null;
}

// GET /notifications — latest notifications + unread count.
router.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });

  const items = await repo().find({
    where: { recipientType: me.type, recipientId: me.id },
    order: { createdAt: "DESC" },
    take: 30
  });
  const unread = await repo().count({
    where: { recipientType: me.type, recipientId: me.id, readAt: IsNull() }
  });

  return res.json({
    notifications: items.map(n => ({
      id: n.id,
      type: n.type,
      actorName: n.actorName,
      postSlug: n.postSlug,
      postTitle: n.postTitle,
      commentId: n.commentId,
      read: !!n.readAt,
      createdAt: n.createdAt
    })),
    unread
  });
});

// GET /notifications/unread-count — lightweight badge poll.
router.get("/unread-count", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const unread = await repo().count({
    where: { recipientType: me.type, recipientId: me.id, readAt: IsNull() }
  });
  return res.json({ unread });
});

const markSchema = z.object({ ids: z.array(z.number().int().positive()).optional() });

// POST /notifications/mark-read — mark some (or all) as read.
router.post("/mark-read", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const parsed = markSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

  const qb = repo()
    .createQueryBuilder()
    .update(Notification)
    .set({ readAt: () => "CURRENT_TIMESTAMP" })
    .where("recipient_type = :t AND recipient_id = :id AND read_at IS NULL", { t: me.type, id: me.id });
  if (parsed.data.ids && parsed.data.ids.length) {
    qb.andWhere("id IN (:...ids)", { ids: parsed.data.ids });
  }
  await qb.execute();
  return res.json({ ok: true });
});

export default router;
