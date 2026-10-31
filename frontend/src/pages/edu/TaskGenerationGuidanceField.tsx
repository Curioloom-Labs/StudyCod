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

/** A compact task brief: one difficulty control, one free-form request, and an optional AI trap. */
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
          {tr("Задум або побажання (необов’язково)", "Idea or requirements (optional)")}
          <textarea
            value={value}
            onChange={event => onChange(event.target.value)}
            rows={2}
            maxLength={4000}
            disabled={busy}
            placeholder={tr(
              "Наприклад: для 8 класу, учні знають цикли, але ще не списки; знайти найбільше значення й порахувати його повтори.",
              "For example: grade 8, students know loops but not arrays; find the largest value and count its occurrences.",
            )}
            className="mt-1 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal leading-6 dark:border-white/10 dark:bg-bg-code"
          />
        </label>
      </div>

      <details className="mt-3 rounded-xl border border-border/10 bg-white/45 p-3 dark:border-white/10 dark:bg-white/[.025]">
        <summary className="cursor-pointer text-xs font-bold">
          {tr("Додатково: пастка для AI", "Optional: AI attention check")}
        </summary>
        <label className="mt-3 flex items-start gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={profile.aiTrapEnabled}
            onChange={event => patchProfile({ aiTrapEnabled: event.target.checked })}
            disabled={busy}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            {tr("Додати в умову одну непомітну фразу-пастку для AI", "Add one subtle sentence that tests an AI solver")}
            <span className="mt-1 block font-normal leading-5 text-text-muted dark:text-text-secondary">
              {tr("Звичайну складність і правила задачі буде збережено; цей фрагмент не впливає на тести.", "The task rules stay unchanged, and this sentence is excluded from test generation.")}
            </span>
          </span>
        </label>
      </details>
    </section>
  );
};
