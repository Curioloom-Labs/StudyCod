import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

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
interface AttemptInfo { status: string; autoScore: number; maxScore: number; autoPercent: number; }

export const LessonQuizPage: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/edu/lessons/${lessonId}/quiz`);
        setQuestions(data?.quiz?.questions ?? null);
        setAttempt(data?.attempt ?? null);
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  const setAnswer = (qid: string, value: any) => setAnswers(prev => ({ ...prev, [qid]: value }));

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

  if (loading) return <div style={{ padding: 24 }}>{tr("Завантаження...", "Loading...")}</div>;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero eyebrowClassic="// quiz" eyebrowAurora={tr("Вікторина", "Quiz")} title={tr("Вікторина уроку", "Lesson quiz")} />

      {!questions ? (
        <p style={{ opacity: 0.6, marginTop: 16 }}>{tr("У цьому уроці немає вікторини.", "This lesson has no quiz.")}</p>
      ) : attempt || result ? (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>{tr("Результат", "Result")}</h3>
          <p>
            {tr("Автоматично", "Auto")}: <strong>{(result ?? attempt)?.autoPercent}%</strong>
            {(result ?? attempt)?.needsManual && (
              <span style={{ marginLeft: 8, fontSize: 13, opacity: 0.7 }}>
                {tr("(є питання на ручну перевірку)", "(some answers await manual grading)")}
              </span>
            )}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
          {questions.map((q, idx) => (
            <div key={q.id} style={{ padding: 14, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {idx + 1}. {q.prompt ?? q.id} {q.points ? <span style={{ opacity: 0.5, fontSize: 12 }}>({q.points})</span> : null}
              </div>
              <QuestionInput q={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} />
            </div>
          ))}
          <Button onClick={submit} disabled={busy}>
            <Send size={16} /> {busy ? tr("Надсилання...", "Submitting...") : tr("Надіслати", "Submit")}
          </Button>
        </div>
      )}
    </div>
  );
};

const QuestionInput: React.FC<{ q: Question; value: any; onChange: (v: any) => void }> = ({ q, value, onChange }) => {
  switch (q.type) {
    case "SINGLE_CHOICE":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.options ?? []).map((opt, i) => (
            <label key={i} style={{ display: "flex", gap: 8 }}>
              <input type="radio" name={q.id} checked={value === i} onChange={() => onChange(i)} /> {opt}
            </label>
          ))}
        </div>
      );
    case "MULTIPLE_CHOICE": {
      const arr: number[] = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.options ?? []).map((opt, i) => (
            <label key={i} style={{ display: "flex", gap: 8 }}>
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
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6 }}>
            <input type="radio" name={q.id} checked={value === true} onChange={() => onChange(true)} /> {tr("Правда", "True")}
          </label>
          <label style={{ display: "flex", gap: 6 }}>
            <input type="radio" name={q.id} checked={value === false} onChange={() => onChange(false)} /> {tr("Хибність", "False")}
          </label>
        </div>
      );
    case "FILL_BLANK": {
      const blanks = q.blanks ?? [];
      const arr: string[] = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
            />
          ))}
        </div>
      );
    }
    case "MATCHING": {
      const n = q.pairCount ?? 0;
      const arr: number[] = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Array.from({ length: n }).map((_, i) => (
            <label key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
              />
            </label>
          ))}
        </div>
      );
    }
    case "OPEN_TEXT":
      return (
        <textarea
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          rows={4}
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)", boxSizing: "border-box" }}
        />
      );
    case "SHORT_ANSWER":
    default:
      return (
        <input
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)", boxSizing: "border-box" }}
        />
      );
  }
};
