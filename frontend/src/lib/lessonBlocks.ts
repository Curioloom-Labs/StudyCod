// Interactive lesson content model (#2). A lesson is a typed-block document the
// AI generates and the teacher edits; the reader renders each block type, and the
// interactive ones (runnable code, comprehension check) reuse the judge + a
// client-side MCQ. Kept defensive: malformed blocks are dropped, never thrown on.

export type RunnableLanguage = Uppercase<JudgeLanguage>;

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

const RUNNABLE_LANGS: RunnableLanguage[] = JUDGE_LANGUAGES.map(language => language.toUpperCase() as RunnableLanguage);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const cleanList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : [];

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeBlock(raw: unknown): LessonBlock | null {
  const block = recordOf(raw);
  if (!block) return null;
  switch (block.type) {
    case "prose": {
      const markdown = str(block.markdown).trim();
      return markdown ? { type: "prose", markdown } : null;
    }
    case "callout": {
      const markdown = str(block.markdown).trim();
      if (!markdown) return null;
      const variant = block.variant === "tip" || block.variant === "warning" ? block.variant : "info";
      return { type: "callout", variant, markdown };
    }
    case "code": {
      const code = str(block.code);
      if (!code.trim()) return null;
      return { type: "code", language: str(block.language) || "text", code, caption: str(block.caption) || undefined };
    }
    case "keypoints": {
      const items = cleanList(block.items);
      return items.length ? { type: "keypoints", items } : null;
    }
    case "runnable": {
      const code = str(block.code);
      if (!code.trim()) return null;
      const language = typeof block.language === "string" && RUNNABLE_LANGS.includes(block.language as RunnableLanguage)
        ? block.language as RunnableLanguage
        : "PYTHON";
      return { type: "runnable", language, code, prompt: str(block.prompt).trim() || undefined };
    }
    case "check": {
      const question = str(block.question).trim();
      const options = cleanList(block.options);
      if (!question || options.length < 2) return null;
      const correct =
        Number.isInteger(block.correct) && Number(block.correct) >= 0 && Number(block.correct) < options.length
          ? Number(block.correct)
          : 0;
      return { type: "check", question, options, correct, explanation: str(block.explanation).trim() || undefined };
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
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  const root = recordOf(obj);
  if (!root) return null;

  const sections: LessonSection[] = [];
  for (const rawSection of Array.isArray(root.sections) ? root.sections : []) {
    const section = recordOf(rawSection);
    if (!section) continue;
    const blocks = (Array.isArray(section.blocks) ? section.blocks : [])
      .map(normalizeBlock)
      .filter((b: LessonBlock | null): b is LessonBlock => b !== null);
    if (blocks.length) sections.push({ heading: str(section.heading).trim(), blocks });
  }
  if (sections.length === 0) return null;

  return { objectives: cleanList(root.objectives), sections, summary: cleanList(root.summary) };
}
import type { JudgeLanguage } from "./judgeLanguages";
import { JUDGE_LANGUAGES } from "./judgeLanguages";
