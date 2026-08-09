import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
  type AppNotification
} from "../../lib/api/notifications";

const POLL_MS = 60_000;

/**
 * Notification bell with unread badge + dropdown. Polls the lightweight
 * unread-count endpoint on an interval; loads the full list only when opened.
 */
export const NotificationsBell: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tr = (uk: string, en: string) => (isEn ? en : uk);

  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let active = true;
    const poll = () => {
      getUnreadCount()
        .then((n) => {
          if (active) setUnread(n);
        })
        .catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const res = await getNotifications();
        setItems(res.notifications);
        setUnread(res.unread);
      } catch {
        // ignore — bell stays usable
      } finally {
        setLoading(false);
      }
    }
  };

  const openItem = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      void markNotificationsRead([n.id]).then(() => {
        setItems((current) => current.map((item) => item.id === n.id ? { ...item, read: true } : item));
        setUnread((current) => Math.max(0, current - 1));
      }).catch(() => undefined);
    }
    if (n.postSlug) navigate(`/blog/${n.postSlug}`);
  };

  const label = (n: AppNotification): string => {
    const who = n.actorName ?? tr("Хтось", "Someone");
    if (n.type === "BLOG_REPLY") return tr(`${who} відповів на ваш коментар`, `${who} replied to your comment`);
    return tr(`${who} прокоментував «${n.postTitle ?? ""}»`, `${who} commented on "${n.postTitle ?? ""}"`);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative inline-flex items-center justify-center rounded-full border border-border bg-bg-surface p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-primary/40 transition-fast"
        aria-label={tr("Сповіщення", "Notifications")}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-mono text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs font-mono font-semibold text-text-primary">
            {tr("Сповіщення", "Notifications")}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-6 text-center text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-secondary">{tr("Немає сповіщень.", "No notifications.")}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-bg-hover ${n.read ? "text-text-secondary" : "text-text-primary"}`}
                >
                  <span className="block">{label(n)}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-text-secondary">
                    {new Date(n.createdAt).toLocaleDateString(isEn ? "en-US" : "uk-UA", {
                      day: "numeric",
                      month: "short"
                    })}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
