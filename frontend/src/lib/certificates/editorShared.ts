export const CERTIFICATE_CANVAS_WIDTH = 1123;
export const CERTIFICATE_CANVAS_HEIGHT = 794;

function looksLikeInlineSvg(input: string): boolean {
  const value = String(input ?? "").trim();
  if (!value) return false;
  return /^<svg[\s>]/i.test(value) || /^<\?xml[^>]*>\s*<svg[\s>]/i.test(value);
}

export function normalizeCertificateBackgroundSource(input: string): string {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if (looksLikeInlineSvg(value)) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;
  }
  return value;
}

export function isSupportedCertificateBackgroundFile(file: File): boolean {
  const mime = String(file?.type ?? "").toLowerCase();
  const name = String(file?.name ?? "").toLowerCase();
  return (
    mime.startsWith("image/") ||
    mime === "image/svg+xml" ||
    mime === "text/xml" ||
    mime === "application/xml" ||
    name.endsWith(".svg")
  );
}

export function isSvgCertificateBackgroundFile(file: File): boolean {
  const mime = String(file?.type ?? "").toLowerCase();
  const name = String(file?.name ?? "").toLowerCase();
  return mime === "image/svg+xml" || mime === "text/xml" || mime === "application/xml" || name.endsWith(".svg");
}

export function toCssUrlValue(input: string): string {
  const value = String(input ?? "").trim();
  if (!value) return "";
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, "");
  return `url("${escaped}")`;
}

// ---------------------------------------------------------------------------
// Canonical certificate layout → HTML/CSS engine.
// This is the single source of truth shared by BOTH the contest editor
// (ContestPage) and the admin global-template editor (AdminDashboardPage) so
// that what is designed on the canvas renders identically in the generated PDF
// no matter where it was authored. The backend renders this HTML/CSS verbatim.
// ---------------------------------------------------------------------------

export type CertificateFieldKey =
  | "contest_name"
  | "name"
  | "full_name"
  | "place"
  | "score"
  | "max_score"
  | "date"
  | "organizer"
  | "signature"
  | "certificate_id"
  | "qr_code";

export const CERTIFICATE_FIELD_KEYS: CertificateFieldKey[] = [
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
];

export type CertificateFieldLayout = {
  x: number;
  y: number;
  fontSize: number;
  align: "left" | "center" | "right";
  fontWeight: number;
  width: number;
};

export type CertificateLayoutState = Record<CertificateFieldKey, CertificateFieldLayout>;

export type CertificateExtraObjectType = "text" | "image" | "shape";

export type CertificateExtraObject = {
  id: string;
  type: CertificateExtraObjectType;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  align: "left" | "center" | "right";
  fontSize: number;
  fontWeight: number;
  text: string;
  imageUrl: string;
  color: string;
  backgroundColor: string;
  opacity: number;
  borderRadius: number;
  rotation: number;
};

