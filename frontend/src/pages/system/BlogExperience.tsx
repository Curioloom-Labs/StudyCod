import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  MessageSquare,
  Pin,
  Settings,
  Sparkles,
} from "lucide-react";
import { PublicProductNav } from "../../components/layout/PublicProductNav";
import { MarkdownView } from "../../components/MarkdownView";
import { ReactionBar } from "../../components/blog/ReactionBar";
import { CommentsSection } from "../../components/blog/CommentsSection";
import {
  BLOG_CATEGORIES,
  type BlogCategory,
  type BlogPostDetail,
  type BlogPostListItem,
} from "../../lib/api/blog";

type Tr = (uk: string, en: string) => string;

const CATEGORY_LABEL: Record<BlogCategory, [string, string]> = {
  NEWS: ["Новини", "News"],
  ANNOUNCEMENT: ["Анонси", "Announcements"],
  FEATURE: ["Можливості", "Features"],
  FIX: ["Виправлення", "Fixes"],
  IMPROVEMENT: ["Покращення", "Improvements"],
};

const CATEGORY_CLASS: Record<BlogCategory, string> = {
  NEWS: "bg-[#00ff88]/12 text-[#00884a] dark:text-[#65ecad]",
  ANNOUNCEMENT: "bg-[#ffd93d]/20 text-[#806500] dark:text-[#ffe16a]",
  FEATURE: "bg-[#ff8c00]/12 text-[#a85900] dark:text-[#ffad4a]",
  FIX: "bg-[#ff6b9d]/12 text-[#c43b6d] dark:text-[#ff8fb6]",
  IMPROVEMENT:
    "bg-[#dce6df] text-[#536158] dark:bg-white/[.07] dark:text-[#b2bdb5]",
};

const PREVIEW_POSTS: BlogPostListItem[] = [
  {
    slug: "new-studycod-handbook",
    title: "Новий StudyCod Handbook: знання без зайвого пошуку",
    excerpt:
      "Перебудували документацію навколо ролей, реальних сценаріїв і окремих сторінок для кожного гайду.",
    category: "FEATURE",
    version: "v2.4",
    pinned: true,
    author: "StudyCod Team",
    authorAvatar: null,
    publishedAt: "2026-07-08T09:00:00Z",
    coverUrl: null,
    readingMinutes: 5,
    tags: [
      { slug: "product", name: "product" },
      { slug: "docs", name: "docs" },
    ],
    commentCount: 7,
    reactionCount: 34,
  },
  {
    slug: "live-classroom-update",
    title: "Live Classroom: фокус на коді й взаємодії",
    excerpt:
      "Матеріали уроку, короткі challenges, черга запитань і live code тепер працюють як один навчальний простір.",
    category: "IMPROVEMENT",
    version: "v2.3",
    pinned: false,
    author: "StudyCod Team",
    authorAvatar: null,
    publishedAt: "2026-06-27T09:00:00Z",
    coverUrl: null,
    readingMinutes: 4,
    tags: [
      { slug: "edu", name: "EDU" },
      { slug: "live", name: "live" },
    ],
    commentCount: 3,
    reactionCount: 21,
  },
  {
    slug: "practice-workspace",
    title: "Практика без шуму: новий workspace задачі",
    excerpt:
      "Умова, редактор, запуск і результат перевірки отримали чіткіші ролі та спокійнішу композицію.",
    category: "FEATURE",
    version: "v2.2",
    pinned: false,
    author: "Product Team",
    authorAvatar: null,
    publishedAt: "2026-06-14T09:00:00Z",
    coverUrl: null,
    readingMinutes: 6,
    tags: [
      { slug: "practice", name: "practice" },
      { slug: "editor", name: "editor" },
    ],
    commentCount: 5,
    reactionCount: 29,
  },
  {
    slug: "dark-theme-polish",
    title: "Темна тема стала спокійнішою та контрастнішою",
    excerpt:
      "Оновили поверхні, стани, типографіку й акцентні кольори без повернення до terminal-естетики.",
    category: "IMPROVEMENT",
    version: "v2.1",
    pinned: false,
    author: "Design Team",
    authorAvatar: null,
    publishedAt: "2026-05-30T09:00:00Z",
    coverUrl: null,
    readingMinutes: 3,
    tags: [{ slug: "design", name: "design" }],
    commentCount: 2,
    reactionCount: 18,
  },
];

