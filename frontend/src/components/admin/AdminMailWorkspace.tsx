import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import {
  deleteAdminMailMessage,
  getAdminMailFolders,
  getAdminMailAttachment,
  getAdminMailMessage,
  getAdminMailMessages,
  getAdminMailStatus,
  getAdminMailSignature,
  setAdminMailSignature,
  moveAdminMailMessage,
  searchAdminMail,
  saveAdminMailDraft,
  sendAdminMailMessage,
  setAdminMailRead,
  type AdminMailFolder,
  type AdminMailMessageDetails,
  type AdminMailMessageListItem,
} from "../../lib/api/admin";
import { Mail, RefreshCcw, Send, Trash2, CheckCircle2, Circle, Reply, ReplyAll, Forward, Search, Star, X, Paperclip, Download } from "lucide-react";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { toast } from "../../lib/toast";
const getApiErrorMessage = (error: unknown): string | null => {
  const message = getErrorMessageFromUnknown(error, "");
  return message || null;
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

function parseEmails(raw: string): string[] {
  return String(raw || "")
    .split(/[\s,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Pull bare addresses out of formatted header strings like `Name <a@b>, Other <c@d>`.
function extractEmails(raw: string): string {
  const matches = String(raw || "").match(/[^\s,<>"]+@[^\s,<>"]+/g);
  return matches ? Array.from(new Set(matches)).join(", ") : "";
}
const reSubject = (s: string): string => (/^\s*re:/i.test(s) ? s : `Re: ${s}`.trim());
const fwdSubject = (s: string): string => (/^\s*fwd?:/i.test(s) ? s : `Fwd: ${s}`.trim());
function quoteBody(m: AdminMailMessageDetails): string {
  const when = m.date ? new Date(m.date).toLocaleString() : "";
  const body = (m.text || "").split("\n").map((l) => `> ${l}`).join("\n");
  return `\n\n${when ? when + ", " : ""}${m.from} wrote:\n${body}`;
}
function forwardBody(m: AdminMailMessageDetails): string {
  const when = m.date ? new Date(m.date).toLocaleString() : "";
  return `\n\n---------- Forwarded message ----------\nFrom: ${m.from}\nDate: ${when}\nSubject: ${m.subject}\nTo: ${m.to}\n\n${m.text || ""}`;
}
const SELF_ADDR = "studycod@studycod.space";

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result || "");
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

function senderName(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  return (m ? m[1].trim() : s.replace(/[<>]/g, "")) || "—";
}
function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export const AdminMailWorkspace: React.FC = () => {
  const [status, setStatus] = React.useState<{ ok: boolean; canRead?: boolean; canSend?: boolean; issues: string[] } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [folders, setFolders] = React.useState<AdminMailFolder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState("INBOX");

  const [items, setItems] = React.useState<AdminMailMessageListItem[]>([]);
  const [selectedUid, setSelectedUid] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<AdminMailMessageDetails | null>(null);
  const selectedUidRef = React.useRef<number | null>(null);
  React.useEffect(() => { selectedUidRef.current = selectedUid; }, [selectedUid]);

  const [composeOpen, setComposeOpen] = React.useState(false);
  const [composeTo, setComposeTo] = React.useState("");
  const [composeCc, setComposeCc] = React.useState("");
  const [composeBcc, setComposeBcc] = React.useState("");
  const [composeSubject, setComposeSubject] = React.useState("");
  const [composeText, setComposeText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [composeInReplyTo, setComposeInReplyTo] = React.useState("");
  const [composeReferences, setComposeReferences] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [searchActive, setSearchActive] = React.useState(false);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [composeFrom, setComposeFrom] = React.useState("");
  const [signature, setSignature] = React.useState("");
  React.useEffect(() => {
    getAdminMailSignature().then((d) => setSignature(d.signature || "")).catch(() => {});
  }, []);
  const [attachmentPreviews, setAttachmentPreviews] = React.useState<Record<number, string>>({});
  const [composeAttachments, setComposeAttachments] = React.useState<Array<{ filename: string; contentType: string; contentBase64: string }>>([]);
  const [composeFormatted, setComposeFormatted] = React.useState(false);
  const composeHtmlBody = (): string | undefined =>
    composeFormatted && composeText.trim() ? renderToStaticMarkup(<ReactMarkdown>{composeText}</ReactMarkdown>) : undefined;

  const addComposeFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const read = (file: File) => new Promise<{ filename: string; contentType: string; contentBase64: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve({ filename: file.name, contentType: file.type || "application/octet-stream", contentBase64: result.includes(",") ? result.split(",")[1] : result });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      const added = await Promise.all(Array.from(files).map(read));
      setComposeAttachments((prev) => [...prev, ...added].slice(0, 10));
    } catch {
      toast.error("Failed to read file");
    }
  };

  const saveSignature = () => {
    setAdminMailSignature(signature).catch(() => {});
  };
  const sigBlock = (): string => (signature.trim() ? `\n\n-- \n${signature.trim()}` : "");

  const loadFolders = React.useCallback(async () => {
    const data = await getAdminMailFolders();
    setFolders(data.folders || []);
  }, []);

  const loadStatus = React.useCallback(async () => {
    const data = await getAdminMailStatus();
    setStatus(data);
    return data;
  }, []);

  const loadMessages = React.useCallback(async (folder = activeFolder) => {
    const data = await getAdminMailMessages({ folder, limit: 40 });
    setItems(data.items || []);
    if (!data.items?.length) {
      setSelectedUid(null);
      setSelected(null);
      return;
    }
    // Keep the current selection if it's still listed; otherwise select the first.
    // Reads selectedUid via a ref on purpose — depending on selectedUid here would
    // recreate this callback (and the reload effect) on every message click, which
    // made the list self-switch and refresh constantly.
    const cur = selectedUidRef.current;
    if (cur == null || !data.items.some((m) => m.uid === cur)) {
      setSelectedUid(data.items[0].uid);
    }
  }, [activeFolder]);

  const loadMessage = React.useCallback(async (folder: string, uid: number) => {
    const data = await getAdminMailMessage(folder, uid);
    setSelected(data.message);
  }, []);

  const reloadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await loadStatus().catch(() => null);
      if (!cfg?.canRead && !cfg?.ok) {
        // Mailbox isn't configured (missing IMAP/SMTP env on the host). Show the
        // status panel instead of firing — and crashing on — folder/message
        // requests that can only 400. Prevents the uncaught AxiosError.
        setFolders([]);
        setItems([]);
        setSelectedUid(null);
        setSelected(null);
        return;
      }
      if (cfg?.canRead ?? cfg?.ok) {
        await loadFolders();
        await loadMessages(activeFolder);
      }
    } catch {
      // A mail backend hiccup must never become an uncaught promise rejection.
    } finally {
      setLoading(false);
    }
  }, [loadStatus, loadFolders, loadMessages, activeFolder]);

  React.useEffect(() => {
    // Run once on mount + via the Refresh button. Folder switches load messages
    // explicitly, so this must NOT depend on reloadAll's identity (that re-fired on
    // every selection change → constant refresh / self-switching).
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    setAttachmentPreviews({});
    if (!selectedUid) {
      setSelected(null);
      return;
    }
    loadMessage(activeFolder, selectedUid).catch(() => setSelected(null));
  }, [activeFolder, selectedUid, loadMessage]);

  const downloadAttachment = async (idx: number, filename: string) => {
    if (!selected) return;
    try {
      const blob = await getAdminMailAttachment(activeFolder, selected.uid, idx);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `attachment-${idx}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e) || "Download failed");
    }
  };
  const previewAttachment = async (idx: number) => {
    if (!selected || attachmentPreviews[idx]) return;
    try {
      const blob = await getAdminMailAttachment(activeFolder, selected.uid, idx);
      const url = URL.createObjectURL(blob);
      setAttachmentPreviews((prev) => ({ ...prev, [idx]: url }));
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e) || "Preview failed");
    }
  };
  const startCompose = () => {
    setComposeFrom("");
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeText(sigBlock());
    setComposeInReplyTo("");
    setComposeReferences("");
    setComposeAttachments([]);
    setComposeOpen(true);
  };

  const markRead = async (read: boolean) => {
    if (!selectedUid) return;
    await setAdminMailRead({ folder: activeFolder, uid: selectedUid, read });
    await loadMessages(activeFolder);
    await loadMessage(activeFolder, selectedUid);
  };

  const moveTo = async (destination: string) => {
    if (!selectedUid) return;
    await moveAdminMailMessage({ folder: activeFolder, uid: selectedUid, destination });
    await loadMessages(activeFolder);
    setSelectedUid(null);
    setSelected(null);
  };

  const deleteCurrent = async () => {
    if (!selectedUid) return;
    await deleteAdminMailMessage({ folder: activeFolder, uid: selectedUid });
    await loadMessages(activeFolder);
    setSelectedUid(null);
    setSelected(null);
  };

  const send = async () => {
    const to = parseEmails(composeTo);
    if (!to.length || !composeSubject.trim()) {
      toast.error("To + Subject are required");
      return;
    }
    setSending(true);
    try {
      await sendAdminMailMessage({
        from: composeFrom.trim() || undefined,
        to,
        cc: parseEmails(composeCc),
        bcc: parseEmails(composeBcc),
        subject: composeSubject.trim(),
        text: composeText,
        html: composeHtmlBody(),
        inReplyTo: composeInReplyTo || undefined,
        references: composeReferences || undefined,
        attachments: composeAttachments.length ? composeAttachments : undefined,
      });
      setComposeOpen(false);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeText("");
      setComposeInReplyTo("");
      setComposeReferences("");
      setComposeAttachments([]);
      if (status?.canRead ?? status?.ok) await loadMessages(activeFolder);
      toast.success("Message sent");
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e) || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      await saveAdminMailDraft({
        from: composeFrom.trim() || undefined,
        to: parseEmails(composeTo),
        cc: parseEmails(composeCc),
        bcc: parseEmails(composeBcc),
        subject: composeSubject.trim(),
        text: composeText,
        html: composeHtmlBody(),
        inReplyTo: composeInReplyTo || undefined,
        references: composeReferences || undefined,
        attachments: composeAttachments.length ? composeAttachments : undefined,
      });
      toast.success("Draft saved");
      setComposeOpen(false);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeText("");
      setComposeInReplyTo("");
      setComposeReferences("");
      setComposeAttachments([]);
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e) || "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const doSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const data = await searchAdminMail({ folder: activeFolder, q, limit: 50 });
      setItems(data.items || []);
      setSearchActive(true);
      setSelectedUid(null);
      setSelected(null);
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e) || "Search failed");
    } finally {
      setSearching(false);
    }
  };
  const clearSearch = async () => {
    setSearch("");
    setSearchActive(false);
    await loadMessages(activeFolder);
  };

  const openReply = (all: boolean) => {
    if (!selected) return;
    const replyToAddr = extractEmails(selected.replyTo || selected.from);
    let cc = "";
    if (all) {
      const others = extractEmails(`${selected.to}, ${selected.cc}`)
        .split(", ")
        .filter((e) => e && e.toLowerCase() !== SELF_ADDR && e.toLowerCase() !== replyToAddr.toLowerCase());
      cc = Array.from(new Set(others)).join(", ");
    }
    setComposeFrom("");
    setComposeAttachments([]);
    setComposeTo(replyToAddr);
    setComposeCc(cc);
    setComposeBcc("");
    setComposeSubject(reSubject(selected.subject));
    setComposeText(`${signature.trim() ? signature.trim() + "\n\n" : ""}${quoteBody(selected)}`);
    setComposeInReplyTo(selected.messageId || "");
    setComposeReferences(`${selected.references || ""} ${selected.messageId || ""}`.trim());
    setComposeOpen(true);
  };

  const openForward = async () => {
    if (!selected) return;
    const msg = selected;
    setComposeFrom("");
    setComposeAttachments([]);
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject(fwdSubject(msg.subject));
    setComposeText(`${signature.trim() ? signature.trim() + "\n\n" : ""}${forwardBody(msg)}`);
    setComposeInReplyTo("");
    setComposeReferences("");
    setComposeOpen(true);
    // Carry the original attachments into the forward.
    if (msg.attachments.length) {
      try {
        const fetched = await Promise.all(
          msg.attachments.map(async (a, idx) => ({
            filename: a.filename || `attachment-${idx}`,
            contentType: a.contentType || "application/octet-stream",
            contentBase64: await blobToBase64(await getAdminMailAttachment(activeFolder, msg.uid, idx))
          }))
        );
        setComposeAttachments(fetched);
      } catch {
        toast.error("Couldn't attach forwarded files");
      }
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-text-primary font-mono">
            <Mail className="w-4 h-4" />
            StudyCod Mail · @studycod.space
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={reloadAll} disabled={loading}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={startCompose} disabled={status != null && status.canSend === false}>
              <Send className="w-4 h-4 mr-2" /> Compose
            </Button>
          </div>
        </div>

        {status && !status.ok ? (
          <div className="mt-3 border border-accent-error/55 bg-accent-error/12 p-3 text-xs font-mono text-accent-error whitespace-pre-wrap">
            {!status.canRead && !status.canSend ? "Mail is not configured:" : "Mail partially configured:"}{"\n"}{status.issues.join("\n")}
            {status.canSend ? "\nSMTP sending is available." : "\nSMTP sending is unavailable."}
            {status.canRead ? "\nIMAP mailbox reading is available." : "\nIMAP mailbox reading is unavailable."}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-12 gap-4 h-[70vh]">
        <Card className="col-span-2 p-3 overflow-auto">
          <div className="text-xs font-mono text-text-secondary mb-2">Folders</div>
          <div className="space-y-1">
            {(folders.length ? folders : [{ path: "INBOX", name: "INBOX", specialUse: "\\Inbox" }]).map((f) => (
              <button type="button"
                key={f.path}
                onClick={async () => {
                  setActiveFolder(f.path);
                  setSearch("");
                  setSearchActive(false);
                  await loadMessages(f.path);
                }}
                className={`w-full text-left px-2 py-1.5 border text-xs font-mono ${activeFolder === f.path ? "border-primary bg-bg-hover text-text-primary" : "border-border text-text-secondary hover:bg-bg-hover"}`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </Card>

        <Card className="col-span-4 p-3 overflow-auto">
          <div className="text-xs font-mono text-text-secondary mb-2 truncate">{activeFolder}{searchActive ? " · search" : " · Messages"}</div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex-1 flex items-center gap-1.5 px-2 border border-border rounded-md bg-bg-code">
              <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                placeholder="Search mail"
                className="flex-1 bg-transparent text-xs text-text-primary py-1.5 outline-none placeholder:text-text-muted"
              />
              {searchActive ? (
                <button type="button" onClick={clearSearch} className="text-text-muted hover:text-text-primary" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
            <Button size="sm" variant="secondary" onClick={doSearch} disabled={searching || !search.trim()}>
              {searching ? "…" : "Go"}
            </Button>
          </div>
          <div className="space-y-1">
            {items.map((m) => {
              const unread = !m.seen;
              return (
                <button type="button"
                  key={m.uid}
                  onClick={() => setSelectedUid(m.uid)}
                  className={`w-full text-left p-2 border rounded-md ${selectedUid === m.uid ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {unread ? <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-label="unread" /> : null}
                      {m.flagged ? <Star className="w-3 h-3 text-accent-warning shrink-0" /> : null}
                      <div className={`text-xs font-mono truncate ${unread ? "text-text-primary font-semibold" : "text-text-secondary"}`}>{m.subject || "(no subject)"}</div>
                    </div>
                    <div className="text-[10px] text-text-muted shrink-0 tabular-nums">{fmtDateShort(m.date)}</div>
                  </div>
                  <div className="text-[11px] text-text-secondary truncate mt-0.5">{senderName(m.from)}</div>
                </button>
              );
            })}
            {!items.length ? <div className="text-xs text-text-secondary">{searchActive ? "No results." : "No messages."}</div> : null}
          </div>
        </Card>

        <Card className="col-span-6 p-3 overflow-auto">
          {!selected ? (
            <div className="text-sm text-text-secondary">Select a message</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-mono text-text-primary">{selected.subject || "(no subject)"}</div>
                  <div className="text-xs text-text-secondary mt-1">From: {selected.from || "—"}</div>
                  <div className="text-xs text-text-secondary">To: {selected.to || "—"}</div>
                  {selected.cc ? <div className="text-xs text-text-secondary">Cc: {selected.cc}</div> : null}
                </div>
                <div className="text-xs text-text-secondary">{fmtDateTime(selected.date)}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => openReply(false)}>
                  <Reply className="w-4 h-4 mr-1" /> Reply
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openReply(true)}>
                  <ReplyAll className="w-4 h-4 mr-1" /> Reply all
                </Button>
                <Button variant="secondary" size="sm" onClick={openForward}>
                  <Forward className="w-4 h-4 mr-1" /> Forward
                </Button>
                <Button variant="secondary" size="sm" onClick={() => markRead(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Mark read
                </Button>
                <Button variant="secondary" size="sm" onClick={() => markRead(false)}>
                  <Circle className="w-4 h-4 mr-1" /> Mark unread
                </Button>
                <select
                  value=""
                  onChange={(e) => { const v = e.target.value; if (v) moveTo(v); }}
                  className="px-2 py-1.5 bg-bg-code border border-border text-text-secondary text-xs rounded-md outline-none focus-visible:border-primary"
                  aria-label="Move to folder"
                >
                  <option value="">Move to…</option>
                  {folders.filter((f) => f.path !== activeFolder).map((f) => (
                    <option key={f.path} value={f.path}>{f.name}</option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" onClick={deleteCurrent} className="text-accent-error hover:opacity-85">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </div>

              <div className="border border-border bg-bg-code p-3 rounded-md">
                {selected.html ? (
                  <div
                    // Mail HTML is untrusted IMAP content. Keep the rich
                    // preview, but strip scripts, event handlers and unsafe
                    // URLs before handing markup to the browser.
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(selected.html, { USE_PROFILES: { html: true } })
                    }}
                  />
                ) : (
                  <pre className="text-xs whitespace-pre-wrap text-text-primary">{selected.text || "(empty)"}</pre>
                )}
              </div>

              {selected.attachments.length ? (
                <div>
                  <div className="text-xs text-text-secondary mb-1">Attachments · {selected.attachments.length}</div>
                  <div className="space-y-1.5">
                    {selected.attachments.map((a, idx) => {
                      const isImg = String(a.contentType || "").toLowerCase().startsWith("image/");
                      return (
                        <div key={`${a.filename || "file"}-${idx}`} className="border border-border p-2 rounded-md text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 text-text-secondary">
                              <Paperclip className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{a.filename || "attachment"}</span>
                              <span className="text-text-muted shrink-0">· {Math.max(1, Math.round((a.size || 0) / 1024))} KB</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isImg ? (
                                <Button size="sm" variant="ghost" onClick={() => previewAttachment(idx)}>Preview</Button>
                              ) : null}
                              <Button size="sm" variant="secondary" onClick={() => downloadAttachment(idx, a.filename || `attachment-${idx}`)} aria-label="Download">
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          {attachmentPreviews[idx] ? (
                            <img src={attachmentPreviews[idx]} alt={a.filename || ""} className="mt-2 max-h-64 rounded border border-border" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      {composeOpen ? (
        <Card className="p-4">
          <div className="text-sm font-mono text-text-primary mb-3">{composeInReplyTo ? "Reply" : "Compose message"}</div>
          <input value={composeFrom} onChange={(e) => setComposeFrom(e.target.value)} placeholder="From (default: studycod@studycod.space)" className="w-full mb-3 px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="To (comma or space separated)" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
            <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Subject" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
            <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="Cc (optional)" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
            <input value={composeBcc} onChange={(e) => setComposeBcc(e.target.value)} placeholder="Bcc (optional)" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
          </div>
          <textarea value={composeText} onChange={(e) => setComposeText(e.target.value)} rows={10} className="mt-3 w-full px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" placeholder={composeFormatted ? "Message body (Markdown: **bold**, # heading, - list, [link](url))" : "Message body"} />
          <label className="mt-2 inline-flex items-center gap-2 text-xs font-mono text-text-secondary cursor-pointer">
            <input type="checkbox" checked={composeFormatted} onChange={(e) => setComposeFormatted(e.target.checked)} />
            Formatted (Markdown → HTML)
          </label>
          <details className="mt-2">
            <summary className="text-xs font-mono text-text-muted cursor-pointer select-none">Signature</summary>
            <textarea value={signature} onChange={(e) => setSignature(e.target.value)} onBlur={saveSignature} rows={3} placeholder="Your signature…" className="mt-1.5 w-full px-3 py-2 bg-bg-code border border-border text-text-primary text-xs" />
          </details>
          <div className="mt-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-mono text-text-secondary border border-border rounded-md px-2 py-1.5 cursor-pointer hover:bg-bg-hover transition-fast">
              <Paperclip className="w-3.5 h-3.5" />
              Attach files
              <input type="file" multiple className="hidden" onChange={(e) => { addComposeFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {composeAttachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {composeAttachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs font-mono border border-border rounded-md px-2 py-1 text-text-secondary">
                    <Paperclip className="w-3 h-3" /> {a.filename}
                    <button type="button" onClick={() => setComposeAttachments(prev => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-accent-error" aria-label="Remove">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setComposeOpen(false)} disabled={sending || savingDraft}>Cancel</Button>
            <Button variant="secondary" onClick={saveDraft} disabled={sending || savingDraft}>{savingDraft ? "Saving…" : "Save draft"}</Button>
            <Button onClick={send} disabled={sending || savingDraft}>{sending ? "Sending..." : "Send"}</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default AdminMailWorkspace;
