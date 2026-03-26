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
