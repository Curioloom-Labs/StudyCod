import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, Flag, Image as ImageIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { MarkdownView } from "../../components/MarkdownView";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { getMe } from "../../lib/api/profile";
import {
  adminListBlogPosts,
  adminCreateBlogPost,
  adminUpdateBlogPost,
  adminDeleteBlogPost,
  adminUploadBlogMedia,
  adminGetReports,
  adminResolveReport,
  BLOG_CATEGORIES,
  type AdminBlogPost,
  type AdminCommentReport,
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

type FormState = BlogUpsertInput & {
  coverUrl?: string | null;
};

const emptyForm: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "NEWS",
  version: "",
  pinned: false,
  status: "DRAFT",
  coverImageKey: null,
  coverUrl: null,
  commentsLocked: false,
  tags: []
};

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary";

export const BlogAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tr: Tr = (uk, en) => (isEn ? en : uk);

  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [tab, setTab] = React.useState<"posts" | "reports">("posts");
  const [posts, setPosts] = React.useState<AdminBlogPost[]>([]);
  const [reports, setReports] = React.useState<AdminCommentReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [tagInput, setTagInput] = React.useState("");
  const [uploadingCover, setUploadingCover] = React.useState(false);
  const [uploadingInline, setUploadingInline] = React.useState(false);

  const contentRef = React.useRef<HTMLTextAreaElement>(null);

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
    Promise.all([adminListBlogPosts(), adminGetReports()])
      .then(([p, r]) => {
        setPosts(p);
        setReports(r);
      })
      .catch((err) => showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Помилка", "Error")) }))
      .finally(() => setLoading(false));
  }, [isEn]);

  React.useEffect(() => {
    if (allowed) reload();
  }, [allowed, reload]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowPreview(false);
    setTagInput("");
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
      status: post.status,
      coverImageKey: post.coverImageKey,
      coverUrl: post.coverUrl,
      commentsLocked: post.commentsLocked,
      tags: post.tags
    });
    setTagInput("");
    setShowPreview(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const res = await adminUploadBlogMedia(file);
      setForm((f) => ({ ...f, coverImageKey: res.key, coverUrl: res.url }));
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося завантажити", "Upload failed")) });
    } finally {
      setUploadingCover(false);
    }
  };

  const uploadInline = async (file: File) => {
    setUploadingInline(true);
    try {
      const res = await adminUploadBlogMedia(file);
      const md = `\n![](${res.url})\n`;
      const el = contentRef.current;
      if (el) {
        const start = el.selectionStart ?? form.content.length;
        const end = el.selectionEnd ?? form.content.length;
        const next = form.content.slice(0, start) + md + form.content.slice(end);
        setForm((f) => ({ ...f, content: next }));
      } else {
        setForm((f) => ({ ...f, content: f.content + md }));
      }
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося завантажити", "Upload failed")) });
    } finally {
      setUploadingInline(false);
    }
  };

  const addTag = (raw: string) => {
    const name = raw.trim().replace(/,$/, "").trim();
    if (!name) return;
    setForm((f) => (f.tags?.includes(name) ? f : { ...f, tags: [...(f.tags ?? []), name] }));
    setTagInput("");
  };

  const removeTag = (name: string) => {
    setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((t) => t !== name) }));
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
        title: form.title,
        slug: form.slug?.trim() || undefined,
        excerpt: form.excerpt?.trim() || null,
        content: form.content,
        category: form.category,
        version: form.version?.trim() || null,
        pinned: form.pinned,
        status: form.status,
        coverImageKey: form.coverImageKey || null,
        commentsLocked: form.commentsLocked,
        tags: form.tags ?? []
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

  const resolveReport = async (report: AdminCommentReport, del: boolean) => {
    try {
      await adminResolveReport(report.id, del);
      showToast({ type: "success", message: del ? tr("Коментар видалено", "Comment deleted") : tr("Закрито", "Resolved") });
      reload();
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося", "Failed")) });
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
          <h1 className="mt-2 text-2xl font-mono font-semibold text-text-primary">{tr("Девблог", "Devblog")}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/blog")}>
          <ArrowLeft className="h-4 w-4" />
          {tr("До блогу", "To blog")}
        </Button>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => setTab("posts")}
          className={`rounded-full border px-3 py-1 text-xs font-mono ${tab === "posts" ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}
        >
          {tr("Записи", "Posts")}
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-mono ${tab === "reports" ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}
        >
          <Flag className="h-3 w-3" />
          {tr("Скарги", "Reports")}
          {reports.length > 0 ? <span className="rounded-full bg-rose-500/20 px-1.5 text-rose-500">{reports.length}</span> : null}
        </button>
      </div>

      {tab === "posts" ? (
        <>
          <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                {editingId == null ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editingId == null ? tr("Новий запис", "New post") : tr("Редагування запису", "Edit post")}
              </div>
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${showPreview ? "border-primary text-primary" : "border-border text-text-secondary"}`}
              >
                <Eye className="h-3.5 w-3.5" />
                {tr("Прев'ю", "Preview")}
              </button>
            </div>

            <input
              className={inputCls}
              placeholder={tr("Заголовок", "Title")}
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />

            {/* Cover */}
            <div className="flex items-center gap-3">
              {form.coverUrl ? (
                <img src={form.coverUrl} alt="" className="h-16 w-28 rounded border border-border object-cover" />
              ) : (
                <div className="flex h-16 w-28 items-center justify-center rounded border border-dashed border-border text-[10px] text-text-secondary">
                  {tr("Без обкладинки", "No cover")}
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary hover:border-primary/40">
                <ImageIcon className="h-3.5 w-3.5" />
                {uploadingCover ? tr("Завантаження…", "Uploading…") : tr("Обкладинка", "Cover")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {form.coverUrl ? (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, coverImageKey: null, coverUrl: null }))}
                  className="text-xs text-text-secondary hover:text-rose-500"
                >
                  {tr("Прибрати", "Remove")}
                </button>
              ) : null}
            </div>

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
                placeholder={tr("Версія (напр. v1.4.0)", "Version (e.g. v1.4.0)")}
                value={form.version ?? ""}
                maxLength={40}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              />
            </div>

            <input
              className={inputCls}
              placeholder={tr("Slug (необов'язково)", "Slug (optional)")}
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

            {/* Tags */}
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(form.tags ?? []).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-bg-hover px-2 py-0.5 text-xs font-mono text-text-primary">
                    #{t}
                    <button type="button" onClick={() => removeTag(t)} className="text-text-secondary hover:text-rose-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                className={`${inputCls} mt-1.5`}
                placeholder={tr("Додати тег і Enter", "Add a tag and press Enter")}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => addTag(tagInput)}
              />
            </div>

            {/* Content + preview */}
            <div className={showPreview ? "grid gap-3 lg:grid-cols-2" : ""}>
              <div className="space-y-2">
                <textarea
                  ref={contentRef}
                  className={`${inputCls} min-h-[220px] font-mono`}
                  placeholder={tr("Текст (Markdown)", "Body (Markdown)")}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-primary/40">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {uploadingInline ? tr("Завантаження…", "Uploading…") : tr("Вставити фото в текст", "Insert image")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadInline(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {showPreview ? (
                <div className="min-h-[220px] rounded-lg border border-border bg-bg-base p-3">
                  {form.content.trim() ? (
                    <MarkdownView content={form.content} />
                  ) : (
                    <p className="text-xs text-text-secondary">{tr("Тут буде прев'ю", "Preview appears here")}</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} />
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
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={!!form.commentsLocked}
                  onChange={(e) => setForm((f) => ({ ...f, commentsLocked: e.target.checked }))}
                />
                {tr("Вимкнути коментарі", "Lock comments")}
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

          <div className="mt-8 space-y-2">
            <h2 className="text-sm font-mono font-semibold text-text-primary">{tr("Усі записи", "All posts")}</h2>
            {loading ? (
              <p className="py-8 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
            ) : posts.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">{tr("Ще немає записів.", "No posts yet.")}</p>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                  {post.coverUrl ? <img src={post.coverUrl} alt="" className="h-10 w-14 rounded object-cover" /> : null}
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
                      {post.commentsLocked ? <span className="text-[10px]">🔒</span> : null}
                    </div>
                    <div className="truncate font-mono text-[11px] text-text-secondary">
                      /{post.slug} · {tr(CATEGORY_LABEL[post.category][0], CATEGORY_LABEL[post.category][1])}
                      {post.tags.length ? ` · ${post.tags.map((t) => `#${t}`).join(" ")}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => startEdit(post)} className="rounded p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary" aria-label={tr("Редагувати", "Edit")}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove(post)} className="rounded p-1.5 text-text-secondary hover:bg-rose-500/10 hover:text-rose-500" aria-label={tr("Видалити", "Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="mt-6 space-y-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">{tr("Скарг немає.", "No reports.")}</p>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Flag className="h-3.5 w-3.5 text-amber-500" />
                  {tr("Поскаржився", "Reported by")}: {r.reporter}
                  {r.postSlug ? (
                    <button onClick={() => navigate(`/blog/${r.postSlug}`)} className="ml-auto text-primary hover:underline">
                      {r.postTitle ?? r.postSlug}
                    </button>
                  ) : null}
                </div>
                {r.reason ? <p className="mt-1 text-xs italic text-text-secondary">“{r.reason}”</p> : null}
                <p className="mt-2 whitespace-pre-wrap rounded bg-bg-base p-2 text-sm text-text-primary">
                  {r.commentContent ?? tr("(коментар видалено)", "(comment deleted)")}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => resolveReport(r, false)}>
                    {tr("Залишити", "Keep")}
                  </Button>
                  <Button size="sm" onClick={() => resolveReport(r, true)}>
                    {tr("Видалити коментар", "Delete comment")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
