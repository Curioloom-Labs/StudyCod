import nodemailer from "nodemailer";
import * as https from "https";
import type { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";
import { BACKEND_PUBLIC_URL, JWT_SECRET } from "../config";
import { DEFAULT_GRADING_SYSTEM, type GradingSystem } from "../types/GradingSystem";
import { formatGradeForSystem as formatGradeForGradingSystem, gradingSystemDisplayLabel } from "../utils/gradingScale";

/**
 * Production Email Service
 * Providers:
 * - smtp (nodemailer)
 * - brevo-api (Brevo Transactional Email API)
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private provider: "smtp" | "brevo-api" | "log" = "smtp";

  private readonly fromEmail: string;
  private readonly notificationsFromEmail: string;
  private readonly supportFromEmail: string;

  constructor() {
    this.fromEmail =
      process.env.EMAIL_FROM || "StudyCod <noreply@studycod.space>";

    this.notificationsFromEmail =
      process.env.EMAIL_FROM_NOTIFICATIONS || this.fromEmail;

    this.supportFromEmail =
      "StudyCod Support <support@studycod.space>";

    this.initializeTransporter();
  }

  /* =========================
     Transporter
     ========================= */

  private initializeTransporter() {
    const providerRaw = String(process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
    this.provider = (providerRaw === "brevo-api" || providerRaw === "brevo_api")
      ? "brevo-api"
      : providerRaw === "smtp"
        ? "smtp"
        : "log";

    if (this.provider === "brevo-api") {
      // No SMTP transporter needed.
      this.transporter = null;

      const apiKey = String(process.env.BREVO_API_KEY || "").trim();
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
      !process.env.SMTP_HOST ||
      !process.env.SMTP_PORT ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD
    ) {
      throw new Error(
        "[EmailService] SMTP configuration is incomplete"
      );
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,          // smtp-relay.brevo.com
      port: Number(process.env.SMTP_PORT),  // 587
      secure: process.env.SMTP_SECURE === "true", // false = STARTTLS
      auth: {
        user: process.env.SMTP_USER,        // apikey
        pass: process.env.SMTP_PASSWORD,    // SMTP API key
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
    return process.env.FRONTEND_URL || "http://localhost:5173";
  }

  private normalizeLocale(locale?: string | null): "uk" | "en" {
    const raw = String(locale ?? "").toLowerCase().trim();
    return raw.startsWith("en") ? "en" : "uk";
  }

  private t(locale: "uk" | "en", uk: string, en: string): string {
    return locale === "en" ? en : uk;
  }

  private getBackendPublicUrl(): string {
    return process.env.BACKEND_PUBLIC_URL || BACKEND_PUBLIC_URL || "http://localhost:4000";
  }

  private buildEmailPreferenceToken(params: {
    action: "unsubscribe" | "subscribe";
    kind: "user" | "student";
    id: number;
    email: string;
  }): string {
    // JWT_SECRET can be empty in non-production setups; still allow token generation.
    const secret = JWT_SECRET || process.env.JWT_SECRET || "dev-secret-change-me";
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
      title: title ? `Оголошення: ${title}` : "Оголошення",
      preheader: preview ? `${preview}` : `Нове оголошення у класі ${className}`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ви отримали нове оголошення у класі <b>${this.escapeHtml(className)}</b>:</p>
<div style="margin:12px 0 0 0;padding:14px 14px;border:1px solid #1f3552;border-radius:12px;background:#0a1422;color:#dbe9ff;">${this.escapeHtml(
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
      title: "Ви можете втратити серію!",
      preheader: `Ваша серія (${streak} днів) під загрозою — зробіть завдання сьогодні.`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ваша серія успіхів <b>${streak} днів</b> під загрозою.</p>
<p>Зайдіть у StudyCod та виконайте будь-яке завдання сьогодні, щоб не втратити прогрес.</p>`,
      cta: { label: "Перейти до StudyCod", url: this.getFrontendUrl() },
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
    const html = this.buildBaseEmail({
      title: type === "CONTROL_WORK" ? "Контрольна робота" : "Нове завдання",
      preheader: `Призначено: ${taskTitle}. Дедлайн: ${deadline.toLocaleString("uk-UA")}`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Вам призначено ${type === "CONTROL_WORK" ? "контрольну роботу" : "нове завдання"}: <b>${this.escapeHtml(
        taskTitle
      )}</b></p>
<p style="margin:10px 0 0 0;">Дедлайн: <b>${deadline.toLocaleString(
        "uk-UA"
      )}</b></p>`,
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

<hr style="border:none;border-top:1px solid #1f3552;margin:20px 0;" />
<p style="margin:0;font-size:12px;color:#8fa6c2;line-height:1.65;">
  Ви отримали цей лист, бо підписані на розсилку StudyCod.
  <br />
  Відписатися: <a href="${unsubscribeUrl}" style="color:#7bc9ff;text-decoration:underline;word-break:break-all;">${unsubscribeUrl}</a>
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
    className?: string | null;
    feedback?: string | null;
    studentName?: string | null;
    locale?: "uk" | "en";
  }): Promise<void> {
    const lng = this.normalizeLocale(opts.locale);
    const grade = Math.max(0, Math.min(100, Math.round(Number(opts.grade) || 0)));
    const gradingSystem = opts.gradingSystem || DEFAULT_GRADING_SYSTEM;
    const gradeDisplay = formatGradeForGradingSystem(grade, gradingSystem);
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
<div style="margin:0;padding:12px;border:1px solid #1f3552;border-radius:10px;background:#08111d;color:#dbe9ff;white-space:pre-wrap;">${this.escapeHtml(feedback)}</div>`
      : "";

    const statusUk = opts.event === "updated" ? "оновлену" : "нову";
    const statusEn = opts.event === "updated" ? "updated" : "new";

    const contentHtml = lng === "en"
      ? `<p>You have a ${statusEn} ${kindEn}.</p>
<p style="margin:8px 0 0 0;"><b>Item:</b> ${itemTitle}</p>
    <p style="margin:8px 0 0 0;"><b>Grade:</b> ${this.escapeHtml(gradeDisplay)}</p>
    ${scaleHtml}
${classHtml}
${feedbackHtml}`
      : `<p>Вам виставлено ${statusUk} оцінку для ${kindUk}.</p>
<p style="margin:8px 0 0 0;"><b>Елемент:</b> ${itemTitle}</p>
    <p style="margin:8px 0 0 0;"><b>Оцінка:</b> ${this.escapeHtml(gradeDisplay)}</p>
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
    const apiKey = String(process.env.BREVO_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("[EmailService] BREVO_API_KEY is missing (required for brevo-api)");
    }
    if (apiKey.startsWith("xsmtpsib-")) {
      throw new Error("[EmailService] BREVO_API_KEY is an SMTP key (xsmtpsib-...). Create a REST API key (xkeysib-...) and use that here.");
    }

    const sender = this.parseFromHeader(opts.fromOverride || this.fromEmail);

    const payload: any = {
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
    } catch (err: any) {
      logger.error('[email] send failed', { message: err?.message });
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
      ? `<p style="margin:0 0 12px 0;color:#9fb3c8;font-size:14px;">${this.escapeHtml(
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

    // Email-client friendly layout: table-based, inline styles.
    return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#060b14;color:#dbe9ff;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;">
    <!-- Preheader (hidden) -->
    <div style="display:none;font-size:1px;color:#060b14;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#060b14;">
      <tr>
        <td align="center" style="padding:34px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="max-width:620px;width:100%;">
            <!-- Brand -->
            <tr>
              <td align="center" style="padding:0 8px 16px 8px;">
                <a href="${this.getFrontendUrl()}" style="text-decoration:none;color:#f2f7ff;font-weight:900;font-size:19px;letter-spacing:0.35px;">
                  StudyCod
                </a>
                <div style="margin-top:8px;font-size:11px;color:#8fa6c2;text-transform:uppercase;letter-spacing:0.9px;">${this.escapeHtml(
                  preheader
                )}</div>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background:#0c1626;border:1px solid #1f3552;border-radius:20px;padding:24px 22px;box-shadow:0 22px 60px rgba(0,0,0,0.48);">
                <div style="height:4px;background:linear-gradient(90deg,#00ff88 0%, #7bc9ff 55%, #9a7dff 100%);border-radius:999px;margin:0 0 16px 0;"></div>
                <h1 style="margin:0 0 10px 0;font-size:24px;line-height:1.24;color:#f2f7ff;letter-spacing:0.2px;">${title}</h1>
                ${greeting}
                <div style="font-size:15px;line-height:1.72;color:#dbe9ff;">
                  ${opts.contentHtml}
                </div>

                ${
                  opts.cta
                    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
                  <tr>
                    <td bgcolor="#00ff88" style="border-radius:12px;">
                      <a href="${opts.cta.url}"
                         style="display:inline-block;padding:13px 20px;background:#00ff88;color:#04110a;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px;letter-spacing:0.1px;">
                        ${this.escapeHtml(opts.cta.label)}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0;font-size:12px;line-height:1.55;color:#8fa6c2;">
                  Якщо кнопка не працює, відкрийте посилання нижче:
                  <br />
                  <a href="${opts.cta.url}" style="color:#7bc9ff;text-decoration:underline;word-break:break-all;">${opts.cta.url}</a>
                </p>
                    `.trim()
                    : ""
                }
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:14px 10px 0 10px;">
                <p style="margin:0;font-size:12px;line-height:1.65;color:#7f96b2;">
                  ${this.escapeHtml(footer)}
                </p>
                <p style="margin:8px 0 0 0;font-size:12px;color:#7f96b2;">© ${year} StudyCod • <a href="${this.getFrontendUrl()}" style="color:#7f96b2;text-decoration:underline;">studycod.space</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
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
<p style="margin:14px 0 0 0;color:#9fb3c8;">Якщо ви не створювали акаунт, просто проігноруйте цей лист.</p>`,
        `<p>Thanks for registering at StudyCod.</p>
<p>Please confirm your email address to activate your account.</p>
<p style="margin:14px 0 0 0;color:#9fb3c8;">If you did not create this account, just ignore this email.</p>`
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
    locale?: "uk" | "en"
  ) {
    const lng = this.normalizeLocale(locale);
    const url = `${this.getFrontendUrl()}/auth/reset-password?token=${token}`;

    const html = this.buildBaseEmail({
      title: this.t(lng, "Відновлення паролю", "Password reset"),
      preheader: this.t(lng, "Посилання для відновлення паролю до вашого акаунта StudyCod.", "Use this link to reset your StudyCod account password."),
      greeting: this.t(lng, `Привіт, ${username}!`, `Hi, ${username}!`),
      contentHtml: this.t(
        lng,
        `<p>Ми отримали запит на відновлення паролю для вашого акаунта.</p>
<p>Натисніть кнопку нижче, щоб встановити новий пароль.</p>
<p style="margin:14px 0 0 0;color:#9fb3c8;">Якщо це були не ви — просто проігноруйте цей лист.</p>`,
        `<p>We received a request to reset your account password.</p>
<p>Click the button below to set a new password.</p>
<p style="margin:14px 0 0 0;color:#9fb3c8;">If this wasn't you, simply ignore this email.</p>`
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
<div style="margin:0 0 10px 0;padding:9px 11px;border-radius:10px;background:#0a1422;border:1px dashed #2a4d73;color:#9ec7ff;font-size:12px;font-weight:700;letter-spacing:0.25px;text-transform:uppercase;">Повідомлення від техпідтримки</div>
<div style="white-space:pre-wrap;background:#08111d;border:1px solid #1f3552;border-radius:12px;padding:14px 14px;color:#dbe9ff;line-height:1.72;">${this.escapeHtml(
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
