import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { logger } from "../utils/logger";

type MailFolder = {
  path: string;
  name: string;
  specialUse: string | null;
};

type MailListItem = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  size: number;
};

type MailMessageDetails = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  replyTo: string;
  messageId: string;
  references: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  text: string;
  html: string;
  attachments: Array<{
    filename: string | null;
    contentType: string;
    size: number;
    contentId: string | null;
  }>;
};

type ListMessagesParams = {
  folder: string;
  limit: number;
  cursorUid?: number;
};

type SendMessageParams = {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; contentType?: string; contentBase64: string }>;
};

class StudyCodMailService {
  private imapHost = String(process.env.STUDYCOD_MAIL_IMAP_HOST || "").trim();
  private imapPort = Number.parseInt(String(process.env.STUDYCOD_MAIL_IMAP_PORT || "993"), 10);
  private imapSecure = String(process.env.STUDYCOD_MAIL_IMAP_SECURE || "true").trim().toLowerCase() !== "false";
  private imapUser = String(process.env.STUDYCOD_MAIL_IMAP_USER || "").trim();
  private imapPass = String(process.env.STUDYCOD_MAIL_IMAP_PASS || "").trim();

  private smtpHost = String(process.env.STUDYCOD_MAIL_SMTP_HOST || process.env.EMAIL_SMTP_HOST || "").trim();
  private smtpPort = Number.parseInt(String(process.env.STUDYCOD_MAIL_SMTP_PORT || process.env.EMAIL_SMTP_PORT || "465"), 10);
  private smtpSecure = String(process.env.STUDYCOD_MAIL_SMTP_SECURE || process.env.EMAIL_SMTP_SECURE || "true").trim().toLowerCase() !== "false";
  private smtpUser = String(process.env.STUDYCOD_MAIL_SMTP_USER || process.env.EMAIL_SMTP_USER || this.imapUser || "").trim();
  private smtpPass = String(process.env.STUDYCOD_MAIL_SMTP_PASS || process.env.EMAIL_SMTP_PASS || this.imapPass || "").trim();
  private smtpFrom = String(process.env.STUDYCOD_MAIL_SMTP_FROM || "").trim();

  isConfigured(): { ok: boolean; canRead: boolean; canSend: boolean; issues: string[] } {
    const issues: string[] = [];
    const imapIssues: string[] = [];
    const smtpIssues: string[] = [];
    if (!this.imapHost) imapIssues.push("STUDYCOD_MAIL_IMAP_HOST is missing");
    if (!this.imapUser) imapIssues.push("STUDYCOD_MAIL_IMAP_USER is missing");
    if (!this.imapPass) imapIssues.push("STUDYCOD_MAIL_IMAP_PASS is missing");
    if (!this.smtpHost) smtpIssues.push("STUDYCOD_MAIL_SMTP_HOST or EMAIL_SMTP_HOST is missing");
    if (!this.smtpUser) smtpIssues.push("STUDYCOD_MAIL_SMTP_USER/EMAIL_SMTP_USER is missing");
    if (!this.smtpPass) smtpIssues.push("STUDYCOD_MAIL_SMTP_PASS/EMAIL_SMTP_PASS is missing");
    const canRead = imapIssues.length === 0;
    const canSend = smtpIssues.length === 0;
    issues.push(...imapIssues, ...smtpIssues);
    return { ok: canRead && canSend, canRead, canSend, issues };
  }

  private formatAddresses(value: any): string {
    const arr = Array.isArray(value) ? value : [];
    return arr
      .map((a) => {
        const name = String(a?.name || "").trim();
        const email = String(a?.address || "").trim();
        if (!email) return "";
        return name ? `${name} <${email}>` : email;
      })
      .filter(Boolean)
      .join(", ");
  }

  private mapFolder(box: any): MailFolder {
    const flags = Array.isArray(box.flags) ? box.flags : Array.from(box.flags || []);
    const specialUse = flags.find((f: string) => String(f).startsWith("\\")) || null;
    return {
      path: String(box?.path || box?.name || "INBOX"),
      name: String(box?.name || box?.path || "INBOX"),
      specialUse,
    };
  }

  private mapListItem(msg: any): MailListItem {
    const env = msg?.envelope;
    const flags: Set<string> = msg?.flags instanceof Set ? msg.flags : new Set<string>();
    const internalDate = msg?.internalDate;
    const isoDate = internalDate instanceof Date
      ? internalDate.toISOString()
      : (typeof internalDate === "string" ? internalDate : null);
    return {
      uid: Number(msg.uid || 0),
      subject: String(env?.subject || ""),
      from: this.formatAddresses(env?.from),
      to: this.formatAddresses(env?.to),
      date: isoDate,
      seen: flags.has("\\Seen"),
      flagged: flags.has("\\Flagged"),
      size: Number(msg.size || 0),
    };
  }

