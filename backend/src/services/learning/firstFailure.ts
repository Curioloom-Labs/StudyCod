export type LearningFailureInput = {
  verdict?: string | null;
  tests: Array<{
    testId?: number;
    passed?: boolean;
    isPublic?: boolean;
    input?: unknown;
    expected?: unknown;
    actual?: unknown;
    error_kind?: unknown;
  }>;
};

export type LearningFirstFailure = {
  testPublicIndex: number;
  testId?: number;
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  errorKind: string;
};

const MAX_PREVIEW_CHARS = 400;
const MAX_RAW_CHARS = 8_192;

function stripAnsi(input: string): string {
  return input.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function stripBidiOverrides(input: string): string {
  // U+202A..U+202E, U+2066..U+2069, U+200E, U+200F, U+061C
  return input.replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g, "");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function looksBinary(input: string): boolean {
  if (!input) return false;
  let suspicious = 0;
  const sample = input.slice(0, 2000);
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    const isCommonWhitespace = code === 9 || code === 10 || code === 13;
    const isPrintable = code >= 32 && code <= 126;
    if (!isPrintable && !isCommonWhitespace) suspicious++;
  }
  return suspicious / sample.length > 0.2;
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max) + " …[trimmed]";
}

export function sanitizePreviewText(raw: unknown, opts?: { maxChars?: number }): string {
  const maxChars = Math.max(16, Number(opts?.maxChars ?? MAX_PREVIEW_CHARS));
  let text = String(raw ?? "").slice(0, MAX_RAW_CHARS);

  try {
    text = text.normalize("NFKC");
  } catch {
    // Keep original text if normalization fails.
  }

  text = stripAnsi(text);
  text = stripBidiOverrides(text);

  if (looksBinary(text)) {
    return "[binary output omitted]";
  }

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  text = escapeHtml(text);

  if (!text) return "(empty)";
  return clip(text, maxChars);
}

export function buildLearningFirstFailure(input: LearningFailureInput): LearningFirstFailure | null {
  const verdict = String(input?.verdict ?? "").toUpperCase();
  const ALLOWED_VERDICTS = new Set(["WA", "PRESENTATION_ERROR", "PARTIAL"]);
  if (!ALLOWED_VERDICTS.has(verdict)) return null;

  const tests = Array.isArray(input?.tests) ? input.tests : [];
  if (!tests.length) return null;

  const failedAt = tests.findIndex((t) => t?.passed === false);
  if (failedAt < 0) return null;

  const failed = tests[failedAt] || {};
  if (failed.isPublic !== true) return null;

  const publicPrefix = tests.slice(0, failedAt + 1).filter((t) => t?.isPublic === true).length;
  if (!publicPrefix) return null;

  const expectedPreview = sanitizePreviewText(failed.expected);
  const actualPreview = sanitizePreviewText(failed.actual);

  return {
    testPublicIndex: publicPrefix,
    ...(typeof failed.testId === "number" ? { testId: failed.testId } : {}),
    inputPreview: sanitizePreviewText(failed.input),
    expectedPreview,
    actualPreview,
    errorKind: String(failed.error_kind ?? "unknown")
  };
}
