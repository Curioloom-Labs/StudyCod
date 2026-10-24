import React from "react";
import { tr } from "../../i18n";
import { olympiadPracticeStage, validateOlympiadPracticeContractDraft } from "../../lib/edu/olympiadPracticeContract";

const fieldClass = "mt-1 w-full rounded-xl border border-border/12 bg-white px-3 py-2.5 text-sm font-medium outline-none ring-primary/25 placeholder:text-text-muted focus:ring-4 dark:border-white/10 dark:bg-bg-code dark:text-text-primary";

function parseContract(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && (parsed as Record<string, unknown>).kind === "OLYMPIAD_ALGORITHMIC_PRACTICE") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function asLines(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}

export const isOlympiadPracticeContractText = (value: string): boolean => parseContract(value) !== null;

export const OlympiadPracticeContractEditor: React.FC<{
  value: string;
  runtime: string;
  onChange: (value: string) => void;
}> = ({ value, runtime, onChange }) => {
  const contract = parseContract(value);
  if (!contract) return <p role="alert" className="rounded-xl bg-accent-error/10 p-3 text-sm text-accent-error">{tr("Контракт не є коректним JSON-об’єктом олімпіадної практики. Виправ його в розширеному редакторі нижче.", "The contract is not a valid Olympiad practice JSON object. Fix it in the advanced editor below.")}</p>;

  const issues = validateOlympiadPracticeContractDraft(contract, runtime);
  const update = (patch: Record<string, unknown>) => onChange(JSON.stringify({ ...contract, ...patch }, null, 2));
  const textField = (key: string, labelUk: string, labelEn: string, rows = 2) => <label className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr(labelUk, labelEn)}<textarea value={typeof contract[key] === "string" ? contract[key] as string : ""} onChange={(event) => update({ [key]: event.target.value })} rows={rows} className={`${fieldClass} resize-y normal-case tracking-normal`} /></label>;
  const listField = (key: "requiredCases" | "allowedScope" | "forbiddenScope", labelUk: string, labelEn: string, hintUk: string, hintEn: string) => <label className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr(labelUk, labelEn)}<textarea value={asLines(contract[key])} onChange={(event) => update({ [key]: event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })} rows={3} className={`${fieldClass} resize-y normal-case tracking-normal`} /><span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-text-muted">{tr(hintUk, hintEn)}</span></label>;

  const sequence = Number(contract.sequence) || 1;
  const total = Number(contract.total) || 1;
  const stage = olympiadPracticeStage(sequence, total);

  return <section className="space-y-4 rounded-2xl border border-primary/15 bg-white/70 p-4 dark:bg-bg-surface/60" aria-label={tr("Структурований контракт генерації задачі", "Structured generated-task contract")}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-text-primary">{tr("Контракт динамічної Judge-задачі", "Dynamic Judge task contract")}</p>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">{tr("Генератор створить нову умову, приклади та приховані тести за цими правилами. Тут редагується алгоритмічний контракт, а не готовий статичний варіант.", "The generator creates a fresh statement, examples, and hidden tests from these rules. Edit the algorithm contract here, not a fixed task variant.")}</p>
      </div>
      <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary-strong dark:text-primary-soft">{stage}</span>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr("Ключ курсу", "Course key")}<input value={String(contract.courseKey ?? "")} onChange={(event) => update({ courseKey: event.target.value.trim() })} className={`${fieldClass} normal-case tracking-normal`} /></label>
      <label className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr("Ключ навички", "Skill key")}<input value={String(contract.topicKey ?? "")} onChange={(event) => update({ topicKey: event.target.value.trim() })} className={`${fieldClass} normal-case tracking-normal`} /><span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-text-muted">{tr("Стабільний латинський ключ, наприклад prefix-sums.", "Stable lowercase key, for example prefix-sums.")}</span></label>
      <label className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr("Послідовність варіанта", "Variant sequence")}<span className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input type="number" min={1} max={Number(contract.total) || 3} value={sequence} onChange={(event) => { const next = Math.max(1, Math.min(total, Number(event.target.value) || 1)); update({ sequence: next, stage: olympiadPracticeStage(next, total) }); }} className={fieldClass} /><span className="text-text-muted">/</span><input type="number" min={1} value={total} onChange={(event) => { const nextTotal = Math.max(1, Number(event.target.value) || 1); const nextSequence = Math.min(sequence, nextTotal); update({ total: nextTotal, sequence: nextSequence, stage: olympiadPracticeStage(nextSequence, nextTotal) }); }} className={fieldClass} /></span></label>
      <div className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr("Середовище виконання", "Runtime")}<div className="mt-1 rounded-xl border border-border/12 bg-bg-hover px-3 py-2.5 text-sm font-bold text-text-primary dark:border-white/10 dark:bg-bg-code">{String(contract.runtime ?? runtime).toUpperCase()}</div></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      {textField("algorithm", "Цільовий алгоритм", "Target algorithm")}
      {textField("objective", "Результат навчання", "Learning objective")}
      {textField("coreOperation", "Що має обчислити програма", "Core operation", 3)}
      {textField("requiredInput", "Формат і межі вводу", "Input format and bounds", 3)}
      {textField("requiredOutput", "Точний формат виводу", "Exact output format", 3)}
      {textField("constraints", "Обмеження й очікувана складність", "Constraints and target complexity", 3)}
      {textField("variation", "Як змінювати сюжет між генераціями", "How to vary generated tasks", 3)}
    </div>

    <div className="grid gap-3 lg:grid-cols-3">
      {listField("requiredCases", "Обов’язкове покриття тестів", "Required test coverage", "Один випадок на рядок; щонайменше три.", "One case per line; at least three.")}
      {listField("allowedScope", "Дозволені прийоми", "Allowed techniques", "Те, що учень уже вивчив.", "Techniques already taught.")}
      {listField("forbiddenScope", "Поза межами теми", "Out-of-scope techniques", "Не вимагай цих прийомів у згенерованій задачі.", "The generated task must not require these techniques.")}
    </div>

    {issues.length > 0 && <div role="status" className="rounded-xl bg-accent-warn/10 px-3 py-2 text-xs leading-5 text-accent-warn">{tr("Контракт ще потребує заповнення:", "The contract still needs attention:")} {issues.map((issue) => issue.replaceAll("_", " ").toLowerCase()).join(" · ")}</div>}

    <details className="rounded-xl border border-border/10 px-3 py-2 dark:border-white/[.08]">
      <summary className="cursor-pointer text-xs font-bold text-text-muted">{tr("Розширений JSON контракта", "Advanced contract JSON")}</summary>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} rows={10} className={`${fieldClass} mt-3 resize-y font-mono text-xs normal-case tracking-normal`} />
    </details>
  </section>;
};
