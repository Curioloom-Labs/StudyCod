import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
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

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/edu/manual-tasks/${taskId}/submissions`);
        setSubmissions(data?.submissions ?? []);
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  if (loading) return <div style={{ padding: 24 }}>{tr("Завантаження...", "Loading...")}</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero
        eyebrowClassic="// submissions"
        eyebrowAurora={tr("Здачі", "Submissions")}
        title={tr("Здачі завдання", "Task submissions")}
      />

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
