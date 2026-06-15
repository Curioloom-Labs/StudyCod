import { Router, Response } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { In } from "typeorm";

import { AppDataSource } from "../data-source";
import { BlogPost, BLOG_CATEGORIES } from "../entities/BlogPost";
import { BlogMedia } from "../entities/BlogMedia";
import { BlogTag } from "../entities/BlogTag";
import { BlogPostTag } from "../entities/BlogPostTag";
import { BlogComment } from "../entities/BlogComment";
import { BlogReaction, BLOG_REACTION_EMOJIS } from "../entities/BlogReaction";
import { BlogCommentReport } from "../entities/BlogCommentReport";
import { Notification } from "../entities/Notification";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { logger } from "../utils/logger";
import {
  resolvePrincipals,
  principalKey,
  estimateReadingMinutes,
  type PrincipalRef,
  type PrincipalType
} from "../utils/blogPrincipals";

const router = Router();

export const BLOG_UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.join(String(process.env.UPLOADS_DIR), "blog")
  : path.resolve(process.cwd(), "uploads", "blog");

/** Browser-facing prefix for blog media — resolved via /api in dev (proxy) and prod (nginx). */
export const MEDIA_URL_PREFIX = "/api/blog/media/";

export const mediaUrl = (key: string | null | undefined): string | null =>
  key ? `${MEDIA_URL_PREFIX}${key}` : null;

const postRepo = () => AppDataSource.getRepository(BlogPost);
const mediaRepo = () => AppDataSource.getRepository(BlogMedia);
const tagRepo = () => AppDataSource.getRepository(BlogTag);
const postTagRepo = () => AppDataSource.getRepository(BlogPostTag);
const commentRepo = () => AppDataSource.getRepository(BlogComment);
const reactionRepo = () => AppDataSource.getRepository(BlogReaction);
const reportRepo = () => AppDataSource.getRepository(BlogCommentReport);
const notificationRepo = () => AppDataSource.getRepository(Notification);

function principalOf(req: AuthRequest): { type: PrincipalType; id: number } | null {
  if (req.userType === "STUDENT" && req.studentId) return { type: "STUDENT", id: req.studentId };
  if (req.userType === "USER" && req.userId) return { type: "USER", id: req.userId };
  return null;
}

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

async function tagsForPosts(postIds: number[]): Promise<Map<number, { slug: string; name: string }[]>> {
  const out = new Map<number, { slug: string; name: string }[]>();
  if (!postIds.length) return out;
  const rows = await postTagRepo()
    .createQueryBuilder("pt")
    .innerJoin(BlogTag, "tag", "tag.id = pt.tagId")
    .select(["pt.postId AS postId", "tag.slug AS slug", "tag.name AS name"])
    .where("pt.postId IN (:...ids)", { ids: postIds })
    .getRawMany<{ postId: number; slug: string; name: string }>();
  for (const r of rows) {
    const list = out.get(r.postId) ?? [];
    list.push({ slug: r.slug, name: r.name });
    out.set(r.postId, list);
  }
  return out;
}

async function commentCounts(postIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!postIds.length) return out;
  const rows = await commentRepo()
    .createQueryBuilder("c")
    .select("c.postId", "postId")
    .addSelect("COUNT(*)", "cnt")
    .where("c.postId IN (:...ids)", { ids: postIds })
    .groupBy("c.postId")
    .getRawMany<{ postId: number; cnt: string }>();
  for (const r of rows) out.set(Number(r.postId), Number(r.cnt));
  return out;
}

async function reactionCounts(
  targetType: "POST" | "COMMENT",
  ids: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const rows = await reactionRepo()
    .createQueryBuilder("r")
    .select("r.targetId", "targetId")
    .addSelect("COUNT(*)", "cnt")
    .where("r.targetType = :t", { t: targetType })
    .andWhere("r.targetId IN (:...ids)", { ids })
    .groupBy("r.targetId")
    .getRawMany<{ targetId: number; cnt: string }>();
  for (const r of rows) out.set(Number(r.targetId), Number(r.cnt));
  return out;
}

