import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";

type QType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "FILL_BLANK" | "MATCHING" | "OPEN_TEXT";
interface Question {
  id: string;
  type: QType;
  prompt?: string;
  points?: number;
  options?: string[];
  blanks?: Array<{ accept: string[] }>;
  pairCount?: number;
}
interface AttemptInfo { status: string; autoScore: number; maxScore: number; autoPercent: number; needsManual?: boolean; }
type QuizAnswer = string | number | boolean | number[] | string[] | undefined;
type QuizResult = { autoPercent?: number; needsManual?: boolean };

export const LessonQuizPage: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const { data } = await api.get(`/edu/lessons/${lessonId}/quiz`);
        setQuestions(data?.quiz?.questions ?? null);
        setAttempt(data?.attempt ?? null);
      } catch (error) {
        setErrorMessage(getErrorMessageFromUnknown(error, tr("Не вдалося завантажити вікторину.", "Could not load the quiz.")));
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, reload]);

  const setAnswer = (qid: string, value: QuizAnswer) => setAnswers(prev => ({ ...prev, [qid]: value }));

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/lessons/${lessonId}/quiz/submit`, { answers });
      setResult(data?.result ?? null);
      showToast({ message: tr("Відповіді надіслано", "Submitted"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="edu-workspace edu-lesson-quiz" role="status" aria-live="polite"><div className="edu-lesson-quiz__loading"><span />{tr("Завантажуємо запитання…", "Loading questions…")}</div></main>;

  return (
    <main className="edu-workspace edu-lesson-quiz">
      <button type="button" onClick={() => navigate(-1)} className="edu-lesson-quiz__back"><ArrowLeft size={16} />{tr("До уроку", "Back to lesson")}</button>
      <header className="edu-lesson-quiz__header">
        <p>{tr("EDU / самоперевірка", "EDU / knowledge check")}</p>
        <h1>{tr("Вікторина уроку", "Lesson quiz")}</h1>
        <span>{questions?.length ?? 0} {tr("запитань", "questions")}</span>
      </header>

      {errorMessage ? (
        <section className="edu-lesson-quiz__empty" role="alert"><strong>{tr("Не вдалося відкрити перевірку", "Could not open the quiz")}</strong><p>{errorMessage}</p><button type="button" onClick={() => setReload(value => value + 1)}>{tr("Спробувати ще раз", "Try again")}</button></section>
      ) : !questions ? (
        <section className="edu-lesson-quiz__empty"><strong>{tr("У цьому уроці немає вікторини", "This lesson has no quiz")}</strong><p>{tr("Поверніться до матеріалу уроку або запитайте викладача, коли з’явиться перевірка.", "Return to the lesson material or ask your teacher when a check will be available.")}</p></section>
      ) : attempt || result ? (
        <section className="edu-lesson-quiz__result" role="status"><div><p>{tr("СПРОБУ ЗБЕРЕЖЕНО", "ATTEMPT SAVED")}</p><h2>{tr("Результат", "Result")}</h2></div><strong>{(result ?? attempt)?.autoPercent ?? "—"}<small>%</small></strong>{(result ?? attempt)?.needsManual && <p className="edu-lesson-quiz__pending">{tr("Відкриті відповіді ще має перевірити викладач.", "Your teacher still needs to review the open responses.")}</p>}</section>
      ) : (
        <form className="edu-lesson-quiz__questions" onSubmit={event => { event.preventDefault(); void submit(); }}>
          {questions.map((q, idx) => <fieldset key={q.id} className="edu-lesson-quiz__question"><legend><span>{String(idx + 1).padStart(2, "0")}</span><strong>{q.prompt ?? q.id}</strong>{q.points ? <small>{q.points} {tr("балів", "points")}</small> : null}</legend><QuestionInput q={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} /></fieldset>)}
          <div className="edu-lesson-quiz__submit-row"><span>{Object.keys(answers).length} / {questions.length} {tr("відповідей обрано", "answers selected")}</span><Button type="submit" disabled={busy || Object.keys(answers).length === 0}><Send size={16} />{busy ? tr("Надсилання…", "Submitting…") : tr("Надіслати відповіді", "Submit answers")}</Button></div>
        </form>
      )}
    </main>
  );
};

const QuestionInput: React.FC<{ q: Question; value: QuizAnswer; onChange: (v: QuizAnswer) => void }> = ({ q, value, onChange }) => {
  switch (q.type) {
    case "SINGLE_CHOICE":
      return (
        <div className="edu-lesson-quiz__options">
          {(q.options ?? []).map((opt, i) => (
            <label key={i} className="edu-lesson-quiz__option">
              <input type="radio" name={q.id} checked={value === i} onChange={() => onChange(i)} /> {opt}
            </label>
          ))}
        </div>
      );
    case "MULTIPLE_CHOICE": {
      const arr: number[] = Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
      return (
        <div className="edu-lesson-quiz__options">
          {(q.options ?? []).map((opt, i) => (
            <label key={i} className="edu-lesson-quiz__option">
              <input
                type="checkbox"
                checked={arr.includes(i)}
                onChange={() => onChange(arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i])}
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }
    case "TRUE_FALSE":
      return (
        <div className="edu-lesson-quiz__options edu-lesson-quiz__options--inline">
          <label className="edu-lesson-quiz__option">
            <input type="radio" name={q.id} checked={value === true} onChange={() => onChange(true)} /> {tr("Правда", "True")}
          </label>
          <label className="edu-lesson-quiz__option">
            <input type="radio" name={q.id} checked={value === false} onChange={() => onChange(false)} /> {tr("Хибність", "False")}
          </label>
        </div>
      );
    case "FILL_BLANK": {
      const blanks = q.blanks ?? [];
      const arr: string[] = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      return (
        <div className="edu-lesson-quiz__options edu-lesson-quiz__options--inline">
          {blanks.map((_, i) => (
            <input
              key={i}
              value={arr[i] ?? ""}
              onChange={e => {
                const next = [...arr];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={`#${i + 1}`}
              className="edu-lesson-quiz__answer edu-lesson-quiz__answer--blank"
            />
          ))}
        </div>
      );
    }
    case "MATCHING": {
      const n = q.pairCount ?? 0;
      const arr: number[] = Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
      return (
        <div className="edu-lesson-quiz__options">
          {Array.from({ length: n }).map((_, i) => (
            <label key={i} className="edu-lesson-quiz__option">
              {tr("Пара", "Pair")} {i + 1}:
              <input
                type="number"
                min={0}
                value={arr[i] ?? ""}
                onChange={e => {
                  const next = [...arr];
                  next[i] = Number(e.target.value);
                  onChange(next);
                }}
                className="edu-lesson-quiz__answer edu-lesson-quiz__answer--pair"
              />
            </label>
          ))}
        </div>
      );
    }
    case "OPEN_TEXT":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className="edu-lesson-quiz__answer edu-lesson-quiz__answer--text"
        />
      );
    case "SHORT_ANSWER":
    default:
      return (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          className="edu-lesson-quiz__answer"
        />
      );
  }
};
