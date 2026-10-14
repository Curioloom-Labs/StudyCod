import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { api } from "../../lib/api/client";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { withDevPreview } from "../../lib/devPreview";
import { isEduQuizAnswered, type EduQuizAnswer, type EduQuizQuestion } from "../../lib/eduQuiz";
import "./eduWorkspace.css";

type Outcome = { status?: string; autoPercent?: number; finalPercent?: number | null; needsManual?: boolean };
const root = "edu-workspace mx-auto max-w-[860px] px-4 py-7 sm:px-6 lg:py-10";
const input = "min-h-11 w-full rounded-xl border border-border bg-bg-base px-4 py-3 text-sm text-text-primary";
const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const example: EduQuizQuestion[] = [
  { id: "q1", type: "SINGLE_CHOICE", prompt: "Яка структура зберігає пару «ключ — значення»?", options: ["Список", "Словник", "Рядок"] },
  { id: "q2", type: "MULTIPLE_CHOICE", prompt: "Оберіть числові типи Python.", options: ["int", "str", "float"] },
  { id: "q3", type: "TRUE_FALSE", prompt: "Список у Python можна змінювати." },
  { id: "q4", type: "FILL_BLANK", prompt: "Назвіть функції для довжини та суми.", blanks: [{}, {}] },
  { id: "q5", type: "MATCHING", prompt: "Зіставте пари за їхніми номерами.", pairCount: 2 },
  { id: "q6", type: "OPEN_TEXT", prompt: "Коли ви оберете множину замість списку?", points: 2 },
];