/** Per-emoji breakdown for a single target, marking which the caller chose. */
async function reactionSummary(
  targetType: "POST" | "COMMENT",
  targetId: number,
  me: { type: PrincipalType; id: number } | null
): Promise<{ items: { emoji: string; count: number; reacted: boolean }[]; total: number }> {
  const rows = await reactionRepo()
    .createQueryBuilder("r")
    .select("r.emoji", "emoji")
    .addSelect("COUNT(*)", "cnt")
    .where("r.targetType = :t", { t: targetType })
    .andWhere("r.targetId = :id", { id: targetId })
    .groupBy("r.emoji")
    .getRawMany<{ emoji: string; cnt: string }>();

  let mine: string | null = null;
  if (me) {
    const own = await reactionRepo().findOne({
      where: { targetType, targetId, principalType: me.type, principalId: me.id }
    });
    mine = own?.emoji ?? null;
  }

  const counts = new Map(rows.map(r => [r.emoji, Number(r.cnt)]));
  let total = 0;
  for (const c of counts.values()) total += c;
  const items = BLOG_REACTION_EMOJIS.map(emoji => ({
    emoji,
    count: counts.get(emoji) ?? 0,
    reacted: mine === emoji
  })).filter(i => i.count > 0 || i.reacted);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Public media serve (NO auth — <img> cannot send a Bearer token)
// ---------------------------------------------------------------------------

router.get("/media/:key", async (req, res) => {
  const key = String(req.params.key || "").trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return res.status(404).end();
  const media = await mediaRepo().findOne({ where: { mediaKey: key } });
  if (!media) return res.status(404).end();
  const abs = path.join(BLOG_UPLOADS_ROOT, ...String(media.storageKey).split("/"));
  if (!fs.existsSync(abs)) return res.status(404).end();
  res.setHeader("Content-Type", media.mimeType || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  return res.sendFile(abs);
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function authorName(post: BlogPost): string | null {
  const a = post.author;
  if (!a) return null;
  const full = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  return full || a.username || null;
}

const listQuerySchema = z.object({
  category: z.enum(BLOG_CATEGORIES as [string, ...string[]]).optional(),
  tag: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

// GET /blog — published posts, newest first (pinned on top).
router.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
  }
  const { category, tag, q, limit, offset } = parsed.data;

  const qb = postRepo()
    .createQueryBuilder("post")
    .leftJoinAndSelect("post.author", "author")
    .where("post.status = :status", { status: "PUBLISHED" });

  if (category) qb.andWhere("post.category = :category", { category });
  if (q) qb.andWhere("(post.title LIKE :q OR post.excerpt LIKE :q)", { q: `%${q}%` });
  if (tag) {
    qb.innerJoin(BlogPostTag, "pt", "pt.postId = post.id")
      .innerJoin(BlogTag, "t", "t.id = pt.tagId AND t.slug = :tagSlug", { tagSlug: tag.toLowerCase() });
  }

  qb.orderBy("post.pinned", "DESC")
    .addOrderBy("post.publishedAt", "DESC")
    .addOrderBy("post.id", "DESC")
    .take(limit)
    .skip(offset);

  const [posts, total] = await qb.getManyAndCount();
  const ids = posts.map(p => p.id);
  const [tags, comments, reactions] = await Promise.all([
    tagsForPosts(ids),
    commentCounts(ids),
    reactionCounts("POST", ids)
  ]);

  const items = posts.map(post => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    version: post.version,
    pinned: post.pinned,
    author: authorName(post),
    authorAvatar: post.author?.avatarUrl ?? null,
    publishedAt: post.publishedAt,
    coverUrl: mediaUrl(post.coverImageKey),
    readingMinutes: estimateReadingMinutes(post.content),
    tags: tags.get(post.id) ?? [],
    commentCount: comments.get(post.id) ?? 0,
    reactionCount: reactions.get(post.id) ?? 0
  }));

  return res.json({ posts: items, total, limit, offset });
});

// GET /blog/tags — all tags with post counts.
router.get("/tags", authRequired, async (_req: AuthRequest, res: Response) => {
  const rows = await tagRepo()
    .createQueryBuilder("t")
    .leftJoin(BlogPostTag, "pt", "pt.tagId = t.id")
    .leftJoin(BlogPost, "p", "p.id = pt.postId AND p.status = 'PUBLISHED'")
    .select(["t.slug AS slug", "t.name AS name"])
    .addSelect("COUNT(p.id)", "cnt")
    .groupBy("t.id")
    .orderBy("cnt", "DESC")
    .getRawMany<{ slug: string; name: string; cnt: string }>();
  return res.json({ tags: rows.map(r => ({ slug: r.slug, name: r.name, count: Number(r.cnt) })) });
});

// GET /blog/:slug — single published post with full detail.
router.get("/:slug", authRequired, async (req: AuthRequest, res: Response) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(404).json({ message: "NOT_FOUND" });

  const post = await postRepo().findOne({
    where: { slug, status: "PUBLISHED" },
    relations: { author: true }
  });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });

  const me = principalOf(req);
  const [tags, reactions, related] = await Promise.all([
    tagsForPosts([post.id]),
    reactionSummary("POST", post.id, me),
    relatedPosts(post)
  ]);

  return res.json({
    post: {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      version: post.version,
      pinned: post.pinned,
      commentsLocked: post.commentsLocked,
      author: authorName(post),
      authorAvatar: post.author?.avatarUrl ?? null,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      coverUrl: mediaUrl(post.coverImageKey),
      readingMinutes: estimateReadingMinutes(post.content),
      tags: tags.get(post.id) ?? [],
      reactions: reactions.items,
      related
    }
  });
});

