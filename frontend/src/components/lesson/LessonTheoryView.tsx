import React, { useMemo } from "react";
import { MarkdownView } from "../MarkdownView";
import { LessonBlocksView } from "./LessonBlocksView";
import { normalizeInteractiveLesson } from "../../lib/lessonBlocks";

/**
 * Renders a lesson's `theory` field as an interactive lesson when it holds the
 * structured block JSON (#2), otherwise falls back to legacy markdown. Forward-
 * compatible: existing markdown theory is untouched (normalize returns null for it).
 */
export const LessonTheoryView: React.FC<{ theory: string }> = ({ theory }) => {
  const lesson = useMemo(() => normalizeInteractiveLesson(theory), [theory]);
  if (lesson) return <LessonBlocksView lesson={lesson} />;
  // Looks like (empty/invalid) interactive JSON — render nothing rather than dumping raw JSON.
  if (theory.trim().startsWith("{")) return null;
  return <MarkdownView content={theory} />;
};
