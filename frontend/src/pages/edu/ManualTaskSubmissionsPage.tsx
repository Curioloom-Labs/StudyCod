import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { getTaskRubric, setTaskRubric, type RubricCriterion } from "../../lib/api/edu";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

interface Submission {
  studentId: number;
  studentName: string;
  text: string | null;
  hasFile: boolean;
  fileName: string | null;
  status: string;
}

/**
 * Teacher view of MANUAL-task submissions (P2.4b). Reads the submissions list;
 * grading reuses the existing manual-grade endpoint elsewhere.
 */
export const ManualTaskSubmissionsPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);
  const [savingRubric, setSavingRubric] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [subs, rub] = await Promise.all([
          api.get(`/edu/manual-tasks/${taskId}/submissions`),
          getTaskRubric(Number(taskId)).catch(() => ({ rubric: [] as RubricCriterion[] }))
        ]);
        setSubmissions(subs.data?.submissions ?? []);
        setRubric(rub.rubric ?? []);
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  const addCriterion = () => setRubric(r => [...r, { id: `c_${Math.random().toString(36).slice(2, 9)}`, label: "", maxPoints: 10 }]);
  const updateCriterion = (id: string, patch: Partial<RubricCriterion>) => setRubric(r => r.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const removeCriterion = (id: string) => setRubric(r => r.filter(c => c.id !== id));
  const saveRubric = async () => {
    setSavingRubric(true);
    try {
      const cleaned = rubric.filter(c => c.label.trim() && c.maxPoints > 0);
      const { rubric: saved } = await setTaskRubric(Number(taskId), cleaned);
      setRubric(saved);
      showToast({ message: tr("Критерії збережено", "Rubric saved"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Не вдалося зберегти", "Failed to save")), type: "error" });
    } finally {
      setSavingRubric(false);
    }
  };

  if (loading) return <div role="status" aria-live="polite" style={{ padding: 24 }}>{tr("Завантаження…", "Loading…")}</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero
        eyebrow="// submissions"
        title={tr("Здачі завдання", "Task submissions")}
      />

      {/* Rubric editor (Tier 1) — criteria are used when grading in the review queue. */}
      <div style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, padding: 12, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <strong>{tr("Критерії оцінювання", "Rubric")}</strong>
          <Button variant="ghost" onClick={saveRubric} disabled={savingRubric}>
            {savingRubric ? tr("Збереження…", "Saving…") : tr("Зберегти критерії", "Save rubric")}
          </Button>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
          {tr("Сума балів критеріїв = 100% оцінки. Без критеріїв — звичайна оцінка.", "Criteria points sum to 100% of the grade. No criteria — plain grade.")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rubric.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={c.label}
                onChange={e => updateCriterion(c.id, { label: e.target.value })}
                placeholder={tr("Критерій (напр. Коректність)", "Criterion (e.g. Correctness)")}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
              />
              <input
                type="number"
                min={1}
                value={c.maxPoints}
                onChange={e => updateCriterion(c.id, { maxPoints: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ width: 90, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)", textAlign: "right" }}
              />
              <button
                type="button"
                onClick={() => removeCriterion(c.id)}
                aria-label={tr("Видалити", "Remove")}
                style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)", background: "transparent", cursor: "pointer" }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={addCriterion}>
            <Plus size={16} /> {tr("Додати критерій", "Add criterion")}
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {submissions.length === 0 && <p style={{ opacity: 0.6 }}>{tr("Ще немає здач.", "No submissions yet.")}</p>}
        {submissions.map(s => (
          <div key={s.studentId} style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>{s.studentName || `#${s.studentId}`}</strong>
              <span
                style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(128,128,128,0.3)" }}
              >
                {s.status === "GRADED" ? tr("Оцінено", "Graded") : tr("На перевірці", "Submitted")}
              </span>
              {s.hasFile && <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.7 }}>📎 {s.fileName}</span>}
            </div>
            {s.text && (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, marginTop: 8, opacity: 0.9 }}>{s.text}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
