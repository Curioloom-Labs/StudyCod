import { Router, Response } from "express";
import { z } from "zod";

import { AppDataSource } from "../data-source";
import { BlogPost, BLOG_CATEGORIES } from "../entities/BlogPost";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";

const router = Router();

const postRepo = () => AppDataSource.getRepository(BlogPost);

function authorName(post: BlogPost): string | null {
  const a = post.author;
  if (!a) return null;
  const full = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  return full || a.username || null;
}

/** Lightweight shape for the feed list (no full body). */
function toListDto(post: BlogPost) {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    version: post.version,
    pinned: post.pinned,
    author: authorName(post),
    publishedAt: post.publishedAt
  };
}

function toDetailDto(post: BlogPost) {
  return {
    ...toListDto(post),
    content: post.content,
    updatedAt: post.updatedAt
  };
}

const listQuerySchema = z.object({
  category: z.enum(BLOG_CATEGORIES as [string, ...string[]]).optional(),
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
  const { category, q, limit, offset } = parsed.data;

  const qb = postRepo()
    .createQueryBuilder("post")
    .leftJoinAndSelect("post.author", "author")
    .where("post.status = :status", { status: "PUBLISHED" });

  if (category) qb.andWhere("post.category = :category", { category });
  if (q) {
    qb.andWhere("(post.title LIKE :q OR post.excerpt LIKE :q)", { q: `%${q}%` });
  }

  qb.orderBy("post.pinned", "DESC")
    .addOrderBy("post.publishedAt", "DESC")
    .addOrderBy("post.id", "DESC")
    .take(limit)
    .skip(offset);

  const [posts, total] = await qb.getManyAndCount();
  return res.json({ posts: posts.map(toListDto), total, limit, offset });
});

// GET /blog/:slug — single published post.
router.get("/:slug", authRequired, async (req: AuthRequest, res: Response) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(404).json({ message: "NOT_FOUND" });

  const post = await postRepo().findOne({
    where: { slug, status: "PUBLISHED" },
    relations: { author: true }
  });
  if (!post) return res.status(404).json({ message: "NOT_FOUND" });

  return res.json({ post: toDetailDto(post) });
});

export default router;
