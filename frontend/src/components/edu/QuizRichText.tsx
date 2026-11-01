import React from "react";
import { Code2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MarkdownView } from "../MarkdownView";
import "./quizRichText.css";

function inferCodeLanguage(code: string): "python" | "cpp" | "java" {
  if (/\b(?:#include|std::|cout\s*<<|cin\s*>>|int\s+main\s*\()/m.test(code)) return "cpp";
  if (/\b(?:public\s+class|static\s+void\s+main|System\.out\.)/m.test(code)) return "java";
  return "python";
}

function promoteInlineCodeLines(markdown: string): string {
  return markdown.replace(/(?:^|\n)([ \t]*`[^`\n]+`[ \t]*(?:\n[ \t]*`[^`\n]+`[ \t]*)+)/g, (block, raw: string) => {
    const lines = raw.split("\n").map((line: string) => line.trim().replace(/^`|`$/g, ""));
    const code = lines.join("\n");
    return `\n\n\`\`\`${inferCodeLanguage(code)}\n${code}\n\`\`\`\n\n`;
  });
}

function addLanguageToBareFences(markdown: string): string {
  let inFence = false;
  let codeLines: string[] = [];
  const lines = markdown.split("\n");
  return lines.map((line, index) => {
    const open = line.match(/^(\s*)(```|~~~)([^\s`]*)?.*$/);
    if (!open) {
      if (inFence && !/^(\s*)(```|~~~)/.test(line)) codeLines.push(line);
      return line;
    }
    const indent = open[1] ?? "";
    const marker = open[2] ?? "```";
    const language = (open[3] ?? "").trim();
    if (!inFence) {
      inFence = true;
      codeLines = [];
      return language ? line : `${indent}${marker}${inferCodeLanguage(lines.slice(index + 1).join("\n"))}`;
    }
    inFence = false;
    codeLines = [];
    return line;
  }).join("\n");
}

function normalizeQuizMarkdown(raw: string): string {
  const decoded = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\/r\/n/g, "\n")
    .replace(/\/n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const promoted = promoteInlineCodeLines(decoded);
  const fenced = addLanguageToBareFences(promoted);
  const parts = fenced.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  return parts.map((part, index) => index % 2 === 1 ? part : part.replace(/\n/g, "  \n")).join("");
}

export const QuizRichText: React.FC<{ content: string | null | undefined }> = ({ content }) => {
  const { i18n } = useTranslation();
  const en = i18n.language?.startsWith("en") ?? false;
  const markdown = normalizeQuizMarkdown(String(content ?? ""));
  const hasCode = /(?:^|\n)\s*(?:```|~~~)/.test(markdown);

  return <div className="edu-quiz-rich-text">
    {hasCode && <div className="edu-quiz-rich-text__code-label"><Code2 className="size-3.5" aria-hidden="true" />{en ? "Code snippet · read-only" : "Фрагмент коду · лише для читання"}</div>}
    <MarkdownView content={markdown} variant="quiz" />
  </div>;
};

