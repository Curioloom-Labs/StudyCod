import React from "react";
import { tr } from "../../i18n";
import type { TaskGenerationProfile } from "./taskGenerationSettings";

type TaskGenerationGuidanceFieldProps = {
  value: string;
  onChange: (value: string) => void;
  profile: TaskGenerationProfile;
  onProfileChange: (profile: TaskGenerationProfile) => void;
  busy: boolean;
  enabled: boolean;
};

const fieldClassName = "mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code";

/**
 * Short, optional task brief plus advanced generation controls.
 * Recommendations used to fire automatically on every title change and could
 * leave the entire authoring form displaying an endless loading state. The
 * actual task generation is now the explicit AI action in TaskAuthoringFields.
 */
export const TaskGenerationGuidanceField: React.FC<TaskGenerationGuidanceFieldProps> = ({
  value,
  onChange,
  profile,
  onProfileChange,
  busy,
  enabled,
}) => {
  if (!enabled) return null;

  const patchProfile = (patch: Partial<TaskGenerationProfile>) => {
    onProfileChange({ ...profile, ...patch, clarifyingQuestions: [], clarificationAnswers: [] });
  };
  const difficultyLabels = [
    tr("Початкова", "Introductory"),
    tr("Легка", "Easy"),
    tr("Середня", "Intermediate"),
    tr("Складна", "Hard"),
    tr("Дуже складна", "Very hard"),
  ];

  return (
    <section className="task-authoring__generation">
      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,.8fr)_minmax(15rem,1.2fr)] sm:items-end">
        <label className="text-xs font-bold">
          {tr("Складність", "Difficulty")}
          <span className="ml-2 text-primary-strong dark:text-primary-soft">
            {profile.difficulty}/5 · {difficultyLabels[Math.max(1, Math.min(5, profile.difficulty)) - 1]}
          </span>
          <input
            aria-label={tr("Складність завдання", "Task difficulty")}
            type="range"
            min="1"
            max="5"
            step="1"
            value={profile.difficulty}
            onChange={event => patchProfile({ difficulty: Number(event.target.value) })}
            disabled={busy}
            className="mt-2 block w-full accent-primary"
          />
          <span className="mt-1 flex justify-between text-[10px] font-normal text-text-muted dark:text-text-secondary">
            <span>{tr("Базова", "Basic")}</span>
            <span>{tr("Поглиблена", "Advanced")}</span>
          </span>
        </label>

        <label className="text-xs font-bold">
          {tr("Що має відпрацювати учень?", "What should the student practice?")}
          <textarea
            value={value}
            onChange={event => onChange(event.target.value)}
            rows={2}
            maxLength={4000}
            disabled={busy}
            placeholder={tr(
              "Необов’язково. Наприклад: знайти найбільше значення й порахувати, скільки разів воно трапляється.",
              "Optional. For example: find the largest value and count how often it occurs.",
            )}
            className="mt-1 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal leading-6 dark:border-white/10 dark:bg-bg-code"
          />
        </label>
      </div>

      <details className="mt-3 rounded-xl border border-border/10 bg-white/45 p-3 dark:border-white/10 dark:bg-white/[.025]">
        <summary className="cursor-pointer text-xs font-bold">
          {tr("Додатково: рівень, стиль і теми", "More: learner level, style, and concepts")}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">
            {tr("Рівень учнів", "Learner level")}
            <select value={profile.learnerLevel} onChange={event => patchProfile({ learnerLevel: event.target.value as TaskGenerationProfile["learnerLevel"] })} disabled={busy} className={fieldClassName}>
              <option value="AUTO">{tr("Автоматично за темою", "Infer from the topic")}</option>
              <option value="BEGINNER">{tr("Початківець", "Beginner")}</option>
              <option value="INTERMEDIATE">{tr("Середній", "Intermediate")}</option>
              <option value="ADVANCED">{tr("Високий", "Advanced")}</option>
              <option value="OLYMPIAD">{tr("Олімпіадний", "Olympiad")}</option>
            </select>
          </label>
          <label className="text-xs font-bold">
            {tr("Будова задачі", "Task structure")}
            <select value={profile.structure} onChange={event => patchProfile({ structure: event.target.value as TaskGenerationProfile["structure"] })} disabled={busy} className={fieldClassName}>
              <option value="AUTO">{tr("Обрати автоматично", "Choose automatically")}</option>
              <option value="SINGLE_CONCEPT">{tr("Одне поняття", "One concept")}</option>
              <option value="MULTI_STEP">{tr("Кілька кроків", "Several steps")}</option>
              <option value="EDGE_CASES">{tr("Граничні випадки", "Boundary cases")}</option>
              <option value="COMBINED">{tr("Поєднати правила теми", "Combine topic rules")}</option>
            </select>
          </label>
          <label className="text-xs font-bold">
            {tr("Стиль умови", "Statement style")}
            <select value={profile.contextStyle} onChange={event => patchProfile({ contextStyle: event.target.value as TaskGenerationProfile["contextStyle"] })} disabled={busy} className={fieldClassName}>
              <option value="AUTO">{tr("Обрати автоматично", "Choose automatically")}</option>
              <option value="NEUTRAL">{tr("Прямо, без сюжету", "Direct, no story")}</option>
              <option value="REAL_WORLD">{tr("Реалістичний сюжет", "Realistic context")}</option>
              <option value="CREATIVE">{tr("Творчий сюжет", "Creative context")}</option>
            </select>
          </label>
          <label className="text-xs font-bold">
            {tr("Клас і попередні знання", "Grade and prior knowledge")}
            <input value={profile.studentContext} onChange={event => patchProfile({ studentContext: event.target.value })} maxLength={240} placeholder={tr("Наприклад: 8 клас, цикли вже вивчили", "For example: grade 8, loops covered")} disabled={busy} className={fieldClassName} />
          </label>
          <label className="text-xs font-bold">
            {tr("Обов’язкові поняття", "Required concepts")}
            <input value={profile.includeConcepts} onChange={event => patchProfile({ includeConcepts: event.target.value })} maxLength={240} placeholder={tr("Наприклад: цикл і підрахунок", "For example: loops and counting")} disabled={busy} className={fieldClassName} />
          </label>
          <label className="text-xs font-bold">
            {tr("Не використовувати", "Avoid")}
            <input value={profile.avoidConcepts} onChange={event => patchProfile({ avoidConcepts: event.target.value })} maxLength={240} placeholder={tr("Наприклад: списки або функції", "For example: arrays or functions")} disabled={busy} className={fieldClassName} />
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            {tr("Навчальна ціль", "Learning goal")}
            <input value={profile.learningGoal} onChange={event => patchProfile({ learningGoal: event.target.value })} maxLength={240} placeholder={tr("Наприклад: уважно перевіряти граничні значення", "For example: reason about boundary values")} disabled={busy} className={fieldClassName} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <label className="flex items-start gap-2"><input type="checkbox" checked={profile.stayOnTopic} onChange={event => patchProfile({ stayOnTopic: event.target.checked })} disabled={busy} className="mt-0.5 size-4 accent-primary" />{tr("Не виходити за межі вивченої теми", "Stay within the taught topic")}</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={profile.avoidSolutionHints} onChange={event => patchProfile({ avoidSolutionHints: event.target.checked })} disabled={busy} className="mt-0.5 size-4 accent-primary" />{tr("Не розкривати спосіб розв’язання", "Do not reveal the solution approach")}</label>
        </div>
        <details className="mt-3 border-t border-border/10 pt-3 dark:border-white/10">
          <summary className="cursor-pointer text-xs font-semibold">{tr("Додати пастку для ШІ", "Add an AI trap")}</summary>
          <label className="mt-3 flex items-start gap-2 text-xs font-semibold">
            <input type="checkbox" checked={profile.aiTrapEnabled} onChange={event => patchProfile({ aiTrapEnabled: event.target.checked })} disabled={busy} className="mt-0.5 size-4 accent-primary" />
            {tr("Додати непомітну фразу, що перевіряє уважність ШІ", "Add a subtle sentence that tests AI attention")}
          </label>
          {profile.aiTrapEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">
              {tr("Тип пастки", "Trap type")}
              <select value={profile.aiTrapStyle} onChange={event => patchProfile({ aiTrapStyle: event.target.value as TaskGenerationProfile["aiTrapStyle"] })} disabled={busy} className={fieldClassName}>
                <option value="BOUNDARY_SHIFT">{tr("Зсув межі на 1", "Shift a boundary by 1")}</option>
                <option value="RULE_SWAP">{tr("Зміна пріоритету правил", "Swap rule priority")}</option>
                <option value="DISTRACTOR">{tr("Зайва деталь сюжету", "Distracting story detail")}</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              {tr("На що звернути увагу", "What should it focus on?")}
              <input value={profile.aiTrapFocus} onChange={event => patchProfile({ aiTrapFocus: event.target.value })} maxLength={240} placeholder={tr("Необов’язково", "Optional")} disabled={busy} className={fieldClassName} />
            </label>
          </div>}
        </details>
      </details>
    </section>
  );
};
