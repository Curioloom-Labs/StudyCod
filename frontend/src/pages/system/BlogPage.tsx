import React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { getMe } from "../../lib/api/profile";
import {
  listBlogPosts,
  getBlogPost,
  BLOG_CATEGORIES,
  type BlogCategory,
  type BlogPostListItem,
  type BlogPostDetail
} from "../../lib/api/blog";
import { BlogFeedExperience, BlogPostExperience } from "./BlogExperience";

type Tr = (uk: string, en: string) => string;

function useTr(): { tr: Tr; locale: string } {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  return { tr: (uk, en) => (isEn ? en : uk), locale: isEn ? "en-US" : "uk-UA" };
}


// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export const BlogPage: React.FC = () => {
  const { tag: tagParam } = useParams<{ tag?: string }>();
  const { tr, locale } = useTr();

  const [posts, setPosts] = React.useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<BlogCategory | "ALL">("ALL");
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) setIsAdmin(u.role === "SYSTEM_ADMIN");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params: { category?: BlogCategory; tag?: string } = {};
    if (category !== "ALL") params.category = category;
    if (tagParam) params.tag = tagParam;
    listBlogPosts(params)
      .then((res) => {
        if (!cancelled) setPosts(res.posts);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessageFromUnknown(err, tr("Не вдалося завантажити", "Failed to load")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, tagParam]);

  return <BlogFeedExperience
    tr={tr}
    locale={locale}
    tagParam={tagParam}
    posts={posts}
    loading={loading}
    error={error}
    category={category}
    setCategory={setCategory}
    isAdmin={isAdmin}
  />;
};

// ---------------------------------------------------------------------------
// Single post
// ---------------------------------------------------------------------------

export const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { tr, locale } = useTr();

  const [post, setPost] = React.useState<BlogPostDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    getMe().then((u) => setIsAdmin(u.role === "SYSTEM_ADMIN")).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPost(null);
    getBlogPost(slug)
      .then((p) => {
        if (!cancelled) setPost(p);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessageFromUnknown(err, tr("Запис не знайдено", "Post not found")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return <BlogPostExperience
    tr={tr}
    locale={locale}
    slug={slug}
    post={post}
    loading={loading}
    error={error}
    isAdmin={isAdmin}
  />;
};