async function relatedPosts(post: BlogPost): Promise<
  { slug: string; title: string; coverUrl: string | null; category: string }[]
> {
  // Posts sharing a tag, else same category; never the post itself.
  const tagRows = await postTagRepo().find({ where: { postId: post.id } });
  const tagIds = tagRows.map(r => r.tagId);

  let candidateIds: number[] = [];
  if (tagIds.length) {
    const rows = await postTagRepo()
      .createQueryBuilder("pt")
      .select("DISTINCT pt.postId", "postId")
      .where("pt.tagId IN (:...tagIds)", { tagIds })
      .andWhere("pt.postId != :self", { self: post.id })
      .limit(10)
      .getRawMany<{ postId: number }>();
    candidateIds = rows.map(r => Number(r.postId));
  }

  const qb = postRepo()
    .createQueryBuilder("p")
    .where("p.status = 'PUBLISHED'")
    .andWhere("p.id != :self", { self: post.id });
  if (candidateIds.length) {
    qb.andWhere("(p.id IN (:...ids) OR p.category = :cat)", { ids: candidateIds, cat: post.category });
  } else {
    qb.andWhere("p.category = :cat", { cat: post.category });
  }
  const rows = await qb.orderBy("p.publishedAt", "DESC").take(3).getMany();
  return rows.map(p => ({
    slug: p.slug,
    title: p.title,
    coverUrl: mediaUrl(p.coverImageKey),
    category: p.category
  }));
}

// ---------------------------------------------------------------------------
// Reactions (post + comment) — authenticated, toggle/replace
// ---------------------------------------------------------------------------

const reactSchema = z.object({
  targetType: z.enum(["POST", "COMMENT"]),
  targetId: z.coerce.number().int().positive(),
  emoji: z.enum(BLOG_REACTION_EMOJIS as [string, ...string[]])
});

router.post("/reactions", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const parsed = reactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
  }
  const { targetType, targetId, emoji } = parsed.data;

  // Validate the target exists.
  if (targetType === "POST") {
    const exists = await postRepo().findOne({ where: { id: targetId } });
    if (!exists) return res.status(404).json({ message: "TARGET_NOT_FOUND" });
  } else {
    const exists = await commentRepo().findOne({ where: { id: targetId } });
    if (!exists) return res.status(404).json({ message: "TARGET_NOT_FOUND" });
  }

  const existing = await reactionRepo().findOne({
    where: { targetType, targetId, principalType: me.type, principalId: me.id }
  });

  if (existing && existing.emoji === emoji) {
    await reactionRepo().remove(existing); // toggle off
  } else if (existing) {
    existing.emoji = emoji; // switch emoji
    await reactionRepo().save(existing);
  } else {
    await reactionRepo().save(
      reactionRepo().create({
        targetType,
        targetId,
        principalType: me.type,
        principalId: me.id,
        emoji
      })
    );
  }

  const summary = await reactionSummary(targetType, targetId, me);
  return res.json({ reactions: summary.items, total: summary.total });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

