import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { getMe } from "../../lib/api/profile";
import {
  adminListBlogPosts,
  adminCreateBlogPost,
  adminUpdateBlogPost,
  adminDeleteBlogPost,
  BLOG_CATEGORIES,
  type AdminBlogPost,
  type BlogCategory,
  type BlogStatus,
  type BlogUpsertInput
} from "../../lib/api/blog";

type Tr = (uk: string, en: string) => string;

const CATEGORY_LABEL: Record<BlogCategory, [string, string]> = {
  NEWS: ["Новина", "News"],
  ANNOUNCEMENT: ["Анонс", "Announcement"],
  FEATURE: ["Нове", "Feature"],
  FIX: ["Виправлення", "Fix"],
  IMPROVEMENT: ["Покращення", "Improvement"]
};

const emptyForm: BlogUpsertInput = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "NEWS",
  version: "",
  pinned: false,
  status: "DRAFT"
};

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary";

export const BlogAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tr: Tr = (uk, en) => (isEn ? en : uk);

  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [posts, setPosts] = React.useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<BlogUpsertInput>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) setAllowed(u.role === "SYSTEM_ADMIN");
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = React.useCallback(() => {
    setLoading(true);
    adminListBlogPosts()
      .then(setPosts)
      .catch((err) => showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Помилка", "Error")) }))
      .finally(() => setLoading(false));
  }, [isEn]);

  React.useEffect(() => {
    if (allowed) reload();
  }, [allowed, reload]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (post: AdminBlogPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? "",
      content: post.content,
      category: post.category,
      version: post.version ?? "",
      pinned: post.pinned,
      status: post.status
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      showToast({ type: "error", message: tr("Заповніть заголовок і текст", "Title and content are required") });
      return;
    }
    setSaving(true);
    try {
      const payload: BlogUpsertInput = {
        ...form,
        slug: form.slug?.trim() || undefined,
        excerpt: form.excerpt?.trim() || null,
        version: form.version?.trim() || null
      };
      if (editingId == null) {
        await adminCreateBlogPost(payload);
        showToast({ type: "success", message: tr("Запис створено", "Post created") });
      } else {
        await adminUpdateBlogPost(editingId, payload);
        showToast({ type: "success", message: tr("Збережено", "Saved") });
      }
      startCreate();
      reload();
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося зберегти", "Failed to save")) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (post: AdminBlogPost) => {
    if (!window.confirm(tr(`Видалити «${post.title}»?`, `Delete "${post.title}"?`))) return;
    try {
      await adminDeleteBlogPost(post.id);
      if (editingId === post.id) startCreate();
      showToast({ type: "success", message: tr("Видалено", "Deleted") });
      reload();
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося видалити", "Failed to delete")) });
    }
  };

  if (allowed === null) {
    return <p className="py-16 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">{tr("Доступ лише для адміністраторів.", "Admins only.")}</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/blog")} className="mt-4">
          {tr("До блогу", "To blog")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <PageEyebrow label={tr("Керування блогом", "Blog admin")} />
          <h1 className="mt-2 text-2xl font-mono font-semibold text-text-primary">
            {tr("Девблог", "Devblog")}
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/blog")}>
          <ArrowLeft className="h-4 w-4" />
          {tr("До блогу", "To blog")}
        </Button>
      </div>

      {/* Editor */}
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {editingId == null ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {editingId == null ? tr("Новий запис", "New post") : tr("Редагування запису", "Edit post")}
        </div>

        <input
          className={inputCls}
          placeholder={tr("Заголовок", "Title")}
          value={form.title}
          maxLength={200}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className={inputCls}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BlogCategory }))}
          >
            {BLOG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tr(CATEGORY_LABEL[c][0], CATEGORY_LABEL[c][1])}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder={tr("Версія (необов'язково, напр. v1.4.0)", "Version (optional, e.g. v1.4.0)")}
            value={form.version ?? ""}
            maxLength={40}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
          />
        </div>

        <input
          className={inputCls}
          placeholder={tr("Slug (необов'язково — згенерується з заголовка)", "Slug (optional — generated from title)")}
          value={form.slug ?? ""}
          maxLength={180}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />

        <input
          className={inputCls}
          placeholder={tr("Короткий опис для стрічки", "Short excerpt for the feed")}
          value={form.excerpt ?? ""}
          maxLength={320}
          onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
        />

        <textarea
          className={`${inputCls} min-h-[200px] font-mono`}
          placeholder={tr("Текст (Markdown)", "Body (Markdown)")}
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
        />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
            />
            {tr("Закріпити", "Pinned")}
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.status === "PUBLISHED"}
              onChange={(e) => setForm((f) => ({ ...f, status: (e.target.checked ? "PUBLISHED" : "DRAFT") as BlogStatus }))}
            />
            {tr("Опублікувати", "Published")}
          </label>
          <div className="ml-auto flex gap-2">
            {editingId != null ? (
              <Button type="button" variant="ghost" size="sm" onClick={startCreate}>
                {tr("Скасувати", "Cancel")}
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? tr("Збереження…", "Saving…") : editingId == null ? tr("Створити", "Create") : tr("Зберегти", "Save")}
            </Button>
          </div>
        </div>
      </form>

      {/* List */}
      <div className="mt-8 space-y-2">
        <h2 className="text-sm font-mono font-semibold text-text-primary">{tr("Усі записи", "All posts")}</h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
        ) : posts.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">{tr("Ще немає записів.", "No posts yet.")}</p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">{post.title}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                      post.status === "PUBLISHED" ? "bg-emerald-500/10 text-emerald-500" : "bg-border/60 text-text-secondary"
                    }`}
                  >
                    {post.status === "PUBLISHED" ? tr("опубл.", "live") : tr("чернетка", "draft")}
                  </span>
                  {post.pinned ? <span className="text-[10px] text-primary">📌</span> : null}
                </div>
                <div className="truncate font-mono text-[11px] text-text-secondary">
                  /{post.slug} · {tr(CATEGORY_LABEL[post.category][0], CATEGORY_LABEL[post.category][1])}
                  {post.version ? ` · ${post.version}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(post)}
                className="rounded p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                aria-label={tr("Редагувати", "Edit")}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(post)}
                className="rounded p-1.5 text-text-secondary hover:bg-rose-500/10 hover:text-rose-500"
                aria-label={tr("Видалити", "Delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