const previewContent = [
  "## Що змінилося",
  "",
  "Ми зібрали довідкові матеріали в окремий StudyCod Handbook. Тепер це не довга сторінка з випадковими блоками, а бібліотека практичних маршрутів для учнів, викладачів і самостійного навчання.",
  "",
  "### Окремий маршрут для кожного гайду",
  "",
  "Кожна інструкція має власну адресу, тематичну навігацію та логічний наступний матеріал. Посилання можна зберегти або надіслати без пояснення, до якого місця сторінки потрібно прокрутити.",
  "",
  "### Більше реального контексту",
  "",
  "- пояснення станів інтерфейсу;",
  "- типові помилки й способи перевірки;",
  "- короткі чеклісти перед важливими діями;",
  "- окремі сценарії Personal та EDU;",
  "- актуальні схеми продукту.",
  "",
  "## Що далі",
  "",
  "Handbook буде розвиватися разом із продуктом. Нові можливості отримуватимуть окремі матеріали, а зміни в навчальних сценаріях одразу відображатимуться у відповідних гайдах.",
].join("\n");

const previewDetail = (slug: string): BlogPostDetail => {
  const item =
    PREVIEW_POSTS.find((post) => post.slug === slug) || PREVIEW_POSTS[0];
  return {
    id: -1,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    content: previewContent,
    category: item.category,
    version: item.version,
    pinned: item.pinned,
    commentsLocked: true,
    author: item.author,
    authorAvatar: item.authorAvatar,
    publishedAt: item.publishedAt,
    updatedAt: item.publishedAt || new Date().toISOString(),
    coverUrl: item.coverUrl,
    readingMinutes: item.readingMinutes,
    tags: item.tags,
    reactions: [
      { emoji: "👍", count: 18, reacted: false },
      { emoji: "🚀", count: 9, reacted: false },
    ],
    related: PREVIEW_POSTS.filter((post) => post.slug !== item.slug)
      .slice(0, 3)
      .map((post) => ({
        slug: post.slug,
        title: post.title,
        coverUrl: null,
        category: post.category,
      })),
  };
};

const formatDate = (iso: string | null, locale: string) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const useBlogNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const preview =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("preview") === "true";
  const go = (path: string) =>
    navigate(
      path +
        (preview
          ? path.includes("?")
            ? "&preview=true"
            : "?preview=true"
          : ""),
    );
  return { navigate, go };
};

const CategoryPill: React.FC<{ category: BlogCategory; tr: Tr }> = ({
  category,
  tr,
}) => (
  <span
    className={
      "inline-flex rounded-full px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.1em] " +
      CATEGORY_CLASS[category]
    }
  >
    {tr(CATEGORY_LABEL[category][0], CATEGORY_LABEL[category][1])}
  </span>
);

const CoverVisual: React.FC<{
  post: BlogPostListItem | BlogPostDetail;
  compact?: boolean;
}> = ({ post, compact = false }) => {
  if (post.coverUrl)
    return (
      <img
        src={post.coverUrl}
        alt=""
        width={1200}
        height={675}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  const color =
    post.category === "FEATURE"
      ? "#ff8c00"
      : post.category === "FIX"
        ? "#ff6b9d"
        : post.category === "ANNOUNCEMENT"
          ? "#ffd93d"
          : "#00ff88";
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#101713]">
      <div
        className="absolute -right-16 -top-20 size-56 rounded-full blur-[70px]"
        style={{ backgroundColor: color + "26" }}
      />
      <div className="absolute -bottom-20 left-1/4 size-52 rounded-full bg-[#00ff88]/10 blur-[70px]" />
      <div
        className={
          "absolute inset-x-6 bottom-6 grid gap-2 " +
          (compact ? "grid-cols-4" : "grid-cols-5")
        }
      >
        {Array.from({ length: compact ? 8 : 15 }).map((_, index) => (
          <span
            key={index}
            className="h-2 rounded-full bg-white/10"
            style={{ width: 35 + ((index * 23) % 65) + "%" }}
          />
        ))}
      </div>
      <span className="absolute left-6 top-6 grid size-10 place-items-center rounded-[13px] border border-white/10 bg-white/[.06]">
        <Sparkles className="size-4" style={{ color }} />
      </span>
    </div>
  );
};

