export function normalizeMarkdownText(raw: unknown): string {
  let s = String(raw ?? "");
  s = s.replace(/\r\n/g, "\n");
  const hasRealNewlines = s.includes("\n");
  const escapedNewlinesCount = (s.match(/\\n/g) || []).length;
  if (!hasRealNewlines && escapedNewlinesCount >= 2 || escapedNewlinesCount >= 6) {
    s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  }
  s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return s;
}