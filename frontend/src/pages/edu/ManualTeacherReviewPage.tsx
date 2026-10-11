import React from "react";
import { ArrowLeft, Download, FileCheck2, Plus, Save, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api/client";
import { getTaskRubric, setTaskRubric, type RubricCriterion } from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

type Submission = {
  studentId: number;
  studentName: string;
  text: string | null;
  hasFile: boolean;
  fileName: string | null;
  status: string;
  updatedAt?: string;
  grade?: { total: number | null; maxScore: number | null; feedback: string | null } | null;
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

export const ManualTeacherReviewPage: React.FC = () => {
  useTranslation();
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const numericTaskId = Number(taskId);
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [rubric, setRubric] = React.useState<RubricCriterion[]>([]);
  const [scores, setScores] = React.useState<Record<number, string>>({});
  const [feedback, setFeedback] = React.useState<Record<number, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [savingRubric, setSavingRubric] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [subs, savedRubric] = await Promise.all([
        api.get(`/edu/manual-tasks/${taskId}/submissions`),
        getTaskRubric(numericTaskId).catch(() => ({ rubric: [] as RubricCriterion[] }))
      ]);
      const nextSubmissions = (subs.data?.submissions ?? []) as Submission[];
      setSubmissions(nextSubmissions);
      setScores(Object.fromEntries(nextSubmissions.filter((item) => item.grade?.total != null).map((item) => [item.studentId, String(item.grade?.total)])));
      setFeedback(Object.fromEntries(nextSubmissions.filter((item) => item.grade?.feedback).map((item) => [item.studentId, item.grade?.feedback ?? ""])));
      setRubric(savedRubric.rubric ?? []);
      setError(null);
    } catch (caught) {
      if (preview()) {
        setSubmissions([
          { studentId: 1, studentName: "Марія Коваль", text: "Пояснення рішення…", hasFile: true, fileName: "solution.pdf", status: "SUBMITTED" },
          { studentId: 2, studentName: "Дмитро Левченко", text: "Короткий опис алгоритму.", hasFile: false, fileName: null, status: "GRADED" }
        ]);
        setRubric([{ id: "logic", label: "Логіка рішення", maxPoints: 6 }, { id: "clarity", label: "Пояснення", maxPoints: 4 }]);
      } else {
        setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити роботи.", "Could not load submissions.")));
      }
    } finally {
      setLoading(false);
    }
  }, [numericTaskId, taskId]);

  React.useEffect(() => { void load(); }, [load]);

  const maxScore = Math.max(1, rubric.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0) || 100);
  const grade = async (submission: Submission) => {
    const total = Number(scores[submission.studentId]);
    if (!Number.isFinite(total) || total < 0 || total > maxScore) {
      setError(tr(`Оцінка має бути від 0 до ${maxScore}.`, `Grade must be from 0 to ${maxScore}.`));
      return;
    }
    setBusyId(submission.studentId);
    setError(null);
    try {
      if (!preview()) {
        await api.post(`/edu/manual-tasks/${numericTaskId}/submissions/${submission.studentId}/grade`, {
          total,
          maxScore,
          feedback: feedback[submission.studentId] || ""
        });
      }
      setSubmissions((items) => items.map((item) => item.studentId === submission.studentId ? { ...item, status: "GRADED" } : item));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти оцінку.", "Could not save the grade.")));
    } finally {
      setBusyId(null);
    }
  };

  const download = async (submission: Submission) => {
    if (preview()) return;
    try {
      const response = await api.get(`/edu/manual-tasks/${numericTaskId}/submissions/${submission.studentId}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = submission.fileName || "submission";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити файл.", "Could not download the file.")));
    }
  };

  const saveRubric = async () => {
    setSavingRubric(true);
    try {
      const cleaned = rubric.filter((item) => item.label.trim() && item.maxPoints > 0);
      if (preview()) {
        setRubric(cleaned);
        return;
      }
      const result = await setTaskRubric(numericTaskId, cleaned);
      setRubric(result.rubric);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти рубрику.", "Could not save the rubric.")));
    } finally {
      setSavingRubric(false);
    }
  };

  return <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
    <button type="button" onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"><ArrowLeft className="h-4 w-4" />{tr("Назад до класу", "Back to class")}</button>
    <header className="rounded-[30px] bg-bg-base p-6 text-text-primary sm:p-9"><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-soft">{tr("Ручна перевірка", "Manual review")}</p><h1 className="mt-3 text-4xl font-bold tracking-[-.055em]">{tr("Роботи учнів", "Student submissions")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{tr("Переглядайте відповіді, завантажуйте файли та зберігайте оцінку з feedback.", "Review responses, download files, and save a grade with feedback.")}</p></header>
    {error && <div className="mt-5 rounded-2xl bg-accent-error/10 px-4 py-3 text-sm text-accent-error dark:text-accent-error">{error}</div>}
    <main className="mt-7 grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-4">{loading ? <div className="h-64 animate-pulse rounded-[26px] bg-bg-hover dark:bg-white/[.05]" /> : submissions.map((submission) => <article key={submission.studentId} className="rounded-[25px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{submission.studentName || `${tr("Учень", "Student")} #${submission.studentId}`}</h2><p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{submission.status === "GRADED" ? tr("Оцінено", "Graded") : tr("Очікує перевірки", "Awaiting review")}</p></div>{submission.status === "GRADED" && <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{tr("Готово", "Done")}</span>}</div><div className="mt-4 rounded-2xl bg-bg-hover p-4 text-sm leading-7 text-text-primary dark:bg-white/[.045] dark:text-text-secondary">{submission.text || tr("Текстової відповіді немає.", "No written response.")}</div>{submission.hasFile && <button type="button" onClick={() => void download(submission)} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary-strong dark:text-primary-soft"><Download className="h-4 w-4" />{submission.fileName || tr("Завантажити файл", "Download file")}</button>}<div className="mt-5 grid gap-3 md:grid-cols-[130px_1fr_auto]"><label htmlFor={`score-${submission.studentId}`} className="sr-only">{tr("Оцінка", "Grade")}</label><input id={`score-${submission.studentId}`} name={`score-${submission.studentId}`} type="number" min={0} max={maxScore} value={scores[submission.studentId] ?? ""} onChange={(event) => setScores((items) => ({ ...items, [submission.studentId]: event.target.value }))} placeholder={`0–${maxScore}`} className="rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-bg-code" /><label htmlFor={`feedback-${submission.studentId}`} className="sr-only">{tr("Feedback для учня", "Feedback for student")}</label><input id={`feedback-${submission.studentId}`} name={`feedback-${submission.studentId}`} value={feedback[submission.studentId] ?? ""} onChange={(event) => setFeedback((items) => ({ ...items, [submission.studentId]: event.target.value }))} placeholder={tr("Feedback для учня", "Feedback for student")} className="rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-bg-code" /><button type="button" disabled={busyId === submission.studentId} onClick={() => void grade(submission)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"><FileCheck2 className="h-4 w-4" />{busyId === submission.studentId ? tr("Зберігаємо…", "Saving…") : tr("Оцінити", "Grade")}</button></div></article>)}{!loading && submissions.length === 0 && <div className="rounded-[26px] border border-dashed border-border/15 px-6 py-16 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Робіт ще немає.", "No submissions yet.")}</div>}</section>
      <aside className="h-fit rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{tr("Рубрика", "Rubric")}</p><h2 className="mt-2 text-2xl font-bold">{tr("Критерії", "Criteria")}</h2></div><span className="text-xs font-bold text-text-muted">{tr("Макс.", "Max")} {maxScore}</span></div><div className="mt-5 space-y-3">{rubric.map((item) => <div key={item.id} className="grid grid-cols-[1fr_72px_30px] gap-2"><input value={item.label} onChange={(event) => setRubric((items) => items.map((value) => value.id === item.id ? { ...value, label: event.target.value } : value))} placeholder={tr("Критерій", "Criterion")} className="rounded-xl border border-border/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-bg-code" /><input type="number" min={1} value={item.maxPoints} onChange={(event) => setRubric((items) => items.map((value) => value.id === item.id ? { ...value, maxPoints: Number(event.target.value) || 0 } : value))} className="rounded-xl border border-border/10 bg-white px-2 py-2 text-sm dark:border-white/10 dark:bg-bg-code" /><button type="button" onClick={() => setRubric((items) => items.filter((value) => value.id !== item.id))} className="text-accent-error"><Trash2 className="h-4 w-4" /></button></div>)}</div><button type="button" onClick={() => setRubric((items) => [...items, { id: `criterion_${Date.now()}`, label: "", maxPoints: 10 }])} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary-strong dark:text-primary-soft"><Plus className="h-4 w-4" />{tr("Додати критерій", "Add criterion")}</button><button type="button" disabled={savingRubric} onClick={() => void saveRubric()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Save className="h-4 w-4" />{savingRubric ? tr("Зберігаємо…", "Saving…") : tr("Зберегти рубрику", "Save rubric")}</button></aside>
    </main>
  </div>;
};
