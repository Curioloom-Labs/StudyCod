import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { useTranslation } from "react-i18next";
import { QuizRichText } from "../../components/edu/QuizRichText";
import "./eduWorkspace.css";

interface Attempt {
  studentId: number;
  studentName: string;
  autoScore: number;
  maxScore: number;
  autoPercent: number;
  finalPercent?: number | null;
  status: "AUTO_GRADED" | "NEEDS_MANUAL" | "MANUAL_GRADED";
}
interface ReviewQuestion {
  id: string; type: string; prompt: string | null; points: number; answer: string;
  options: string[]; correctAnswer: string | null;
  result: { earned: number; points: number; correct: boolean | null; needsManual: boolean } | null;
}

export const TeacherQuizReviewPage: React.FC = () => {
  useTranslation();
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFor, setOpenFor] = useState<number | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const detailGeneration = React.useRef(0);
  const listGeneration = React.useRef(0);

  const loadAttempts = async () => {
    const generation = ++listGeneration.current;
    setError(null);
    try {
      const { data } = await api.get(`/edu/lessons/${lessonId}/quiz/attempts`);
      if (generation === listGeneration.current) setAttempts(data?.attempts ?? []);
    } catch (cause) {
      if (generation === listGeneration.current) setError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити спроби.", "Could not load attempts.")));
    }
  };

  useEffect(() => {
    detailGeneration.current += 1;
    setOpenFor(null);
    setQuestions([]);
    setScores({});
    setLoading(true);
    setLoadingAnswers(false);
    let active = true;
    (async () => {
      try {
        await loadAttempts();
      } catch (error) {
        setError(tr("Не вдалося завантажити спроби.", "Could not load attempts."));
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; detailGeneration.current += 1; listGeneration.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const expand = async (studentId: number) => {
    if (busy || loadingAnswers) return;
    const generation = ++detailGeneration.current;
    if (openFor === studentId) {
      setOpenFor(null);
      return;
    }
    try {
      setLoadingAnswers(true);
      setError(null);
      const { data } = await api.get(`/edu/lessons/${lessonId}/quiz/attempts/${studentId}`);
      if (generation !== detailGeneration.current) return;
      setQuestions(data?.questions ?? (data?.openQuestions ?? []).map((q: { id: string; prompt: string | null; points: number; answer: string }) => ({
        ...q, type: "OPEN_TEXT", options: [], correctAnswer: null, result: null
      })));
      setScores({});
      setOpenFor(studentId);
    } catch (error) {
      if (generation !== detailGeneration.current) return;
      setError(tr("Не вдалося завантажити відповіді.", "Could not load answers."));
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally { if (generation === detailGeneration.current) setLoadingAnswers(false); }
  };

  const grade = async (studentId: number) => {
    const manualQuestions = questions.filter(q => q.type === "OPEN_TEXT");
    if (busy || manualQuestions.some(q => scores[q.id] == null || !scores[q.id].trim() || !Number.isFinite(Number(scores[q.id])) || Number(scores[q.id]) < 0 || Number(scores[q.id]) > q.points)) return;
    setBusy(true);
    try {
      const manualScores: Record<string, number> = {};
      for (const q of manualQuestions) {
        const v = Number(scores[q.id]);
        if (Number.isFinite(v)) manualScores[q.id] = v;
      }
      const { data } = await api.post(`/edu/lessons/${lessonId}/quiz/attempts/${studentId}/grade-manual`, { manualScores });
      showToast({ message: tr(`Підсумок: ${data?.result?.finalPercent}%`, `Final: ${data?.result?.finalPercent}%`), type: "success" });
      setOpenFor(null);
      await loadAttempts();
    } catch (error) {
      setError(tr("Не вдалося зберегти оцінку.", "Could not save grade."));
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="edu-workspace edu-quiz-review__loading" role="status" aria-live="polite">{tr("Завантажуємо спроби…", "Loading attempts…")}</div>;

  return (
    <main className="edu-workspace edu-quiz-review mx-auto max-w-[860px] px-4 pb-12 sm:px-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="edu-quiz-review__back">
        <ArrowLeft size={16} /> {tr("До уроку", "Back to lesson")}
      </Button>
      <header className="edu-quiz-review__header"><p>{tr("EDU / перевірка відповідей", "EDU / answer review")}</p><h1>{tr("Спроби вікторини", "Quiz attempts")}</h1><span>{attempts.length} {tr("учнів", "learners")}</span></header>

      {error && (
        <div role="alert" className="edu-quiz-review__error">
          <div>{error}</div>
          <Button variant="ghost" onClick={() => void loadAttempts()}>
            {tr("Спробувати ще раз", "Try again")}
          </Button>
        </div>
      )}

      <div className="edu-quiz-review__attempts">
        {!error && attempts.length === 0 && <p className="edu-quiz-review__empty">{tr("Ще немає спроб. Відповіді учнів з’являться після надсилання вікторини.", "No attempts yet. Learner responses will appear here after they submit the quiz.")}</p>}
        {attempts.map(a => (
          <article key={a.studentId} className="edu-quiz-review__attempt">
            <div className="edu-quiz-review__student">
              <strong>{a.studentName || `#${a.studentId}`}</strong>
              <span className="edu-quiz-review__score">{a.finalPercent ?? a.autoPercent}%</span>
              <span className={`edu-quiz-review__status ${a.status === "NEEDS_MANUAL" ? "is-pending" : ""}`}>
                {a.status === "NEEDS_MANUAL"
                  ? tr("Потребує перевірки", "Needs review")
                  : a.status === "MANUAL_GRADED"
                  ? tr("Перевірено", "Graded")
                  : tr("Авто", "Auto")}
              </span>
              <Button variant="ghost" disabled={busy || loadingAnswers} aria-expanded={openFor === a.studentId} className="edu-quiz-review__grade" onClick={() => expand(a.studentId)}>
                {openFor === a.studentId ? tr("Сховати", "Hide") : a.status === "NEEDS_MANUAL" ? tr("Переглянути й оцінити", "Review and grade") : tr("Переглянути відповіді", "Review answers")}
              </Button>
            </div>

            {openFor === a.studentId && (
              <div className="edu-quiz-review__answers">
                {questions.length === 0 && <p className="edu-quiz-review__empty">{tr("У цій спробі не знайдено запитань.", "No questions were found for this attempt.")}</p>}
                {questions.map(q => (
                  <div key={q.id} className="edu-quiz-review__answer">
                    <div className="edu-quiz-review__prompt"><QuizRichText content={q.prompt ?? q.id} /></div>
                    <div className="edu-quiz-review__response"><strong>{tr("Відповідь учня:", "Student answer:")}</strong> <QuizRichText content={q.answer || tr("(порожньо)", "(empty)")} /></div>
                    {q.type !== "OPEN_TEXT" && <p className="text-sm text-text-secondary">{q.result?.correct ? tr("Правильно", "Correct") : tr("Неправильно", "Incorrect")} · {q.result?.earned ?? 0}/{q.result?.points ?? q.points} {tr("балів", "points")}</p>}
                    {q.correctAnswer && <div className="edu-quiz-review__response"><strong>{tr("Правильна відповідь:", "Correct answer:")}</strong> <QuizRichText content={q.correctAnswer} /></div>}
                    {q.type === "OPEN_TEXT" && <label className="edu-quiz-review__points">
                      {tr("Бали", "Points")} (0–{q.points}):{" "}
                      <input type="number" min={0} max={q.points} step="0.01" disabled={busy} value={scores[q.id] ?? ""} onChange={e => setScores(prev => ({ ...prev, [q.id]: e.target.value }))} className="edu-quiz-review__points-input" />
                    </label>}
                  </div>
                ))}
                {questions.some(q => q.type === "OPEN_TEXT") && <Button onClick={() => grade(a.studentId)} disabled={busy || questions.filter(q => q.type === "OPEN_TEXT").some(q => scores[q.id] == null || !scores[q.id].trim() || !Number.isFinite(Number(scores[q.id])) || Number(scores[q.id]) < 0 || Number(scores[q.id]) > q.points)}>
                  <Check size={16} /> {tr("Зберегти оцінку", "Save grade")}
                </Button>}
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
};
