export type MultiFileSubmissionV1 = {
  version: 1;
  entry: string;
  files: Array<{ path: string; content: string }>;
};

const PREFIX = "__STUDYCOD_MULTI_FILE_V1__\n";

export function isEncodedMultiFileSubmission(s: unknown): s is string {
  return typeof s === "string" && s.startsWith(PREFIX);
}

export function encodeMultiFileSubmissionV1(payload: Omit<MultiFileSubmissionV1, "version">): string {
  const normalized: MultiFileSubmissionV1 = {
    version: 1,
    entry: String(payload.entry || "").trim(),
    files: Array.isArray(payload.files)
      ? payload.files.map(f => ({
          path: String((f as any)?.path ?? "").trim(),
          content: String((f as any)?.content ?? "")
        }))
      : []
  };
  return PREFIX + JSON.stringify(normalized);
}

export function decodeMultiFileSubmissionV1(s: unknown): MultiFileSubmissionV1 | null {
  if (!isEncodedMultiFileSubmission(s)) return null;
  const raw = String(s).slice(PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== 1) return null;
    const entry = typeof parsed.entry === "string" ? parsed.entry.trim() : "";
    const filesRaw = Array.isArray(parsed.files) ? parsed.files : [];
    const files = filesRaw
      .map((f: any) => ({
        path: typeof f?.path === "string" ? f.path.trim() : "",
        content: typeof f?.content === "string" ? f.content : ""
      }))
      .filter((f: { path: string; content: string }) => f.path.length > 0);
    if (!entry || files.length === 0) return null;
    if (!files.some((f: { path: string; content: string }) => f.path === entry)) return null;
    return { version: 1, entry, files };
  } catch {
    return null;
  }
}

export function pickEntryContent(decoded: MultiFileSubmissionV1): string {
  const hit = decoded.files.find(f => f.path === decoded.entry);
  return hit?.content ?? "";
}

export function concatForAI(decoded: MultiFileSubmissionV1): string {
  // Deterministic concat that keeps file boundaries.
  const files = [...decoded.files].sort((a, b) => a.path.localeCompare(b.path));
  return files
    .map(f => `// FILE: ${f.path}\n${f.content}`)
    .join("\n\n");
}
