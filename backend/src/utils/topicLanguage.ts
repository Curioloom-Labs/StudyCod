import type { JudgeLanguage } from "../services/judgeWorker/types";

/**
 * Language values stored by EDU topics. Classes intentionally do not have a
 * language: each topic owns the language used by its tasks and submissions.
 * Keep this list aligned with the judge worker catalogue.
 */
export const TOPIC_LANGUAGES = [
  "JAVA", "PYTHON", "CPP", "C", "CSHARP", "KOTLIN",
  "JS", "GO", "RUST", "PASCAL", "D", "DART", "HASKELL",
  "LISP", "LUA", "PERL", "PHP", "RUBY", "SWIFT",
] as const;

export type TopicLanguage = (typeof TOPIC_LANGUAGES)[number];

export const TOPIC_LANGUAGE_LABELS: Record<TopicLanguage, string> = {
  JAVA: "Java",
  PYTHON: "Python",
  CPP: "C++",
  C: "C",
  CSHARP: "C#",
  KOTLIN: "Kotlin",
  JS: "JavaScript",
  GO: "Go",
  RUST: "Rust",
  PASCAL: "Pascal",
  D: "D",
  DART: "Dart",
  HASKELL: "Haskell",
  LISP: "Common Lisp",
  LUA: "Lua",
  PERL: "Perl",
  PHP: "PHP",
  RUBY: "Ruby",
  SWIFT: "Swift",
};

export const TOPIC_ENTRY_FILES: Record<TopicLanguage, string> = {
  JAVA: "Main.java",
  PYTHON: "main.py",
  CPP: "main.cpp",
  C: "main.c",
  CSHARP: "Program.cs",
  KOTLIN: "Main.kt",
  JS: "main.js",
  GO: "main.go",
  RUST: "main.rs",
  PASCAL: "main.pas",
  D: "main.d",
  DART: "main.dart",
  HASKELL: "main.hs",
  LISP: "main.lisp",
  LUA: "main.lua",
  PERL: "main.pl",
  PHP: "main.php",
  RUBY: "main.rb",
  SWIFT: "main.swift",
};

export function normalizeTopicLanguage(raw: unknown): TopicLanguage | null {
  const value = String(raw ?? "").trim().toUpperCase();
  const aliases: Record<string, TopicLanguage> = {
    "C++": "CPP",
    "C#": "CSHARP",
    JAVASCRIPT: "JS",
    "COMMON LISP": "LISP",
    COMMONLISP: "LISP",
  };
  const canonical = aliases[value] ?? value.replace(/\+\+/g, "PP");
  return (TOPIC_LANGUAGES as readonly string[]).includes(canonical)
    ? canonical as TopicLanguage
    : null;
}

export function topicLanguageLabel(raw: unknown): string {
  const normalized = normalizeTopicLanguage(raw);
  return normalized ? TOPIC_LANGUAGE_LABELS[normalized] : String(raw ?? "").trim() || "the selected programming language";
}

export function topicLanguageToJudgeLanguage(raw: unknown): JudgeLanguage {
  const normalized = normalizeTopicLanguage(raw);
  return (normalized ? normalized.toLowerCase() : "python") as JudgeLanguage;
}
