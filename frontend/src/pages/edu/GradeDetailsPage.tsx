import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion, animate } from "framer-motion";
import { easeOutQuint } from "../../lib/motion";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { getStudentCode, updateGrade, type UpdateGradeRequest } from "../../lib/api/edu";
import { ArrowLeft, Save, Code2 } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: latest => setDisplay(Math.round(latest))
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{display}</>;
};

const ScoreBar: React.FC<{ percent: number; tone?: string }> = ({ percent, tone = "bg-primary" }) => {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
      <motion.div
        className={`h-full ${tone} rounded-full origin-left`}
        style={{ width: "100%" }}
        initial={reduce ? { scaleX: clamped / 100 } : { scaleX: 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={reduce ? { duration: 0 } : { duration: 0.6, ease: easeOutQuint }}
      />
    </div>
  );
};
type GradeStudent = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type GradeTask = {
  title: string;
};

type GradeInfo = {
  total: number;
  feedback?: string | null;
};
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
  const [student, setStudent] = useState<GradeStudent | null>(null);
  const [task, setTask] = useState<GradeTask | null>(null);
  const [grade, setGrade] = useState<GradeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const safeServerMessage = (value: unknown) => {
    const msg = typeof value === "string" ? value : String(value ?? "");
    if (typeof i18n.language === "string" && i18n.language.startsWith("en") && /[А-Яа-яІіЇїЄєҐґ]/.test(msg)) return "";
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
      showToast({ type: "success", message: tr("Оцінка оновлена", "Grade updated") });
      navigate(-1);
    } catch (error: unknown) {
      console.error("Failed to update grade:", error);
      const raw = safeServerMessage(getErrorMessageFromUnknown(error, ""));
      showToast({ type: "error", message: raw || tr("Не вдалося оновити оцінку", "Failed to update grade") });
    } finally {
      setSaving(false);
    }
  };
  if (loading) {
    return <PageSkeleton variant="default" />;
  }
  const scoreTone = total >= 85 ? "text-accent-success" : total >= 65 ? "text-accent-warn" : total >= 40 ? "text-accent-warning" : "text-accent-error";
  const barTone = total >= 85 ? "bg-accent-success" : total >= 65 ? "bg-accent-warn" : total >= 40 ? "bg-accent-warning" : "bg-accent-error";
  return <div className="h-full flex flex-col bg-bg-base">
      <div className="border-b border-border bg-bg-surface flex items-center justify-between px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-1">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="min-w-0">
            <span className="font-mono text-xs text-primary/70">// grade</span>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight text-text-primary truncate">{task?.title}</h1>
            <div className="text-xs text-text-secondary font-mono truncate">
              {student?.lastName} {student?.firstName} {student?.middleName || ""}
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="shrink-0">
          <Save className="w-4 h-4 mr-2" />
          {saving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {}
        <div className="flex-1 border-r border-border overflow-hidden">
          <div className="h-full p-4 bg-bg-code overflow-y-auto">
            <div className="mb-2 text-xs font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" />
              {tr("Код учня", "Student code")}
            </div>
            <pre className="text-sm font-mono text-text-primary whitespace-pre-wrap">
              {code}
            </pre>
          </div>
        </div>

        {}
        <div className="w-80 bg-bg-surface p-5 overflow-y-auto">
          <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">{tr("Оцінка", "Grade")}</h2>

          <div className="rounded-xl border border-border bg-bg-base p-4 mb-5">
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-3xl md:text-4xl font-bold tabular-nums ${scoreTone}`}><CountUp value={total} /></span>
              <span className="text-xs text-text-muted font-mono uppercase tracking-[0.08em]">/ 100</span>
            </div>
            <div className="mt-3">
              <ScoreBar percent={total} tone={barTone} />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Оцінка (1-100)", "Grade (1-100)")}
              </label>
              <input type="number" min="1" max="100" value={total || ""} onChange={e => setTotal(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
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