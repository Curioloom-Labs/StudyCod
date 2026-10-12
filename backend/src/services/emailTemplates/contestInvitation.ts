export type ContestInvitation = {
  fullName: string;
  username: string;
  password: string;
  contestTitle: string;
  entryUrl: string;
  siteUrl: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  includeContestInfo?: boolean;
  organizerMessage?: string;
  locale?: "uk" | "en";
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

const palette = {
  canvas: "#171b19",
  surface: "#1d221f",
  border: "#343c36",
  text: "#e9eee9",
  secondary: "#b6c1b8",
  muted: "#8d9c91",
  accent: "#a3c8ab",
  onAccent: "#18291e",
};

export function buildContestInvitationEmail(invitation: ContestInvitation): { subject: string; html: string; text: string } {
  const locale = invitation.locale === "en" ? "en" : "uk";
  const tr = (uk: string, en: string) => locale === "en" ? en : uk;
  const title = escapeHtml(invitation.contestTitle);
  const entryUrl = escapeHtml(invitation.entryUrl);
  const siteUrl = escapeHtml(invitation.siteUrl);
  const message = invitation.organizerMessage?.trim();
  const subject = tr(`Запрошення до контесту «${invitation.contestTitle}» · StudyCod`, `Invitation to ${invitation.contestTitle} · StudyCod`);
  const preheader = tr("Ваші дані для входу та повідомлення організатора.", "Your sign-in details and a message from the organizer.");
  const intro = tr("Організатор запросив вас до участі. Для входу використайте логін і пароль з цього листа.", "The organizer has invited you to take part. Use the username and password below to sign in.");
  const scope = tr("Ці дані працюють лише для цього контесту.", "These sign-in details work only for this contest.");
  const formatDate = (value: Date | string | null | undefined): string => {
    if (!value) return tr("Не вказано", "Not set");
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return tr("Не вказано", "Not set");
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "uk-UA", {
      timeZone: "Europe/Kyiv", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(date);
  };
  const start = formatDate(invitation.startsAt);
  const end = formatDate(invitation.endsAt);
  const timeZone = tr("Час за Києвом", "Kyiv time");
  const schedule = invitation.includeContestInfo !== false ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${palette.border};border-bottom:1px solid ${palette.border};">
        <tr>
          <td class="schedule-cell" width="50%" valign="top" style="padding:20px 16px 18px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:${palette.muted};">${tr("Початок", "Starts")}</p>
            <p style="margin:0;font-size:15px;line-height:1.5;color:${palette.text};">${escapeHtml(start)}</p>
          </td>
          <td class="schedule-cell schedule-end" width="50%" valign="top" style="padding:20px 0 18px 16px;">
            <p style="margin:0 0 6px;font-size:13px;color:${palette.muted};">${tr("Завершення", "Ends")}</p>
            <p style="margin:0;font-size:15px;line-height:1.5;color:${palette.text};">${escapeHtml(end)}</p>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:0 0 18px;font-size:12px;color:${palette.muted};">${timeZone}</td></tr>
      </table>` : "";
  const organizer = message ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:24px 0 0;">
          <h2 style="margin:0 0 8px;font-size:14px;font-weight:600;line-height:1.5;color:${palette.text};">${tr("Від організатора", "From the organizer")}</h2>
          <p style="margin:0;font-size:15px;line-height:1.65;color:${palette.secondary};overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(message).replace(/\r\n|\r|\n/g, "<br />")}</p>
        </td></tr>
      </table>` : "";

  // Tables and inline colors are intentional: mail clients do not consistently support app CSS.
  const html = `<!DOCTYPE html>
<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(subject)}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0; mso-table-rspace:0; }
    a:focus-visible { outline:2px solid ${palette.accent}; outline-offset:4px; }
    @media screen and (max-width:480px) {
      .mail-outer { padding:20px 12px 28px !important; }
      .mail-content { padding:26px 22px !important; }
      .mail-title { font-size:26px !important; }
      .schedule-cell { display:block !important; width:100% !important; padding:16px 0 0 !important; }
      .schedule-end { padding-bottom:16px !important; }
      .credential-label { width:72px !important; padding-left:16px !important; }
      .credential-value { padding-right:16px !important; }
      .mail-button { display:block !important; text-align:center !important; }
      .mail-action { width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${palette.canvas};color:${palette.text};font-family:'Segoe UI',Arial,sans-serif;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.canvas}" style="table-layout:fixed;">
    <tr><td class="mail-outer" align="center" style="padding:36px 20px 40px;">
      <!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;table-layout:fixed;">
        <tr><td style="padding:0 4px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" bgcolor="#26342b" style="border:1px solid #46544b;border-radius:9px;color:${palette.accent};font-family:Consolas,'Courier New',monospace;font-size:17px;font-weight:bold;">&lt;/&gt;</td>
            <td style="padding-left:11px;"><a href="${siteUrl}" style="font-size:20px;font-weight:700;letter-spacing:-.5px;color:${palette.text};text-decoration:none;">StudyCod</a></td>
          </tr></table>
        </td></tr>
        <tr><td class="mail-content" bgcolor="${palette.surface}" style="padding:34px 36px;border:1px solid ${palette.border};border-radius:12px;">
          <p style="margin:0 0 12px;color:${palette.accent};font-size:13px;font-weight:600;line-height:1.5;">${tr("Запрошення до контесту", "Contest invitation")}</p>
          <h1 class="mail-title" style="margin:0 0 24px;font-size:30px;font-weight:700;letter-spacing:-.7px;line-height:1.2;color:${palette.text};overflow-wrap:anywhere;word-break:break-word;">${title}</h1>
          <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:${palette.text};overflow-wrap:anywhere;word-break:break-word;">${tr("Вітаємо", "Hello")}, ${escapeHtml(invitation.fullName)}.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${palette.secondary};">${intro}</p>
          ${schedule}
          ${organizer}
          <h2 style="margin:28px 0 12px;font-size:16px;font-weight:600;line-height:1.5;color:${palette.text};">${tr("Дані для входу", "Sign-in details")}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.canvas}" style="border:1px solid ${palette.border};border-radius:8px;table-layout:fixed;">
            <tr>
              <td class="credential-label" width="90" valign="top" style="padding:16px 12px 16px 20px;border-bottom:1px solid ${palette.border};font-size:13px;line-height:1.6;color:${palette.muted};">${tr("Логін", "Username")}</td>
              <td class="credential-value" valign="top" style="padding:16px 20px 16px 0;border-bottom:1px solid ${palette.border};font-size:15px;line-height:1.6;color:${palette.text};font-family:Consolas,'Courier New',monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(invitation.username)}</td>
            </tr>
            <tr>
              <td class="credential-label" width="90" valign="top" style="padding:16px 12px 16px 20px;font-size:13px;line-height:1.6;color:${palette.muted};">${tr("Пароль", "Password")}</td>
              <td class="credential-value" valign="top" style="padding:16px 20px 16px 0;font-size:15px;line-height:1.6;color:${palette.text};font-family:Consolas,'Courier New',monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(invitation.password)}</td>
            </tr>
          </table>
          <p style="margin:10px 0 24px;font-size:12px;line-height:1.6;color:${palette.muted};">${scope}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td>
            <table class="mail-action" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td bgcolor="${palette.accent}" style="border-radius:6px;mso-padding-alt:13px 22px;">
              <a class="mail-button" href="${entryUrl}" style="display:inline-block;padding:13px 22px;border:1px solid ${palette.accent};border-radius:6px;color:${palette.onAccent};font-size:15px;font-weight:600;line-height:1.4;text-decoration:none;mso-padding-alt:0;">${tr("Увійти до контесту", "Open contest")}</a>
            </td></tr></table>
          </td></tr></table>
          <p style="margin:18px 0 4px;font-size:12px;line-height:1.6;color:${palette.muted};">${tr("Або відкрийте посилання у браузері:", "Or open this link in your browser:")}</p>
          <a href="${entryUrl}" style="font-size:12px;line-height:1.6;color:${palette.secondary};text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${entryUrl}</a>
        </td></tr>
        <tr><td style="padding:22px 4px 0;font-size:12px;line-height:1.7;color:${palette.muted};">
          <p style="margin:0 0 6px;">${tr("Цей лист надіслав організатор контесту через StudyCod.", "The contest organizer sent this email through StudyCod.")}</p>
          <p style="margin:0;">© ${new Date().getFullYear()} StudyCod · Curioloom Labs</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    tr("Запрошення до контесту", "Contest invitation"), invitation.contestTitle, "",
    `${tr("Вітаємо", "Hello")}, ${invitation.fullName}.`, intro, "",
    ...(invitation.includeContestInfo !== false ? [`${tr("Початок", "Starts")}: ${start}`, `${tr("Завершення", "Ends")}: ${end}`, timeZone, ""] : []),
    ...(message ? [`${tr("Від організатора", "From the organizer")}:`, message, ""] : []),
    `${tr("Логін", "Username")}: ${invitation.username}`, `${tr("Пароль", "Password")}: ${invitation.password}`, scope, "",
    `${tr("Увійти до контесту", "Open contest")}: ${invitation.entryUrl}`,
  ].join("\n");
  return { subject, html, text };
}