  private async withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const cfg = this.isConfigured();
    if (!cfg.canRead) throw new Error(`MAIL_IMAP_NOT_CONFIGURED: ${cfg.issues.filter((issue) => issue.includes("IMAP")).join("; ")}`);

    const client = new ImapFlow({
      host: this.imapHost,
      port: Number.isFinite(this.imapPort) ? this.imapPort : 993,
      secure: this.imapSecure,
      auth: {
        user: this.imapUser,
        pass: this.imapPass,
      },
      logger: false,
    });

    try {
      await client.connect();
      return await fn(client);
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore
      }
    }
  }

  async getFolders(): Promise<MailFolder[]> {
    return this.withImap(async (client) => {
      const out: MailFolder[] = [];
      const listed = await client.list();
      for (const box of listed || []) {
        out.push(this.mapFolder(box));
      }
      out.sort((a, b) => a.path.localeCompare(b.path));
      return out;
    });
  }

  async listMessages(params: ListMessagesParams): Promise<{ folder: string; items: MailListItem[]; nextCursorUid: number | null }> {
    const folder = String(params.folder || "INBOX").trim() || "INBOX";
    const limit = Math.min(100, Math.max(1, Number(params.limit || 30)));

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const mailbox: any = client.mailbox || null;
        const exists = Number(mailbox?.exists || 0);
        if (exists <= 0) return { folder, items: [], nextCursorUid: null };

        const beforeUid = Number(params.cursorUid || 0);
        const high = beforeUid > 0 ? beforeUid - 1 : exists;
        const low = Math.max(1, high - limit + 1);

        const range = `${low}:${high}`;
        const rows: MailListItem[] = [];
        for await (const msg of client.fetch(range, {
          uid: true,
          envelope: true,
          internalDate: true,
          flags: true,
          size: true,
        })) {
          rows.push(this.mapListItem(msg));
        }
        rows.sort((a, b) => b.uid - a.uid);
        const nextCursorUid = rows.length === limit ? rows[rows.length - 1].uid : null;
        return { folder, items: rows, nextCursorUid };
      } finally {
        lock.release();
      }
    });
  }

  async searchMessages(
    folderRaw: string,
    queryRaw: string,
    limitRaw?: number
  ): Promise<{ folder: string; items: MailListItem[]; nextCursorUid: number | null }> {
    const folder = String(folderRaw || "INBOX").trim() || "INBOX";
    const q = String(queryRaw || "").trim();
    const limit = Math.max(1, Math.min(100, Number(limitRaw) || 40));
    if (!q) return { folder, items: [], nextCursorUid: null };

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        // Match the query across the common headers + body (server-side IMAP SEARCH).
        const found = await client.search({ or: [{ subject: q }, { from: q }, { to: q }, { body: q }] }, { uid: true });
        const uids = (Array.isArray(found) ? found : [])
          .map(Number)
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => b - a)
          .slice(0, limit);
        const rows: MailListItem[] = [];
        if (uids.length) {
          for await (const msg of client.fetch(
            uids.join(","),
            { uid: true, envelope: true, internalDate: true, flags: true, size: true },
            { uid: true }
          )) {
            rows.push(this.mapListItem(msg));
          }
        }
        rows.sort((a, b) => b.uid - a.uid);
        return { folder, items: rows, nextCursorUid: null };
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(folderRaw: string, uid: number): Promise<MailMessageDetails> {
    const folder = String(folderRaw || "INBOX").trim() || "INBOX";
    const id = Number(uid || 0);
    if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_UID");

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const msg: any = await client.fetchOne(String(id), {
          uid: true,
          envelope: true,
          internalDate: true,
          flags: true,
          source: true,
        });
        if (!msg?.source) throw new Error("MESSAGE_NOT_FOUND");

        const parsed = await simpleParser(msg.source as Buffer);
        const env = msg.envelope;
        const flags: Set<string> = msg?.flags instanceof Set ? msg.flags : new Set<string>();
        const internalDate = msg?.internalDate;
        const isoDate = internalDate instanceof Date
          ? internalDate.toISOString()
          : (typeof internalDate === "string" ? internalDate : null);

        return {
          uid: Number(msg.uid || id),
          subject: String(env?.subject || ""),
          from: this.formatAddresses(env?.from),
          to: this.formatAddresses(env?.to),
          cc: this.formatAddresses(env?.cc),
          bcc: this.formatAddresses(env?.bcc),
          replyTo: this.formatAddresses(env?.replyTo),
          messageId: String((parsed as any).messageId || env?.messageId || ""),
          references: Array.isArray((parsed as any).references)
            ? (parsed as any).references.join(" ")
            : String((parsed as any).references || ""),
          date: isoDate,
          seen: flags.has("\\Seen"),
          flagged: flags.has("\\Flagged"),
          text: String(parsed.text || ""),
          html: String(parsed.html || ""),
          attachments: Array.isArray(parsed.attachments)
            ? parsed.attachments.map((a: any) => ({
                filename: a.filename || null,
                contentType: String(a.contentType || "application/octet-stream"),
                size: Number(a.size || 0),
                contentId: a.cid || null,
              }))
            : [],
        };
      } finally {
        lock.release();
      }
    });
  }

  async getAttachment(
    folderRaw: string,
    uid: number,
    index: number
  ): Promise<{ filename: string; contentType: string; content: Buffer }> {
    const folder = String(folderRaw || "INBOX").trim() || "INBOX";
    const id = Number(uid || 0);
    const idx = Number(index);
    if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_UID");
    if (!Number.isInteger(idx) || idx < 0) throw new Error("INVALID_INDEX");

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const msg: any = await client.fetchOne(String(id), { uid: true, source: true });
        if (!msg?.source) throw new Error("MESSAGE_NOT_FOUND");
        const parsed = await simpleParser(msg.source as Buffer);
        const att = Array.isArray(parsed.attachments) ? parsed.attachments[idx] : null;
        if (!att || !att.content) throw new Error("ATTACHMENT_NOT_FOUND");
        return {
          filename: String(att.filename || `attachment-${idx}`),
          contentType: String(att.contentType || "application/octet-stream"),
          content: att.content as Buffer,
        };
      } finally {
        lock.release();
      }
    });
  }

  async setRead(folderRaw: string, uid: number, read: boolean): Promise<void> {
    const folder = String(folderRaw || "INBOX").trim() || "INBOX";
    const id = Number(uid || 0);
    if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_UID");

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (read) {
          await client.messageFlagsAdd(String(id), ["\\Seen"], { uid: true });
        } else {
          await client.messageFlagsRemove(String(id), ["\\Seen"], { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  async moveMessage(folderRaw: string, uid: number, destinationRaw: string): Promise<void> {
    const folder = String(folderRaw || "INBOX").trim() || "INBOX";
    const destination = String(destinationRaw || "").trim();
    const id = Number(uid || 0);
    if (!destination) throw new Error("DESTINATION_REQUIRED");
    if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_UID");

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageMove(String(id), destination, { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async deleteMessage(folderRaw: string, uid: number): Promise<void> {
    const folder = String(folderRaw || "INBOX").trim() || "INBOX";
    const id = Number(uid || 0);
    if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_UID");

    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageDelete(String(id), { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  private buildAttachments(data: SendMessageParams) {
    const list = (data.attachments || [])
      .filter((a) => a && a.filename && a.contentBase64)
      .map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.contentBase64, "base64") }));
    return list.length ? list : undefined;
  }

  async sendMessage(data: SendMessageParams): Promise<{ messageId: string | null }> {
    const cfg = this.isConfigured();
    if (!cfg.canSend) throw new Error(`MAIL_SMTP_NOT_CONFIGURED: ${cfg.issues.filter((issue) => !issue.includes("IMAP")).join("; ")}`);

    const transporter = nodemailer.createTransport({
      host: this.smtpHost,
      port: Number.isFinite(this.smtpPort) ? this.smtpPort : 465,
      secure: this.smtpSecure,
      auth: {
        user: this.smtpUser,
        pass: this.smtpPass,
      },
    });

    const from = String(data.from || this.smtpFrom || this.smtpUser).trim();
    if (!from) throw new Error("FROM_REQUIRED");

    const info = await transporter.sendMail({
      from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      text: data.text,
      html: data.html,
      replyTo: data.replyTo,
      inReplyTo: data.inReplyTo,
      references: data.references,
      attachments: this.buildAttachments(data),
    });

    logger.info("[studycod-mail] message sent", { messageId: info?.messageId || null });
    return { messageId: info?.messageId || null };
  }

  private async resolveDraftsFolder(client: any): Promise<string> {
    try {
      const list = await client.list();
      const match = (Array.isArray(list) ? list : []).find((f: any) => {
        const su = String(f.specialUse || "").toLowerCase();
        const path = String(f.path || "").toLowerCase();
        return su === "\\drafts" || path === "drafts";
      });
      return match?.path || "Drafts";
    } catch {
      return "Drafts";
    }
  }

  async saveDraft(data: SendMessageParams): Promise<void> {
    const cfg = this.isConfigured();
    if (!cfg.canRead) throw new Error(`MAIL_IMAP_NOT_CONFIGURED: ${cfg.issues.filter((issue) => issue.includes("IMAP")).join("; ")}`);
    const from = String(data.from || this.smtpFrom || this.smtpUser).trim();

    const raw: Buffer = await new Promise((resolve, reject) => {
      new MailComposer({
        from,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        text: data.text,
        html: data.html,
        inReplyTo: data.inReplyTo,
        references: data.references,
        attachments: this.buildAttachments(data),
      })
        .compile()
        .build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)));
    });

    return this.withImap(async (client) => {
      const drafts = await this.resolveDraftsFolder(client);
      await client.append(drafts, raw, ["\\Draft"]);
      logger.info("[studycod-mail] draft saved", { folder: drafts });
    });
  }
}

export const studyCodMailService = new StudyCodMailService();
