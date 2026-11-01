import React from "react";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { tr } from "../../i18n";
import { MarkdownView } from "../../components/MarkdownView";
import { TaskGenerationGuidanceField } from "./TaskGenerationGuidanceField";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import type { TaskGenerationProfile } from "./taskGenerationSettings";

export type TaskAuthoringTab = "statement" | "advanced";
export type TaskAuthoringDraft = {
  title: string;
  description: string;
  template: string;
  maxAttempts: string;
  theory: string;
  projectSpecJson: string;
};

type TaskAuthoringFieldsProps = {
  idPrefix: string;
  value: TaskAuthoringDraft;
  onChange: (patch: Partial<TaskAuthoringDraft>) => void;
  generationGuidance: string;
  onGenerationGuidanceChange: (value: string) => void;
  generationProfile: TaskGenerationProfile;
  onGenerationProfileChange: (profile: TaskGenerationProfile) => void;
  includeSubtasks: boolean;
  onIncludeSubtasksChange: (value: boolean) => void;
  generateIllustration: boolean;
  onGenerateIllustrationChange: (value: boolean) => void;
  guidanceEnabled: boolean;
  selectedTab: TaskAuthoringTab;
  onSelectedTabChange: (value: TaskAuthoringTab) => void;
  aiBusy: "condition" | "template" | "theory" | null;
  busy: boolean;
  onGenerateCondition: () => void;
  onGenerateTemplate: () => void;
  onGenerateTheory: () => void;
};

const inputClassName = "mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-bg-code";

