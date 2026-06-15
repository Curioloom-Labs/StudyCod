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

export type BlogPostListItem = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: BlogCategory;
  version: string | null;
  pinned: boolean;
  author: string | null;
  publishedAt: string | null;
};

export type BlogPostDetail = BlogPostListItem & {
  content: string;
  updatedAt: string;
};

export type AdminBlogPost = BlogPostListItem & {
  id: number;
  content: string;
  status: BlogStatus;
  createdAt: string;
  updatedAt: string;
};

export type BlogListResponse = {
  posts: BlogPostListItem[];
  total: number;
  limit: number;
  offset: number;
};

// ---- Public (authenticated) reads ----

export async function listBlogPosts(params: {
  category?: BlogCategory;
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
