import { Router, Response } from "express";
import { z } from "zod";
import { Not } from "typeorm";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { AppDataSource } from "../data-source";
import { BlogPost, BLOG_CATEGORIES, BlogCategory, BlogStatus } from "../entities/BlogPost";
import { BlogMedia } from "../entities/BlogMedia";
import { BlogTag } from "../entities/BlogTag";
import { BlogPostTag } from "../entities/BlogPostTag";
import { BlogComment } from "../entities/BlogComment";
import { BlogCommentReport } from "../entities/BlogCommentReport";
import { User } from "../entities/User";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { logger } from "../utils/logger";
import { resolvePrincipals, principalKey } from "../utils/blogPrincipals";
import { BLOG_UPLOADS_ROOT, mediaUrl } from "./blog";

const router = Router();

const postRepo = () => AppDataSource.getRepository(BlogPost);
const userRepo = () => AppDataSource.getRepository(User);
const mediaRepo = () => AppDataSource.getRepository(BlogMedia);
const tagRepo = () => AppDataSource.getRepository(BlogTag);
const postTagRepo = () => AppDataSource.getRepository(BlogPostTag);
const commentRepo = () => AppDataSource.getRepository(BlogComment);
const reportRepo = () => AppDataSource.getRepository(BlogCommentReport);

// --- Image upload (image/* only, ~5MB) ---
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("UNSUPPORTED_MEDIA_TYPE"));
  }
});

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif"
};

function slugifyTag(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9а-яіїєґ-]+/giu, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Resolves tag names to ids, auto-creating missing tags, then replaces the post's links. */
async function syncPostTags(postId: number, tagNames: string[]): Promise<void> {
  const cleaned = [...new Set(tagNames.map(t => t.trim()).filter(Boolean))].slice(0, 12);
  const slugs = cleaned.map(name => ({ name, slug: slugifyTag(name) })).filter(t => t.slug);

  const ids: number[] = [];
  for (const { name, slug } of slugs) {
    let tag = await tagRepo().findOne({ where: { slug } });
    if (!tag) tag = await tagRepo().save(tagRepo().create({ slug, name }));
    ids.push(tag.id);
  }

  await postTagRepo().delete({ postId });
  if (ids.length) {
    await postTagRepo().save(ids.map(tagId => postTagRepo().create({ postId, tagId })));
  }
}

async function tagNamesForPost(postId: number): Promise<string[]> {
  const rows = await postTagRepo()
    .createQueryBuilder("pt")
    .innerJoin(BlogTag, "t", "t.id = pt.tagId")
    .select("t.name", "name")
    .where("pt.postId = :postId", { postId })
    .getRawMany<{ name: string }>();
  return rows.map(r => r.name);
}

// Minimal Ukrainian/Russian → Latin transliteration for readable slugs.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
  з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ъ: "", ы: "y", э: "e", ё: "e"
};

