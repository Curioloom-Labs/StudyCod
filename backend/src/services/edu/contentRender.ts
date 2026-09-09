/**
 * Pure rendering of content-page course items (THEORY/PAGE) into the HTML stored
 * in a lesson's theory. Supports authored HTML/text plus first-class video and
 * document embeds, with defensive URL handling (only http/https; everything else
 * is dropped). No DB/IO — unit-testable.
 */

export interface PageContent {
  html?: unknown;
  text?: unknown;
  body?: unknown;
  videoUrl?: unknown;
  /** Optional WebVTT/SRT-compatible caption track for direct media URLs. */
  videoCaptionUrl?: unknown;
  videoCaptionLang?: unknown;
  videoCaptionLabel?: unknown;
  docUrl?: unknown;
  docLabel?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Return only a well-formed public http(s) URL; local/private targets are rejected. */
export function safeHttpUrl(raw: unknown): string | null {
  const s = str(raw).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isPrivateOrLocalHost(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname === "metadata.google.internal"
  ) return true;

  if (hostname.includes(":")) {
    // Loopback, unspecified, link-local and unique-local IPv6 ranges.
    return hostname === "::1"
      || hostname === "::"
      || hostname.startsWith("fe8")
      || hostname.startsWith("fe9")
      || hostname.startsWith("fea")
      || hostname.startsWith("feb")
      || hostname.startsWith("fc")
      || hostname.startsWith("fd");
  }

  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && b >= 18 && b <= 19)
    || a >= 224;
}

/** YouTube watch/short URL → privacy-friendly embed URL, or null if not YouTube. */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.slice("/embed/".length);
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.slice("/shorts/".length);
    }
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return null;
  }
}

function safeCaptionLanguage(raw: unknown): string {
  const value = str(raw).trim();
  return /^[a-z]{2,3}(?:-[A-Z]{2})?$/i.test(value) ? value : "uk";
}

function renderVideo(rawUrl: unknown, content: PageContent): string {
  const url = safeHttpUrl(rawUrl);
  if (!url) return "";
  const yt = youtubeEmbedUrl(url);
  if (yt) {
    return `<div class="sc-video"><iframe src="${escapeHtml(yt)}" title="Embedded video" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    const captionUrl = safeHttpUrl(content.videoCaptionUrl);
    const captionLabel = str(content.videoCaptionLabel).trim() || "Українські субтитри";
    const track = captionUrl
      ? `<track kind="captions" src="${escapeHtml(captionUrl)}" srclang="${escapeHtml(safeCaptionLanguage(content.videoCaptionLang))}" label="${escapeHtml(captionLabel)}" default>`
      : "";
    return `<div class="sc-video"><video controls aria-label="Embedded video" src="${escapeHtml(url)}">${track}</video></div>`;
  }
  // Unknown provider → safe external link.
  return `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`;
}

function renderDoc(rawUrl: unknown, label: unknown): string {
  const url = safeHttpUrl(rawUrl);
  if (!url) return "";
  const text = str(label).trim() || url;
  return `<p class="sc-doc"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a></p>`;
}

/**
 * Render one content item to an HTML section (title + body + optional video/doc).
 * Returns "" when there is nothing renderable.
 */
export function renderPageContent(title: string, content: PageContent | null | undefined): string {
  const c = content ?? {};
  const parts: string[] = [];
  const body = str(c.html) || str(c.text) || str(c.body);
  if (body) parts.push(body);
  parts.push(renderVideo(c.videoUrl, c));
  parts.push(renderDoc(c.docUrl, c.docLabel));

  const inner = parts.filter(Boolean).join("\n");
  if (!inner) return "";
  return `<section><h3>${escapeHtml(title)}</h3>${inner}</section>`;
}
