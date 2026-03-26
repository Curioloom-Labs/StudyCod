import React, { useMemo } from "react";

export type WebPreviewFile = { path: "index.html" | "styles.css" | "script.js"; content: string };

const MAX_FILE_CHARS = 200_000;
const MAX_SRCDOC_CHARS = 500_000;

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n<!-- truncated in preview (${value.length - maxChars} chars omitted) -->`;
}

function normalizeFiles(input: WebPreviewFile[]): WebPreviewFile[] {
  const byPath = new Map<WebPreviewFile["path"], string>();
  for (const f of input || []) {
    if (!f) continue;
    const p = String(f.path) as WebPreviewFile["path"];
    if (p !== "index.html" && p !== "styles.css" && p !== "script.js") continue;
    byPath.set(p, typeof f.content === "string" ? f.content : "");
  }

  return [
    { path: "index.html", content: byPath.get("index.html") ?? "" },
    { path: "styles.css", content: byPath.get("styles.css") ?? "" },
    { path: "script.js", content: byPath.get("script.js") ?? "" },
  ];
}

function buildSrcDoc(files: WebPreviewFile[]): string {
  const normalized = normalizeFiles(files);
  const html = clampText(normalized.find(f => f.path === "index.html")?.content ?? "", MAX_FILE_CHARS);
  const css = clampText(normalized.find(f => f.path === "styles.css")?.content ?? "", MAX_FILE_CHARS);
  const js = clampText(normalized.find(f => f.path === "script.js")?.content ?? "", MAX_FILE_CHARS);

  const hasStyleTag = /<style[\s>]/i.test(html);
  const hasScriptTag = /<script[\s>]/i.test(html);
  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasHeadTag = /<head[\s>]/i.test(html);
  const hasBodyTag = /<body[\s>]/i.test(html);
  const hasDoctype = /<!doctype\s+html>/i.test(html);
  const hasCspMeta = /<meta\s+http-equiv=["']Content-Security-Policy["']/i.test(html);
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data: https:; connect-src https:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'">`;

  let body = html;
  if (!hasCspMeta) {
    if (hasHeadTag) {
      body = body.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${cspMeta}`);
    } else if (hasHtmlTag) {
      body = body.replace(/<html(\s[^>]*)?>/i, (m) => `${m}\n<head>\n${cspMeta}\n</head>`);
    } else if (hasBodyTag) {
      body = body.replace(/<body(\s[^>]*)?>/i, `<head>\n${cspMeta}\n</head>\n$&`);
    } else {
      body = `${hasDoctype ? "" : "<!doctype html>\n"}<html><head>${cspMeta}</head><body>${body}</body></html>`;
    }
  }

  if (!hasStyleTag) body += `\n<style>\n${css}\n</style>\n`;
  if (!hasScriptTag) body += `\n<script>\n${js}\n</script>\n`;

  body = clampText(body, MAX_SRCDOC_CHARS);

  return body;
}

interface Props {
  files: WebPreviewFile[];
  title?: string;
  className?: string;
}

export const WebPreviewPane: React.FC<Props> = ({ files, title = "Preview", className }) => {
  const srcDoc = useMemo(() => buildSrcDoc(files), [files]);

  return (
    <div className={className ?? "flex flex-col h-full min-h-0"}>
      <div className="px-3 py-2 border-b border-border text-xs font-mono text-text-secondary">{title}</div>
      <iframe
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full flex-1 min-h-0 bg-white"
      />
    </div>
  );
};
