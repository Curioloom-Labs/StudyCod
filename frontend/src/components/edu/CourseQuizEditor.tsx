import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { tr } from "../../i18n";
import { emptyCourseQuizQuestion, type CourseQuizQuestionDraft } from "../../lib/courseQuiz";

const control = "w-full rounded-xl border border-border/12 bg-white px-3 py-2.5 text-sm outline-none ring-primary/25 transition placeholder:text-text-muted focus:ring-4 dark:border-white/10 dark:bg-bg-code dark:text-text-primary";

interface Props {
  questions: CourseQuizQuestionDraft[];
  onChange: (questions: CourseQuizQuestionDraft[]) => void;
  idPrefix: string;
}

export const CourseQuizEditor: React.FC<Props> = ({ questions, onChange, idPrefix }) => {
  const updateQuestion = (questionIndex: number, patch: Partial<CourseQuizQuestionDraft>) => {
    onChange(questions.map((question, index) => index === questionIndex ? { ...question, ...patch } : question));
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, { options: question.options.map((option, index) => index === optionIndex ? value : option) });
  };

  const addOption = (questionIndex: number) => {
    const question = questions[questionIndex];
    if (question.options.length >= 5) return;
    updateQuestion(questionIndex, { options: [...question.options, ""] });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, index) => index !== optionIndex);
    const correct = question.correct === optionIndex
      ? Math.min(optionIndex, options.length - 1)
      : question.correct > optionIndex ? question.correct - 1 : question.correct;
    updateQuestion(questionIndex, { options, correct });
  };

  return <div className="space-y-3">
    {questions.map((question, questionIndex) => (
      <section key={`${idPrefix}-question-${questionIndex}`} className="rounded-2xl border border-border/12 bg-bg-surface p-4 dark:border-white/[.08]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-text-primary">{tr(`Питання ${questionIndex + 1}`, `Question ${questionIndex + 1}`)}</h3>
          <button type="button" disabled={questions.length <= 1} onClick={() => onChange(questions.filter((_, index) => index !== questionIndex))} aria-label={tr(`Видалити питання ${questionIndex + 1}`, `Delete question ${questionIndex + 1}`)} className="rounded-lg border border-border/15 p-2 text-text-muted hover:text-accent-error disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="size-4" />
          </button>
        </div>
        <label className="block text-xs font-bold uppercase tracking-[.1em] text-text-muted">
          {tr("Формулювання", "Prompt")}
          <textarea value={question.question} onChange={event => updateQuestion(questionIndex, { question: event.target.value })} rows={2} className={control + " mt-1 resize-y normal-case tracking-normal"} placeholder={tr("Введи запитання", "Write the question")} />
        </label>
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-text-muted">{tr("Варіанти · обери правильний", "Options · select the correct answer")}</legend>
          {question.options.map((option, optionIndex) => {
            const label = String.fromCharCode((tr("А", "A")).charCodeAt(0) + optionIndex);
            return <div key={`${idPrefix}-question-${questionIndex}-option-${optionIndex}`} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2">
              <input type="radio" name={`${idPrefix}-correct-${questionIndex}`} checked={question.correct === optionIndex} onChange={() => updateQuestion(questionIndex, { correct: optionIndex })} aria-label={tr(`Позначити варіант ${label} правильним`, `Mark option ${label} as correct`)} className="size-4 accent-primary" />
              <span className="w-5 text-xs font-bold text-text-muted">{label}</span>
              <input value={option} onChange={event => updateOption(questionIndex, optionIndex, event.target.value)} aria-label={tr(`Текст варіанта ${label}`, `Option ${label} text`)} className={control} />
              <button type="button" disabled={question.options.length <= 2} onClick={() => removeOption(questionIndex, optionIndex)} aria-label={tr(`Видалити варіант ${label}`, `Delete option ${label}`)} className="rounded-lg border border-border/15 p-2 text-text-muted hover:text-accent-error disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 className="size-3.5" />
              </button>
            </div>;
          })}
          <button type="button" disabled={question.options.length >= 5} onClick={() => addOption(questionIndex)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold text-primary-strong hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-soft">
            <Plus className="size-3.5" />{tr("Додати варіант", "Add option")}
          </button>
        </fieldset>
      </section>
    ))}
    <button type="button" onClick={() => onChange([...questions, emptyCourseQuizQuestion()])} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/25 px-3 py-2 text-sm font-bold text-primary-strong hover:bg-primary/5 dark:text-primary-soft">
      <Plus className="size-4" />{tr("Додати питання", "Add question")}
    </button>
  </div>;
};
