import React from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Pencil, Pin, Reply, Trash2, Flag } from "lucide-react";
import { Button } from "../ui/Button";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import {
  getBlogComments,
  createBlogComment,
  editBlogComment,
  deleteBlogComment,
  reportBlogComment,
  reactToBlog,
  adminPinComment,
  BLOG_REACTION_EMOJIS,
  type BlogComment
} from "../../lib/api/blog";

type Tr = (uk: string, en: string) => string;

function useTr(): { tr: Tr; locale: string } {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  return { tr: (uk, en) => (isEn ? en : uk), locale: isEn ? "en-US" : "uk-UA" };
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Renders plain-text comment content with auto-linked URLs (no markdown). */
const CommentText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(URL_RE);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline break-all"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </p>
  );
};

function timeAgo(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

const CommentReactions: React.FC<{ commentId: number; count: number; mine: string | null }> = ({
  commentId,
  count,
  mine
}) => {
  const [items, setItems] = React.useState<{ emoji: string; count: number; reacted: boolean }[] | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [total, setTotal] = React.useState(count);
  const [myEmoji, setMyEmoji] = React.useState<string | null>(mine);

  const react = async (emoji: string) => {
    setPicking(false);
    try {
      const res = await reactToBlog({ targetType: "COMMENT", targetId: commentId, emoji });
      setItems(res.reactions);
      setTotal(res.total);
      setMyEmoji(res.reactions.find((r) => r.reacted)?.emoji ?? null);
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, "Failed") });
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1">
      {items ? (
        items.map((it) => (
          <button
            key={it.emoji}
            type="button"
            onClick={() => react(it.emoji)}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
              it.reacted ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"
            }`}
          >
            {it.emoji}
            {it.count > 0 ? <span className="font-mono">{it.count}</span> : null}
          </button>
        ))
      ) : (
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
            myEmoji ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:border-primary/40"
          }`}
        >
          <span>{myEmoji ?? "🙂"}</span>
          {total > 0 ? <span className="font-mono">{total}</span> : <span>＋</span>}
        </button>
      )}
      {!items ? (
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="rounded-full border border-border px-1.5 py-0.5 text-xs text-text-secondary hover:border-primary/40"
        >
          ＋
        </button>
      ) : null}
      {picking ? (
        <div className="absolute z-10 mt-1 top-full flex gap-1 rounded-lg border border-border bg-surface p-1 shadow-md">
          {BLOG_REACTION_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => react(emoji)} className="rounded px-1.5 py-1 hover:bg-bg-hover">
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

type CardProps = {
  comment: BlogComment;
  isAdmin: boolean;
  locale: string;
  tr: Tr;
  onReply: (parentId: number) => void;
  onChanged: () => void;
};

const CommentCard: React.FC<CardProps> = ({ comment, isAdmin, locale, tr, onReply, onChanged }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(comment.content);

  const saveEdit = async () => {
    if (!draft.trim()) return;
    try {
      await editBlogComment(comment.id, draft.trim());
      setEditing(false);
      onChanged();
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося", "Failed")) });
    }
  };

  const remove = async () => {
    if (!window.confirm(tr("Видалити коментар?", "Delete comment?"))) return;
    try {
      await deleteBlogComment(comment.id);
      onChanged();
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося", "Failed")) });
    }
  };

  const report = async () => {
    const reason = window.prompt(tr("Причина скарги (необов'язково):", "Reason (optional):")) ?? undefined;
    try {
      await reportBlogComment(comment.id, reason || undefined);
      showToast({ type: "success", message: tr("Скаргу надіслано", "Reported") });
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося", "Failed")) });
    }
  };

  const pin = async () => {
    try {
      await adminPinComment(comment.id);
      onChanged();
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося", "Failed")) });
    }
  };

  return (
    <div className={`rounded-lg border p-3 ${comment.pinned ? "border-primary/40 bg-primary/5" : "border-border bg-surface"}`}>
      <div className="flex items-center gap-2">
        {comment.authorAvatar ? (
          <img src={comment.authorAvatar} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-hover text-[10px] font-mono text-text-secondary">
            {comment.author.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-text-primary">{comment.author}</span>
        {comment.pinned ? <Pin className="h-3.5 w-3.5 text-primary" /> : null}
        <span className="ml-auto font-mono text-[11px] text-text-secondary">
          {timeAgo(comment.createdAt, locale)}
          {comment.editedAt ? ` · ${tr("ред.", "edited")}` : ""}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            value={draft}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit}>{tr("Зберегти", "Save")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(comment.content); }}>
              {tr("Скасувати", "Cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <CommentText text={comment.content} />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CommentReactions commentId={comment.id} count={comment.reactionCount} mine={comment.myReaction} />
        <button
          type="button"
          onClick={() => onReply(comment.id)}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <Reply className="h-3.5 w-3.5" />
          {tr("Відповісти", "Reply")}
        </button>
        {comment.mine ? (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
            <Pencil className="h-3.5 w-3.5" />
            {tr("Редагувати", "Edit")}
          </button>
        ) : null}
        {comment.canManage ? (
          <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-rose-500">
            <Trash2 className="h-3.5 w-3.5" />
            {tr("Видалити", "Delete")}
          </button>
        ) : null}
        {isAdmin ? (
          <button type="button" onClick={pin} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-primary">
            <Pin className="h-3.5 w-3.5" />
            {comment.pinned ? tr("Відкріпити", "Unpin") : tr("Закріпити", "Pin")}
          </button>
        ) : null}
        {!comment.mine ? (
          <button type="button" onClick={report} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-amber-500">
            <Flag className="h-3.5 w-3.5" />
            {tr("Поскаржитись", "Report")}
          </button>
        ) : null}
      </div>
    </div>
  );
};

type Props = {
  slug: string;
  isAdmin: boolean;
  initialLocked: boolean;
};

export const CommentsSection: React.FC<Props> = ({ slug, isAdmin, initialLocked }) => {
  const { tr, locale } = useTr();
  const [comments, setComments] = React.useState<BlogComment[]>([]);
  const [locked, setLocked] = React.useState(initialLocked);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<number | null>(null);
  const [replyDraft, setReplyDraft] = React.useState("");
  const [posting, setPosting] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    getBlogComments(slug)
      .then((res) => {
        setComments(res.comments);
        setLocked(res.commentsLocked);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  React.useEffect(() => {
    load();
  }, [load]);

  const submit = async (content: string, parentId?: number) => {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      const res = await createBlogComment(slug, { content: content.trim(), parentId });
      setComments(res.comments);
      setDraft("");
      setReplyDraft("");
      setReplyTo(null);
    } catch (err) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(err, tr("Не вдалося надіслати", "Failed to post")) });
    } finally {
      setPosting(false);
    }
  };

  const total = React.useMemo(() => {
    let n = 0;
    for (const c of comments) n += 1 + c.replies.length;
    return n;
  }, [comments]);

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-base font-mono font-semibold text-text-primary">
        <MessageSquare className="h-4 w-4" />
        {tr("Коментарі", "Comments")} {total > 0 ? <span className="text-text-secondary">({total})</span> : null}
      </h2>

      {locked ? (
        <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
          {tr("Коментарі вимкнено для цього запису.", "Comments are disabled for this post.")}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            placeholder={tr("Залишіть коментар…", "Leave a comment…")}
            rows={3}
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={posting || !draft.trim()} onClick={() => submit(draft)}>
              {posting ? tr("Надсилання…", "Posting…") : tr("Надіслати", "Post")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {loading ? (
          <p className="text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-text-secondary">{tr("Поки що немає коментарів.", "No comments yet.")}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="space-y-2">
              <CommentCard comment={c} isAdmin={isAdmin} locale={locale} tr={tr} onReply={setReplyTo} onChanged={load} />
              {replyTo === c.id && !locked ? (
                <div className="ml-6 space-y-2">
                  <textarea
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                    placeholder={tr("Ваша відповідь…", "Your reply…")}
                    rows={2}
                    value={replyDraft}
                    maxLength={4000}
                    onChange={(e) => setReplyDraft(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={posting || !replyDraft.trim()} onClick={() => submit(replyDraft, c.id)}>
                      {tr("Відповісти", "Reply")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setReplyTo(null); setReplyDraft(""); }}>
                      {tr("Скасувати", "Cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {c.replies.length > 0 ? (
                <div className="ml-6 space-y-2 border-l border-border pl-3">
                  {c.replies.map((r) => (
                    <CommentCard key={r.id} comment={r} isAdmin={isAdmin} locale={locale} tr={tr} onReply={setReplyTo} onChanged={load} />
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
};
