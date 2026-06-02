import Handlebars from "handlebars";
import { CertificateFieldRecord, CertificatePayload } from "./types";

const ALL_KEYS = new Set([
  "contest_name",
  "name",
  "full_name",
  "place",
  "score",
  "max_score",
  "date",
  "organizer",
  "signature",
  "certificate_id",
  "qr_code",
]);

function escapeHtml(input: unknown): string {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEnabledFields(fields: CertificateFieldRecord[]): Set<string> {
  const enabled = new Set<string>();
  for (const f of fields || []) {
    if (f.isEnabled && ALL_KEYS.has(f.fieldKey)) enabled.add(f.fieldKey);
  }
  return enabled;
}

export class CertificateTemplateEngine {
  renderStudyCodTemplate(params: {
    payload: CertificatePayload;
    fields: CertificateFieldRecord[];
    cssTemplate?: string | null;
  }): string {
    const enabled = normalizeEnabledFields(params.fields);
    const p = params.payload;
    const show = (key: string) => enabled.has(key);

    const extraCss = String(params.cssTemplate ?? "").trim();

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4 landscape; margin: 0; }
      html, body { margin: 0; width: 297mm; height: 210mm; }
      body { font-family: Arial, sans-serif; background: #f4f8ff; overflow: hidden; }
      .certificate {
        width: 297mm;
        height: 210mm;
        box-sizing: border-box;
        padding: 48px 64px;
        border: 12px solid #0f2f5f;
        background: linear-gradient(135deg, #ffffff 0%, #eef5ff 100%);
        position: relative;
        overflow: hidden;
      }
      .brand { color: #0f2f5f; font-size: 22px; font-weight: 700; letter-spacing: 1px; }
      .title { margin-top: 16px; font-size: 44px; color: #0f2f5f; font-weight: 800; }
      .subtitle { margin-top: 12px; color: #375b93; font-size: 18px; }
      .name { margin-top: 34px; font-size: 48px; color: #041a3a; font-weight: 700; }
      .full_name { display: none; margin-top: 6px; font-size: 28px; color: #1d3f74; font-weight: 600; }
      .score { margin-top: 20px; font-size: 28px; color: #1d3f74; }
      .meta { margin-top: 24px; font-size: 16px; color: #324f7b; line-height: 1.7; }
      .signature { position: absolute; right: 64px; bottom: 72px; color: #0f2f5f; font-size: 18px; }
      .id { position: absolute; left: 64px; bottom: 30px; font-size: 12px; color: #4b6288; }
      .qr { position: absolute; right: 64px; top: 64px; width: 112px; height: 112px; border: 1px solid #d8e4fb; background: #fff; }
      ${extraCss}
    </style>
  </head>
  <body>
    <div class="certificate">
      <div class="brand">StudyCod</div>
      <div class="title">Certificate of Achievement</div>
      <div class="subtitle">This certificate is proudly presented to</div>
      <div class="name">${show("name") ? escapeHtml(p.name) : ""}</div>
      <div class="full_name">${show("full_name") ? escapeHtml(p.full_name) : ""}</div>
      ${show("score")
        ? `<div class="score">Score: <b>${escapeHtml(p.score)}</b>${show("max_score") ? ` / ${escapeHtml(p.max_score)}` : ""}</div>`
        : ""}

      <div class="meta">
        ${show("contest_name") ? `<div>Contest: <b>${escapeHtml(p.contest_name)}</b></div>` : ""}
        ${show("place") && p.place ? `<div>Place: <b>${escapeHtml(p.place)}</b></div>` : ""}
        ${show("max_score") ? `<div>Max score: <b>${escapeHtml(p.max_score)}</b></div>` : ""}
        ${show("date") ? `<div>Date: <b>${escapeHtml(p.date)}</b></div>` : ""}
        ${show("organizer") ? `<div>Organizer: <b>${escapeHtml(p.organizer)}</b></div>` : ""}
      </div>

      ${show("signature") ? `<div class="signature">Signature: ${escapeHtml(p.signature)}</div>` : ""}
      ${show("certificate_id") ? `<div class="id">Certificate ID: ${escapeHtml(p.certificate_id)}</div>` : ""}
      ${show("qr_code") ? `<img class="qr" src="${escapeHtml(p.qr_code)}" alt="qr" />` : ""}
    </div>
  </body>
</html>`;
  }

  renderCustomTemplate(params: {
    htmlTemplate: string;
    cssTemplate?: string | null;
    payload: CertificatePayload;
  }): string {
    const template = Handlebars.compile(params.htmlTemplate, { noEscape: false, strict: false });
    const body = template(params.payload);
    const css = String(params.cssTemplate ?? "").trim();

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4 landscape; margin: 0; }
      html, body { margin: 0; width: 297mm; height: 210mm; overflow: hidden; }
      body { background: #ffffff; font-family: Arial, Helvetica, sans-serif; }
      ${css}
    </style>
  </head>
  <body>${body}</body>
</html>`;
  }
}
