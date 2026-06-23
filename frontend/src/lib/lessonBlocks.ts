// Interactive lesson content model (#2). A lesson is a typed-block document the
// AI generates and the teacher edits; the reader renders each block type, and the
// interactive ones (runnable code, comprehension check) reuse the judge + a
// client-side MCQ. Kept defensive: malformed blocks are dropped, never thrown on.

export type RunnableLanguage = "JAVA" | "PYTHON" | "CPP";

export type LessonBlock =
  | { type: "prose"; markdown: string }
  | { type: "callout"; variant: "info" | "tip" | "warning"; markdown: string }
  | { type: "code"; language: string; code: string; caption?: string }
  | { type: "keypoints"; items: string[] }
  | { type: "runnable"; language: RunnableLanguage; code: string; prompt?: string }
  | { type: "check"; question: string; options: string[]; correct: number; explanation?: string };

export interface LessonSection {
  heading: string;
  blocks: LessonBlock[];
}

export interface InteractiveLesson {
  objectives: string[];
  sections: LessonSection[];
  summary: string[];
}

const RUNNABLE_LANGS: RunnableLanguage[] = ["JAVA", "PYTHON", "CPP"];
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const cleanList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : [];

function normalizeBlock(raw: any): LessonBlock | null {
  if (!raw || typeof raw !== "object") return null;
  switch (raw.type) {
    case "prose": {
      const markdown = str(raw.markdown).trim();
      return markdown ? { type: "prose", markdown } : null;
    }
    case "callout": {
      const markdown = str(raw.markdown).trim();
      if (!markdown) return null;
      const variant = raw.variant === "tip" || raw.variant === "warning" ? raw.variant : "info";
      return { type: "callout", variant, markdown };
    }
    case "code": {
      const code = str(raw.code);
      if (!code.trim()) return null;
      return { type: "code", language: str(raw.language) || "text", code, caption: str(raw.caption) || undefined };
    }
    case "keypoints": {
      const items = cleanList(raw.items);
      return items.length ? { type: "keypoints", items } : null;
    }
    case "runnable": {
      const code = str(raw.code);
      if (!code.trim()) return null;
      const language = RUNNABLE_LANGS.includes(raw.language) ? (raw.language as RunnableLanguage) : "PYTHON";
      return { type: "runnable", language, code, prompt: str(raw.prompt).trim() || undefined };
    }
    case "check": {
      const question = str(raw.question).trim();
      const options = cleanList(raw.options);
      if (!question || options.length < 2) return null;
      const correct =
        Number.isInteger(raw.correct) && raw.correct >= 0 && raw.correct < options.length ? raw.correct : 0;
      return { type: "check", question, options, correct, explanation: str(raw.explanation).trim() || undefined };
    }
    default:
      return null;
  }
}

/**
 * Parse/validate arbitrary stored or AI-generated content into an InteractiveLesson.
 * Returns null when the input isn't a usable interactive lesson, so callers can fall
 * back to legacy markdown theory.
 */
export function normalizeInteractiveLesson(raw: unknown): InteractiveLesson | null {
  let obj: any = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const sections: LessonSection[] = [];
  for (const s of Array.isArray(obj.sections) ? obj.sections : []) {
    if (!s || typeof s !== "object") continue;
    const blocks = (Array.isArray(s.blocks) ? s.blocks : [])
      .map(normalizeBlock)
      .filter((b: LessonBlock | null): b is LessonBlock => b !== null);
    if (blocks.length) sections.push({ heading: str(s.heading).trim(), blocks });
  }
  if (sections.length === 0) return null;

  return { objectives: cleanList(obj.objectives), sections, summary: cleanList(obj.summary) };
}
