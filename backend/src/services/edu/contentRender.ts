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

/** Return the URL only if it is a well-formed http(s) URL; else null. */
export function safeHttpUrl(raw: unknown): string | null {
  const s = str(raw).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    return null;
  } catch {
    return null;
  }
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

function renderVideo(rawUrl: unknown): string {
  const url = safeHttpUrl(rawUrl);
  if (!url) return "";
  const yt = youtubeEmbedUrl(url);
  if (yt) {
    return `<div class="sc-video"><iframe src="${escapeHtml(yt)}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return `<div class="sc-video"><video controls src="${escapeHtml(url)}"></video></div>`;
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
  parts.push(renderVideo(c.videoUrl));
  parts.push(renderDoc(c.docUrl, c.docLabel));

  const inner = parts.filter(Boolean).join("\n");
  if (!inner) return "";
  return `<section><h3>${escapeHtml(title)}</h3>${inner}</section>`;
}