type FeedProps = {
  tr: Tr;
  locale: string;
  tagParam?: string;
  posts: BlogPostListItem[];
  loading: boolean;
  error: string | null;
  category: BlogCategory | "ALL";
  setCategory: (value: BlogCategory | "ALL") => void;
  isAdmin: boolean;
};

export const BlogFeedExperience: React.FC<FeedProps> = ({
  tr,
  locale,
  tagParam,
  posts,
  loading,
  error,
  category,
  setCategory,
  isAdmin,
}) => {
  const { navigate, go } = useBlogNavigation();
  const reduceMotion = useReducedMotion();
  const sourcePosts = posts.length
    ? posts
    : import.meta.env.DEV
      ? PREVIEW_POSTS
      : [];
  const displayPosts =
    category === "ALL"
      ? sourcePosts
      : sourcePosts.filter((post) => post.category === category);
  const featured = displayPosts[0];
  const remaining = displayPosts.slice(1);
  const showError = Boolean(error && !sourcePosts.length);

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav active="blog" />
      <main>
        <section className="mx-auto w-[min(1240px,calc(100%_-_48px))] pt-8 max-md:w-[calc(100%_-_28px)]">
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[32px] bg-[#101713] px-[clamp(24px,6vw,76px)] py-[clamp(52px,7vw,82px)] text-white"
          >
            <div className="absolute -right-24 -top-40 size-[420px] rounded-full bg-[#00ff88]/10 blur-[100px]" />
            <div className="relative flex flex-wrap items-end justify-between gap-8">
              <div className="max-w-[750px]">
                <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#65ecad]">
                  StudyCod Journal
                </span>
                <h1 className="mt-5 text-balance text-[clamp(42px,6vw,74px)] font-extrabold leading-[.98] tracking-[-.055em]">
                  {tagParam
                    ? "#" + tagParam
                    : tr(
                        "Розповідаємо, як розвивається навчання.",
                        "How the learning experience evolves.",
                      )}
                </h1>
                <p className="mt-6 max-w-[610px] text-[16px] leading-7 text-[#aab5ad]">
                  {tr(
                    "Оновлення продукту, педагогічні рішення й деталі, які роблять практику програмування зрозумілішою.",
                    "Product updates, teaching decisions, and details that make programming practice clearer.",
                  )}
                </p>
              </div>
              {isAdmin && (
                <button type="button"
                  onClick={() => navigate("/blog/admin")}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-white/10 bg-white/[.06] px-4 text-[11px] font-bold text-[#c2ccc5]"
                >
                  <Settings className="size-4" />
                  {tr("Керування", "Manage")}
                </button>
              )}
            </div>
          </motion.div>
        </section>

        <section className="mx-auto w-[min(1120px,calc(100%_-_48px))] py-16 max-md:w-[calc(100%_-_28px)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#65ecad]">
                {tr("Журнал продукту", "Product journal")}
              </span>
              <h2 className="mt-2 text-[32px] font-bold tracking-[-.045em]">
                {tr("Останні матеріали", "Latest stories")}
              </h2>
            </div>
            {!tagParam && (
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[#122017]/10 bg-white p-1 dark:border-white/10 dark:bg-[#151c17]">
                {(["ALL", ...BLOG_CATEGORIES] as const).map((value) => (
                  <button type="button"
                    key={value}
                    onClick={() => setCategory(value)}
                    className={
                      "whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[10px] font-bold transition " +
                      (category === value
                        ? "bg-[#111814] text-white dark:bg-[#edf3ef] dark:text-[#111814]"
                        : "text-[#718078] dark:text-[#96a299]")
                    }
                  >
                    {value === "ALL"
                      ? tr("Усі", "All")
                      : tr(CATEGORY_LABEL[value][0], CATEGORY_LABEL[value][1])}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && !sourcePosts.length ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="h-[420px] animate-pulse rounded-[26px] bg-[#e9ede8] dark:bg-[#151c17]" />
              <div className="h-[420px] animate-pulse rounded-[26px] bg-[#e9ede8] dark:bg-[#151c17]" />
            </div>
          ) : showError ? (
            <div className="mt-8 rounded-[24px] border border-[#ff6b9d]/20 bg-[#ff6b9d]/5 p-8 text-center text-[14px] text-[#b83b67]">
              {error}
            </div>
          ) : featured ? (
            <>
          <button type="button"
            onClick={() => go("/blog/" + featured.slug)}
                className="group mt-8 grid w-full overflow-hidden rounded-[27px] border border-[#122017]/10 bg-white text-left shadow-[0_20px_65px_rgba(18,32,23,.055)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#151c17] md:grid-cols-[1.1fr_.9fr]"
              >
                <div className="min-h-[320px]">
                  <CoverVisual post={featured} />
                </div>
                <div className="flex flex-col p-[clamp(24px,5vw,48px)]">
                  <div className="flex items-center gap-3">
                    <CategoryPill category={featured.category} tr={tr} />
                    {featured.pinned && (
                      <Pin className="size-3.5 text-[#00a85c]" />
                    )}
                    <span className="ml-auto text-[10px] text-[#7c8980]">
                      {formatDate(featured.publishedAt, locale)}
                    </span>
                  </div>
                  <h3 className="mt-7 text-[clamp(25px,3vw,36px)] font-bold leading-[1.08] tracking-[-.045em]">
                    {featured.title}
                  </h3>
                  <p className="mt-5 text-[14px] leading-6 text-[#667169] dark:text-[#a5b0a8]">
                    {featured.excerpt}
                  </p>
                  <div className="mt-auto flex items-center gap-5 pt-8 text-[10px] text-[#7a867e]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {featured.readingMinutes} {tr("хв", "min")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" />
                      {featured.commentCount}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-[#00884a] transition group-hover:gap-2 dark:text-[#65ecad]">
                      {tr("Читати", "Read")}
                      <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                </div>
              </button>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {remaining.map((post) => (
                  <button type="button"
                    key={post.slug}
                onClick={() => go("/blog/" + post.slug)}
                    className="group overflow-hidden rounded-[24px] border border-[#122017]/10 bg-white text-left transition hover:-translate-y-0.5 hover:border-[#00b963]/25 dark:border-white/10 dark:bg-[#151c17]"
                  >
                    <div className="h-44">
                      <CoverVisual post={post} compact />
                    </div>
                    <div className="p-6">
                      <div className="flex items-center gap-3">
                        <CategoryPill category={post.category} tr={tr} />
                        <span className="ml-auto text-[9px] text-[#7c8980]">
                          {formatDate(post.publishedAt, locale)}
                        </span>
                      </div>
                      <h3 className="mt-5 text-[20px] font-bold leading-[1.2] tracking-[-.035em]">
                        {post.title}
                      </h3>
                      <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-[#6c796f] dark:text-[#9da9a1]">
                        {post.excerpt}
                      </p>
                      <div className="mt-6 flex items-center gap-4 text-[9px] text-[#7c8980]">
                        <span>
                          {post.readingMinutes} {tr("хв читання", "min read")}
                        </span>
                        <span>
                          {post.reactionCount} {tr("реакцій", "reactions")}
                        </span>
                        <ArrowRight className="ml-auto size-4 transition group-hover:translate-x-1 group-hover:text-[#00a85c]" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-[24px] border border-[#122017]/10 bg-white p-12 text-center text-[14px] text-[#718078] dark:border-white/10 dark:bg-[#151c17]">
              {tr(
                "У цій категорії поки немає матеріалів.",
                "No stories in this category yet.",
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

type PostProps = {
  tr: Tr;
  locale: string;
  slug?: string;
  post: BlogPostDetail | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
};

export const BlogPostExperience: React.FC<PostProps> = ({
  tr,
  locale,
  slug,
  post,
  loading,
  error,
  isAdmin,
}) => {
  const { go } = useBlogNavigation();
  const reduceMotion = useReducedMotion();
  const resolved =
    post || (import.meta.env.DEV && slug ? previewDetail(slug) : null);
  if (loading && !resolved)
    return (
      <div className="min-h-[100dvh] bg-[#f7f8f5] dark:bg-[#0b100d]">
        <PublicProductNav active="blog" />
        <div className="mx-auto mt-12 h-[620px] w-[min(900px,calc(100%_-_32px))] animate-pulse rounded-[28px] bg-[#e8ece7] dark:bg-[#151c17]" />
      </div>
    );
  if (!resolved)
    return (
      <div className="min-h-[100dvh] bg-[#f7f8f5] dark:bg-[#0b100d]">
        <PublicProductNav active="blog" />
        <div className="mx-auto mt-16 w-[min(720px,calc(100%_-_32px))] rounded-[24px] border border-[#ff6b9d]/20 p-10 text-center text-[#c23e6c]">
          {error || tr("Матеріал не знайдено", "Story not found")}
        </div>
      </div>
    );

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav active="blog" />
      <main id="main-content" className="mx-auto w-[min(1080px,calc(100%_-_32px))] py-10">
        <button type="button"
        onClick={() => go("/blog")}
          className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#122017]/10 bg-white px-4 text-[11px] font-bold text-[#667169] dark:border-white/10 dark:bg-[#151c17] dark:text-[#a5b0a8]"
        >
          <ArrowLeft className="size-4" />
          {tr("До журналу", "Back to journal")}
        </button>
        <motion.article
          initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          className="mt-7 overflow-hidden rounded-[30px] border border-[#122017]/10 bg-white shadow-[0_26px_80px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111713]"
        >
          <div className="h-[clamp(260px,42vw,480px)]">
            <CoverVisual post={resolved} />
          </div>
          <header className="mx-auto max-w-[820px] px-6 pb-12 pt-12 sm:px-10">
            <div className="flex flex-wrap items-center gap-3">
              <CategoryPill category={resolved.category} tr={tr} />
              {resolved.version && (
                <span className="text-[10px] font-semibold text-[#7b877f]">
                  {resolved.version}
                </span>
              )}
              <span className="ml-auto text-[10px] text-[#7b877f]">
                {formatDate(resolved.publishedAt, locale)}
              </span>
            </div>
            <h1 className="mt-7 text-balance text-[clamp(36px,6vw,64px)] font-extrabold leading-[1.02] tracking-[-.055em]">
              {resolved.title}
            </h1>
            {resolved.excerpt && (
              <p className="mt-6 text-[17px] leading-8 text-[#667169] dark:text-[#a8b3ab]">
                {resolved.excerpt}
              </p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-4 text-[10px] text-[#7b877f]">
              <span>{resolved.author || "StudyCod Team"}</span>
              <span>·</span>
              <span>
                {resolved.readingMinutes} {tr("хв читання", "min read")}
              </span>
              {resolved.tags.map((tag) => (
                <button type="button"
                  key={tag.slug}
                    onClick={() => go("/blog/tag/" + tag.slug)}
                  className="rounded-full bg-[#eef2ed] px-2.5 py-1.5 dark:bg-white/[.06]"
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          </header>
          <div className="border-t border-[#122017]/10 dark:border-white/10">
            <div className="mx-auto max-w-[820px] px-6 py-12 sm:px-10">
              <MarkdownView content={resolved.content} variant="handbook" />
              <div className="mt-12 border-t border-[#122017]/10 pt-6 dark:border-white/10">
                <ReactionBar
                  targetType="POST"
                  targetId={resolved.id}
                  initial={resolved.reactions}
                />
              </div>
              {resolved.related.length > 0 && (
                <div className="mt-14">
                  <h2 className="text-[24px] font-bold">
                    {tr("Продовжити читання", "Continue reading")}
                  </h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {resolved.related.map((item) => (
                      <button type="button"
                        key={item.slug}
                            onClick={() => go("/blog/" + item.slug)}
                        className="rounded-[18px] border border-[#122017]/10 bg-[#f7f9f6] p-4 text-left transition hover:border-[#00b963]/25 dark:border-white/10 dark:bg-white/[.035]"
                      >
                        <CategoryPill category={item.category} tr={tr} />
                        <strong className="mt-4 block text-[13px] leading-5">
                          {item.title}
                        </strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {resolved.id > 0 && (
                <CommentsSection
                  slug={resolved.slug}
                  isAdmin={isAdmin}
                  initialLocked={resolved.commentsLocked}
                />
              )}
            </div>
          </div>
        </motion.article>
      </main>
    </div>
  );
};