type CommentDto = {
  id: number;
  parentId: number | null;
  content: string;
  pinned: boolean;
  editedAt: Date | null;
  createdAt: Date;
  author: string;
  authorAvatar: string | null;
  canManage: boolean;
  mine: boolean;
  reactionCount: number;
  myReaction: string | null;
  replies: CommentDto[];
};

async function buildCommentTree(
  postId: number,
  me: { type: PrincipalType; id: number } | null,
  isAdmin: boolean
): Promise<CommentDto[]> {
  const comments = await commentRepo().find({
    where: { postId },
    order: { pinned: "DESC", createdAt: "ASC" }
  });

  const authorRefs: PrincipalRef[] = comments.map(c => ({ type: c.authorType, id: c.authorId }));
  const principals = await resolvePrincipals(authorRefs);
  const reactionMap = await reactionCounts("COMMENT", comments.map(c => c.id));

  // My reactions per comment (single query).
  const myReactions = new Map<number, string>();
  if (me && comments.length) {
    const mine = await reactionRepo().find({
      where: {
        targetType: "COMMENT",
        targetId: In(comments.map(c => c.id)),
        principalType: me.type,
        principalId: me.id
      }
    });
    for (const r of mine) myReactions.set(r.targetId, r.emoji);
  }

  const toDto = (c: BlogComment): CommentDto => {
    const info = principals.get(principalKey(c.authorType, c.authorId));
    const mineEmoji = myReactions.get(c.id) ?? null;
    return {
      id: c.id,
      parentId: c.parentId,
      content: c.content,
      pinned: c.pinned,
      editedAt: c.editedAt,
      createdAt: c.createdAt,
      author: info?.name ?? "—",
      authorAvatar: info?.avatarUrl ?? null,
      canManage: isAdmin || (!!me && me.type === c.authorType && me.id === c.authorId),
      mine: !!me && me.type === c.authorType && me.id === c.authorId,
      reactionCount: reactionMap.get(c.id) ?? 0,
      myReaction: mineEmoji,
      replies: []
    };
  };

  const dtos = comments.map(toDto);
  const byId = new Map(dtos.map(d => [d.id, d]));
  const roots: CommentDto[] = [];
  for (const d of dtos) {
    if (d.parentId && byId.has(d.parentId)) {
      byId.get(d.parentId)!.replies.push(d);
    } else {
      roots.push(d);
    }
  }
  return roots;
}

// GET /blog/:slug/comments
router.get("/:slug/comments", authRequired, async (req: AuthRequest, res: Response) => {
  const post = await postRepo().findOne({ where: { slug: String(req.params.slug), status: "PUBLISHED" } });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });
  const me = principalOf(req);
  const isAdmin = req.userRole === "SYSTEM_ADMIN";
  const tree = await buildCommentTree(post.id, me, isAdmin);
  return res.json({ comments: tree, commentsLocked: post.commentsLocked });
});

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  parentId: z.coerce.number().int().positive().optional()
});

