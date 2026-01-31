import nodemailer from "nodemailer";

/**
 * Production Email Service
 * Provider: Brevo SMTP (smtp-relay.brevo.com)
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;

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
    if (process.env.EMAIL_PROVIDER !== "smtp") {
      console.warn(
        "[EmailService] EMAIL_PROVIDER != smtp. Emails will be logged only."
      );
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

  async sendAnnouncementEmail(email: string, username: string, className: string, title: string | null, preview: string) {
    const html = this.buildBaseEmail({
      title: title ? `Оголошення: ${title}` : "Оголошення",
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ви отримали нове оголошення у класі <b>${this.escapeHtml(className)}</b>:</p><blockquote>${this.escapeHtml(preview)}</blockquote>`
    });
    const text = `Оголошення у класі ${className}:
  }
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
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ваша серія успіхів (${streak} днів) під загрозою! Не забудьте виконати завдання сьогодні, щоб не втратити прогрес.</p>`
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
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Вам призначено ${type === "CONTROL_WORK" ? "контрольну роботу" : "нове завдання"}: <b>${this.escapeHtml(taskTitle)}</b></p><p>Дедлайн: <b>${deadline.toLocaleString("uk-UA")}</b></p>`
    });
    const text = `${type === "CONTROL_WORK" ? "Контрольна робота" : "Нове завдання"}: ${taskTitle}

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

  private async sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromOverride?: string;
  }): Promise<void> {
    if (!this.transporter) {
      // DEV / disabled mode
      console.log("\n=== EMAIL (LOG MODE) ===");
      console.log("To:", opts.to);
      console.log("Subject:", opts.subject);
      console.log(opts.text);
      console.log("========================\n");
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
    } catch (err) {
      console.error("[EmailService] Send failed:", err);
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
    const greeting = opts.greeting
      ? `<p style="color:#9fb3c8;">${this.escapeHtml(opts.greeting)}</p>`
      : "";

    const footer =
      opts.footer ||
      "Це автоматичний лист від StudyCod. Будь ласка, не відповідайте на нього.";

    return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
</head>
<body style="background:#0b0f14;color:#d6e1f0;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px;">
    <h2>${title}</h2>
    ${greeting}
    <div>${opts.contentHtml}</div>

    ${
      opts.cta
        ? `<p style="margin-top:24px;">
             <a href="${opts.cta.url}"
                style="padding:12px 20px;
                       background:#00ff88;
                       color:#0b0f14;
                       text-decoration:none;
                       border-radius:6px;
                       font-weight:bold;">
               ${this.escapeHtml(opts.cta.label)}
             </a>
           </p>`
        : ""
    }

    <hr style="margin:32px 0;border-color:#233043"/>
    <p style="font-size:12px;color:#6a6a7f">${this.escapeHtml(
      footer
    )}</p>
    <p style="font-size:12px;color:#6a6a7f">© 2025 StudyCod</p>
  </div>
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
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Підтвердіть email для активації акаунта.</p>`,
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
      greeting: `Привіт, ${username}!`,
      contentHtml: `<p>Ми отримали запит на відновлення паролю.</p>`,
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
      contentHtml: `<pre>${this.escapeHtml(opts.message)}</pre>`,
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