function slugify(input: string): string {
  const base = (input || "")
    .toLowerCase()
    .split("")
    .map(ch => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return base || "post";
}

async function uniqueSlug(base: string, ignoreId?: number): Promise<string> {
  let candidate = base;
  let n = 1;
  // Loop until we find a free slug. Bounded in practice by collision count.
  while (true) {
    const where: any = { slug: candidate };
    if (ignoreId) where.id = Not(ignoreId);
    const existing = await postRepo().findOne({ where });
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`.slice(0, 180);
  }
}

function authorName(post: BlogPost): string | null {
  const a = post.author;
  if (!a) return null;
  const full = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  return full || a.username || null;
}

function toAdminDto(post: BlogPost, tags: string[] = []) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    category: post.category,
    version: post.version,
    pinned: post.pinned,
    status: post.status,
    coverImageKey: post.coverImageKey,
    coverUrl: mediaUrl(post.coverImageKey),
    commentsLocked: post.commentsLocked,
    tags,
    author: authorName(post),
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

const upsertSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(180).optional(),
  excerpt: z.string().trim().max(320).optional().nullable(),
  content: z.string().min(1).max(200_000),
  category: z.enum(BLOG_CATEGORIES as [string, ...string[]]).default("NEWS"),
  version: z.string().trim().max(40).optional().nullable(),
  pinned: z.boolean().optional().default(false),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  coverImageKey: z.string().trim().max(64).optional().nullable(),
  commentsLocked: z.boolean().optional().default(false),
  tags: z.array(z.string().trim().max(60)).max(12).optional().default([])
});

// GET /admin/blog — all posts (drafts included), newest first.
router.get("/", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
  const posts = await postRepo().find({
    relations: { author: true },
    order: { createdAt: "DESC", id: "DESC" }
  });
  const ids = posts.map(p => p.id);
  const tagsByPost = new Map<number, string[]>();
  if (ids.length) {
    const rows = await postTagRepo()
      .createQueryBuilder("pt")
      .innerJoin(BlogTag, "t", "t.id = pt.tagId")
      .select(["pt.postId AS postId", "t.name AS name"])
      .where("pt.postId IN (:...ids)", { ids })
      .getRawMany<{ postId: number; name: string }>();
    for (const r of rows) {
      const list = tagsByPost.get(r.postId) ?? [];
      list.push(r.name);
      tagsByPost.set(r.postId, list);
    }
  }
  return res.json({ posts: posts.map(p => toAdminDto(p, tagsByPost.get(p.id) ?? [])) });
});

// GET /admin/blog/reports — open comment reports queue.
// NOTE: must be registered before "/:id" so Express 5 doesn't treat "reports"
// as an :id (which would fail the numeric check with 400).
router.get("/reports", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
  const reports = await reportRepo().find({
    where: { status: "OPEN" },
    relations: { comment: true },
    order: { createdAt: "DESC" },
    take: 100
  });

  const reporterRefs = reports.map(r => ({ type: r.reporterType, id: r.reporterId }));
  const principals = await resolvePrincipals(reporterRefs);

  // Resolve post slug per reported comment for deep-linking.
  const commentIds = reports.map(r => r.comment?.id).filter(Boolean) as number[];
  const postByComment = new Map<number, { slug: string; title: string }>();
  if (commentIds.length) {
    const rows = await commentRepo()
      .createQueryBuilder("c")
      .innerJoin(BlogPost, "p", "p.id = c.postId")
      .select(["c.id AS commentId", "p.slug AS slug", "p.title AS title"])
      .where("c.id IN (:...ids)", { ids: commentIds })
      .getRawMany<{ commentId: number; slug: string; title: string }>();
    for (const r of rows) postByComment.set(Number(r.commentId), { slug: r.slug, title: r.title });
  }

  return res.json({
    reports: reports.map(r => {
      const info = principals.get(principalKey(r.reporterType, r.reporterId));
      const post = r.comment ? postByComment.get(r.comment.id) : undefined;
      return {
        id: r.id,
        commentId: r.comment?.id ?? null,
        commentContent: r.comment?.content ?? null,
        reason: r.reason,
        reporter: info?.name ?? "—",
        postSlug: post?.slug ?? null,
        postTitle: post?.title ?? null,
        createdAt: r.createdAt
      };
    })
  });
});

// GET /admin/blog/:id — single post for editing.
router.get("/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const post = await postRepo().findOne({ where: { id }, relations: { author: true } });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });
  return res.json({ post: toAdminDto(post, await tagNamesForPost(post.id)) });
});

// POST /admin/blog — create.
router.post("/", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
  }
  const data = parsed.data;

  const baseSlug = slugify(data.slug || data.title);
  const slug = await uniqueSlug(baseSlug);

  const author = req.userId ? await userRepo().findOne({ where: { id: req.userId } }) : null;

  const post = postRepo().create({
    slug,
    title: data.title,
    excerpt: data.excerpt?.trim() || null,
    content: data.content,
    category: data.category as BlogCategory,
    version: data.version?.trim() || null,
    pinned: data.pinned,
    status: data.status as BlogStatus,
    coverImageKey: data.coverImageKey?.trim() || null,
    commentsLocked: data.commentsLocked,
    author: author ?? null,
    publishedAt: data.status === "PUBLISHED" ? new Date() : null
  });
  await postRepo().save(post);
  await syncPostTags(post.id, data.tags);

  const saved = await postRepo().findOne({ where: { id: post.id }, relations: { author: true } });
  return res.status(201).json({ post: toAdminDto(saved!, await tagNamesForPost(post.id)) });
});

// PUT /admin/blog/:id — update.
router.put("/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
  }
  const data = parsed.data;

  const post = await postRepo().findOne({ where: { id } });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });

  // Re-slug only when the admin explicitly supplies one.
  if (data.slug && slugify(data.slug) !== post.slug) {
    post.slug = await uniqueSlug(slugify(data.slug), post.id);
  }

  const wasPublished = post.status === "PUBLISHED";

  post.title = data.title;
  post.excerpt = data.excerpt?.trim() || null;
  post.content = data.content;
  post.category = data.category as BlogCategory;
  post.version = data.version?.trim() || null;
  post.pinned = data.pinned;
  post.status = data.status as BlogStatus;
  post.coverImageKey = data.coverImageKey?.trim() || null;
  post.commentsLocked = data.commentsLocked;

  if (data.status === "PUBLISHED" && !wasPublished) {
    post.publishedAt = new Date();
  } else if (data.status === "DRAFT") {
    post.publishedAt = null;
  }

  await postRepo().save(post);
  await syncPostTags(post.id, data.tags);
  const saved = await postRepo().findOne({ where: { id: post.id }, relations: { author: true } });
  return res.json({ post: toAdminDto(saved!, await tagNamesForPost(post.id)) });
});

// DELETE /admin/blog/:id
router.delete("/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const post = await postRepo().findOne({ where: { id } });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });
  await postRepo().remove(post);
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Media upload — returns a public URL to embed in Markdown / use as cover.
// ---------------------------------------------------------------------------

router.post(
  "/media",
  authRequired,
  systemAdminGuard,
  imageUpload.single("file"),
  async (req: AuthRequest, res: Response) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "NO_FILE" });

    try {
      const ext = EXT_BY_MIME[file.mimetype] || "bin";
      const mediaKey = crypto.randomBytes(18).toString("base64url"); // ~24 chars, url-safe
      const storageKey = `${mediaKey}.${ext}`;
      fs.mkdirSync(BLOG_UPLOADS_ROOT, { recursive: true });
      fs.writeFileSync(path.join(BLOG_UPLOADS_ROOT, storageKey), file.buffer);

      await mediaRepo().save(
        mediaRepo().create({
          mediaKey,
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploaderType: "USER",
          uploaderId: req.userId ?? null
        })
      );

      return res.status(201).json({ key: mediaKey, url: mediaUrl(mediaKey) });
    } catch (err) {
      logger.error("[admin/blog] media upload failed", { requestId: req.requestId, err });
      return res.status(500).json({ message: "UPLOAD_FAILED" });
    }
  }
);

// ---------------------------------------------------------------------------
// Comment moderation
// ---------------------------------------------------------------------------

// POST /admin/blog/comments/:id/pin — toggle pin.
router.post("/comments/:id/pin", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const comment = await commentRepo().findOne({ where: { id } });
  if (!comment) return res.status(404).json({ message: "NOT_FOUND" });
  comment.pinned = !comment.pinned;
  await commentRepo().save(comment);
  return res.json({ ok: true, pinned: comment.pinned });
});

// POST /admin/blog/reports/:id/resolve — mark a report handled (optionally delete the comment).
router.post("/reports/:id/resolve", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const report = await reportRepo().findOne({ where: { id }, relations: { comment: true } });
  if (!report) return res.status(404).json({ message: "NOT_FOUND" });

  const deleteComment = req.body?.deleteComment === true;
  if (deleteComment && report.comment) {
    const commentId = report.comment.id;
    await commentRepo().delete({ id: commentId });
    // Resolve any other open reports for the same comment.
    await reportRepo().update({ commentId, status: "OPEN" }, { status: "RESOLVED" });
  } else {
    report.status = "RESOLVED";
    await reportRepo().save(report);
  }
  return res.json({ ok: true });
});

export default router;
