import React from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import {
  deleteAdminMailMessage,
  getAdminMailFolders,
  getAdminMailMessage,
  getAdminMailMessages,
  getAdminMailStatus,
  moveAdminMailMessage,
  sendAdminMailMessage,
  setAdminMailRead,
  type AdminMailFolder,
  type AdminMailMessageDetails,
  type AdminMailMessageListItem,
} from "../../lib/api/admin";
import { Mail, RefreshCcw, Send, Trash2, CheckCircle2, Circle } from "lucide-react";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
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

export const AdminMailWorkspace: React.FC = () => {
  const [status, setStatus] = React.useState<{ ok: boolean; issues: string[] } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [folders, setFolders] = React.useState<AdminMailFolder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState("INBOX");

  const [items, setItems] = React.useState<AdminMailMessageListItem[]>([]);
  const [selectedUid, setSelectedUid] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<AdminMailMessageDetails | null>(null);

  const [composeOpen, setComposeOpen] = React.useState(false);
  const [composeTo, setComposeTo] = React.useState("");
  const [composeCc, setComposeCc] = React.useState("");
  const [composeBcc, setComposeBcc] = React.useState("");
  const [composeSubject, setComposeSubject] = React.useState("");
  const [composeText, setComposeText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const loadFolders = React.useCallback(async () => {
    const data = await getAdminMailFolders();
    setFolders(data.folders || []);
  }, []);

  const loadStatus = React.useCallback(async () => {
    const data = await getAdminMailStatus();
    setStatus(data);
  }, []);

  const loadMessages = React.useCallback(async (folder = activeFolder) => {
    const data = await getAdminMailMessages({ folder, limit: 40 });
    setItems(data.items || []);
    if (!data.items?.length) {
      setSelectedUid(null);
      setSelected(null);
      return;
    }
    const keep = data.items.find((m) => m.uid === selectedUid) ?? data.items[0];
    setSelectedUid(keep.uid);
  }, [activeFolder, selectedUid]);

  const loadMessage = React.useCallback(async (folder: string, uid: number) => {
    const data = await getAdminMailMessage(folder, uid);
    setSelected(data.message);
  }, []);

  const reloadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      await loadStatus();
      await loadFolders();
      await loadMessages(activeFolder);
    } finally {
      setLoading(false);
    }
  }, [loadStatus, loadFolders, loadMessages, activeFolder]);

  React.useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  React.useEffect(() => {
    if (!selectedUid) {
      setSelected(null);
      return;
    }
    loadMessage(activeFolder, selectedUid).catch(() => setSelected(null));
  }, [activeFolder, selectedUid, loadMessage]);

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
      alert("To + Subject are required");
      return;
    }
    setSending(true);
    try {
      await sendAdminMailMessage({
        to,
        cc: parseEmails(composeCc),
        bcc: parseEmails(composeBcc),
        subject: composeSubject.trim(),
        text: composeText,
      });
      setComposeOpen(false);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeText("");
      await loadMessages(activeFolder);
      alert("Message sent");
    } catch (e: unknown) {
      alert(getApiErrorMessage(e) || "Failed to send");
    } finally {
      setSending(false);
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
            <Button onClick={() => setComposeOpen(true)}>
              <Send className="w-4 h-4 mr-2" /> Compose
            </Button>
          </div>
        </div>

        {status && !status.ok ? (
          <div className="mt-3 border border-red-500/50 bg-red-500/10 p-3 text-xs font-mono text-red-200 whitespace-pre-wrap">
            Mail is not configured:\n{status.issues.join("\n")}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-12 gap-4 h-[70vh]">
        <Card className="col-span-2 p-3 overflow-auto">
          <div className="text-xs font-mono text-text-secondary mb-2">Folders</div>
          <div className="space-y-1">
            {(folders.length ? folders : [{ path: "INBOX", name: "INBOX", specialUse: "\\Inbox" }]).map((f) => (
              <button
                key={f.path}
                onClick={async () => {
                  setActiveFolder(f.path);
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
          <div className="text-xs font-mono text-text-secondary mb-2">{activeFolder} · Messages</div>
          <div className="space-y-1">
            {items.map((m) => (
              <button
                key={m.uid}
                onClick={() => setSelectedUid(m.uid)}
                className={`w-full text-left p-2 border ${selectedUid === m.uid ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-mono text-text-primary truncate">{m.subject || "(no subject)"}</div>
                  <div className="text-[10px] text-text-secondary">#{m.uid}</div>
                </div>
                <div className="text-[11px] text-text-secondary truncate mt-0.5">{m.from || "—"}</div>
                <div className="text-[10px] text-text-secondary mt-0.5">{fmtDateTime(m.date)}</div>
              </button>
            ))}
            {!items.length ? <div className="text-xs text-text-secondary">No messages.</div> : null}
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
                <Button variant="secondary" size="sm" onClick={() => markRead(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Mark read
                </Button>
                <Button variant="secondary" size="sm" onClick={() => markRead(false)}>
                  <Circle className="w-4 h-4 mr-1" /> Mark unread
                </Button>
                <Button variant="secondary" size="sm" onClick={() => moveTo("Trash")}>Move to Trash</Button>
                <Button variant="secondary" size="sm" onClick={deleteCurrent} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </div>

              <div className="border border-border bg-bg-code p-3 rounded-md">
                {selected.html ? (
                  <div dangerouslySetInnerHTML={{ __html: selected.html }} />
                ) : (
                  <pre className="text-xs whitespace-pre-wrap text-text-primary">{selected.text || "(empty)"}</pre>
                )}
              </div>

              {selected.attachments.length ? (
                <div>
                  <div className="text-xs text-text-secondary mb-1">Attachments</div>
                  <div className="space-y-1">
                    {selected.attachments.map((a, idx) => (
                      <div key={`${a.filename || "file"}-${idx}`} className="text-xs text-text-secondary border border-border p-2 rounded">
                        {a.filename || "attachment"} · {a.contentType} · {a.size} bytes
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      {composeOpen ? (
        <Card className="p-4">
          <div className="text-sm font-mono text-text-primary mb-3">Compose message</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="To (comma or space separated)" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
            <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Subject" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
            <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="Cc (optional)" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
            <input value={composeBcc} onChange={(e) => setComposeBcc(e.target.value)} placeholder="Bcc (optional)" className="px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" />
          </div>
          <textarea value={composeText} onChange={(e) => setComposeText(e.target.value)} rows={10} className="mt-3 w-full px-3 py-2 bg-bg-code border border-border text-text-primary text-sm" placeholder="Message body" />
          <div className="mt-3 flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setComposeOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={send} disabled={sending}>{sending ? "Sending..." : "Send"}</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default AdminMailWorkspace;
