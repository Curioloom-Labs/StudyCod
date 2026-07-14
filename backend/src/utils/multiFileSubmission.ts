export type MultiFileSubmissionV1 = {
  version: 1;
  entry: string;
  files: Array<{ path: string; content: string }>;
};

const PREFIX = "__STUDYCOD_MULTI_FILE_V1__\n";

export function normalizeSafeCodeFilePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim().replace(/\\/g, "/");
  if (!path || path.length > 180) return null;
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const parts = path.split("/");
  if (parts.length > 8) return null;
  for (const part of parts) {
    if (!part || part === "." || part === "..") return null;
    if (part.startsWith(".")) return null;
    if (part.length > 80) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(part)) return null;
  }
  return path;
}

export function isEncodedMultiFileSubmission(s: unknown): s is string {
  return typeof s === "string" && s.startsWith(PREFIX);
}

export function encodeMultiFileSubmissionV1(payload: Omit<MultiFileSubmissionV1, "version">): string {
  const normalized: MultiFileSubmissionV1 = {
    version: 1,
    entry: String(payload.entry || "").trim(),
    files: Array.isArray(payload.files)
      ? payload.files.map(f => ({
          path: normalizeSafeCodeFilePath((f as any)?.path) ?? "",
          content: String((f as any)?.content ?? "")
        }))
      : []
  };
  return PREFIX + JSON.stringify(normalized);
}

// Bounds enforced independently of the global body-limit middleware so a
// route that legitimately needs a larger JSON body (library / topics) can't
// be tricked into ingesting an unreasonably huge multi-file blob. Defaults
// are deliberately conservative — bump them if a real curriculum task needs
// more room.
const MULTI_FILE_MAX_TOTAL_BYTES = (() => {
  const raw = (process.env.MULTI_FILE_MAX_TOTAL_BYTES ?? "").trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 16 * 1024 ? n : 1_048_576; // 1 MB
})();
const MULTI_FILE_MAX_PER_FILE_BYTES = (() => {
  const raw = (process.env.MULTI_FILE_MAX_PER_FILE_BYTES ?? "").trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 4 * 1024 ? n : 512 * 1024; // 512 KB
})();
const MULTI_FILE_MAX_FILES = (() => {
  const raw = (process.env.MULTI_FILE_MAX_FILES ?? "").trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 64;
})();

export function decodeMultiFileSubmissionV1(s: unknown): MultiFileSubmissionV1 | null {
  if (!isEncodedMultiFileSubmission(s)) return null;
  const raw = String(s).slice(PREFIX.length);
  // Cheap upfront check before JSON.parse spends CPU on a multi-MB payload.
  if (Buffer.byteLength(raw, "utf8") > MULTI_FILE_MAX_TOTAL_BYTES) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== 1) return null;
    const entry = normalizeSafeCodeFilePath(parsed.entry) ?? "";
    const filesRaw = Array.isArray(parsed.files) ? parsed.files : [];
    if (filesRaw.length > MULTI_FILE_MAX_FILES) return null;
    const files = filesRaw
      .map((f: any) => ({
        path: normalizeSafeCodeFilePath(f?.path) ?? "",
        content: typeof f?.content === "string" ? f.content : ""
      }))
      .filter((f: { path: string; content: string }) => f.path.length > 0);
    if (!entry || files.length === 0) return null;
    if (!files.some((f: { path: string; content: string }) => f.path === entry)) return null;
    let totalBytes = 0;
    for (const f of files) {
      const bytes = Buffer.byteLength(f.content, "utf8");
      if (bytes > MULTI_FILE_MAX_PER_FILE_BYTES) return null;
      totalBytes += bytes;
      if (totalBytes > MULTI_FILE_MAX_TOTAL_BYTES) return null;
    }
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