const QuestionInput: React.FC<{ q: EduQuizQuestion; value?: EduQuizAnswer; onChange: (value: EduQuizAnswer) => void }> = ({ q, value, onChange }) => {
  if (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
    const multiple = q.type === "MULTIPLE_CHOICE";
    const options = q.type === "TRUE_FALSE" ? [tr("Правда", "True"), tr("Неправда", "False")] : q.options || [];
    return <div className="mt-5 grid gap-2">{options.map((option, index) => {
      const choice = q.type === "TRUE_FALSE" ? index === 0 : index;
      const checked = multiple ? Array.isArray(value) && value.includes(index) : value === choice;
      return <label key={index} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${checked ? "border-primary/40 bg-primary/10" : "border-transparent bg-bg-hover"}`}>
        <input type={multiple ? "checkbox" : "radio"} name={`quiz-${q.id}`} checked={checked} onChange={() => {
          const selected = Array.isArray(value) ? value : [];
          onChange(multiple ? checked ? selected.filter(item => item !== index) : [...selected, index] : choice);
        }} className="size-4 shrink-0 accent-primary" /><span>{option}</span>
      </label>;
    })}</div>;
  }
  if (q.type === "FILL_BLANK" || q.type === "MATCHING") {
    const matching = q.type === "MATCHING";
    const count = matching ? q.pairCount || 0 : q.blanks?.length || 0;
    const values = Array.isArray(value) ? value : [];
    const update = (index: number, nextValue: string | number | null) => {
      const next = Array.from({ length: count }, (_, i) => values[i] ?? null);
      next[index] = nextValue; onChange(next);
    };
    return <div className="mt-5 grid gap-3 sm:grid-cols-2">{Array.from({ length: count }, (_, index) => <label key={index} className="grid gap-2 text-sm text-text-secondary">
      {matching ? tr("Пара", "Pair") : tr("Пропуск", "Blank")} {index + 1}
      {matching ? <select className={input} value={values[index] ?? ""} onChange={event => update(index, event.target.value === "" ? null : Number(event.target.value))}>
        <option value="">{tr("Оберіть відповідність", "Select a match")}</option>{Array.from({ length: count }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
      </select> : <input className={input} value={String(values[index] ?? "")} onChange={event => update(index, event.target.value)} />}
    </label>)}</div>;
  }
  return <label className="mt-5 grid gap-2 text-sm text-text-secondary">{tr("Ваша відповідь", "Your answer")}<textarea className={`${input} resize-y leading-6`} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} rows={q.type === "OPEN_TEXT" ? 5 : 2} /></label>;
};

export const QuizCanvasPage: React.FC<{ user: { id: number; studentId?: number | null } }> = ({ user }) => {
  useTranslation();
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = React.useState<EduQuizQuestion[] | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, EduQuizAnswer>>({});
  const [savedAnswers, setSavedAnswers] = React.useState<Record<string, EduQuizAnswer> | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const submitting = React.useRef(false);
  const generation = React.useRef(0);
  const draftKey = user.studentId ? `studycod.edu.quiz.${user.studentId}.${lessonId}` : null;
  const [submissionAllowed, setSubmissionAllowed] = React.useState(true);
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null);
  const [draftSaved, setDraftSaved] = React.useState(false);
  const clearDraft = () => { try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* Storage can be unavailable. */ } setDraftSaved(false); };
  const answer = (questionId: string, value: EduQuizAnswer) => {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    if (draftKey && !preview()) {
      try { localStorage.setItem(draftKey, JSON.stringify({ questions: JSON.stringify(questions), answers: next })); setDraftSaved(true); }
      catch { setDraftSaved(false); }
    }
  };
  const back = () => navigate(withDevPreview(`/edu/lessons/${lessonId}?source=course`));
  React.useEffect(() => {
    const controller = new AbortController();
    ++generation.current;
    setLoading(true); setError(null); setQuestions(null); setAnswers({}); setOutcome(null); setSavedAnswers(null);
    setDraftSaved(false);
    void (async () => {
      try {
        if (preview()) { setQuestions(example); return; }
        const { data } = await api.get(`/edu/lessons/${lessonId}/quiz`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          const loadedQuestions = data?.quiz?.questions ?? null;
          setQuestions(loadedQuestions); setOutcome(data?.attempt ?? null); setSavedAnswers(data?.submittedAnswers ?? null);
          setSubmissionAllowed(data?.submissionAllowed !== false); setBlockedReason(data?.submissionBlockedReason ?? null);
          if (data?.attempt) clearDraft();
          else if (draftKey) {
            try {
              const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
              if (draft?.questions === JSON.stringify(loadedQuestions) && draft.answers && typeof draft.answers === "object" && !Array.isArray(draft.answers)) {
                setAnswers(draft.answers); setDraftSaved(true);
              }
            } catch { /* Ignore unavailable storage or an invalid draft. */ }
          }
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити квіз.", "Could not load the quiz.")));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); ++generation.current; };
  }, [lessonId, reload, draftKey]);
  const completed = questions?.filter(q => isEduQuizAnswered(q, answers[q.id])).length ?? 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!submissionAllowed || submitting.current || !questions?.length || completed !== questions.length) return;
    submitting.current = true; setBusy(true); setError(null);
    const currentGeneration = generation.current;
    try {
      if (preview()) { setOutcome({ needsManual: true }); setSavedAnswers(answers); }
      else {
        const { data } = await api.post(`/edu/lessons/${lessonId}/quiz/submit`, { answers });
        if (currentGeneration === generation.current) { setOutcome(data?.result ?? null); setSavedAnswers(answers); clearDraft(); }
      }
    } catch (caught) {
      if (currentGeneration === generation.current) {
        try {
          // Recover a saved result when the submission succeeded but its response was lost.
          const { data } = await api.get(`/edu/lessons/${lessonId}/quiz`);
          if (currentGeneration === generation.current && data?.attempt) { setOutcome(data.attempt); setSavedAnswers(data?.submittedAnswers ?? null); clearDraft(); return; }
        } catch { /* Preserve the student's draft for retry. */ }
        if (currentGeneration === generation.current) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося надіслати відповіді.", "Could not submit answers.")));
      }
    }
    finally { submitting.current = false; setBusy(false); }
  };
  const percent = outcome?.finalPercent ?? outcome?.autoPercent;
  return <main className={root} aria-busy={loading || busy}>
    <button type="button" onClick={back} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-text-secondary"><ArrowLeft className="size-4" aria-hidden="true" />{tr("До уроку", "Back to lesson")}</button>
    <header className="border-b border-border pb-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-strong">{tr("Самоперевірка", "Self-check")}</p><h1 className="mt-3 text-3xl font-bold tracking-[-.04em] sm:text-4xl">{tr("Квіз уроку", "Lesson quiz")}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">{tr("Дайте відповідь на кожне питання. Після надсилання відповіді змінити не можна.", "Answer every question. You cannot change your answers after submitting.")}</p></header>
    {error && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-error/25 bg-accent-error/5 p-4 text-sm text-accent-error"><span>{error}</span>{!questions && <button type="button" onClick={() => setReload(v => v + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold"><RefreshCw className="size-4" />{tr("Повторити", "Retry")}</button>}</div>}
    {!submissionAllowed && !outcome && <p role="status" className="mt-5 rounded-xl bg-bg-hover p-4 text-sm">{getErrorMessageFromUnknown({ response: { data: { message: blockedReason } } }, tr("Здача квізу зараз недоступна.", "Quiz submission is currently unavailable."))}</p>}
    {loading ? <div role="status" aria-label={tr("Завантаження квізу", "Loading quiz")} className="mt-6 space-y-4">{[1, 2, 3].map(item => <div key={item} className="h-40 animate-pulse rounded-2xl bg-bg-hover" />)}</div>
      : outcome ? <section role="status" className="edu-result mt-8 rounded-2xl border border-border bg-bg-surface p-6 sm:p-8"><CheckCircle2 className="size-8 text-primary-strong" aria-hidden="true" /><h2 className="mt-4 text-xl font-bold">{tr("Відповіді збережено", "Answers saved")}</h2><p className="mt-4 text-4xl font-bold tabular-nums">{percent == null ? "—" : `${percent}%`}</p><p className="mt-2 text-sm text-text-secondary">{outcome.finalPercent != null ? tr("Підсумкова оцінка після перевірки викладача", "Final grade after teacher review") : tr("Результат автоматично перевірених питань", "Result for automatically graded questions")}</p>
        {(outcome.needsManual || outcome.status === "NEEDS_MANUAL") && <p className="mt-4 rounded-xl bg-bg-hover p-4 text-sm text-text-secondary">{tr("Відкриті відповіді очікують перевірки викладача. Підсумкова оцінка з’явиться після перевірки.", "Written answers await teacher review. Your final grade will appear after review.")}</p>}{savedAnswers && questions?.length && <details className="mt-6 rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer rounded-lg px-2 py-3 text-sm font-semibold">{tr("Переглянути надіслані відповіді", "Review submitted answers")}</summary><fieldset disabled className="mt-5 min-w-0 space-y-6">{questions.map((question, index) => <fieldset key={question.id} className="min-w-0 border-t border-border pt-4"><legend className="max-w-full text-sm font-semibold">{index + 1}. {question.prompt || question.id}</legend><QuestionInput q={question} value={savedAnswers[question.id]} onChange={() => {}} /></fieldset>)}</fieldset></details>}<button type="button" onClick={back} className="mt-6 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">{tr("Повернутися до уроку", "Return to lesson")}</button></section>
      : questions?.length ? <form onSubmit={submit} className="mt-6 space-y-5"><p className="text-sm tabular-nums text-text-secondary" role="status">{tr("Відповідей", "Answered")}: {completed}/{questions.length}</p>{draftSaved && <p role="status" className="text-xs text-text-secondary">{tr("Чернетку збережено у цьому браузері.", "Your draft is saved in this browser.")}</p>}<fieldset disabled={busy || !submissionAllowed} className="min-w-0 space-y-5">{questions.map((q, index) => <fieldset key={q.id} className="min-w-0 rounded-2xl border border-border bg-bg-surface p-5 sm:p-6"><legend className="max-w-full px-2 text-base font-semibold leading-6">{index + 1}. {q.prompt || q.id}</legend><p className="text-xs tabular-nums text-text-muted">{q.points ?? 1} {tr("балів", "points")}</p><QuestionInput q={q} value={answers[q.id]} onChange={value => answer(q.id, value)} /></fieldset>)}</fieldset><button type="submit" disabled={busy || !submissionAllowed || completed !== questions.length} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Send className="size-4" aria-hidden="true" />{busy ? tr("Надсилаємо…", "Submitting…") : tr("Надіслати відповіді", "Submit answers")}</button></form>
      : !error && <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-sm text-text-secondary">{tr("Для цього уроку ще немає квізу.", "There is no quiz for this lesson yet.")}</p>}
  </main>;
};