export function defaultCertificateLayoutState(): CertificateLayoutState {
  return {
    contest_name: { x: 50, y: 18, fontSize: 28, align: "center", fontWeight: 700, width: 76 },
    name: { x: 50, y: 34, fontSize: 34, align: "center", fontWeight: 700, width: 80 },
    full_name: { x: 50, y: 40, fontSize: 42, align: "center", fontWeight: 700, width: 84 },
    place: { x: 50, y: 45, fontSize: 26, align: "center", fontWeight: 600, width: 52 },
    score: { x: 50, y: 53, fontSize: 22, align: "center", fontWeight: 600, width: 44 },
    max_score: { x: 62, y: 53, fontSize: 18, align: "left", fontWeight: 500, width: 20 },
    date: { x: 12, y: 87, fontSize: 16, align: "left", fontWeight: 500, width: 24 },
    organizer: { x: 50, y: 87, fontSize: 16, align: "center", fontWeight: 500, width: 40 },
    signature: { x: 84, y: 87, fontSize: 16, align: "right", fontWeight: 500, width: 24 },
    certificate_id: { x: 12, y: 93, fontSize: 12, align: "left", fontWeight: 500, width: 30 },
    qr_code: { x: 86, y: 93, fontSize: 12, align: "right", fontWeight: 500, width: 12 },
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function cssClassSafeId(input: string): string {
  return String(input ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function escapeHtmlText(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCustomAutoLayoutHtml(
  fields: Record<CertificateFieldKey, { isEnabled: boolean; isRequired: boolean }>,
  extraObjects: CertificateExtraObject[]
): string {
  const lines = CERTIFICATE_FIELD_KEYS
    .filter((key) => Boolean(fields[key]?.isEnabled))
    .map((key) => key === "qr_code"
      ? `<img class="cf-field cf-${key} cf-qr-image" src="{{${key}}}" alt="qr" />`
      : `<div class="cf-field cf-${key}">{{${key}}}</div>`);

  const extraLines = extraObjects.map((obj) => {
    const cls = `cf-extra-${cssClassSafeId(obj.id)}`;
    if (obj.type === "image") {
      const src = String(obj.imageUrl ?? "").trim();
      const safeAlt = escapeHtmlText("certificate-image");
      return `<img class="cf-extra ${cls}" src="${escapeHtmlText(src)}" alt="${safeAlt}" />`;
    }
    if (obj.type === "shape") {
      return `<div class="cf-extra ${cls}" aria-hidden="true"></div>`;
    }
    return `<div class="cf-extra ${cls}">${escapeHtmlText(obj.text || "Additional text")}</div>`;
  });

  return `<div class="cert-wrap">\n${lines.join("\n")}\n${extraLines.join("\n")}\n</div>`;
}

export function buildCustomAutoLayoutCss(params: {
  layouts: CertificateLayoutState;
  backgroundImageUrl: string;
  extraObjects: CertificateExtraObject[];
}): string {
  const safeBgUrl = String(params.backgroundImageUrl ?? "").trim();
  const backgroundImageValue = safeBgUrl
    ? `${toCssUrlValue(safeBgUrl)}, linear-gradient(135deg, #ffffff, #f1f5f9)`
    : "linear-gradient(135deg, #ffffff, #f1f5f9)";

  const fieldRules = CERTIFICATE_FIELD_KEYS.map((key) => {
    const l = params.layouts[key];
    const x = Math.max(0, Math.min(100, Number(l?.x ?? 50)));
    const y = Math.max(0, Math.min(100, Number(l?.y ?? 50)));
    const size = Math.max(10, Math.min(72, Number(l?.fontSize ?? 18)));
    const weight = Math.max(300, Math.min(900, Number(l?.fontWeight ?? 500)));
    const width = Math.max(8, Math.min(96, Number(l?.width ?? 40)));
    const align = l?.align === "right" || l?.align === "center" ? l.align : "left";
    const translate = align === "center" ? "translate(-50%, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
    return `.cf-${key} { left: ${x}%; top: ${y}%; width: ${width}%; font-size: ${size}px; font-weight: ${weight}; text-align: ${align}; transform: ${translate}; }`;
  });

  const extraRules = params.extraObjects.map((obj) => {
    const cls = `.cf-extra-${cssClassSafeId(obj.id)}`;
    const x = clampNumber(Number(obj.x ?? 50), 0, 100);
    const y = clampNumber(Number(obj.y ?? 50), 0, 100);
    const width = clampNumber(Number(obj.width ?? 20), 2, 96);
    const height = clampNumber(Number(obj.height ?? 10), 2, 96);
    const fontSize = clampNumber(Number(obj.fontSize ?? 16), 8, 96);
    const fontWeight = clampNumber(Number(obj.fontWeight ?? 500), 300, 900);
    const align = obj.align === "left" || obj.align === "right" ? obj.align : "center";
    const opacity = clampNumber(Number(obj.opacity ?? 1), 0.05, 1);
    const radius = clampNumber(Number(obj.borderRadius ?? 0), 0, 48);
    const rotation = clampNumber(Number(obj.rotation ?? 0), -180, 180);
    const zIndex = clampNumber(Number(obj.zIndex ?? 20), 1, 999);
    const transform = align === "left"
      ? `translate(0, -50%) rotate(${rotation}deg)`
      : align === "right"
        ? `translate(-100%, -50%) rotate(${rotation}deg)`
        : `translate(-50%, -50%) rotate(${rotation}deg)`;

    const base = `${cls} { left: ${x}%; top: ${y}%; width: ${width}%; height: ${height}%; text-align: ${align}; transform: ${transform}; opacity: ${opacity}; border-radius: ${radius}px; z-index: ${Math.round(zIndex)}; }`;

    if (obj.type === "image") {
      return [
        base,
        `${cls} { object-fit: contain; background: transparent; }`,
      ].join("\n");
    }
    if (obj.type === "shape") {
      return [
        base,
        `${cls} { background: ${String(obj.backgroundColor || "rgba(59,130,246,0.25)")}; border: 1px solid rgba(15,23,42,0.2); }`,
      ].join("\n");
    }
    const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    return [
      base,
      `${cls} { color: ${String(obj.color || "#0f172a")}; font-size: ${fontSize}px; font-weight: ${fontWeight}; line-height: 1.2; white-space: pre-wrap; background: ${String(obj.backgroundColor || "transparent")}; padding: 2px 6px; display: flex; align-items: center; justify-content: ${justify}; }`,
    ].join("\n");
  });

  return [
    "/* AUTOLAYOUT_START */",
    ".cert-wrap {",
    "  position: relative;",
    "  width: 1123px;",
    "  height: 794px;",
    "  box-sizing: border-box;",
    `  background-image: ${backgroundImageValue};`,
    "  background-repeat: no-repeat;",
    "  background-position: center;",
    "  background-size: 100% 100%;",
    "  image-rendering: auto;",
    "  -webkit-print-color-adjust: exact;",
    "  print-color-adjust: exact;",
    "  border: 2px solid #334155;",
    "  border-radius: 12px;",
    "  overflow: hidden;",
    "}",
    ".cf-field {",
    "  position: absolute;",
    "  max-width: 96%;",
    "  color: #0f172a;",
    "  white-space: normal;",
    "  line-height: 1.2;",
    "}",
    ".cf-qr-image {",
    "  object-fit: contain;",
    "  height: auto;",
    "}",
    ".cf-extra {",
    "  position: absolute;",
    "  max-width: 96%;",
    "  box-sizing: border-box;",
    "}",
    ...fieldRules,
    ...extraRules,
    "/* AUTOLAYOUT_END */",
  ].join("\n");
}

export function mergeAutoLayoutCss(existingCss: string, autoCss: string): string {
  const text = String(existingCss ?? "");
  const start = text.indexOf("/* AUTOLAYOUT_START */");
  const end = text.indexOf("/* AUTOLAYOUT_END */");
  if (start >= 0 && end > start) {
    const afterEnd = end + "/* AUTOLAYOUT_END */".length;
    return `${text.slice(0, start).trimEnd()}\n\n${autoCss}\n\n${text.slice(afterEnd).trimStart()}`.trim();
  }
  return [text.trim(), autoCss.trim()].filter(Boolean).join("\n\n");
}
