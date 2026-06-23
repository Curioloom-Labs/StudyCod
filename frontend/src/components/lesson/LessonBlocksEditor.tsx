import React, { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/Button";
import { tr } from "../../i18n";
import { LessonBlocksView } from "./LessonBlocksView";
import type { InteractiveLesson, LessonBlock, LessonSection, RunnableLanguage } from "../../lib/lessonBlocks";

const ctrl =
  "w-full bg-bg-code border border-border text-text-primary rounded-[var(--ui-control-radius)] px-3 py-2 text-sm outline-none focus-visible:border-primary placeholder:text-text-muted";
const linesToArr = (s: string): string[] => s.split("\n").map((x) => x.replace(/\s+$/, "")).filter((l) => l.trim().length > 0);
const arrToLines = (a: string[]): string => a.join("\n");

const BLOCK_TYPES: { type: LessonBlock["type"]; label: string }[] = [
  { type: "prose", label: tr("Текст", "Text") },
  { type: "code", label: tr("Код", "Code") },
  { type: "callout", label: tr("Виноска", "Callout") },
  { type: "keypoints", label: tr("Тези", "Key points") },
  { type: "runnable", label: tr("Пісочниця", "Sandbox") },
  { type: "check", label: tr("Перевірка", "Check") }
];

function emptyBlock(type: LessonBlock["type"]): LessonBlock {
  switch (type) {
    case "prose": return { type, markdown: "" };
    case "callout": return { type, variant: "info", markdown: "" };
    case "code": return { type, language: "python", code: "" };
    case "keypoints": return { type, items: [] };
    case "runnable": return { type, language: "PYTHON", code: "" };
    case "check": return { type, question: "", options: ["", ""], correct: 0 };
  }
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const RowControls: React.FC<{ onUp: () => void; onDown: () => void; onDelete: () => void }> = ({ onUp, onDown, onDelete }) => (
  <div className="flex items-center gap-1 shrink-0">
    <button type="button" onClick={onUp} className="p-1 text-text-muted hover:text-text-primary" aria-label="Up"><ChevronUp className="w-3.5 h-3.5" /></button>
    <button type="button" onClick={onDown} className="p-1 text-text-muted hover:text-text-primary" aria-label="Down"><ChevronDown className="w-3.5 h-3.5" /></button>
    <button type="button" onClick={onDelete} className="p-1 text-text-muted hover:text-accent-error" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
  </div>
);

const BlockEditor: React.FC<{ block: LessonBlock; onChange: (b: LessonBlock) => void }> = ({ block, onChange }) => {
  switch (block.type) {
    case "prose":
      return <textarea value={block.markdown} onChange={(e) => onChange({ ...block, markdown: e.target.value })} rows={4} placeholder={tr("Текст (Markdown)…", "Text (Markdown)…")} className={ctrl + " font-mono"} />;
    case "callout":
      return (
        <div className="space-y-2">
          <select value={block.variant} onChange={(e) => onChange({ ...block, variant: e.target.value as "info" | "tip" | "warning" })} className={ctrl}>
            <option value="info">info</option>
            <option value="tip">tip</option>
            <option value="warning">warning</option>
          </select>
          <textarea value={block.markdown} onChange={(e) => onChange({ ...block, markdown: e.target.value })} rows={3} placeholder={tr("Текст виноски…", "Callout text…")} className={ctrl} />
        </div>
      );
    case "code":
      return (
        <div className="space-y-2">
          <input value={block.language} onChange={(e) => onChange({ ...block, language: e.target.value })} placeholder="language (python/java/cpp/…)" className={ctrl} />
          <textarea value={block.code} onChange={(e) => onChange({ ...block, code: e.target.value })} rows={5} placeholder={tr("Код прикладу…", "Example code…")} className={ctrl + " font-mono"} />
          <input value={block.caption ?? ""} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder={tr("Підпис (необов.)", "Caption (optional)")} className={ctrl} />
        </div>
      );
    case "keypoints":
      return <textarea value={arrToLines(block.items)} onChange={(e) => onChange({ ...block, items: linesToArr(e.target.value) })} rows={4} placeholder={tr("По одній тезі на рядок", "One key point per line")} className={ctrl} />;
    case "runnable":
      return (
        <div className="space-y-2">
          <select value={block.language} onChange={(e) => onChange({ ...block, language: e.target.value as RunnableLanguage })} className={ctrl}>
            <option value="PYTHON">PYTHON</option>
            <option value="JAVA">JAVA</option>
            <option value="CPP">CPP</option>
          </select>
          <input value={block.prompt ?? ""} onChange={(e) => onChange({ ...block, prompt: e.target.value })} placeholder={tr("Завдання для пісочниці (необов.)", "Sandbox prompt (optional)")} className={ctrl} />
          <textarea value={block.code} onChange={(e) => onChange({ ...block, code: e.target.value })} rows={5} placeholder={tr("Стартовий код…", "Starter code…")} className={ctrl + " font-mono"} />
        </div>
      );
    case "check":
      return (
        <div className="space-y-2">
          <input value={block.question} onChange={(e) => onChange({ ...block, question: e.target.value })} placeholder={tr("Питання", "Question")} className={ctrl} />
          <textarea
            value={arrToLines(block.options)}
            onChange={(e) => {
              const options = e.target.value.split("\n").map((x) => x.replace(/\s+$/, ""));
              onChange({ ...block, options, correct: Math.min(block.correct, Math.max(0, options.length - 1)) });
            }}
            rows={Math.max(2, block.options.length)}
            placeholder={tr("По варіанту на рядок", "One option per line")}
            className={ctrl}
          />
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            {tr("Правильний:", "Correct:")}
            <select value={block.correct} onChange={(e) => onChange({ ...block, correct: Number(e.target.value) })} className="bg-bg-code border border-border rounded px-2 py-1 text-text-primary">
              {block.options.map((_, i) => <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>)}
            </select>
          </div>
          <input value={block.explanation ?? ""} onChange={(e) => onChange({ ...block, explanation: e.target.value })} placeholder={tr("Пояснення (необов.)", "Explanation (optional)")} className={ctrl} />
        </div>
      );
  }
};

interface Props {
  value: InteractiveLesson;
  onChange: (lesson: InteractiveLesson) => void;
}

export const LessonBlocksEditor: React.FC<Props> = ({ value, onChange }) => {
  const [preview, setPreview] = useState(false);
  const lesson = value;
  const setSections = (sections: LessonSection[]) => onChange({ ...lesson, sections });

  const updateBlock = (si: number, bi: number, b: LessonBlock) => {
    const sections = lesson.sections.slice();
    const blocks = sections[si].blocks.slice();
    blocks[bi] = b;
    sections[si] = { ...sections[si], blocks };
    setSections(sections);
  };
  const addBlock = (si: number, type: LessonBlock["type"]) => {
    const sections = lesson.sections.slice();
    sections[si] = { ...sections[si], blocks: [...sections[si].blocks, emptyBlock(type)] };
    setSections(sections);
  };
  const moveBlock = (si: number, bi: number, dir: -1 | 1) => {
    const sections = lesson.sections.slice();
    sections[si] = { ...sections[si], blocks: move(sections[si].blocks, bi, dir) };
    setSections(sections);
  };
  const deleteBlock = (si: number, bi: number) => {
    const sections = lesson.sections.slice();
    sections[si] = { ...sections[si], blocks: sections[si].blocks.filter((_, i) => i !== bi) };
    setSections(sections);
  };

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setPreview(false)}><EyeOff className="w-4 h-4 mr-1.5" /> {tr("Редагувати", "Edit")}</Button>
        </div>
        <LessonBlocksView lesson={lesson} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setPreview(true)}><Eye className="w-4 h-4 mr-1.5" /> {tr("Перегляд", "Preview")}</Button>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-[0.08em] text-text-muted mb-1.5">{tr("Цілі уроку (по одній на рядок)", "Objectives (one per line)")}</label>
        <textarea value={arrToLines(lesson.objectives)} onChange={(e) => onChange({ ...lesson, objectives: linesToArr(e.target.value) })} rows={3} className={ctrl} />
      </div>

      {lesson.sections.map((sec, si) => (
        <div key={si} className="rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input value={sec.heading} onChange={(e) => { const s = lesson.sections.slice(); s[si] = { ...sec, heading: e.target.value }; setSections(s); }} placeholder={tr("Заголовок розділу", "Section heading")} className={ctrl + " font-semibold"} />
            <RowControls onUp={() => setSections(move(lesson.sections, si, -1))} onDown={() => setSections(move(lesson.sections, si, 1))} onDelete={() => setSections(lesson.sections.filter((_, i) => i !== si))} />
          </div>

          {sec.blocks.map((b, bi) => (
            <div key={bi} className="rounded-md border border-border bg-bg-base p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-primary">{BLOCK_TYPES.find((t) => t.type === b.type)?.label ?? b.type}</span>
                <RowControls onUp={() => moveBlock(si, bi, -1)} onDown={() => moveBlock(si, bi, 1)} onDelete={() => deleteBlock(si, bi)} />
              </div>
              <BlockEditor block={b} onChange={(nb) => updateBlock(si, bi, nb)} />
            </div>
          ))}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {BLOCK_TYPES.map((t) => (
              <button key={t.type} type="button" onClick={() => addBlock(si, t.type)} className="text-[11px] font-mono px-2 py-1 rounded-md border border-border text-text-secondary hover:border-primary/40 hover:text-text-primary transition-fast">
                + {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Button variant="secondary" size="sm" onClick={() => setSections([...lesson.sections, { heading: "", blocks: [] }])}>
        <Plus className="w-4 h-4 mr-1.5" /> {tr("Додати розділ", "Add section")}
      </Button>

      <div>
        <label className="block text-xs font-mono uppercase tracking-[0.08em] text-text-muted mb-1.5">{tr("Підсумок (по одному на рядок)", "Summary (one per line)")}</label>
        <textarea value={arrToLines(lesson.summary)} onChange={(e) => onChange({ ...lesson, summary: linesToArr(e.target.value) })} rows={3} className={ctrl} />
      </div>
    </div>
  );
};
