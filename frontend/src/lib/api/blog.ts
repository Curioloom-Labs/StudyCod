import { api } from "./client";

export type BlogCategory = "NEWS" | "ANNOUNCEMENT" | "FEATURE" | "FIX" | "IMPROVEMENT";
export type BlogStatus = "DRAFT" | "PUBLISHED";

export const BLOG_CATEGORIES: BlogCategory[] = [
  "NEWS",
  "ANNOUNCEMENT",
  "FEATURE",
  "FIX",
  "IMPROVEMENT"
];

export const BLOG_REACTION_EMOJIS = ["👍", "❤️", "🎉", "🚀", "👀"];

export type BlogTag = { slug: string; name: string };
export type BlogTagWithCount = BlogTag & { count: number };

export type ReactionItem = { emoji: string; count: number; reacted: boolean };

export type BlogPostListItem = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: BlogCategory;
  version: string | null;
  pinned: boolean;
  author: string | null;
  authorAvatar: string | null;
  publishedAt: string | null;
  coverUrl: string | null;
  readingMinutes: number;
  tags: BlogTag[];
  commentCount: number;
  reactionCount: number;
};

export type RelatedPost = { slug: string; title: string; coverUrl: string | null; category: BlogCategory };

export type BlogPostDetail = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: BlogCategory;
  version: string | null;
  pinned: boolean;
  commentsLocked: boolean;
  author: string | null;
  authorAvatar: string | null;
  publishedAt: string | null;
  updatedAt: string;
  coverUrl: string | null;
  readingMinutes: number;
  tags: BlogTag[];
  reactions: ReactionItem[];
  related: RelatedPost[];
};

export type BlogComment = {
  id: number;
  parentId: number | null;
  content: string;
  pinned: boolean;
  editedAt: string | null;
  createdAt: string;
  author: string;
  authorAvatar: string | null;
  canManage: boolean;
  mine: boolean;
  reactionCount: number;
  myReaction: string | null;
  replies: BlogComment[];
};

export type AdminBlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: BlogCategory;
  version: string | null;
  pinned: boolean;
  status: BlogStatus;
  coverImageKey: string | null;
  coverUrl: string | null;
  commentsLocked: boolean;
  tags: string[];
  author: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogListResponse = {
  posts: BlogPostListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminCommentReport = {
  id: number;
  commentId: number | null;
  commentContent: string | null;
  reason: string | null;
  reporter: string;
  postSlug: string | null;
  postTitle: string | null;
  createdAt: string;
};

// ---- Public (authenticated) reads ----

export async function listBlogPosts(params: {
  category?: BlogCategory;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<BlogListResponse> {
  const res = await api.get("/blog", { params });
  return res.data;
}

export async function getBlogPost(slug: string): Promise<BlogPostDetail> {
  const res = await api.get(`/blog/${encodeURIComponent(slug)}`);
  return res.data.post;
}

export async function getBlogTags(): Promise<BlogTagWithCount[]> {
  const res = await api.get("/blog/tags");
  return res.data.tags;
}

export async function getBlogComments(
  slug: string
): Promise<{ comments: BlogComment[]; commentsLocked: boolean }> {
  const res = await api.get(`/blog/${encodeURIComponent(slug)}/comments`);
  return res.data;
}

export async function createBlogComment(
  slug: string,
  input: { content: string; parentId?: number }
): Promise<{ comments: BlogComment[] }> {
  const res = await api.post(`/blog/${encodeURIComponent(slug)}/comments`, input);
  return res.data;
}

export async function editBlogComment(id: number, content: string): Promise<void> {
  await api.put(`/blog/comments/${id}`, { content });
}

export async function deleteBlogComment(id: number): Promise<void> {
  await api.delete(`/blog/comments/${id}`);
}

export async function reportBlogComment(id: number, reason?: string): Promise<void> {
  await api.post(`/blog/comments/${id}/report`, { reason });
}

export async function reactToBlog(input: {
  targetType: "POST" | "COMMENT";
  targetId: number;
  emoji: string;
}): Promise<{ reactions: ReactionItem[]; total: number }> {
  const res = await api.post("/blog/reactions", input);
  return res.data;
}

// ---- Admin CRUD (SYSTEM_ADMIN) ----

export type BlogUpsertInput = {
  title: string;
  slug?: string;
  excerpt?: string | null;
  content: string;
  category: BlogCategory;
  version?: string | null;
  pinned?: boolean;
  status: BlogStatus;
  coverImageKey?: string | null;
  commentsLocked?: boolean;
  tags?: string[];
};

export async function adminListBlogPosts(): Promise<AdminBlogPost[]> {
  const res = await api.get("/admin/blog");
  return res.data.posts;
}

export async function adminGetBlogPost(id: number): Promise<AdminBlogPost> {
  const res = await api.get(`/admin/blog/${id}`);
  return res.data.post;
}

export async function adminCreateBlogPost(input: BlogUpsertInput): Promise<AdminBlogPost> {
  const res = await api.post("/admin/blog", input);
  return res.data.post;
}

export async function adminUpdateBlogPost(id: number, input: BlogUpsertInput): Promise<AdminBlogPost> {
  const res = await api.put(`/admin/blog/${id}`, input);
  return res.data.post;
}

export async function adminDeleteBlogPost(id: number): Promise<void> {
  await api.delete(`/admin/blog/${id}`);
}

export async function adminUploadBlogMedia(file: File): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/admin/blog/media", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return res.data;
}

export async function adminPinComment(id: number): Promise<{ pinned: boolean }> {
  const res = await api.post(`/admin/blog/comments/${id}/pin`);
  return res.data;
}

export async function adminGetReports(): Promise<AdminCommentReport[]> {
  const res = await api.get("/admin/blog/reports");
  return res.data.reports;
}

export async function adminResolveReport(id: number, deleteComment: boolean): Promise<void> {
  await api.post(`/admin/blog/reports/${id}/resolve`, { deleteComment });
}
