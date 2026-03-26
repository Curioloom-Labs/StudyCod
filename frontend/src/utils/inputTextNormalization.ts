export function decodeEscapedInputText(raw: string): string {
  const s = String(raw ?? "").replace(/\r\n/g, "\n");
  const escapedNewlineCount = (s.match(/\\n/g) || []).length + (s.match(/\\r\\n/g) || []).length;
  const slashNewlineCount = (s.match(/\/n/g) || []).length + (s.match(/\/r\/n/g) || []).length;
  const hasHtmlBreak = /<br\s*\/?>/i.test(s);

  if (escapedNewlineCount === 0 && slashNewlineCount === 0 && !s.includes("\\t") && !hasHtmlBreak) return s;
  if (!s.includes("\n") || escapedNewlineCount >= 2 || slashNewlineCount >= 2 || hasHtmlBreak) {
    return s
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\/r\/n/g, "\n")
      .replace(/\/n/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  return s;
}

export function normalizeMarkdownEscapes(raw: string): string {
  // Important: do not decode escaped \n globally here.
  // It can break markdown tables by splitting a single table cell into extra rows/columns.
  // Decoding of escaped line breaks should happen in specific UI contexts (e.g. inline code rendering, stdin helpers).
  const s = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

  return s;
}

export function extractFirstExampleInput(markdown: string): string {
  const src = String(markdown ?? "").replace(/\r\n/g, "\n");
  if (!src.trim()) return "";

  const stripInlineCode = (s: string) => {
    const t = String(s ?? "").trim();
    if ((t.startsWith("`") && t.endsWith("`")) || (t.startsWith("\"") && t.endsWith("\""))) {
      return t.slice(1, -1).trim();
    }
    return t;
  };

  const fromTable = (() => {
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const header = lines[i] ?? "";
      if (!header.includes("|")) continue;
      const low = header.toLowerCase();
      if (!/(input|вхід)/.test(low)) continue;

      const separator = lines[i + 1] ?? "";
      if (!separator.includes("|") || !/[-:]/.test(separator)) continue;

      for (let j = i + 2; j < lines.length; j++) {
        const row = lines[j] ?? "";
        if (!row.includes("|")) {
          if (row.trim()) break;
          continue;
        }
        let cells = row.split("|").map((c) => c.trim());
        if (cells[0] === "") cells = cells.slice(1);
        if (cells[cells.length - 1] === "") cells = cells.slice(0, -1);
        const firstCell = stripInlineCode(cells[0] ?? "");
        if (firstCell) return firstCell;
      }
    }
    return "";
  })();

  if (fromTable) return decodeEscapedInputText(fromTable).trim();

  const fenced = src.match(/(?:^|\n)(?:#{1,6}\s*)?(?:input|вхід[^\n:]*)\s*:?\s*\n+```[\w-]*\n([\s\S]*?)\n```/i);
  if (fenced?.[1]) return decodeEscapedInputText(fenced[1]).trim();

  const plain = src.match(/(?:^|\n)(?:#{1,6}\s*)?(?:input|вхід[^\n:]*)\s*:?\s*\n([\s\S]*?)(?:\n(?:#{1,6}\s*)?(?:output|вихід)|$)/i);
  if (plain?.[1]) return decodeEscapedInputText(plain[1]).trim();

  return "";
}

export function normalizeStdinBeforeRun(raw: string): string {
  return decodeEscapedInputText(raw);
}
