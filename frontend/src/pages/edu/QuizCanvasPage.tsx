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
const root = "edu-workspace edu-quiz mx-auto w-full max-w-[1100px] px-4 py-7 sm:px-6 lg:py-10";
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
  const unansweredQuestion = questions?.find(q => !isEduQuizAnswered(q, answers[q.id]));
  const jumpToQuestion = (questionId: string) => {
    document.getElementById(`edu-quiz-question-${questionId}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
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
    <button type="button" onClick={back} className="edu-quiz__back"><ArrowLeft className="size-4" aria-hidden="true" />{tr("До уроку", "Back to lesson")}</button>
    <header className="edu-quiz__header"><div><p className="edu-quiz__eyebrow">{tr("Урок · перевірка знань", "Lesson · knowledge check")}</p><h1>{tr("Перевір себе", "Check your understanding")}</h1><p>{tr("Відповідай у власному темпі. Чернетка зберігається у цьому браузері, а відкриті відповіді перевірить викладач.", "Work at your own pace. Your draft is saved in this browser, and written answers will be reviewed by your teacher.")}</p></div><span className="edu-quiz__header-mark" aria-hidden="true">01</span></header>
    {error && <div role="alert" className="edu-quiz__alert"><span>{error}</span>{!questions && <button type="button" onClick={() => setReload(v => v + 1)} className="edu-quiz__retry"><RefreshCw className="size-4" />{tr("Повторити", "Retry")}</button>}</div>}
    {!submissionAllowed && !outcome && <p role="status" className="edu-quiz__blocked">{getErrorMessageFromUnknown({ response: { data: { message: blockedReason } } }, tr("Здача квізу зараз недоступна.", "Quiz submission is currently unavailable."))}</p>}
    {loading ? <div role="status" aria-label={tr("Завантаження квізу", "Loading quiz")} className="edu-quiz__skeleton">{[1, 2, 3].map(item => <div key={item} />)}</div>
      : outcome ? <section role="status" className="edu-quiz__outcome edu-result"><div className="edu-quiz__outcome-icon"><CheckCircle2 className="size-6" aria-hidden="true" /></div><p className="edu-quiz__eyebrow">{tr("Результат спроби", "Attempt result")}</p><h2>{tr("Відповіді збережено", "Answers saved")}</h2><p className="edu-quiz__score">{percent == null ? "—" : `${percent}%`}</p><p className="edu-quiz__outcome-note">{outcome.finalPercent != null ? tr("Підсумкова оцінка після перевірки викладача", "Final grade after teacher review") : tr("Результат автоматично перевірених питань", "Result for automatically graded questions")}</p>
        {(outcome.needsManual || outcome.status === "NEEDS_MANUAL") && <p className="edu-quiz__review-note">{tr("Відкриті відповіді очікують перевірки викладача. Підсумкова оцінка з’явиться після перевірки.", "Written answers await teacher review. Your final grade will appear after review.")}</p>}
        {savedAnswers && questions?.length && <details className="edu-quiz__submitted"><summary>{tr("Переглянути надіслані відповіді", "Review submitted answers")}</summary><fieldset disabled>{questions.map((question, index) => <fieldset key={question.id}><legend>{index + 1}. {question.prompt || question.id}</legend><QuestionInput q={question} value={savedAnswers[question.id]} onChange={() => {}} /></fieldset>)}</fieldset></details>}
        <button type="button" onClick={back} className="edu-quiz__primary">{tr("Повернутися до уроку", "Return to lesson")}</button></section>
      : questions?.length ? <form onSubmit={submit} className="edu-quiz__layout">
        <section className="edu-quiz__questions" aria-label={tr("Питання квізу", "Quiz questions")}>
          <div className="edu-quiz__progress-mobile"><span>{tr("Відповіді", "Answers")}</span><strong>{completed}<small> / {questions.length}</small></strong><i><span style={{ width: `${Math.round((completed / questions.length) * 100)}%` }} /></i></div>
          <fieldset disabled={busy || !submissionAllowed} className="edu-quiz__question-list">{questions.map((q, index) => {
            const answered = isEduQuizAnswered(q, answers[q.id]);
            return <fieldset id={`edu-quiz-question-${q.id}`} key={q.id} className="edu-quiz__question"><legend><span className="edu-quiz__question-number">{String(index + 1).padStart(2, "0")}</span><span className="edu-quiz__question-title">{q.prompt || q.id}</span><span className="edu-quiz__points">{q.points ?? 1} {tr("бал", "pt")}</span></legend><QuestionInput q={q} value={answers[q.id]} onChange={value => answer(q.id, value)} /><span className="edu-quiz__answered" aria-live="polite">{answered ? tr("Відповідь записано", "Answer recorded") : tr("Ще без відповіді", "Not answered yet")}</span></fieldset>;
          })}</fieldset>
        </section>
        <aside className="edu-quiz__aside" aria-label={tr("Прогрес квізу", "Quiz progress")}>
          <div className="edu-quiz__aside-heading"><div><span>{tr("ТВОЯ СПРОБА", "YOUR ATTEMPT")}</span><h2>{tr("Питання", "Questions")}</h2></div><strong>{completed}<small> / {questions.length}</small></strong></div>
          <p className="edu-quiz__progress-label">{tr("Відповіді записані", "Answers recorded")}</p><div className="edu-quiz__progress-track" role="progressbar" aria-label={tr("Заповнення квізу", "Quiz completion")} aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={completed}><span style={{ width: `${Math.round((completed / questions.length) * 100)}%` }} /></div>
          <nav className="edu-quiz__question-nav" aria-label={tr("Перейти до питання", "Jump to question")}>{questions.map((q, index) => <button type="button" key={q.id} onClick={() => jumpToQuestion(q.id)} aria-label={`${tr("Питання", "Question")} ${index + 1}${isEduQuizAnswered(q, answers[q.id]) ? ` · ${tr("є відповідь", "answered")}` : ` · ${tr("без відповіді", "unanswered")}`}`} aria-current={unansweredQuestion?.id === q.id ? "step" : undefined} className={isEduQuizAnswered(q, answers[q.id]) ? "is-answered" : ""}>{String(index + 1).padStart(2, "0")}</button>)}</nav>
          <div className="edu-quiz__draft" role="status"><span className={draftSaved ? "is-saved" : ""} />{draftSaved ? tr("Чернетку збережено у цьому браузері", "Draft saved in this browser") : tr("Відповіді зберігаються автоматично", "Answers save automatically")}</div>
          <button type="submit" disabled={busy || !submissionAllowed || completed !== questions.length} className="edu-quiz__primary"><Send className="size-4" aria-hidden="true" />{busy ? tr("Надсилаємо…", "Submitting…") : completed !== questions.length ? tr("Дай відповідь на всі питання", "Answer every question") : tr("Здати відповіді", "Submit answers")}</button>
          {completed !== questions.length && unansweredQuestion && <button type="button" className="edu-quiz__next" onClick={() => jumpToQuestion(unansweredQuestion.id)}>{tr("До наступного питання без відповіді", "Go to the next unanswered question")} <span aria-hidden="true">→</span></button>}
          <p className="edu-quiz__aside-note">{tr("Після надсилання змінити відповіді буде неможливо.", "You cannot change answers after submitting.")}</p>
        </aside>
      </form>
      : !error && <section className="edu-quiz__empty"><span>—</span><h2>{tr("Квіз ще не готовий", "Quiz is not ready yet")}</h2><p>{tr("Для цього уроку ще немає питань. Повернись до матеріалу або спробуй пізніше.", "There are no questions for this lesson yet. Return to the lesson material or check again later.")}</p><button type="button" onClick={back}>{tr("Повернутися до уроку", "Return to lesson")}</button></section>}
  </main>;
};
