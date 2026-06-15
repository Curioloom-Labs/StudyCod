import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Pin, Settings, Tag } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { MarkdownView } from "../../components/MarkdownView";
import { fadeUpItem, staggerContainer, easeOutQuint } from "../../lib/motion";
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

type Tr = (uk: string, en: string) => string;

function useTr(): { tr: Tr; locale: string } {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  return {
    tr: (uk, en) => (isEn ? en : uk),
    locale: isEn ? "en-US" : "uk-UA"
  };
}

const CATEGORY_LABEL: Record<BlogCategory, [string, string]> = {
  NEWS: ["Новина", "News"],
  ANNOUNCEMENT: ["Анонс", "Announcement"],
  FEATURE: ["Нове", "Feature"],
  FIX: ["Виправлення", "Fix"],
  IMPROVEMENT: ["Покращення", "Improvement"]
};

const CATEGORY_STYLE: Record<BlogCategory, string> = {
  NEWS: "bg-primary/10 text-primary border-primary/20",
  ANNOUNCEMENT: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  FEATURE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  FIX: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  IMPROVEMENT: "bg-sky-500/10 text-sky-500 border-sky-500/20"
};

const CategoryBadge: React.FC<{ category: BlogCategory; tr: Tr }> = ({ category, tr }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wide ${CATEGORY_STYLE[category]}`}
  >
    <Tag className="h-3 w-3" />
    {tr(CATEGORY_LABEL[category][0], CATEGORY_LABEL[category][1])}
  </span>
);

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export const BlogPage: React.FC = () => {
  const navigate = useNavigate();
  const { tr, locale } = useTr();
  const prefersReducedMotion = useReducedMotion();

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
    listBlogPosts(category === "ALL" ? {} : { category })
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
  }, [category]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? undefined : "hidden"}
        animate={prefersReducedMotion ? undefined : "show"}
      >
        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <PageEyebrow label={tr("Девблог", "Devblog")} />
              <h1 className="mt-3 text-2xl font-mono font-semibold text-text-primary">
                {tr("Новини та оновлення", "News & updates")}
              </h1>
            </div>
            {isAdmin ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/blog/admin")}>
                <Settings className="h-4 w-4" />
                {tr("Керування", "Manage")}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {tr(
              "Що нового у StudyCod: анонси, зміни та виправлення.",
              "What's new in StudyCod: announcements, changes and fixes."
            )}
          </p>
        </motion.div>

        <motion.div
          variants={prefersReducedMotion ? undefined : fadeUpItem}
          className="mt-6 flex flex-wrap gap-2"
        >
          {(["ALL", ...BLOG_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-mono transition ${
                category === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-text-secondary hover:border-primary/40 hover:text-text-primary"
              }`}
            >
              {c === "ALL" ? tr("Усі", "All") : tr(CATEGORY_LABEL[c][0], CATEGORY_LABEL[c][1])}
            </button>
          ))}
        </motion.div>

        <div className="mt-6 space-y-3">
          {loading ? (
            <p className="py-12 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
          ) : error ? (
            <p className="py-12 text-center text-sm text-rose-500">{error}</p>
          ) : posts.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-secondary">
              {tr("Поки що немає записів.", "No posts yet.")}
            </p>
          ) : (
            posts.map((post) => (
              <motion.button
                key={post.slug}
                type="button"
                variants={prefersReducedMotion ? undefined : fadeUpItem}
                onClick={() => navigate(`/blog/${post.slug}`)}
                className="block w-full rounded-xl border border-border bg-surface p-4 text-left transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={post.category} tr={tr} />
                  {post.version ? (
                    <span className="font-mono text-[11px] text-text-secondary">{post.version}</span>
                  ) : null}
                  {post.pinned ? <Pin className="h-3.5 w-3.5 text-primary" /> : null}
                  <span className="ml-auto font-mono text-[11px] text-text-secondary">
                    {formatDate(post.publishedAt, locale)}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-semibold text-text-primary">{post.title}</h2>
                {post.excerpt ? (
                  <p className="mt-1 text-sm leading-6 text-text-secondary line-clamp-2">{post.excerpt}</p>
                ) : null}
              </motion.button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single post
// ---------------------------------------------------------------------------

export const BlogPostPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { tr, locale } = useTr();
  const prefersReducedMotion = useReducedMotion();

  const [post, setPost] = React.useState<BlogPostDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/blog")} className="mb-4">
        <ArrowLeft className="h-4 w-4" />
        {tr("До всіх записів", "Back to all posts")}
      </Button>

      {loading ? (
        <p className="py-12 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
      ) : error ? (
        <p className="py-12 text-center text-sm text-rose-500">{error}</p>
      ) : post ? (
        <motion.article
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOutQuint }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={post.category} tr={tr} />
            {post.version ? (
              <span className="font-mono text-xs text-text-secondary">{post.version}</span>
            ) : null}
            {post.pinned ? <Pin className="h-4 w-4 text-primary" /> : null}
          </div>
          <h1 className="mt-3 text-2xl font-mono font-semibold text-text-primary">{post.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>{formatDate(post.publishedAt, locale)}</span>
            {post.author ? (
              <>
                <span aria-hidden>·</span>
                <span>{post.author}</span>
              </>
            ) : null}
          </div>
          <div className="mt-6 border-t border-border pt-6">
            <MarkdownView content={post.content} />
          </div>
        </motion.article>
      ) : null}
    </div>
  );
};
