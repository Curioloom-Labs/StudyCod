import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { tr } from "../../i18n";
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
import { SupportExperience } from "./SupportExperience";

const PREVIEW_CONVERSATIONS: SupportChatConversation[] = [
  { id: 901, subject: "Не відкривається перевірка задачі", status: "OPEN", createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() },
  { id: 900, subject: "Питання щодо прогресу курсу", status: "CLOSED", createdAt: new Date(Date.now() - 86400000).toISOString(), lastMessageAt: new Date(Date.now() - 7200000).toISOString() },
];

const PREVIEW_MESSAGES: SupportChatMessage[] = [
  { id: 1, senderType: "USER", text: "Після запуску рішення перевірка довго завантажується, але результат не з’являється.", createdAt: new Date(Date.now() - 3600000).toISOString(), attachments: [] },
  { id: 2, senderType: "ADMIN", text: "Дякуємо за деталі. Ми перевіряємо чергу виконання. Підкажіть, будь ласка, мову та назву задачі.", createdAt: new Date(Date.now() - 3000000).toISOString(), attachments: [] },
  { id: 3, senderType: "USER", text: "Python, задача «Унікальні слова». Додаю скріншот стану.", createdAt: new Date(Date.now() - 2400000).toISOString(), attachments: [{ id: 11, originalName: "task-state.png", mimeType: "image/png", sizeBytes: 184320 }] },
];

export const SupportPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get("preview") === "1";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const statusLabel = (status: string) => {
    if (status === "OPEN") return tr("Відкрито", "Open");
    if (status === "CLOSED") return tr("Закрито", "Closed");
    return status;
  };

  const senderLabel = (senderType: string) => {
    if (senderType === "USER") return tr("Користувач", "User");
    if (senderType === "SUPPORT" || senderType === "ADMIN") return tr("Підтримка", "Support");
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

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    if (isPreview) {
      setConversations(PREVIEW_CONVERSATIONS);
      setLoading(false);
      return;
    }
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
    if (isPreview) {
      setMessages(conversationId === 901 ? PREVIEW_MESSAGES : PREVIEW_MESSAGES.slice(0, 2));
      setThreadLoading(false);
      return;
    }
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

    if (selectedConversationId && !conversations.some(c => c.id === selectedConversationId)) {
      setSelectedConversationId(null);
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
    if (isPreview) {
      const now = new Date().toISOString();
      const previewConversation: SupportChatConversation = { id: 902, subject: newSubject.trim(), status: "OPEN", createdAt: now, lastMessageAt: now };
      setConversations(prev => [previewConversation, ...prev]);
      setMessages([{ id: 20, senderType: "USER", text: newMessage.trim(), createdAt: now, attachments: [] }]);
      setSelectedConversationId(902);
      setNewSubject("");
      setNewMessage("");
      setSending(false);
      return;
    }
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
    if (isPreview) {
      setMessages(prev => [...prev, { id: Date.now(), senderType: "USER", text: composerText.trim(), createdAt: new Date().toISOString(), attachments: [] }]);
      setComposerText("");
      setComposerFiles([]);
      setSending(false);
      return;
    }
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

  const closeConversation = async () => {
    if (!selectedConversationId) return;
    if (isPreview) {
      setConversations(prev => prev.map(item => item.id === selectedConversationId ? { ...item, status: "CLOSED" } : item));
      return;
    }
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

  return <SupportExperience
    tr={tr}
    loading={loading}
    sending={sending}
    threadLoading={threadLoading}
    error={error}
    conversations={conversations}
    selectedConversationId={selectedConversationId}
    selectedConversation={selectedConversation}
    messages={messages}
    newSubject={newSubject}
    newMessage={newMessage}
    composerText={composerText}
    composerFiles={composerFiles}
    canCreate={canCreate}
    canSend={canSend}
    fileInputRef={fileInputRef}
    setNewSubject={setNewSubject}
    setNewMessage={setNewMessage}
    setComposerText={setComposerText}
    setComposerFiles={setComposerFiles}
    selectConversation={setSelectedConversationId}
    onCreateConversation={onCreateConversation}
    onSendMessage={onSendMessage}
    onRefresh={loadConversations}
    onCloseConversation={closeConversation}
    onHome={() => navigate("/")}
    onDownloadAttachment={downloadAttachment}
    statusLabel={statusLabel}
    senderLabel={senderLabel}
    humanSize={humanSize}
  />;

};
export default SupportPage;
