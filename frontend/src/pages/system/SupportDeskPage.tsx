import React from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, ExternalLink, Inbox, MessageCircle, Paperclip, RefreshCw, Search, Send } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PersonalRouteShell } from "../../components/layout/PersonalRouteShell";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { downloadSupportChatAttachment } from "../../lib/api/support";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import {
  getSupportDeskConversation,
  listSupportDeskConversations,
  listSupportDeskTickets,
  postSupportDeskMessage,
  replySupportDeskTicket,
  updateSupportDeskConversationStatus,
  type SupportDeskConversation,
  type SupportDeskMessage,
  type SupportDeskTicket,
} from "../../lib/api/supportDesk";

type Filter = "ALL" | "OPEN" | "CLOSED";

const demoConversations: SupportDeskConversation[] = [
  { id: 1, userEmail: "student@example.test", subject: "Перевірка задачі зависає", status: "OPEN", createdAt: new Date(Date.now() - 3_600_000).toISOString(), lastMessageAt: new Date(Date.now() - 180_000).toISOString() },
  { id: 2, userEmail: "teacher@example.test", subject: "Не відкривається журнал класу", status: "OPEN", createdAt: new Date(Date.now() - 86_400_000).toISOString(), lastMessageAt: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 3, userEmail: "parent@example.test", subject: "Питання про сертифікат", status: "CLOSED", createdAt: new Date(Date.now() - 172_800_000).toISOString(), lastMessageAt: new Date(Date.now() - 90_000_000).toISOString() },
];

const demoMessages: SupportDeskMessage[] = [
  { id: 1, senderType: "USER", text: "Після натискання Test результат не з'являється вже кілька хвилин.", createdAt: new Date(Date.now() - 900_000).toISOString(), attachments: [] },
  { id: 2, senderType: "ADMIN", text: "Прийняли. Перевіряємо чергу виконання та повернемось із відповіддю.", createdAt: new Date(Date.now() - 600_000).toISOString(), attachments: [] },
];

