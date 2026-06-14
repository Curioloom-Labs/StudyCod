import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { LifeBuoy, MessageSquarePlus, Paperclip, Send, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { tr } from "../../i18n";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";
import {
  closeSupportChatConversation,
  createSupportChatConversation,
  downloadSupportChatAttachment,
  getSupportChatConversation,
  listSupportChatConversations,
  postSupportChatMessage,
  type SupportChatConversation,
  type SupportChatMessage
} from "../../lib/api/support";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

export const SupportPage: React.FC = () => {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const isAurora = useUIMode().mode === "aurora";
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<SupportChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const statusLabel = (status: string) => {
    if (status === "OPEN") return tr("Відкрито", "Open");
    if (status === "CLOSED") return tr("Закрито", "Closed");
    return status;
  };

  const senderLabel = (senderType: string) => {
    if (senderType === "USER") return tr("Користувач", "User");
    if (senderType === "SUPPORT") return tr("Підтримка", "Support");
    return senderType;
  };

  const canCreate = useMemo(() => {
    return newSubject.trim().length > 0 && newMessage.trim().length > 0;
  }, [newSubject, newMessage]);

  const canSend = useMemo(() => {
    if (!selectedConversationId) return false;
    if (sending) return false;
    const selected = conversations.find(c => c.id === selectedConversationId);
    if (selected?.status === "CLOSED") return false;
    return composerText.trim().length > 0 || composerFiles.length > 0;
  }, [selectedConversationId, sending, composerText, composerFiles.length, conversations]);

  const selectedConversation = useMemo(
    () => conversations.find(c => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const requestedConversationId = useMemo(() => {
    const raw = searchParams.get("conversationId");
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [searchParams]);

  useEffect(() => {
    return () => {
      Object.values(attachmentPreviewUrls).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSupportChatConversations();
      setConversations(data.conversations || []);
    } catch (err: unknown) {
      const msg = getErrorMessageFromUnknown(err, tr("Не вдалося завантажити звернення", "Failed to load requests"));
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  const loadThread = async (conversationId: number) => {
    setThreadLoading(true);
    setError(null);
    try {
      const data = await getSupportChatConversation(conversationId);
      setMessages(data.messages || []);
    } catch (err: unknown) {
      const msg = getErrorMessageFromUnknown(err, tr("Не вдалося завантажити чат", "Failed to load chat"));
      setError(String(msg));
    } finally {
      setThreadLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (conversations.length === 0) return;

    if (requestedConversationId && conversations.some(c => c.id === requestedConversationId)) {
      if (selectedConversationId !== requestedConversationId) {
        setSelectedConversationId(requestedConversationId);
      }
      return;
    }

    if (!selectedConversationId || !conversations.some(c => c.id === selectedConversationId)) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, requestedConversationId, selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId) {
      loadThread(selectedConversationId);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  const onCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setSending(true);
    setError(null);
    try {
      const res = await createSupportChatConversation({
        subject: newSubject.trim(),
        message: newMessage.trim()
      });
      setNewSubject("");
      setNewMessage("");
      await loadConversations();
      setSelectedConversationId(res.conversation.id);
    } catch (err: unknown) {
      const msg = getErrorMessageFromUnknown(err, tr("Не вдалося створити звернення", "Failed to create request"));
      setError(String(msg));
    } finally {
      setSending(false);
    }
  };

  const onSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversationId) return;
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await postSupportChatMessage(selectedConversationId, {
        text: composerText,
        files: composerFiles
      });
      setComposerText("");
      setComposerFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessages(prev => [...prev, res.message]);
      await loadConversations();
    } catch (err: unknown) {
      const msg = getErrorMessageFromUnknown(err, tr("Не вдалося надіслати", "Failed to send"));
      setError(String(msg));
    } finally {
      setSending(false);
    }
  };

  const humanSize = (bytes: number) => {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const downloadAttachment = async (attachmentId: number) => {
    try {
      const { blob, filename } = await downloadSupportChatAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = getErrorMessageFromUnknown(err, tr("Не вдалося завантажити файл", "Failed to download file"));
      setError(String(msg));
    }
  };

  const isImageAttachment = (mimeType: string | undefined, filename: string | undefined) => {
    const mt = String(mimeType || "").toLowerCase();
    if (mt.startsWith("image/")) return true;
    const name = String(filename || "").toLowerCase();
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some(ext => name.endsWith(ext));
  };

  const ensureAttachmentPreview = async (attachmentId: number) => {
    if (attachmentPreviewUrls[attachmentId]) return attachmentPreviewUrls[attachmentId];
    const { blob } = await downloadSupportChatAttachment(attachmentId);
    const url = URL.createObjectURL(blob);
    setAttachmentPreviewUrls(prev => ({ ...prev, [attachmentId]: url }));
    return url;
  };

  const closeConversation = async () => {
    if (!selectedConversationId) return;
    const reason = window.prompt(tr("Причина закриття (необов'язково)", "Close reason (optional)"), "") ?? "";
    try {
      await closeSupportChatConversation(selectedConversationId, reason);
      await loadConversations();
      await loadThread(selectedConversationId);
    } catch (err: unknown) {
      const msg = getErrorMessageFromUnknown(err, tr("Не вдалося закрити звернення", "Failed to close request"));
      setError(String(msg));
    }
  };

  return (
    <div className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          {isAurora ? (
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted">{tr("Підтримка", "Support")}</span>
          ) : (
            <span className="font-mono text-xs text-primary/70">{tr("// підтримка", "// support")}</span>
          )}
          <div className={`flex items-center gap-2 ${isAurora ? "mt-3" : "mt-2"}`}>
            <LifeBuoy className={`text-primary ${isAurora ? "w-6 h-6" : "w-5 h-5"}`} />
            <h1 className={isAurora ? "text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.05] text-text-primary" : "text-2xl md:text-3xl font-semibold tracking-tight text-text-primary"}>{tr("Технічна підтримка", "Technical support")}</h1>
          </div>
          <p className={isAurora ? "mt-3 text-sm md:text-base text-text-secondary max-w-xl" : "mt-1.5 text-sm text-text-secondary max-w-xl"}>
            {tr("Чат із підтримкою (можна додавати файли).", "Chat with support (attachments are allowed).")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => loadConversations()} disabled={loading}>
            {tr("Оновити", "Refresh")}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            {tr("На головну", "Home")}
          </Button>
        </div>
      </motion.div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      {error && (
        <div className="rounded-xl border border-accent-error bg-bg-code px-4 py-3 font-mono text-xs text-accent-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Звернення", "Requests")}</div>
            <Button variant="secondary" size="sm" onClick={() => setSelectedConversationId(null)}>
              <MessageSquarePlus className="w-3.5 h-3.5 mr-1.5" />
              {tr("Нове", "New")}
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <div className="rounded-xl border border-dashed border-border py-10 px-4 flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <LifeBuoy className="w-4 h-4 text-primary" />
                </div>
                <div className="text-xs font-mono text-text-secondary">{tr("Поки що немає звернень.", "No requests yet.")}</div>
              </div>
            )}
            <motion.div
              variants={prefersReducedMotion ? undefined : staggerContainer}
              initial={prefersReducedMotion ? undefined : "initial"}
              animate={prefersReducedMotion ? undefined : "animate"}
              className="space-y-2"
            >
              {conversations.map(c => (
                <motion.button
                  key={c.id}
                  variants={prefersReducedMotion ? undefined : fadeUpItem}
                  onClick={() => setSelectedConversationId(c.id)}
                  className={`relative w-full text-left rounded-xl border px-3 py-2.5 transition-fast hover:-translate-y-0.5 ${
                    selectedConversationId === c.id
                      ? "border-primary/40 bg-primary/5 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]"
                      : "border-border bg-bg-surface hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  {c.status === "OPEN" && selectedConversationId !== c.id && (
                    <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  <div className="flex items-center justify-between gap-2 pr-3">
                    <div className="text-sm text-text-primary font-medium truncate">{c.subject}</div>
                    <div className={`text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 ${
                      c.status === "OPEN"
                        ? "border-accent-success/60 text-accent-success bg-accent-success/10"
                        : "border-border text-text-secondary bg-bg-hover"
                    }`}
                    >
                      {statusLabel(c.status)}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-text-secondary font-mono">
                    {new Date(c.lastMessageAt).toLocaleString()}
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </div>
        </Card>

        <Card className="p-4 md:col-span-2">
            {!selectedConversationId ? (
              <div>
                <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Нове звернення", "New request")}</div>
                <form onSubmit={onCreateConversation} className="mt-3 space-y-3">
                  <Input
                    label={tr("Тема", "Subject")}
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder={tr("Коротко: що зламалось?", "Briefly: what is broken?")}
                    required
                  />
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Повідомлення", "Message")}</label>
                    <textarea
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder={tr("Опишіть детально проблему та кроки відтворення", "Describe the issue and reproduction steps in detail")}
                      className="w-full min-h-[140px] resize-y bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-fast placeholder:text-text-muted"
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!canCreate || sending}>
                      {sending ? tr("Створюємо…", "Creating…") : tr("Створити", "Create")}
                    </Button>
                  </div>
                  <div className="text-xs text-text-secondary font-mono">
                    {tr("Файли можна прикріпити наступним повідомленням у чаті.", "You can attach files in the next chat message.")}
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex flex-col h-[70vh]">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-text-primary">{tr("Чат", "Chat")}</div>
                    <span className="text-xs font-mono text-text-muted">#{selectedConversationId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedConversation?.status === "OPEN" ? (
                      <Button variant="secondary" size="sm" onClick={closeConversation}>
                        {tr("Закрити чат", "Close chat")}
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-text-secondary border border-border rounded-md px-2 py-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {tr("Закрито", "Closed")}
                      </div>
                    )}
                  </div>
                </div>

                {selectedConversation?.status === "CLOSED" ? (
                  <div className="mt-3 text-xs font-mono text-text-secondary border border-border bg-bg-hover/40 rounded-lg px-3 py-2">
                    {tr("Це звернення закрито. Для нових питань створіть нове звернення.", "This request is closed. Create a new one for new questions.")}
                  </div>
                ) : null}

                <div className="mt-3 flex-1 overflow-auto rounded-xl border border-border bg-bg-code p-3">
                  {threadLoading && (
                    <div className="space-y-3">
                      <Skeleton className="h-16 w-2/3" />
                      <Skeleton className="h-16 w-3/4 ml-auto" />
                      <Skeleton className="h-16 w-1/2" />
                    </div>
                  )}
                  {!threadLoading && messages.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border py-10 px-4 flex flex-col items-center text-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <LifeBuoy className="w-4 h-4 text-primary" />
                      </div>
                      <div className="text-xs font-mono text-text-secondary">{tr("Повідомлень ще немає.", "No messages yet.")}</div>
                    </div>
                  )}
                  <motion.div
                    variants={prefersReducedMotion ? undefined : staggerContainer}
                    initial={prefersReducedMotion ? undefined : "initial"}
                    animate={prefersReducedMotion ? undefined : "animate"}
                    className="space-y-3"
                  >
                    {messages.map(m => {
                      const isUser = m.senderType === "USER";
                      return (
                        <motion.div
                          key={m.id}
                          variants={prefersReducedMotion ? undefined : fadeUpItem}
                          className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl border px-3 py-2 ${
                              isUser
                                ? "border-primary/30 bg-primary/10"
                                : "border-border bg-bg-surface"
                            }`}
                          >
                            <div className="text-[11px] font-mono text-text-secondary flex items-center justify-between gap-3">
                              <span>{senderLabel(m.senderType)}</span>
                              <span>{new Date(m.createdAt).toLocaleString()}</span>
                            </div>
                            {m.text && <div className="mt-1 text-sm whitespace-pre-wrap">{m.text}</div>}

                            {m.attachments?.length ? (
                              <div className="mt-2 space-y-1">
                                {m.attachments.map(a => (
                                  <div key={a.id} className="flex items-center justify-between gap-2 border border-border rounded-lg px-2 py-1 bg-bg-base">
                                    <div className="min-w-0">
                                      <div className="text-xs font-mono text-text-primary truncate">{a.originalName}</div>
                                      <div className="text-[11px] font-mono text-text-secondary">{humanSize(a.sizeBytes)}</div>
                                      {isImageAttachment(a.mimeType, a.originalName) ? (
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              await ensureAttachmentPreview(a.id);
                                            } catch (err: unknown) {
                                              const msg = getErrorMessageFromUnknown(err, tr("Не вдалося відкрити прев’ю", "Failed to open preview"));
                                              setError(String(msg));
                                            }
                                          }}
                                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:underline"
                                        >
                                          <ImageIcon className="w-3 h-3" />
                                          {tr("Показати прев’ю", "Show preview")}
                                        </button>
                                      ) : null}
                                    </div>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => downloadAttachment(a.id)}
                                    >
                                      {tr("Завантажити", "Download")}
                                    </Button>
                                  </div>
                                ))}

                                {m.attachments.map(a => {
                                  const url = attachmentPreviewUrls[a.id];
                                  if (!url) return null;
                                  return (
                                    <div key={`preview-${a.id}`} className="border border-border rounded-lg p-2 bg-bg-base">
                                      <img src={url} alt={a.originalName} className="max-h-64 rounded-md border border-border" />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </div>

                <form onSubmit={onSendMessage} className="mt-3 space-y-2 sticky bottom-0 bg-bg-base pt-1">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Повідомлення", "Message")}</label>
                    <textarea
                      value={composerText}
                      onChange={e => setComposerText(e.target.value)}
                      placeholder={tr("Напишіть повідомлення…", "Write a message…")}
                      className="w-full min-h-[90px] resize-y bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-fast placeholder:text-text-muted"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-xs font-mono text-text-secondary border border-border rounded-md px-2 py-1.5 cursor-pointer hover:bg-bg-hover transition-fast">
                        <Paperclip className="w-3.5 h-3.5" />
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={e => {
                            const files = Array.from(e.target.files || []);
                            setComposerFiles(files);
                          }}
                          className="hidden"
                        />
                        {tr("Файли", "Files")}
                      </label>
                      {composerFiles.length > 0 && (
                        <div className="text-xs font-mono text-text-secondary">
                          {tr("{{count}} файл(ів)", "{{count}} file(s)").replace("{{count}}", String(composerFiles.length))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          setComposerFiles([]);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        disabled={sending || composerFiles.length === 0}
                      >
                        {tr("Очистити файли", "Clear files")}
                      </Button>
                      <Button type="submit" disabled={!canSend}>
                        <Send className="w-4 h-4 mr-2" />
                        {sending ? tr("Надсилаємо…", "Sending…") : tr("Надіслати", "Send")}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            )}
        </Card>
      </div>

      <div className="text-xs text-text-secondary font-mono">
        {tr("Якщо чат не відкривається — перевірте, що ви увійшли в акаунт.", "If chat does not open, check that you are logged in.")}
      </div>
    </div>
  );
};
export default SupportPage;
