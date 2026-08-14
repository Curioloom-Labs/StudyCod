import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

interface Attempt {
  studentId: number;
  studentName: string;
  autoScore: number;
  maxScore: number;
  autoPercent: number;
  status: "AUTO_GRADED" | "NEEDS_MANUAL" | "MANUAL_GRADED";
}
interface OpenQuestion { id: string; prompt: string | null; points: number; answer: string; }

export const TeacherQuizReviewPage: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFor, setOpenFor] = useState<number | null>(null);
  const [questions, setQuestions] = useState<OpenQuestion[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAttempts = async () => {
    setError(null);
    const { data } = await api.get(`/edu/lessons/${lessonId}/quiz/attempts`);
    setAttempts(data?.attempts ?? []);
  };

  useEffect(() => {
    (async () => {
      try {
        await loadAttempts();
      } catch (error) {
        setError("Failed to load attempts.");
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const expand = async (studentId: number) => {
    if (openFor === studentId) {
      setOpenFor(null);
      return;
    }
    try {
      const { data } = await api.get(`/edu/lessons/${lessonId}/quiz/attempts/${studentId}`);
      setQuestions(data?.openQuestions ?? []);
      setScores({});
      setOpenFor(studentId);
    } catch (error) {
      setError("Failed to load answers.");
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  const grade = async (studentId: number) => {
    setBusy(true);
    try {
      const manualScores: Record<string, number> = {};
      for (const q of questions) {
        const v = Number(scores[q.id]);
        if (Number.isFinite(v)) manualScores[q.id] = v;
      }
      const { data } = await api.post(`/edu/lessons/${lessonId}/quiz/attempts/${studentId}/grade-manual`, { manualScores });
      showToast({ message: tr(`Підсумок: ${data?.result?.finalPercent}%`, `Final: ${data?.result?.finalPercent}%`), type: "success" });
      setOpenFor(null);
      await loadAttempts();
    } catch (error) {
      setError("Failed to save grade.");
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div role="status" aria-live="polite" style={{ padding: 24 }}>{tr("Завантаження...", "Loading...")}</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero
        eyebrowClassic="// quiz review"
        eyebrowAurora={tr("Перевірка", "Review")}
        title={tr("Спроби вікторини", "Quiz attempts")}
      />

      {error && (
        <div role="alert" style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(220, 70, 100, 0.12)" }}>
          <div>{error}</div>
          <Button variant="ghost" onClick={() => void loadAttempts()} style={{ marginTop: 8 }}>
            {tr("Спробувати ще раз", "Try again")}
          </Button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {attempts.length === 0 && <p style={{ opacity: 0.6 }}>{tr("Ще немає спроб.", "No attempts yet.")}</p>}
        {attempts.map(a => (
          <div key={a.studentId} style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>{a.studentName || `#${a.studentId}`}</strong>
              <span style={{ fontSize: 13, opacity: 0.7 }}>{a.autoPercent}%</span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(128,128,128,0.3)",
                  color: a.status === "NEEDS_MANUAL" ? "rgb(220,150,40)" : undefined
                }}
              >
                {a.status === "NEEDS_MANUAL"
                  ? tr("Потребує перевірки", "Needs review")
                  : a.status === "MANUAL_GRADED"
                  ? tr("Перевірено", "Graded")
                  : tr("Авто", "Auto")}
              </span>
              {a.status !== "AUTO_GRADED" && (
                <Button variant="ghost" className="text-xs" onClick={() => expand(a.studentId)} style={{ marginLeft: "auto" }}>
                  {openFor === a.studentId ? tr("Сховати", "Hide") : tr("Оцінити", "Grade")}
                </Button>
              )}
            </div>

            {openFor === a.studentId && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {questions.length === 0 && <p style={{ opacity: 0.6 }}>{tr("Немає відкритих питань.", "No open questions.")}</p>}
                {questions.map(q => (
                  <div key={q.id} style={{ padding: 10, background: "rgba(128,128,128,0.06)", borderRadius: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{q.prompt ?? q.id}</div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 14, margin: "6px 0", opacity: 0.9 }}>{q.answer || tr("(порожньо)", "(empty)")}</div>
                    <label style={{ fontSize: 13 }}>
                      {tr("Бали", "Points")} (0–{q.points}):{" "}
                      <input
                        type="number"
                        min={0}
                        max={q.points}
                        value={scores[q.id] ?? ""}
                        onChange={e => setScores(prev => ({ ...prev, [q.id]: e.target.value }))}
                        style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
                      />
                    </label>
                  </div>
                ))}
                <Button onClick={() => grade(a.studentId)} disabled={busy}>
                  <Check size={16} /> {tr("Зберегти оцінку", "Save grade")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