const formatDate = (value: string) => new Date(value).toLocaleString(tr("uk-UA", "en-US"), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const formatSize = (size: number) => size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

export const SupportDeskPage: React.FC = () => {
  useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preview = import.meta.env.DEV && ["1", "true"].includes(searchParams.get("preview") || "");
  const [conversations, setConversations] = React.useState<SupportDeskConversation[]>([]);
  const [tickets, setTickets] = React.useState<SupportDeskTicket[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = React.useState<SupportDeskTicket | null>(null);
  const [messages, setMessages] = React.useState<SupportDeskMessage[]>([]);
  const [filter, setFilter] = React.useState<Filter>("OPEN");
  const [query, setQuery] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [ticketReply, setTicketReply] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = React.useState<Record<number, string>>({});
  const attachmentPreviewUrlsRef = React.useRef<Record<number, string>>({});
  const selectedIdRef = React.useRef<number | null>(null);
  const selectedTicketRef = React.useRef<SupportDeskTicket | null>(null);

  const selected = conversations.find((item) => item.id === selectedId) || null;
  const visibleConversations = conversations.filter((item) => {
    const statusMatch = filter === "ALL" || item.status === filter;
    const haystack = `${item.subject} ${item.userEmail}`.toLowerCase();
    return statusMatch && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  });

  const loadThread = React.useCallback(async (id: number, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const result = preview ? { messages: demoMessages } : await getSupportDeskConversation(id);
      setMessages(result.messages || []);
    } catch (cause) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити діалог.", "Could not load the conversation.")));
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, [preview]);

  const loadInbox = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [chatResult, ticketResult] = preview
        ? [{ conversations: demoConversations }, { tickets: [] as SupportDeskTicket[] }]
        : await Promise.all([listSupportDeskConversations(), listSupportDeskTickets().catch(() => ({ tickets: [] as SupportDeskTicket[] }))]);
      setConversations(chatResult.conversations || []);
      setTickets(ticketResult.tickets || []);
      const currentId = selectedIdRef.current;
      const fallbackId = selectedTicketRef.current ? null : (chatResult.conversations.find((item) => item.status === "OPEN")?.id ?? chatResult.conversations[0]?.id ?? null);
      const nextId = currentId && chatResult.conversations.some((item) => item.id === currentId) ? currentId : fallbackId;
      setSelectedId(nextId);
      if (nextId && nextId !== currentId) await loadThread(nextId, silent);
    } catch (cause) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити чергу підтримки.", "Could not load the support inbox.")));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadThread, preview]);

  React.useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  React.useEffect(() => { selectedTicketRef.current = selectedTicket; }, [selectedTicket]);
  React.useEffect(() => { void loadInbox(); }, [loadInbox]);
  React.useEffect(() => {
    if (preview) return;
    const timer = window.setInterval(() => {
      void loadInbox(true);
      if (selectedId) void loadThread(selectedId, true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadInbox, loadThread, preview, selectedId]);

  React.useEffect(() => {
    const imageAttachments = messages.flatMap(message => (message.attachments || []).filter(file => file.mimeType.startsWith("image/")));
    const missing = imageAttachments.filter(file => !attachmentPreviewUrlsRef.current[file.id]);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map(async file => {
      try {
        const result = await downloadSupportChatAttachment(file.id);
        return [file.id, URL.createObjectURL(result.blob)] as const;
      } catch {
        return null;
      }
    })).then(entries => {
      const created = entries.filter((entry): entry is readonly [number, string] => Boolean(entry));
      if (cancelled) {
        created.forEach(([, url]) => URL.revokeObjectURL(url));
        return;
      }
      if (!created.length) return;
      setAttachmentPreviewUrls(current => {
        const next = { ...current };
        created.forEach(([id, url]) => { next[id] = url; attachmentPreviewUrlsRef.current[id] = url; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [messages]);

  React.useEffect(() => () => {
    Object.values(attachmentPreviewUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
  }, []);

  const openConversation = (id: number) => {
    setSelectedTicket(null);
    setSelectedId(id);
    setMessages([]);
    void loadThread(id);
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !reply.trim() || selected?.status !== "OPEN" || sending) return;
    setSending(true);
    setError(null);
    try {
      if (preview) {
        setMessages((current) => [...current, { id: Date.now(), senderType: "ADMIN", text: reply.trim(), createdAt: new Date().toISOString(), attachments: [] }]);
      } else {
        await postSupportDeskMessage(selectedId, { text: reply.trim(), sendEmail: true });
        await loadThread(selectedId);
        await loadInbox(true);
      }
      setReply("");
    } catch (cause) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося надіслати відповідь.", "Could not send the reply.")));
    } finally {
      setSending(false);
    }
  };

  const sendTicketReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !ticketReply.trim() || sending) return;
    setSending(true);
    try {
      await replySupportDeskTicket(selectedTicket.id, ticketReply.trim());
      setTicketReply("");
      const result = await listSupportDeskTickets();
      setTickets(result.tickets || []);
      setSelectedTicket(result.tickets.find((item) => item.id === selectedTicket.id) || null);
    } catch (cause) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося відповісти на звернення.", "Could not reply to the request.")));
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async () => {
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    try {
      if (preview) {
        setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, status: item.status === "OPEN" ? "CLOSED" : "OPEN" } : item));
      } else {
        await updateSupportDeskConversationStatus(selected.id, selected.status === "OPEN" ? "CLOSED" : "OPEN");
        await loadInbox(true);
        await loadThread(selected.id, true);
      }
    } catch (cause) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося змінити статус звернення.", "Could not update the request status.")));
    } finally {
      setSending(false);
    }
  };

  const downloadAttachment = async (attachmentId: number) => {
    const attachment = messages.flatMap((message) => message.attachments || []).find((item) => item.id === attachmentId);
    const previewWindow = attachment?.mimeType.startsWith("image/") ? window.open("about:blank", "_blank", "noopener,noreferrer") : null;
    try {
      const result = await downloadSupportChatAttachment(attachmentId);
      const url = URL.createObjectURL(result.blob);
      if (previewWindow) {
        previewWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      previewWindow?.close();
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити вкладення.", "Could not download the attachment.")));
    }
  };

  const openCount = conversations.filter((item) => item.status === "OPEN").length;
  const closedCount = conversations.filter((item) => item.status === "CLOSED").length;

  return <PersonalRouteShell area="lab">
    <div className="min-h-[calc(100dvh-72px)] bg-bg-base dark:bg-bg-base">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-9 lg:py-9">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div><div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.18em] text-primary-strong dark:text-[#62edaa]"><Inbox className="size-4" />Support desk</div><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] text-text-primary dark:text-[#edf4ef] sm:text-5xl">{tr("Черга, де нічого не губиться.", "A support queue where nothing gets lost.")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#718075] dark:text-[#a8b7ac]">{tr("Окремий простір для команди підтримки: звернення, контекст, відповіді та вкладення в одному робочому потоці.", "A dedicated workspace for support: requests, context, replies, and attachments in one place.")}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => navigate("/support")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/10 bg-white px-4 text-sm font-semibold text-[#4e6154] dark:border-white/10 dark:bg-white/[.04] dark:text-[#c0cec3]"><ExternalLink className="size-4" />{tr("Сторінка користувача", "User support page")}</button><button type="button" onClick={() => void loadInbox()} className="grid size-11 place-items-center rounded-xl border border-border/10 bg-white text-[#526457] transition hover:bg-[#edf3ed] dark:border-white/10 dark:bg-white/[.04] dark:text-[#bdc9c0]" aria-label={tr("Оновити", "Refresh")}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button></div>
        </header>

        <div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-primary/15 bg-primary/10 p-4 dark:border-primary/15 dark:bg-primary/[.07]"><div className="text-xs font-semibold uppercase tracking-[.12em] text-[#4f7660] dark:text-[#8bcaa4]">{tr("В роботі", "Open")}</div><div className="mt-2 text-3xl font-bold text-primary-strong dark:text-primary-soft">{openCount}</div></div><div className="rounded-2xl border border-border/8 bg-white p-4 dark:border-white/10 dark:bg-white/[.035]"><div className="text-xs font-semibold uppercase tracking-[.12em] text-[#718075]">{tr("Закриті", "Closed")}</div><div className="mt-2 text-3xl font-bold text-[#33473a] dark:text-[#dce8de]">{closedCount}</div></div><div className="rounded-2xl border border-[#ff8c00]/15 bg-[#fff7e9] p-4 dark:border-[#ff8c00]/15 dark:bg-[#ff8c00]/[.07]"><div className="text-xs font-semibold uppercase tracking-[.12em] text-[#a56a16] dark:text-[#ffc36e]">Legacy email</div><div className="mt-2 text-3xl font-bold text-[#a45e08] dark:text-[#ffc36e]">{tickets.length}</div></div></div>

        {error ? <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#ff6b9d]/25 bg-[#fff0f4] px-4 py-3 text-sm text-[#bd4169] dark:border-[#ff6b9d]/20 dark:bg-[#ff6b9d]/[.08] dark:text-[#ff9aba]"><AlertCircle className="size-4 shrink-0" />{error}<button type="button" onClick={() => void loadInbox()} className="ml-auto font-bold underline">{tr("Повторити", "Retry")}</button></div> : null}

        <div className="mt-7 grid min-h-[680px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)_280px]">
          <aside className="rounded-[26px] border border-border/8 bg-white p-4 dark:border-white/10 dark:bg-[#111a14]"><div className="flex items-center justify-between"><h2 className="text-lg font-bold tracking-[-.03em] text-[#1c2a20] dark:text-[#edf4ef]">{tr("Вхідні", "Inbox")}</h2><span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-xs font-bold text-[#357653] dark:bg-primary/10 dark:text-primary-soft">{conversations.length}</span></div><div className="relative mt-4"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b998e]" /><label htmlFor="support-desk-search" className="sr-only">{tr("Пошук звернень", "Search requests")}</label><input id="support-desk-search" name="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Пошук за темою або email", "Search by subject or email")} className="h-10 w-full rounded-xl border border-border/10 bg-[#f7faf7] pl-9 pr-3 text-xs outline-none focus:border-primary dark:border-white/10 dark:bg-white/[.04]" /></div><div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[#f1f5f1] p-1 dark:bg-white/[.04]">{(["OPEN", "ALL", "CLOSED"] as Filter[]).map((item) => <button type="button" key={item} onClick={() => setFilter(item)} className={`rounded-lg px-2 py-2 text-[10px] font-bold ${filter === item ? "bg-white text-primary-strong shadow-sm dark:bg-white/[.1] dark:text-primary-soft" : "text-[#78867c]"}`}>{item === "OPEN" ? tr("Відкриті", "Open") : item === "CLOSED" ? tr("Закриті", "Closed") : tr("Усі", "All")}</button>)}</div><div className="mt-4 space-y-2 overflow-y-auto xl:max-h-[520px]">{loading && !conversations.length ? <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#eef3ee] dark:bg-white/[.05]" />)}</div> : visibleConversations.map((item) => <button type="button" key={item.id} onClick={() => openConversation(item.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selectedId === item.id ? "border-primary/35 bg-primary/10 dark:border-primary/25 dark:bg-primary/[.08]" : "border-transparent bg-[#f7faf7] hover:border-border/10 dark:bg-white/[.035] dark:hover:border-white/10"}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-bold text-[#26372c] dark:text-[#e4eee6]">{item.subject}</span><span className={`mt-1 size-2 shrink-0 rounded-full ${item.status === "OPEN" ? "bg-primary" : "bg-[#93a097]"}`} /></div><div className="mt-2 truncate text-xs text-[#718075]">{item.userEmail}</div><div className="mt-2 flex items-center gap-1 text-[10px] text-[#93a097]"><Clock3 className="size-3" />{formatDate(item.lastMessageAt)}</div></button>)}{!loading && !visibleConversations.length ? <div className="rounded-2xl bg-[#f7faf7] p-5 text-center text-xs text-[#7b897f] dark:bg-white/[.035]">{tr("За цим фільтром звернень немає.", "No requests match this filter.")}</div> : null}</div><div className="mt-5 border-t border-border/8 pt-4 dark:border-white/10"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#a16a18]">Legacy email</span><span className="text-xs text-[#859289]">{tickets.length}</span></div><div className="space-y-2">{tickets.slice(0, 4).map((ticket) => <button type="button" key={ticket.id} onClick={() => { setSelectedTicket(ticket); setSelectedId(null); setMessages([]); }} className={`w-full rounded-xl p-3 text-left ${selectedTicket?.id === ticket.id ? "bg-[#fff3dc] dark:bg-[#ff8c00]/[.12]" : "bg-[#fffaf1] dark:bg-white/[.03]"}`}><div className="truncate text-xs font-bold">{ticket.subject}</div><div className="mt-1 truncate text-[10px] text-[#9b865f]">{ticket.userEmail}</div></button>)}</div></div></aside>

          <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[26px] border border-border/8 bg-white dark:border-white/10 dark:bg-[#111a14]"><div className="flex items-center justify-between gap-3 border-b border-border/8 px-5 py-4 dark:border-white/10"><div className="min-w-0">{selected ? <><div className="truncate text-lg font-bold text-[#1c2a20] dark:text-[#edf4ef]">{selected.subject}</div><div className="mt-1 truncate text-xs text-[#718075]">{selected.userEmail}</div></> : selectedTicket ? <><div className="truncate text-lg font-bold text-[#1c2a20] dark:text-[#edf4ef]">{selectedTicket.subject}</div><div className="mt-1 truncate text-xs text-[#718075]">Legacy email · {selectedTicket.userEmail}</div></> : <div className="text-lg font-bold text-[#8a988e]">{tr("Оберіть звернення", "Select a request")}</div>}</div>{selected ? <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${selected.status === "OPEN" ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-[#eef2ee] text-[#738278] dark:bg-white/[.07] dark:text-[#bac7bd]"}`}>{selected.status === "OPEN" ? tr("В роботі", "Open") : tr("Закрите", "Closed")}</span><button type="button" onClick={() => void changeStatus()} disabled={sending} className="rounded-xl border border-border/10 px-3 py-2 text-[10px] font-bold text-[#58705d] transition hover:bg-[#f1f5f1] disabled:opacity-40 dark:border-white/10 dark:text-[#bed0c2] dark:hover:bg-white/[.07]">{selected.status === "OPEN" ? tr("Закрити", "Close") : tr("Відкрити", "Reopen")}</button></div> : null}</div>
            {selectedTicket ? <div className="flex flex-1 flex-col p-5"><div className="rounded-2xl bg-[#fffaf1] p-5 text-sm dark:bg-[#ff8c00]/[.07]"><div className="font-bold">{tr("Опис звернення", "Request details")}</div><p className="mt-3 whitespace-pre-wrap leading-7 text-[#526257] dark:text-[#c7d2c9]">{selectedTicket.message}</p><div className="mt-4 text-xs text-[#9b865f]">{tr("Створено:", "Created:")} {formatDate(selectedTicket.createdAt)} · {tr("Статус:", "Status:")} {selectedTicket.status}</div></div><form onSubmit={sendTicketReply} className="mt-auto pt-5"><label htmlFor="support-ticket-reply" className="sr-only">{tr("Відповідь на email-звернення", "Reply to email request")}</label><textarea id="support-ticket-reply" name="ticketReply" value={ticketReply} onChange={(event) => setTicketReply(event.target.value)} rows={5} placeholder={tr("Відповідь на email-звернення…", "Reply to the email request…")} className="w-full resize-y rounded-2xl border border-border/10 bg-[#f7faf7] p-4 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-white/[.04]" /><button type="submit" disabled={sending || !ticketReply.trim()} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-[#172b1d] px-4 text-sm font-bold text-white disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Send className="size-4" />{tr("Надіслати email", "Send email")}</button></form></div> : selected ? <><div className="flex-1 overflow-y-auto p-5">{threadLoading ? <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#eef3ee] dark:bg-white/[.05]" />)}</div> : messages.length ? <div className="space-y-4">{messages.map((message) => <article key={message.id} className={`max-w-[86%] rounded-2xl p-4 ${message.senderType === "ADMIN" ? "ml-auto bg-primary/10 dark:bg-primary/[.09]" : "bg-[#f5f8f5] dark:bg-white/[.045]"}`}><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#7b897f]"><span>{message.senderType === "USER" ? tr("Користувач", "User") : message.senderType === "ADMIN" ? "Support desk" : tr("Система", "System")}</span><span>·</span><span>{formatDate(message.createdAt)}</span></div>{message.text ? <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#33473a] dark:text-[#d8e5da]">{message.text}</p> : null}{message.attachments?.length ? <div className="mt-3 flex flex-wrap gap-2">{message.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => void downloadAttachment(attachment.id)} className="inline-flex items-center gap-2 rounded-xl border border-border/10 bg-white/70 px-3 py-2 text-xs font-semibold text-primary-strong dark:border-white/10 dark:bg-black/10 dark:text-primary-soft"><Paperclip className="size-3.5" />{attachment.originalName}<span className="font-normal text-[#829086]">{formatSize(attachment.sizeBytes)}</span></button>)}</div> : null}</article>)}</div> : <div className="grid h-full place-items-center text-sm text-[#829086]">{tr("У цьому зверненні поки немає повідомлень.", "There are no messages in this request yet.")}</div>}</div><form onSubmit={sendReply} className="border-t border-border/8 p-4 dark:border-white/10"><div className="flex items-end gap-2"><label htmlFor="support-reply" className="sr-only">{tr("Відповідь на звернення", "Reply to request")}</label><textarea id="support-reply" name="reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} disabled={selected.status !== "OPEN" || sending} placeholder={selected.status === "OPEN" ? tr("Написати відповідь…", "Write a reply…") : tr("Звернення закрито", "Request is closed")} className="min-h-20 flex-1 resize-y rounded-2xl border border-border/10 bg-[#f7faf7] p-3 text-sm outline-none focus:border-primary disabled:opacity-50 dark:border-white/10 dark:bg-white/[.04]" /><button type="submit" disabled={selected.status !== "OPEN" || sending || !reply.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#172b1d] text-white disabled:opacity-40 dark:bg-primary dark:text-primary-foreground" aria-label={tr("Надіслати", "Send")}><Send className="size-4" /></button></div><div className="mt-2 flex items-center gap-2 text-[10px] text-[#8a988e]"><MessageCircle className="size-3.5" />{tr("Відповідь збережеться в історії та буде надіслана на email.", "The reply will be saved in the conversation and sent by email.")}</div></form></> : <div className="grid flex-1 place-items-center p-8 text-center"><div><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><Inbox className="size-6" /></div><div className="mt-4 text-lg font-bold text-[#33473a] dark:text-[#dce8de]">{tr("Немає відкритого діалогу", "No conversation selected")}</div><p className="mt-2 max-w-sm text-sm leading-6 text-[#829086]">{tr("Оберіть звернення з черги, щоб побачити контекст і відповісти.", "Select a request from the inbox to review its context and reply.")}</p></div></div>}
          </section>

          <aside className="rounded-[26px] border border-border/8 bg-white p-5 dark:border-white/10 dark:bg-[#111a14]"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#718075]"><CheckCircle2 className="size-4 text-primary-strong" />{tr("Контекст", "Context")}</div>{selected ? <div className="mt-5 space-y-4"><div><div className="text-xs text-[#829086]">{tr("Email користувача", "User email")}</div><div className="mt-1 break-all text-sm font-bold text-[#2d4233] dark:text-[#e1ebe3]">{selected.userEmail}</div></div><div><div className="text-xs text-[#829086]">{tr("Створено", "Created")}</div><div className="mt-1 text-sm font-semibold text-[#526257] dark:text-[#bdcbbf]">{formatDate(selected.createdAt)}</div></div><div><div className="text-xs text-[#829086]">{tr("Остання активність", "Last activity")}</div><div className="mt-1 text-sm font-semibold text-[#526257] dark:text-[#bdcbbf]">{formatDate(selected.lastMessageAt)}</div></div><div className="rounded-2xl bg-[#f5f8f5] p-4 text-xs leading-6 text-[#718075] dark:bg-white/[.04]">{tr("Не просіть пароль або токени. Для діагностики достатньо часу події, URL, опису очікуваного результату та безпечного скріншота.", "Never ask for passwords or tokens. For troubleshooting, the event time, URL, expected result, and a safe screenshot are enough.")}</div></div> : selectedTicket ? <div className="mt-5 rounded-2xl bg-[#fffaf1] p-4 text-xs leading-6 text-[#8b6d38] dark:bg-[#ff8c00]/[.07] dark:text-[#dcb777]">{tr("Legacy звернення ще не має chat timeline. Відповідь піде email-ом і змінить його статус.", "This legacy request has no chat timeline. A reply will be sent by email and update its status.")}</div> : <div className="mt-5 text-sm leading-6 text-[#829086]">{tr("Контекст з'явиться після вибору звернення.", "Context will appear after you select a request.")}</div>}</aside>
        </div>
      </div>
    </div>
  </PersonalRouteShell>;
};

export default SupportDeskPage;