// POST /blog/:slug/comments
router.post("/:slug/comments", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const post = await postRepo().findOne({
    where: { slug: String(req.params.slug), status: "PUBLISHED" },
    relations: { author: true }
  });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });
  if (post.commentsLocked) return res.status(403).json({ message: "COMMENTS_LOCKED" });

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
  }

  // Collapse replies-to-replies onto the same parent (single nesting level).
  let parentId: number | null = null;
  let parentComment: BlogComment | null = null;
  if (parsed.data.parentId) {
    parentComment = await commentRepo().findOne({ where: { id: parsed.data.parentId, postId: post.id } });
    if (!parentComment) return res.status(404).json({ message: "PARENT_NOT_FOUND" });
    parentId = parentComment.parentId ?? parentComment.id;
    if (parentId !== parentComment.id) {
      parentComment = await commentRepo().findOne({ where: { id: parentId } });
    }
  }

  const comment = await commentRepo().save(
    commentRepo().create({
      postId: post.id,
      parentId,
      authorType: me.type,
      authorId: me.id,
      content: parsed.data.content
    })
  );

  await emitCommentNotifications(post, comment, parentComment, me);

  const isAdmin = req.userRole === "SYSTEM_ADMIN";
  const tree = await buildCommentTree(post.id, me, isAdmin);
  return res.status(201).json({ comments: tree });
});

async function emitCommentNotifications(
  post: BlogPost,
  comment: BlogComment,
  parent: BlogComment | null,
  actor: { type: PrincipalType; id: number }
): Promise<void> {
  try {
    const actorInfo = (await resolvePrincipals([{ type: actor.type, id: actor.id }])).get(
      principalKey(actor.type, actor.id)
    );
    const actorName = actorInfo?.name ?? null;
    const targets: { type: PrincipalType; id: number; type_: "BLOG_COMMENT" | "BLOG_REPLY" }[] = [];

    // Reply → notify parent author.
    if (parent && !(parent.authorType === actor.type && parent.authorId === actor.id)) {
      targets.push({ type: parent.authorType, id: parent.authorId, type_: "BLOG_REPLY" });
    }
    // New top-level comment → notify the post author (admin).
    if (!parent && post.author && post.author.id !== (actor.type === "USER" ? actor.id : -1)) {
      targets.push({ type: "USER", id: post.author.id, type_: "BLOG_COMMENT" });
    }

    for (const t of targets) {
      await notificationRepo().save(
        notificationRepo().create({
          recipientType: t.type,
          recipientId: t.id,
          type: t.type_,
          actorName,
          postSlug: post.slug,
          postTitle: post.title,
          commentId: comment.id
        })
      );
    }
  } catch (err) {
    logger.warn("[blog] failed to emit comment notifications", { err });
  }
}

const editCommentSchema = z.object({ content: z.string().trim().min(1).max(4000) });

// PUT /blog/comments/:id — author edits own comment.
router.put("/comments/:id", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const comment = await commentRepo().findOne({ where: { id } });
  if (!comment) return res.status(404).json({ message: "NOT_FOUND" });

  const isOwner = comment.authorType === me.type && comment.authorId === me.id;
  if (!isOwner) return res.status(403).json({ message: "FORBIDDEN" });

  const parsed = editCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

  comment.content = parsed.data.content;
  comment.editedAt = new Date();
  await commentRepo().save(comment);
  return res.json({ ok: true });
});

// DELETE /blog/comments/:id — author or admin.
router.delete("/comments/:id", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const comment = await commentRepo().findOne({ where: { id } });
  if (!comment) return res.status(404).json({ message: "NOT_FOUND" });

  const isAdmin = req.userRole === "SYSTEM_ADMIN";
  const isOwner = comment.authorType === me.type && comment.authorId === me.id;
  if (!isAdmin && !isOwner) return res.status(403).json({ message: "FORBIDDEN" });

  await commentRepo().remove(comment); // replies cascade
  return res.json({ ok: true });
});

const reportSchema = z.object({ reason: z.string().trim().max(300).optional() });

// POST /blog/comments/:id/report
router.post("/comments/:id/report", authRequired, async (req: AuthRequest, res: Response) => {
  const me = principalOf(req);
  if (!me) return res.status(401).json({ message: "UNAUTHENTICATED" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const comment = await commentRepo().findOne({ where: { id } });
  if (!comment) return res.status(404).json({ message: "NOT_FOUND" });

  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

  await reportRepo().save(
    reportRepo().create({
      commentId: id,
      reporterType: me.type,
      reporterId: me.id,
      reason: parsed.data.reason?.trim() || null
    })
  );
  return res.json({ ok: true });
});

export default router;