export const TaskAuthoringFields: React.FC<TaskAuthoringFieldsProps> = ({
  idPrefix,
  value,
  onChange,
  generationGuidance,
  onGenerationGuidanceChange,
  generationProfile,
  onGenerationProfileChange,
  includeSubtasks,
  onIncludeSubtasksChange,
  generateIllustration,
  onGenerateIllustrationChange,
  guidanceEnabled,
  selectedTab,
  onSelectedTabChange,
  aiBusy,
  busy,
  onGenerateCondition,
  onGenerateTemplate,
  onGenerateTheory,
}) => {
  const descriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const theoryRef = React.useRef<HTMLTextAreaElement | null>(null);
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const templateId = `${idPrefix}-template`;
  const theoryId = `${idPrefix}-theory`;
  const attemptsId = `${idPrefix}-max-attempts`;

  const generateCondition = () => {
    if (value.description.trim() && !window.confirm(tr("Замінити поточну умову новою AI-версією?", "Replace the current statement with a new AI draft?"))) return;
    onGenerateCondition();
  };

  return (
    <div className="task-authoring__fields">
      <section className="task-authoring__step" aria-label={tr("Основне завдання", "Core task details")}>
        <div className="task-authoring__step-heading">
          <span>1</span>
          <div>
            <h3>{tr("Спочатку — суть задачі", "Start with the problem idea")}</h3>
            <p>{tr("Достатньо назви й короткого задуму. Решту умови допоможе скласти AI.", "A title and a short idea are enough. AI can draft the full statement.")}</p>
          </div>
        </div>

        <label className="task-authoring__label" htmlFor={titleId}>{tr("Назва завдання", "Task title")}</label>
        <input
          id={titleId}
          name="taskTitle"
          required
          maxLength={512}
          value={value.title}
          onChange={event => onChange({ title: event.target.value })}
          placeholder={tr("Наприклад, Гарний масив", "For example, A Nice Array")}
          disabled={busy}
          className="task-authoring__title"
        />

        {guidanceEnabled && <TaskGenerationGuidanceField
          value={generationGuidance}
          onChange={onGenerationGuidanceChange}
          profile={generationProfile}
          onProfileChange={onGenerationProfileChange}
          busy={busy}
          enabled={guidanceEnabled}
        />}
      </section>

      <section className="task-authoring__step" aria-label={tr("Умова задачі", "Task statement")}>
        <div className="task-authoring__statement-heading">
          <div className="task-authoring__step-heading">
            <span>2</span>
            <div>
              <h3>{tr("Умова й приклади", "Statement and examples")}</h3>
              <p>{tr("Згенеруйте чернетку або напишіть умову самостійно. Її можна відредагувати тут же.", "Generate a draft or write the statement yourself. Edit it right here.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MarkdownImageInsertButton value={value.description} onChange={description => onChange({ description })} textareaRef={descriptionRef} className="classroom-text-button" />
            <button
              type="button"
              className="classroom-button classroom-button--primary"
              disabled={!!aiBusy || busy || !value.title.trim()}
              onClick={generateCondition}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {aiBusy === "condition"
                ? tr("Створюємо умову…", "Writing the statement…")
                : value.description.trim()
                  ? tr("Перегенерувати", "Regenerate")
                  : tr("Створити умову з AI", "Draft with AI")}
            </button>
          </div>
        </div>

        <label className="sr-only" htmlFor={descriptionId}>{tr("Умова завдання", "Task statement")}</label>
        <textarea
          ref={descriptionRef}
          id={descriptionId}
          name="taskDescription"
          value={value.description}
          onChange={event => onChange({ description: event.target.value })}
          placeholder={tr("Опишіть, що має зробити учень, або натисніть «Створити умову з AI».", "Describe what the student should do, or choose “Draft with AI”.")}
          rows={11}
          disabled={busy}
          className="task-authoring__statement"
        />
        <div className="task-authoring__statement-footer">
          <label className="flex items-start gap-2 text-xs leading-5 text-text-muted dark:text-text-secondary">
            <input type="checkbox" checked={includeSubtasks} disabled={busy || !!aiBusy} onChange={event => onIncludeSubtasksChange(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>{tr("Доречні підзадачі й відсотки", "Add subtasks and percentage weights when useful")}</span>
          </label>
          <label className="flex items-start gap-2 text-xs leading-5 text-text-muted dark:text-text-secondary">
            <input type="checkbox" checked={generateIllustration} disabled={busy || !!aiBusy} onChange={event => onGenerateIllustrationChange(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>{tr("Створити ілюстрацію разом з умовою", "Generate an illustration with the statement")}</span>
          </label>
          <p className="classroom-caption">{tr("Підтримуються Markdown, блоки коду та LaTeX.", "Markdown, code blocks, and LaTeX are supported.")}</p>
        </div>

        <details className="task-authoring__preview">
          <summary>{tr("Попередній перегляд для учня", "Student preview")}</summary>
          <div><MarkdownView content={value.description || tr("Тут буде показано умову задачі.", "The task statement will appear here.")} variant="task" /></div>
        </details>
      </section>

      <details
        className="task-authoring__advanced"
        open={selectedTab === "advanced"}
        onToggle={event => onSelectedTabChange(event.currentTarget.open ? "advanced" : "statement")}
      >
        <summary>
          <span>3</span>
          <span>{tr("Додатково — необов’язково", "More options — optional")}</span>
          <small>{tr("Стартовий код, теорія та спроби", "Starter code, theory, and attempts")}</small>
          <ArrowRight className="size-4" aria-hidden="true" />
        </summary>
        <div className="task-authoring__advanced-content">
          <section>
            <div className="classroom-toolbar">
              <label className="task-authoring__label" htmlFor={templateId}>{tr("Стартовий код для учня", "Starter code for the student")}</label>
              <button type="button" className="classroom-text-button" disabled={!!aiBusy || busy || !value.title.trim()} onClick={onGenerateTemplate}>
                <Sparkles className="size-4" aria-hidden="true" />
                {aiBusy === "template" ? tr("Створюємо…", "Generating…") : tr("Згенерувати", "Generate")}
              </button>
            </div>
            <textarea id={templateId} name="taskTemplate" value={value.template} onChange={event => onChange({ template: event.target.value })} rows={7} spellCheck={false} className="task-authoring__code" disabled={busy} />
            <p className="classroom-caption">{tr("Необов’язково. Порожній редактор учня теж підходить.", "Optional. The student editor can start empty.")}</p>
          </section>

          <section>
            <div className="classroom-toolbar">
              <label className="task-authoring__label" htmlFor={theoryId}>{tr("Коротке пояснення перед практикою", "Short explanation before practice")}</label>
              <div className="flex flex-wrap items-center gap-2">
                <MarkdownImageInsertButton value={value.theory} onChange={theory => onChange({ theory })} textareaRef={theoryRef} className="classroom-text-button" />
                <button type="button" className="classroom-text-button" disabled={!!aiBusy || busy || !value.description.trim()} onClick={onGenerateTheory}>
                  <BookOpen className="size-4" aria-hidden="true" />
                  {aiBusy === "theory" ? tr("Створюємо…", "Generating…") : tr("Допомогти з поясненням", "Draft an explanation")}
                </button>
              </div>
            </div>
            <textarea ref={theoryRef} id={theoryId} name="taskTheory" value={value.theory} onChange={event => onChange({ theory: event.target.value })} rows={6} placeholder={tr("Необов’язково", "Optional")} disabled={busy} />
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="task-authoring__label" htmlFor={attemptsId}>
              {tr("Кількість спроб", "Number of attempts")}
              <input id={attemptsId} name="maxAttempts" type="number" min="1" required value={value.maxAttempts} onChange={event => onChange({ maxAttempts: event.target.value })} className={inputClassName} disabled={busy} />
            </label>
            <div className="classroom-caption self-end pb-2">{tr("Скільки разів учень може надіслати розв’язання на перевірку.", "How many times the student may submit a solution.")}</div>
          </div>
        </div>
      </details>
    </div>
  );
};
