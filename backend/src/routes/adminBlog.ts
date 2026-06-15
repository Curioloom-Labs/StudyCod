import { Router, Response } from "express";
import { z } from "zod";
import { Not } from "typeorm";

import { AppDataSource } from "../data-source";
import { BlogPost, BLOG_CATEGORIES, BlogCategory, BlogStatus } from "../entities/BlogPost";
import { User } from "../entities/User";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";

const router = Router();

const postRepo = () => AppDataSource.getRepository(BlogPost);
const userRepo = () => AppDataSource.getRepository(User);

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

function toAdminDto(post: BlogPost) {
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
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

// GET /admin/blog — all posts (drafts included), newest first.
router.get("/", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
  const posts = await postRepo().find({
    relations: { author: true },
    order: { createdAt: "DESC", id: "DESC" }
  });
  return res.json({ posts: posts.map(toAdminDto) });
});

// GET /admin/blog/:id — single post for editing.
router.get("/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
  const post = await postRepo().findOne({ where: { id }, relations: { author: true } });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });
  return res.json({ post: toAdminDto(post) });
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
    author: author ?? null,
    publishedAt: data.status === "PUBLISHED" ? new Date() : null
  });
  await postRepo().save(post);

  const saved = await postRepo().findOne({ where: { id: post.id }, relations: { author: true } });
  return res.status(201).json({ post: toAdminDto(saved!) });
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

  if (data.status === "PUBLISHED" && !wasPublished) {
    post.publishedAt = new Date();
  } else if (data.status === "DRAFT") {
    post.publishedAt = null;
  }

  await postRepo().save(post);
  const saved = await postRepo().findOne({ where: { id: post.id }, relations: { author: true } });
  return res.json({ post: toAdminDto(saved!) });
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

export default router;
