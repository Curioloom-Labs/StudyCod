import nodemailer from "nodemailer";
import * as https from "https";
import type { IncomingMessage } from "http";
import { logger } from "../utils/logger";

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
  private readonly supportFromEmail: string;

  constructor() {
    this.fromEmail =
      process.env.EMAIL_FROM || "StudyCod <noreply@studycod.space>";

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

  async sendAnnouncementEmail(email: string, username: string, className: string, title: string | null, preview: string) {
    const html = this.buildBaseEmail({
      title: title ? `Оголошення: ${title}` : "Оголошення",
      preheader: preview ? `${preview}` : `Нове оголошення у класі ${className}`,
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ви отримали нове оголошення у класі <b>${this.escapeHtml(className)}</b>:</p>
<div style="margin:12px 0 0 0;padding:12px 12px;border:1px solid #233043;border-radius:10px;background:#0b0f14;color:#d6e1f0;">${this.escapeHtml(
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
        text: String(opts.text ?? '').slice(0, 10_000)
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
  }): string {
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
      "Це автоматичний лист від StudyCod. Будь ласка, не відповідайте на нього.";

    // Email-client friendly layout: table-based, inline styles.
    return `<!DOCTYPE html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0b0f14;color:#d6e1f0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <!-- Preheader (hidden) -->
    <div style="display:none;font-size:1px;color:#0b0f14;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0b0f14;">
      <tr>
        <td align="center" style="padding:36px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
            <!-- Brand -->
            <tr>
              <td align="center" style="padding:0 8px 18px 8px;">
                <a href="${this.getFrontendUrl()}" style="text-decoration:none;color:#e8f1ff;font-weight:900;font-size:20px;letter-spacing:0.4px;">
                  StudyCod
                </a>
                <div style="margin-top:6px;font-size:12px;color:#7f93ab;">${this.escapeHtml(
                  preheader
                )}</div>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background:#0f1724;border:1px solid #243448;border-radius:16px;padding:26px 22px;box-shadow:0 18px 55px rgba(0,0,0,0.45);">
                <div style="height:4px;background:#00e887;border-radius:999px;margin:0 0 16px 0;"></div>
                <h1 style="margin:0 0 10px 0;font-size:24px;line-height:1.25;color:#f1f6ff;letter-spacing:0.2px;">${title}</h1>
                ${greeting}
                <div style="font-size:15px;line-height:1.7;color:#d6e1f0;">
                  ${opts.contentHtml}
                </div>

                ${
                  opts.cta
                    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
                  <tr>
                    <td bgcolor="#00e887" style="border-radius:12px;">
                      <a href="${opts.cta.url}"
                         style="display:inline-block;padding:13px 20px;background:#00e887;color:#081019;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px;letter-spacing:0.1px;">
                        ${this.escapeHtml(opts.cta.label)}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0;font-size:12px;line-height:1.55;color:#9fb3c8;">
                  Якщо кнопка не працює, відкрийте посилання нижче:
                  <br />
                  <a href="${opts.cta.url}" style="color:#7ab7ff;text-decoration:underline;word-break:break-all;">${opts.cta.url}</a>
                </p>
                    `.trim()
                    : ""
                }
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:14px 10px 0 10px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#7f93ab;">
                  ${this.escapeHtml(footer)}
                </p>
                <p style="margin:8px 0 0 0;font-size:12px;color:#7f93ab;">© ${year} StudyCod • <a href="${this.getFrontendUrl()}" style="color:#7f93ab;text-decoration:underline;">studycod.space</a></p>
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
    username: string
  ) {
    const url = `${this.getFrontendUrl()}/verify-email?token=${token}`;

    const html = this.buildBaseEmail({
      title: "Підтвердження електронної пошти",
      preheader: "Підтвердіть email, щоб активувати акаунт StudyCod.",
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Дякуємо за реєстрацію в StudyCod.</p>
<p>Щоб активувати акаунт, підтвердіть вашу адресу електронної пошти.</p>
<p style="margin:14px 0 0 0;color:#9fb3c8;">Якщо ви не створювали акаунт, просто проігноруйте цей лист.</p>`,
      cta: { label: "Підтвердити email", url },
    });

    const text = `Привіт, ${username}!

Для підтвердження email перейдіть за посиланням:
${url}

— StudyCod`;

    await this.sendEmail({
      to: email,
      subject: "Підтвердження електронної пошти",
      html,
      text,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    username: string
  ) {
    const url = `${this.getFrontendUrl()}/auth/reset-password?token=${token}`;

    const html = this.buildBaseEmail({
      title: "Відновлення паролю",
      preheader: "Посилання для відновлення паролю до вашого акаунта StudyCod.",
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ми отримали запит на відновлення паролю для вашого акаунта.</p>
<p>Натисніть кнопку нижче, щоб встановити новий пароль.</p>
<p style="margin:14px 0 0 0;color:#9fb3c8;">Якщо це були не ви — просто проігноруйте цей лист.</p>`,
      cta: { label: "Відновити пароль", url },
    });

    const text = `Відновлення паролю:

${url}

Якщо це були не ви — просто ігноруйте лист.
— StudyCod`;

    await this.sendEmail({
      to: email,
      subject: "Відновлення паролю",
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
      contentHtml: `<p style="margin:0 0 12px 0;">Ми відповіли на ваше звернення:</p>
<div style="white-space:pre-wrap;background:#0b0f14;border:1px solid #233043;border-radius:10px;padding:12px 12px;color:#d6e1f0;">${this.escapeHtml(
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
