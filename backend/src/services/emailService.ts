import nodemailer, { type Transporter } from "nodemailer";
import * as https from "https";
import type { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";
import { BACKEND_PUBLIC_URL, JWT_SECRET } from "../config";
import { DEFAULT_GRADING_SYSTEM, type GradingSystem } from "../types/GradingSystem";
import { formatGradeForSystem as formatGradeForGradingSystem, gradingSystemDisplayLabel, normalizeScaleMode, type GradeScaleMode } from "../utils/gradingScale";
import { env } from "../env";
import { buildContestInvitationEmail, type ContestInvitation } from "./emailTemplates/contestInvitation";

/**
 * Production Email Service
 * Providers:
 * - smtp (nodemailer)
 * - brevo-api (Brevo Transactional Email API)
 */
class EmailService {
  private transporter: Transporter | null = null;
  private provider: "smtp" | "brevo-api" | "log" = "smtp";

  private readonly fromEmail: string;
  private readonly notificationsFromEmail: string;
  private readonly supportFromEmail: string;

  constructor() {
    this.fromEmail =
      env.EMAIL_FROM || "StudyCod <noreply@studycod.space>";

    this.notificationsFromEmail =
      env.EMAIL_FROM_NOTIFICATIONS || this.fromEmail;

    this.supportFromEmail =
      "StudyCod <studycod@studycod.space>";

    this.initializeTransporter();
  }

  /* =========================
     Transporter
     ========================= */

  private initializeTransporter() {
    // Tests must be runnable without production SMTP secrets. The explicit
    // EMAIL_PROVIDER setting still wins, while test mode defaults to the
    // existing no-op/log provider instead of failing during module import.
    const providerRaw = String(
      env.EMAIL_PROVIDER || (env.NODE_ENV === "test" ? "log" : "smtp")
    ).trim().toLowerCase();
    this.provider = (providerRaw === "brevo-api" || providerRaw === "brevo_api")
      ? "brevo-api"
      : providerRaw === "smtp"
        ? "smtp"
        : "log";

    if (this.provider === "brevo-api") {
      // No SMTP transporter needed.
      this.transporter = null;

      const apiKey = String(env.BREVO_API_KEY || "").trim();
      if (!apiKey) {
        throw new Error("[EmailService] EMAIL_PROVIDER=brevo-api requires BREVO_API_KEY (Brevo REST API key)");
      }
      if (apiKey.startsWith("xsmtpsib-")) {
        throw new Error("[EmailService] BREVO_API_KEY looks like an SMTP (X-SMTP) key (xsmtpsib-...). Use a Brevo REST API key (xkeysib-...) for the HTTP API");
      }
      return;
    }

    if (this.provider !== "smtp") {
      logger.warn("[email] EMAIL_PROVIDER not set to smtp/brevo-api; log mode", { provider: providerRaw });
      this.transporter = null;
      return;
    }

    // ❗ Fail fast — no silent fallbacks
    if (
      !env.SMTP_HOST ||
      !env.SMTP_PORT ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD
    ) {
      throw new Error(
        "[EmailService] SMTP configuration is incomplete"
      );
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,          // smtp-relay.brevo.com
      port: Number(env.SMTP_PORT),  // 587
      secure: env.SMTP_SECURE === "true", // false = STARTTLS
      auth: {
        user: env.SMTP_USER,        // apikey
        pass: env.SMTP_PASSWORD,    // SMTP API key
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  /* =========================
     Utils
     ========================= */

  private getFrontendUrl(): string {
    return env.FRONTEND_URL || "http://localhost:5173";
  }

  private normalizeLocale(locale?: string | null): "uk" | "en" {
    const raw = String(locale ?? "").toLowerCase().trim();
    return raw.startsWith("en") ? "en" : "uk";
  }

  private t(locale: "uk" | "en", uk: string, en: string): string {
    return locale === "en" ? en : uk;
  }

  private getBackendPublicUrl(): string {
    return env.BACKEND_PUBLIC_URL || BACKEND_PUBLIC_URL || "http://localhost:4000";
  }

  private buildEmailPreferenceToken(params: {
    action: "unsubscribe" | "subscribe";
    kind: "user" | "student";
    id: number;
    email: string;
  }): string {
    // JWT_SECRET can be empty in non-production setups; still allow token generation.
    const secret = JWT_SECRET || env.JWT_SECRET || "dev-secret-change-me";
    return jwt.sign({
      t: "email-pref",
      action: params.action,
      kind: params.kind,
      id: params.id,
      email: params.email,
    }, secret, { expiresIn: "180d" });
  }

  private buildUnsubscribeUrl(params: { kind: "user" | "student"; id: number; email: string }): string {
    const token = this.buildEmailPreferenceToken({
      action: "unsubscribe",
      kind: params.kind,
      id: params.id,
      email: params.email,
    });
    return `${this.getBackendPublicUrl().replace(/\/$/, "")}/api/emails/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  async sendAnnouncementEmail(email: string, username: string, className: string, title: string | null, preview: string) {
    const html = this.buildBaseEmail({
      title: title ? `📢 ${title}` : "📢 Оголошення",
      preheader: preview ? `${preview}` : `Нове оголошення у класі ${className}`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p style="margin:0 0 6px 0;">Нове оголошення у класі <b>${this.escapeHtml(className)}</b>:</p>
<div style="margin:12px 0 0;padding:16px;border:1px solid #343c36;border-left:3px solid #a3c8ab;border-radius:8px;background:#222b25;color:#b6c1b8;line-height:1.7;">${this.escapeHtml(
        preview
      )}</div>`,
      cta: { label: "Відкрити StudyCod", url: this.getFrontendUrl() },
    });
    const text = `Оголошення у класі ${className}:\n${preview}`;
    await this.sendEmail({
      to: email,
      subject: title ? `Оголошення: ${title}` : "Оголошення",
      html,
      text
    });
  }

  async sendStreakBreakNotification(email: string, username: string, streak: number) {
    const html = this.buildBaseEmail({
      title: "🔥 Ви можете втратити серію!",
      preheader: `Ваша серія (${streak} днів) під загрозою — зробіть завдання сьогодні.`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px 0;">
  <tr>
    <td align="center" style="padding:18px 16px;border:1px solid #ffb45433;border-radius:16px;background:rgba(255,180,84,0.10);">
      <div style="font-size:40px;line-height:1;font-weight:900;color:#ffca7e;">🔥 ${streak}</div>
      <div style="margin:8px 0 0;font-size:13px;color:#b6c1b8;">днів поспіль</div>
    </td>
  </tr>
</table>
<p style="margin:0 0 8px 0;">Ваша серія успіхів під загрозою!</p>
<p style="margin:0;">Зайдіть у StudyCod та виконайте будь-яке завдання сьогодні, щоб не втратити прогрес.</p>`,
      cta: { label: "Зберегти серію", url: this.getFrontendUrl() },
    });
    const text = `Ваша серія успіхів (${streak} днів) під загрозою! Не забудьте виконати завдання сьогодні.`;
    await this.sendEmail({
      to: email,
      subject: "Ви можете втратити серію!",
      html,
      text
    });
  }

  async sendTaskAssignmentEmail(email: string, username: string, taskTitle: string, deadline: Date, type: string) {
    const isControl = type === "CONTROL_WORK";
    const titleText = isControl ? "Контрольна робота" : "Нове завдання";
    const emoji = isControl ? "📝" : "🚀";
    const deadlineStr = deadline.toLocaleString("uk-UA");
    const html = this.buildBaseEmail({
      title: `${emoji} ${titleText}`,
      preheader: `Призначено: ${taskTitle}. Дедлайн: ${deadlineStr}`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p style="margin:0 0 12px 0;">Вам призначено ${isControl ? "контрольну роботу" : "нове завдання"}:</p>
<div style="margin:0;padding:14px 16px;border:1px solid #343c36;border-radius:8px;background:#222b25;color:#e9eee9;font-size:16px;font-weight:700;">${this.escapeHtml(taskTitle)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0 0;">
  <tr>
    <td style="padding:10px 14px;border:1px solid #ffb45433;border-radius:12px;background:rgba(255,180,84,0.10);color:#ffca7e;font-size:14px;font-weight:700;">⏰ Дедлайн: ${this.escapeHtml(deadlineStr)}</td>
  </tr>
</table>`,
      cta: { label: "Відкрити StudyCod", url: this.getFrontendUrl() },
    });
    const text = `${type === "CONTROL_WORK" ? "Контрольна робота" : "Нове завдання"}: ${taskTitle}\nДедлайн: ${deadline.toLocaleString("uk-UA")}`;
    await this.sendEmail({
      to: email,
      subject: type === "CONTROL_WORK" ? "Контрольна робота" : "Нове завдання",
      html,
      text
    });
  }

  async sendBroadcastEmail(opts: {
    to: string;
    subject: string;
    title: string;
    contentHtml: string;
    text?: string;
    recipient: { kind: "user" | "student"; id: number; email: string };
  }): Promise<void> {
    const unsubscribeUrl = this.buildUnsubscribeUrl(opts.recipient);

    const html = this.buildBaseEmail({
      title: opts.title,
      preheader: opts.subject,
      contentHtml: `${opts.contentHtml}

<hr style="border:none;border-top:1px solid #343c36;margin:20px 0;" />
<p style="margin:0;font-size:12px;color:#8d9c91;line-height:1.65;">
  Ви отримали цей лист, бо підписані на розсилку StudyCod.
  <br />
  Відписатися: <a href="${unsubscribeUrl}" style="color:#a3c8ab;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${unsubscribeUrl}</a>
</p>`,
      footer: "Розсилка StudyCod"
    });

    const text = (opts.text?.trim().length ? opts.text.trim() : "") + `\n\nВідписатися: ${unsubscribeUrl}`;

    await this.sendEmail({
      to: opts.to,
      subject: opts.subject,
      html,
      text
    });
  }

  async sendContestInvitation(opts: ContestInvitation & {
    to: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  }): Promise<void> {
    const invitation = buildContestInvitationEmail(opts);
    await this.sendEmail({
      to: opts.to,
      ...invitation,
      fromOverride: this.notificationsFromEmail,
      headers: { "X-StudyCod-Category": "notification" },
      attachments: opts.attachments,
    });
  }

  async sendNotificationEmail(opts: {
    to: string;
    subject: string;
    title: string;
    contentHtml: string;
    text?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>;
  }): Promise<void> {
    const html = this.buildBaseEmail({
      title: opts.title,
      preheader: opts.subject,
      contentHtml: opts.contentHtml,
      footer: "Оповіщення StudyCod"
    });

    const text = (opts.text?.trim().length ? opts.text.trim() : "");

    await this.sendEmail({
      to: opts.to,
      subject: opts.subject,
      html,
      text,
      fromOverride: this.notificationsFromEmail,
      headers: {
        "X-StudyCod-Category": "notification",
      },
      attachments: opts.attachments,
    });
  }

  async sendBirthdayGreetingEmail(opts: {
    to: string;
    username: string;
    firstName?: string | null;
  }): Promise<void> {
    const name = (opts.firstName ?? "").trim() || opts.username;

    const html = this.buildBaseEmail({
      title: "З Днем народження!",
      preheader: "StudyCod вітає вас та бажає успіхів у навчанні.",
      greeting: `Привіт, ${name}!`,
      contentHtml: `<p style="margin:0 0 12px 0;">Вітаємо з Днем народження! 🎉</p>
<p style="margin:0 0 12px 0;">Бажаємо натхнення, стабільної серії (streak) і крутого прогресу в програмуванні.</p>
<p style="margin:0;">Заходьте в StudyCod — сьогодні гарний день, щоб розв’язати ще одне завдання 😉</p>`,
      cta: { label: "Відкрити StudyCod", url: this.getFrontendUrl() },
      footer: "Автоматичне привітання від StudyCod"
    });

    const text = `Привіт, ${name}!

Вітаємо з Днем народження!
Бажаємо натхнення та прогресу в програмуванні.

StudyCod: ${this.getFrontendUrl()}`;

    await this.sendEmail({
      to: opts.to,
      subject: "З Днем народження!",
      html,
      text,
    });
  }

  async sendGradeChangedEmail(opts: {
    to: string;
    event: "created" | "updated";
    kind: "task" | "summary" | "control";
    itemTitle: string;
    grade: number;
    maxGrade?: number;
    gradingSystem?: GradingSystem | null;
    gradeScaleMode?: GradeScaleMode | null;
    className?: string | null;
    feedback?: string | null;
    studentName?: string | null;
    locale?: "uk" | "en";
  }): Promise<void> {
    const lng = this.normalizeLocale(opts.locale);
    const grade = Math.max(0, Math.min(100, Math.round(Number(opts.grade) || 0)));
    const gradingSystem = opts.gradingSystem || DEFAULT_GRADING_SYSTEM;
    const gradeDisplay = formatGradeForGradingSystem(grade, gradingSystem, normalizeScaleMode(opts.gradeScaleMode));
    const gradingSystemLabel = gradingSystemDisplayLabel(gradingSystem, lng);

    const kindUk = opts.kind === "control"
      ? "контрольної роботи"
      : opts.kind === "summary"
        ? "підсумкової оцінки"
        : "завдання";

    const kindEn = opts.kind === "control"
      ? "control work"
      : opts.kind === "summary"
        ? "summary grade"
        : "task";

    const subject = this.t(
      lng,
      opts.event === "updated" ? "Оцінку оновлено в StudyCod" : "Нова оцінка в StudyCod",
      opts.event === "updated" ? "Grade updated in StudyCod" : "New grade in StudyCod"
    );

    const title = this.t(
      lng,
      opts.event === "updated" ? "Оцінку оновлено" : "Нова оцінка",
      opts.event === "updated" ? "Grade updated" : "New grade"
    );

    const greeting = opts.studentName
      ? this.t(lng, `Привіт, ${opts.studentName}!`, `Hi, ${opts.studentName}!`)
      : undefined;

    const itemTitle = this.escapeHtml(String(opts.itemTitle || "").trim() || this.t(lng, "Завдання", "Task"));
    const className = String(opts.className || "").trim();
    const feedback = String(opts.feedback || "").trim();

    const classHtml = className
      ? `<p style="margin:8px 0 0 0;"><b>${this.t(lng, "Клас", "Class")}:</b> ${this.escapeHtml(className)}</p>`
      : "";

    const scaleHtml = `<p style="margin:8px 0 0 0;"><b>${this.t(lng, "Шкала", "Scale")}:</b> ${this.escapeHtml(gradingSystemLabel)}</p>`;

    const feedbackHtml = feedback
      ? `<p style="margin:12px 0 6px 0;"><b>${this.t(lng, "Коментар вчителя", "Teacher comment")}:</b></p>
<div style="margin:0;padding:12px;border:1px solid #343c36;border-radius:8px;background:#222b25;color:#b6c1b8;white-space:pre-wrap;">${this.escapeHtml(feedback)}</div>`
      : "";

    const statusUk = opts.event === "updated" ? "оновлену" : "нову";
    const statusEn = opts.event === "updated" ? "updated" : "new";

    // Color + emoji depend on how good the grade is (grade is a 0..100 percent).
    const tone =
      grade >= 90 ? { accent: "#a3c8ab", soft: "rgba(163,200,171,0.12)", emoji: "🌟" }
        : grade >= 75 ? { accent: "#8fb89a", soft: "rgba(143,184,154,0.12)", emoji: "👍" }
          : grade >= 50 ? { accent: "#ffb454", soft: "rgba(255,180,84,0.12)", emoji: "📘" }
            : { accent: "#ff8f8f", soft: "rgba(255,143,143,0.12)", emoji: "💪" };

    const praiseUk =
      grade >= 90 ? "Чудовий результат — так тримати!"
        : grade >= 75 ? "Гарна робота, продовжуй у тому ж дусі!"
          : grade >= 50 ? "Непогано — є над чим попрацювати."
            : "Не засмучуйся: наступного разу вийде краще!";
    const praiseEn =
      grade >= 90 ? "Excellent result — keep it up!"
        : grade >= 75 ? "Nice work, keep going!"
          : grade >= 50 ? "Not bad — there's room to grow."
            : "Don't worry: you'll do better next time!";

    // Big hero badge with the grade.
    const gradeBadgeHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 4px 0;">
  <tr>
    <td align="center" style="padding:20px 16px;border:1px solid ${tone.accent}33;border-radius:16px;background:${tone.soft};">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#8d9c91;margin:0 0 8px;">${tone.emoji}&nbsp;${this.t(lng, "Оцінка", "Grade")}</div>
      <div style="font-size:44px;line-height:1;font-weight:900;color:${tone.accent};">${this.escapeHtml(gradeDisplay)}</div>
      <div style="margin:10px 0 0;font-size:13px;color:#b6c1b8;">${this.t(lng, praiseUk, praiseEn)}</div>
    </td>
  </tr>
</table>`.trim();

    const contentHtml = lng === "en"
      ? `<p style="margin:0 0 4px 0;">You have a ${statusEn} grade for the ${kindEn} below.</p>
${gradeBadgeHtml}
<p style="margin:14px 0 0 0;"><b>Item:</b> ${itemTitle}</p>
    ${scaleHtml}
${classHtml}
${feedbackHtml}`
      : `<p style="margin:0 0 4px 0;">Вам виставлено ${statusUk} оцінку для ${kindUk}.</p>
${gradeBadgeHtml}
<p style="margin:14px 0 0 0;"><b>Елемент:</b> ${itemTitle}</p>
    ${scaleHtml}
${classHtml}
${feedbackHtml}`;

    const html = this.buildBaseEmail({
      title,
      preheader: subject,
      greeting,
      contentHtml,
      cta: {
        label: this.t(lng, "Відкрити StudyCod", "Open StudyCod"),
        url: this.getFrontendUrl()
      },
      footer: this.t(lng, "Оповіщення про оцінювання StudyCod", "StudyCod grading notification"),
      locale: lng
    });

    const textLines = [
      lng === "en"
        ? `You have a ${statusEn} ${kindEn}.`
        : `Вам виставлено ${statusUk} оцінку для ${kindUk}.`,
      `${lng === "en" ? "Item" : "Елемент"}: ${String(opts.itemTitle || "").trim() || this.t(lng, "Завдання", "Task")}`,
      `${lng === "en" ? "Grade" : "Оцінка"}: ${gradeDisplay}`,
      `${lng === "en" ? "Scale" : "Шкала"}: ${gradingSystemLabel}`,
      className ? `${lng === "en" ? "Class" : "Клас"}: ${className}` : "",
      feedback ? `${lng === "en" ? "Teacher comment" : "Коментар вчителя"}: ${feedback}` : "",
      "",
      this.getFrontendUrl()
    ].filter(Boolean);

    await this.sendEmail({
      to: opts.to,
      subject,
      html,
      text: textLines.join("\n"),
      fromOverride: this.notificationsFromEmail,
      headers: {
        "X-StudyCod-Category": "grade-notification"
      }
    });
  }

  private escapeHtml(input: unknown): string {
    const s = String(input ?? "");
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* =========================
     Core send
     ========================= */

  private parseFromHeader(value: string): { name?: string; email: string } {
    // Accept: "Name <email@domain>" or "email@domain"
    const raw = String(value || "").trim().replace(/^"|"$/g, "");
    const angle = raw.match(/^(.*)<([^>]+)>\s*$/);
    if (angle) {
      const name = angle[1].trim().replace(/^"|"$/g, "");
      const email = angle[2].trim();
      return name ? { name, email } : { email };
    }
    return { email: raw };
  }

  private async sendViaBrevoApi(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromOverride?: string;
    headers?: Record<string, string>;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>;
  }): Promise<void> {
    const apiKey = String(env.BREVO_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("[EmailService] BREVO_API_KEY is missing (required for brevo-api)");
    }
    if (apiKey.startsWith("xsmtpsib-")) {
      throw new Error("[EmailService] BREVO_API_KEY is an SMTP key (xsmtpsib-...). Create a REST API key (xkeysib-...) and use that here.");
    }

    const sender = this.parseFromHeader(opts.fromOverride || this.fromEmail);

    const payload: {
      sender: { name?: string; email: string };
      to: Array<{ email: string }>;
      subject: string;
      htmlContent: string;
      headers?: Record<string, string>;
      attachment?: Array<{ name: string; content: string }>;
    } = {
      sender,
      to: [{ email: opts.to }],
      subject: opts.subject,
      // Brevo docs recommend using only one body type. We use htmlContent.
      htmlContent: opts.html,
    };

    if (opts.headers && Object.keys(opts.headers).length) {
      payload.headers = opts.headers;
    }

    if (Array.isArray(opts.attachments) && opts.attachments.length > 0) {
      payload.attachment = opts.attachments.map((a) => ({
        name: String(a.filename || "attachment.bin"),
        content: Buffer.isBuffer(a.content)
          ? a.content.toString("base64")
          : Buffer.from(String(a.content ?? "")).toString("base64"),
      }));
    }

    const data = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.brevo.com",
          path: "/v3/smtp/email",
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": apiKey,
            "content-length": Buffer.byteLength(data),
          },
          timeout: 15_000,
        },
        (res: IncomingMessage) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () => {
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) {
              resolve();
              return;
            }
            reject(new Error(`[EmailService] Brevo API send failed: ${status} ${body}`));
          });
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error("[EmailService] Brevo API request timed out"));
      });

      req.on("error", (err: unknown) => reject(err));
      req.write(data);
      req.end();
    });
  }

  private async sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromOverride?: string;
    headers?: Record<string, string>;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>;
  }): Promise<void> {
    if (this.provider === "brevo-api") {
      await this.sendViaBrevoApi(opts);
      return;
    }

    if (!this.transporter) {
      // DEV / disabled mode
      logger.info('[email] log mode', {
        to: opts.to,
        subject: opts.subject,
        text: String(opts.text ?? '').slice(0, 10_000),
        attachments: Array.isArray(opts.attachments)
          ? opts.attachments.map((a) => a.filename)
          : []
      });
      return;
    }

    try {
      await this.transporter.sendMail({
        from: opts.fromOverride || this.fromEmail,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        headers: opts.headers,
        attachments: Array.isArray(opts.attachments)
          ? opts.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            }))
          : undefined,
      });
    } catch (err: unknown) {
      logger.error('[email] send failed', { message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /* =========================
     Templates
     ========================= */

  private buildBaseEmail(opts: {
    title: string;
    preheader?: string;
    greeting?: string;
    contentHtml: string;
    cta?: { label: string; url: string };
    footer?: string;
    locale?: "uk" | "en";
  }): string {
    const locale = this.normalizeLocale(opts.locale);
    const title = this.escapeHtml(opts.title);
    const preheader = this.escapeHtml(opts.preheader || opts.title);
    const year = new Date().getFullYear();
    const greeting = opts.greeting
      ? `<p style="margin:0 0 8px;color:#e9eee9;font-size:16px;line-height:1.6;overflow-wrap:anywhere;">${this.escapeHtml(
          opts.greeting
        )}</p>`
      : "";

    const footer =
      opts.footer ||
      this.t(
        locale,
        "Це автоматичний лист від StudyCod. Будь ласка, не відповідайте на нього.",
        "This is an automatic email from StudyCod. Please do not reply to it."
      );
    const notificationLabel = this.t(locale, "СПОВІЩЕННЯ STUDYCOD", "STUDYCOD NOTIFICATION");
    const siteUrl = this.escapeHtml(this.getFrontendUrl());
    const ctaBlock = opts.cta
      ? `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 0;">
                  <tr>
                    <td bgcolor="#a3c8ab" style="border-radius:6px;mso-padding-alt:14px 20px;">
                      <a href="${this.escapeHtml(opts.cta.url)}" style="display:block;padding:14px 20px;border:1px solid #a3c8ab;border-radius:6px;color:#243c2c;text-decoration:none;font-weight:700;font-size:15px;line-height:1.4;text-align:center;mso-padding-alt:0;">${this.escapeHtml(opts.cta.label)} &nbsp; <span aria-hidden="true">&rarr;</span></a>
                    </td>
                  </tr>
                </table>
                <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#8d9c91;">
                  ${this.t(locale, "Якщо кнопка не працює, відкрийте посилання у браузері:", "If the button doesn't work, open this link in your browser:")}
                  <br />
                  <a href="${this.escapeHtml(opts.cta.url)}" style="color:#b6c1b8;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${this.escapeHtml(opts.cta.url)}</a>
                </p>`
      : "";

    // Tables and inline colors are intentional: mail clients do not consistently support app CSS.
    return `<!DOCTYPE html>
<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${title}</title>
    <style>
      body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      table, td { mso-table-lspace:0; mso-table-rspace:0; }
      @media screen and (max-width:480px) {
        .mail-outer { padding:20px 12px 28px !important; }
        .mail-header { padding:0 2px 18px !important; }
        .mail-header-note { font-size:10px !important; }
        .mail-hero { padding:28px 22px 24px !important; }
        .mail-title { font-size:30px !important; }
        .mail-content { padding:24px 22px 28px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:#171b19;color:#e9eee9;font-family:'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171b19" style="table-layout:fixed;">
      <tr><td class="mail-outer" align="center" style="padding:36px 20px 40px;">
        <!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;table-layout:fixed;">
          <tr><td class="mail-header" style="padding:0 4px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="36" height="36" align="center" bgcolor="#26342b" style="border:1px solid #46544b;border-radius:9px;color:#a3c8ab;font-family:Consolas,'Courier New',monospace;font-size:17px;font-weight:bold;">&lt;/&gt;</td>
                <td style="padding-left:11px;"><a href="${siteUrl}" style="font-size:20px;font-weight:700;letter-spacing:-.5px;color:#e9eee9;text-decoration:none;">StudyCod</a></td>
              </tr></table></td>
              <td class="mail-header-note" align="right" style="padding-left:12px;font-size:12px;line-height:1.5;color:#8d9c91;">LEARN BY BUILDING</td>
            </tr></table>
          </td></tr>
          <tr><td class="mail-hero" bgcolor="#222b25" style="padding:36px 36px 32px;border:1px solid #343c36;border-top:3px solid #a3c8ab;border-bottom:0;border-radius:12px 12px 0 0;">
            <p style="margin:0 0 18px;color:#a3c8ab;font-size:12px;font-weight:600;letter-spacing:1.3px;line-height:1.5;">${notificationLabel}</p>
            <h1 class="mail-title" style="margin:0;font-size:38px;font-weight:700;letter-spacing:-1.2px;line-height:1.15;color:#e9eee9;overflow-wrap:anywhere;word-break:break-word;">${title}</h1>
          </td></tr>
          <tr><td class="mail-content" bgcolor="#1d221f" style="padding:28px 36px 34px;border:1px solid #343c36;border-top:0;border-radius:0 0 12px 12px;font-size:15px;line-height:1.7;color:#b6c1b8;">
            ${greeting}
            <div>${opts.contentHtml}</div>
            ${ctaBlock}
          </td></tr>
          <tr><td style="padding:22px 4px 0;font-size:12px;line-height:1.7;color:#8d9c91;">
            <p style="margin:0 0 6px;">${this.escapeHtml(footer)}</p>
            <p style="margin:0;">© ${year} StudyCod · Curioloom Labs</p>
          </td></tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td></tr>
    </table>
  </body>
</html>`;
  }

  /* =========================
     Public API
     ========================= */

  async sendVerificationEmail(
    email: string,
    token: string,
    username: string,
    locale?: "uk" | "en"
  ) {
    const lng = this.normalizeLocale(locale);
    const url = `${this.getFrontendUrl()}/verify-email?token=${token}`;

    const html = this.buildBaseEmail({
      title: this.t(lng, "Підтвердження електронної пошти", "Email verification"),
      preheader: this.t(lng, "Підтвердіть email, щоб активувати акаунт StudyCod.", "Confirm your email to activate your StudyCod account."),
      greeting: this.t(lng, `Привіт, ${username}!`, `Hi, ${username}!`),
      contentHtml: this.t(
        lng,
        `<p>Дякуємо за реєстрацію в StudyCod.</p>
<p>Щоб активувати акаунт, підтвердіть вашу адресу електронної пошти.</p>
<p style="margin:14px 0 0;color:#8d9c91;">Якщо ви не створювали акаунт, просто проігноруйте цей лист.</p>`,
        `<p>Thanks for registering at StudyCod.</p>
<p>Please confirm your email address to activate your account.</p>
<p style="margin:14px 0 0;color:#8d9c91;">If you did not create this account, just ignore this email.</p>`
      ),
      cta: { label: this.t(lng, "Підтвердити email", "Verify email"), url },
      locale: lng,
    });

    const text = this.t(
      lng,
      `Привіт, ${username}!

Для підтвердження email перейдіть за посиланням:
${url}

— StudyCod`,
      `Hi, ${username}!

Please confirm your email by following this link:
${url}

— StudyCod`
    );

    await this.sendEmail({
      to: email,
      subject: this.t(lng, "Підтвердження електронної пошти", "Email verification"),
      html,
      text,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    username: string,
    locale?: "uk" | "en",
    userMode?: "EDUCATIONAL",
    invitationPath?: string
  ) {
    const lng = this.normalizeLocale(locale);
    const url = `${this.getFrontendUrl()}/auth/reset-password?token=${token}${userMode === "EDUCATIONAL" ? "&mode=edu" : ""}${invitationPath ? `&next=${encodeURIComponent(invitationPath)}` : ""}`;

    const html = this.buildBaseEmail({
      title: this.t(lng, "Відновлення паролю", "Password reset"),
      preheader: this.t(lng, "Посилання для відновлення паролю до вашого акаунта StudyCod.", "Use this link to reset your StudyCod account password."),
      greeting: this.t(lng, `Привіт, ${username}!`, `Hi, ${username}!`),
      contentHtml: this.t(
        lng,
        `<p>Ми отримали запит на відновлення паролю для вашого акаунта.</p>
<p>Натисніть кнопку нижче, щоб встановити новий пароль.</p>
<p style="margin:14px 0 0;color:#8d9c91;">Якщо це були не ви — просто проігноруйте цей лист.</p>`,
        `<p>We received a request to reset your account password.</p>
<p>Click the button below to set a new password.</p>
<p style="margin:14px 0 0;color:#8d9c91;">If this wasn't you, simply ignore this email.</p>`
      ),
      cta: { label: this.t(lng, "Відновити пароль", "Reset password"), url },
      locale: lng,
    });

    const text = this.t(
      lng,
      `Відновлення паролю:

${url}

Якщо це були не ви — просто ігноруйте лист.
— StudyCod`,
      `Password reset:

${url}

If this wasn't you, just ignore this email.
— StudyCod`
    );

    await this.sendEmail({
      to: email,
      subject: this.t(lng, "Відновлення паролю", "Password reset"),
      html,
      text,
    });
  }

  async sendSupportReply(opts: {
    to: string;
    subject: string;
    message: string;
  }) {
    const html = this.buildBaseEmail({
      title: opts.subject,
      preheader: "Відповідь від підтримки StudyCod.",
      contentHtml: `<p style="margin:0 0 12px 0;">Ми опрацювали ваше звернення та надіслали відповідь нижче:</p>
<div style="margin:0 0 10px 0;padding:9px 11px;border-radius:10px;background:rgba(255,180,84,0.10);border:1px dashed #ffb45466;color:#ffca7e;font-size:12px;font-weight:700;letter-spacing:0.25px;text-transform:uppercase;">Повідомлення від техпідтримки</div>
<div style="white-space:pre-wrap;background:#222b25;border:1px solid #343c36;border-radius:8px;padding:14px;color:#b6c1b8;line-height:1.72;">${this.escapeHtml(
        opts.message
      )}</div>`,
      footer: "StudyCod Technical Support",
    });

    await this.sendEmail({
      to: opts.to,
      subject: `Re: ${opts.subject}`,
      html,
      text: opts.message,
      fromOverride: this.supportFromEmail,
    });
  }
}

export const emailService = new EmailService();
