import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { getStudentCode, updateGrade, type UpdateGradeRequest } from "../lib/api/edu";
import { ArrowLeft, Save, Code2 } from "lucide-react";
import { tr } from "../i18n";
export const GradeDetailsPage: React.FC = () => {
  const {
    i18n
  } = useTranslation();
  const {
    gradeId
  } = useParams<{
    gradeId: string;
  }>();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [task, setTask] = useState<any>(null);
  const [grade, setGrade] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const safeServerMessage = (value: unknown) => {
    const msg = typeof value === "string" ? value : String(value ?? "");
    if (i18n.language === "en" && /[А-Яа-яІіЇїЄєҐґ]/.test(msg)) return "";
    return msg;
  };
  useEffect(() => {
    if (gradeId) {
      loadGrade();
    }
  }, [gradeId]);
  const loadGrade = async () => {
    if (!gradeId) return;
    try {
      const data = await getStudentCode(parseInt(gradeId, 10));
      setCode(data.code || "");
      setStudent(data.student);
      setTask(data.task);
      setGrade(data.grade);
      setTotal(data.grade.total || 0);
      setFeedback(data.grade.feedback || "");
    } catch (error) {
      console.error("Failed to load grade:", error);
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async () => {
    if (!gradeId) return;
    const update: UpdateGradeRequest = {
      total: total > 0 ? total : undefined,
      feedback: feedback.trim() || undefined
    };
    setSaving(true);
    try {
      await updateGrade(parseInt(gradeId, 10), update);
      alert(tr("Оцінка оновлена", "Grade updated"));
      navigate(-1);
    } catch (error: any) {
      console.error("Failed to update grade:", error);
      const raw = safeServerMessage(error.response?.data?.message ?? error.message);
      alert(raw || tr("Не вдалося оновити оцінку", "Failed to update grade"));
    } finally {
      setSaving(false);
    }
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Завантаження...", "Loading...")}
      </div>;
  }
  return <div className="h-full flex flex-col bg-bg-base">
      <div className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div>
            <h1 className="text-lg font-mono text-text-primary">{task?.title}</h1>
            <div className="text-xs text-text-secondary">
              {student?.lastName} {student?.firstName} {student?.middleName || ""}
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {}
        <div className="flex-1 border-r border-border overflow-hidden">
          <div className="h-full p-4 bg-bg-code overflow-y-auto">
            <pre className="text-sm font-mono text-text-primary whitespace-pre-wrap">
              {code}
            </pre>
          </div>
        </div>

        {}
        <div className="w-80 bg-bg-surface p-4 overflow-y-auto">
          <h2 className="text-lg font-mono text-text-primary mb-4">{tr("Оцінка", "Grade")}</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Оцінка (1-12)", "Grade (1-12)")}
              </label>
              <input type="number" min="1" max="12" value={total || ""} onChange={e => setTotal(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Коментар", "Comment")}
              </label>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[200px]" placeholder={tr("Додайте коментар для учня...", "Add a comment for the student...")} />
            </div>
          </div>
        </div>
      </div>
    </div>;
};