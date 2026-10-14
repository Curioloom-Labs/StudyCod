import "./eduWorkspace.css";
import React from "react";
import { isAxiosError } from "axios";
import { manualGradeInput } from "../../lib/eduManualGrade";
import { ArrowLeft, Download, FileCheck2, Plus, Save, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api/client";
import { getTaskRubric, setTaskRubric, type RubricCriterion } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

type Submission = {
  studentId: number;
  revision?: string;
  studentName: string;
  text: string | null;
  hasFile: boolean;
  fileName: string | null;
  status: string;
  updatedAt?: string;
  grade?: { total: number | null; score?: number | null; maxScore: number | null; feedback: string | null } | null;
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

export const ManualTeacherReviewPage: React.FC = () => {
  useTranslation();
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const numericTaskId = Number(taskId);
  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [rubricLocked, setRubricLocked] = React.useState(false);
  const [canEditRubric, setCanEditRubric] = React.useState(true);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const focusResponseAfterReload = React.useRef(false);
  const [rubric, setRubric] = React.useState<RubricCriterion[]>([]);
  const [savedRubric, setSavedRubric] = React.useState<RubricCriterion[]>([]);
  const [scores, setScores] = React.useState<Record<number, string>>({});
  const [feedback, setFeedback] = React.useState<Record<number, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [savingRubric, setSavingRubric] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reviewConflict, setReviewConflict] = React.useState<{ studentId: number; ready: boolean } | null>(null);
  const loadGeneration = React.useRef(0);
  const gradePending = React.useRef(false);
  const rubricPending = React.useRef(false);

  const load = React.useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const [subs, savedRubric] = await Promise.all([
        api.get(`/edu/manual-tasks/${taskId}/submissions`),
        getTaskRubric(numericTaskId)
      ]);
      if (generation !== loadGeneration.current) return;
      const nextSubmissions = (subs.data?.submissions ?? []) as Submission[];
      setSubmissions(nextSubmissions);
      const maximum = (savedRubric.rubric ?? []).reduce((sum, criterion) => sum + criterion.maxPoints, 0) || 100;
      setScores(Object.fromEntries(nextSubmissions.map((item) => [item.studentId, manualGradeInput(item.grade, maximum)])));
      setFeedback(Object.fromEntries(nextSubmissions.filter((item) => item.grade?.feedback).map((item) => [item.studentId, item.grade?.feedback ?? ""])));
      setRubric(savedRubric.rubric ?? []);
      setSavedRubric(savedRubric.rubric ?? []);
      setRubricLocked(savedRubric.locked ?? nextSubmissions.length > 0);
      setCanEditRubric(savedRubric.canEdit !== false);
      setError(null);
    } catch (caught) {
      if (generation !== loadGeneration.current) return;
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
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [numericTaskId, taskId]);

  React.useEffect(() => { setSubmissions([]); setScores({}); setFeedback({}); setRubric([]); setReviewConflict(null); void load(); return () => { ++loadGeneration.current; }; }, [load]);

  const maxScore = Math.max(1, rubric.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0) || 100);
  const rubricDirty = JSON.stringify(rubric) !== JSON.stringify(savedRubric);
  const editingDisabled = loading || busyId !== null || savingRubric;
  const rubricEditingDisabled = editingDisabled || rubricLocked || !canEditRubric;
  React.useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  React.useEffect(() => {
    if (!loading && !rubricDirty && focusResponseAfterReload.current && submissions.length) {
      focusResponseAfterReload.current = false;
      document.getElementById(`score-${submissions[0].studentId}`)?.focus();
    }
  }, [loading, rubricDirty, submissions]);
  const refreshConflictedSubmission = async (studentId: number) => {
    const generation = loadGeneration.current;
    const response = await api.get(`/edu/manual-tasks/${numericTaskId}/submissions`);
    if (generation !== loadGeneration.current) return;
    const current = (response.data?.submissions as Submission[] | undefined)?.find(item => item.studentId === studentId);
    if (!current) throw new Error(tr("Робота більше недоступна. Оновіть сторінку класу.", "This response is no longer available. Reload the class page."));
    setSubmissions(items => items.map(item => item.studentId === studentId ? current : item));
    setReviewConflict({ studentId, ready: true });
  };
  const grade = async (submission: Submission) => {
    if (gradePending.current || rubricPending.current || busyId !== null || loading || rubricDirty || reviewConflict) return;
    const total = Number(scores[submission.studentId]);
    if (!scores[submission.studentId]?.trim() || !Number.isSafeInteger(total) || total < 0 || total > maxScore) {
      setError(tr(`Оцінка має бути від 0 до ${maxScore}.`, `Grade must be from 0 to ${maxScore}.`));
      return;
    }
    gradePending.current = true;
    const generation = loadGeneration.current;
    setBusyId(submission.studentId);
    setError(null);
    try {
      let saved: { grade?: Submission["grade"]; revision?: string } = {};
      if (!preview()) {
        const response = await api.post(`/edu/manual-tasks/${numericTaskId}/submissions/${submission.studentId}/grade`, {
          total,
          maxScore,
          expectedRevision: submission.revision,
          feedback: feedback[submission.studentId] || ""
        });
        saved = response.data;
      }
      if (generation === loadGeneration.current) setSubmissions((items) => items.map((item) => item.studentId === submission.studentId ? { ...item, status: "GRADED", grade: saved.grade ?? { total: Math.round(total / maxScore * 100), score: total, maxScore, feedback: feedback[submission.studentId] || "" }, revision: saved.revision ?? item.revision } : item));
    } catch (caught) {
      if (generation !== loadGeneration.current) return;
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти оцінку.", "Could not save the grade.")));
      if (isAxiosError(caught) && caught.response?.status === 409 && ["SUBMISSION_CHANGED", "REVIEW_REVISION_REQUIRED"].includes(caught.response?.data?.message)) {
        setReviewConflict({ studentId: submission.studentId, ready: false });
        try { await refreshConflictedSubmission(submission.studentId); }
        catch (refreshError) { if (generation === loadGeneration.current) setError(getErrorMessageFromUnknown(refreshError, tr("Не вдалося завантажити актуальну роботу. Ваша оцінка й коментар збережені в полях.", "Could not load the current response. Your grade and feedback remain in the inputs."))); }
      }
    } finally {
      gradePending.current = false;
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
    if (rubricPending.current || gradePending.current || rubricEditingDisabled) return;
    const generation = loadGeneration.current;
    rubricPending.current = true;
    setSavingRubric(true);
    try {
      if (rubric.length > 30 || rubric.some(item => !item.label.trim() || !Number.isSafeInteger(item.maxPoints) || item.maxPoints <= 0) || maxScore > 100000) {
        setError(tr("Заповніть назви критеріїв і додатні цілі бали. Доступно до 30 критеріїв та 100 000 балів сумарно.", "Use named criteria with positive whole points. Maximum: 30 criteria and 100,000 total points."));
        return;
      }
      const cleaned = rubric.map(item => ({ ...item, label: item.label.trim() }));
      if (preview()) {
        setRubric(cleaned);
        setSavedRubric(cleaned);
        return;
      }
      const result = await setTaskRubric(numericTaskId, cleaned);
      if (generation !== loadGeneration.current) return;
      setRubric(result.rubric);
      setSavedRubric(result.rubric);
      setError(null);
    } catch (caught) {
      if (generation !== loadGeneration.current) return;
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти рубрику.", "Could not save the rubric.")));
      if (isAxiosError(caught) && caught.response?.data?.message === "RUBRIC_LOCKED") {
        setRubricLocked(true);
        try {
          const current = await getTaskRubric(numericTaskId);
          if (generation === loadGeneration.current) setSavedRubric(current.rubric);
        } catch { /* The reload action remains available if refreshing criteria fails. */ }
      }
    } finally {
      rubricPending.current = false;
      setSavingRubric(false);
    }
  };

  return <div data-manual-review className="edu-workspace mx-auto min-w-0 w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
    <button type="button" onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"><ArrowLeft className="h-4 w-4" />{tr("Назад до класу", "Back to class")}</button>
    <header className="rounded-[30px] bg-bg-base p-6 text-text-primary sm:p-9"><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-soft">{tr("Ручна перевірка", "Manual review")}</p><h1 className="mt-3 text-4xl font-bold tracking-[-.055em]">{tr("Роботи учнів", "Student submissions")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{tr("Переглядайте відповіді, завантажуйте файли та зберігайте оцінку з коментарем.", "Review responses, download files, and save a grade with feedback.")}</p></header>
    {error && <div ref={errorRef} role="alert" tabIndex={-1} className="mt-5 rounded-2xl bg-accent-error/10 px-4 py-3 text-sm text-accent-error focus:outline focus:outline-2 focus:outline-primary dark:text-accent-error">{error}</div>}
    {error && !reviewConflict && <button type="button" disabled={editingDisabled} onClick={() => void load()} className="mt-3 text-sm font-bold text-primary-strong">{tr("Оновити роботи", "Reload submissions")}</button>}
    {rubricLocked && <p role="status" className="mt-4 text-sm text-text-secondary">{tr("Критерії вже використовуються в роботах або розпочатих спробах. Їх збережено для поточного завдання; роботи можна оцінювати за чинною рубрикою.", "Submissions or started attempts already use these criteria. They are retained for this task; responses can still be graded with the existing rubric.")}</p>}
    {!canEditRubric && <p className="mt-3 text-sm text-text-secondary">{tr("Ваш доступ дозволяє оцінювати роботи. Критерії може змінювати автор завдання.", "Your access allows grading responses. The task author can change its criteria.")}</p>}
    {rubricDirty && <div className="mt-4"><p role="status" className="text-sm text-text-muted">{tr("Збережіть або скасуйте зміни критеріїв перед оцінюванням.", "Save or discard criterion changes before grading.")}</p><button type="button" disabled={editingDisabled} onClick={() => { setRubric(savedRubric); setError(null); if (rubricLocked) { focusResponseAfterReload.current = true; void load(); } }} className="mt-2 min-h-11 rounded-xl border border-border/20 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">{tr("Скасувати зміни критеріїв", "Discard criterion changes")}</button></div>}
    <main className="mt-7 grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-4">{loading ? <div className="h-64 animate-pulse rounded-[26px] bg-bg-hover dark:bg-white/[.05]" /> : submissions.map((submission) => <article data-student-id={submission.studentId} key={submission.studentId} className="rounded-[25px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{submission.studentName || `${tr("Учень", "Student")} #${submission.studentId}`}</h2><p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{submission.status === "GRADED" ? tr("Оцінено", "Graded") : tr("Очікує перевірки", "Awaiting review")}</p></div>{submission.status === "GRADED" && <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{tr("Готово", "Done")}</span>}</div><div className="mt-4 rounded-2xl bg-bg-hover p-4 text-sm leading-7 text-text-primary dark:bg-white/[.045] dark:text-text-secondary">{submission.text || tr("Текстової відповіді немає.", "No written response.")}</div>{submission.hasFile && <button type="button" onClick={() => void download(submission)} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary-strong dark:text-primary-soft"><Download className="h-4 w-4" />{submission.fileName || tr("Завантажити файл", "Download file")}</button>}{submission.grade?.total != null && <p className="mt-3 text-sm text-text-secondary">{tr("Оцінка в журналі:", "Journal grade:")} {submission.grade.total}/100</p>}{reviewConflict?.studentId === submission.studentId && <div role="status" className="mt-4 rounded-xl border border-accent-warn/30 bg-accent-warn/10 p-4 text-sm"><p>{tr("Робота або оцінка змінилася. Ваші бали й коментар залишилися в полях. Перегляньте актуальну відповідь і рішення нижче перед продовженням.", "The response or grade changed. Your points and feedback remain in the inputs. Review the current response and decision before continuing.")}</p><p className="mt-2 font-semibold">{reviewConflict.ready ? tr("Актуальна оцінка:", "Current grade:") : tr("Остання завантажена оцінка:", "Last loaded grade:")} {submission.grade?.total == null ? tr("Не оцінено", "Ungraded") : submission.grade.total + "/100"}</p><p className="mt-1 whitespace-pre-wrap">{reviewConflict.ready ? tr("Актуальний коментар:", "Current feedback:") : tr("Останній завантажений коментар:", "Last loaded feedback:")} {submission.grade?.feedback || tr("Немає", "None")}</p><button type="button" disabled={editingDisabled} onClick={() => { if (reviewConflict.ready) { setReviewConflict(null); setError(null); document.getElementById(`score-${submission.studentId}`)?.focus(); } else { setBusyId(submission.studentId); void refreshConflictedSubmission(submission.studentId).catch(caught => setError(getErrorMessageFromUnknown(caught, tr("Не вдалося оновити роботу. Чернетка збережена.", "Could not refresh the response. Your draft is retained.")))).finally(() => setBusyId(null)); } }} className="mt-3 min-h-11 rounded-xl border border-border/20 px-4 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40">{reviewConflict.ready ? tr("Переглянув зміни — продовжити", "Reviewed changes — continue") : tr("Завантажити актуальну роботу", "Load current response")}</button></div>}<div className="mt-5 grid gap-3 md:grid-cols-[130px_1fr_auto]"><label htmlFor={`score-${submission.studentId}`} className="sr-only">{tr("Оцінка", "Grade")}</label><input id={`score-${submission.studentId}`} name={`score-${submission.studentId}`} disabled={editingDisabled || rubricDirty} type="number" min={0} max={maxScore} value={scores[submission.studentId] ?? ""} onChange={(event) => setScores((items) => ({ ...items, [submission.studentId]: event.target.value }))} placeholder={`0–${maxScore}`} className="min-h-11 min-w-0 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-bg-code" /><label htmlFor={`feedback-${submission.studentId}`} className="sr-only">{tr("Коментар для учня", "Feedback for student")}</label><input id={`feedback-${submission.studentId}`} name={`feedback-${submission.studentId}`} disabled={editingDisabled || rubricDirty} maxLength={10000} value={feedback[submission.studentId] ?? ""} onChange={(event) => setFeedback((items) => ({ ...items, [submission.studentId]: event.target.value }))} placeholder={tr("Коментар для учня", "Feedback for student")} className="min-h-11 min-w-0 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-bg-code" /><button type="button" disabled={editingDisabled || rubricDirty || Boolean(reviewConflict) || !scores[submission.studentId]?.trim() || !Number.isSafeInteger(Number(scores[submission.studentId])) || Number(scores[submission.studentId]) < 0 || Number(scores[submission.studentId]) > maxScore} onClick={() => void grade(submission)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"><FileCheck2 className="h-4 w-4" />{busyId === submission.studentId ? tr("Зберігаємо…", "Saving…") : tr("Оцінити", "Grade")}</button></div></article>)}{!loading && submissions.length === 0 && <div className="rounded-[26px] border border-dashed border-border/15 px-6 py-16 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Робіт ще немає.", "No submissions yet.")}</div>}</section>
      <aside className="h-fit rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{tr("Рубрика", "Rubric")}</p><h2 className="mt-2 text-2xl font-bold">{tr("Критерії", "Criteria")}</h2></div><span className="text-xs font-bold text-text-muted">{tr("Макс.", "Max")} {maxScore}</span></div><div className="mt-5 space-y-3">{rubric.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_72px_44px] gap-2"><input disabled={rubricEditingDisabled} aria-label={tr("Назва критерію", "Criterion name")} value={item.label} onChange={(event) => setRubric((items) => items.map((value) => value.id === item.id ? { ...value, label: event.target.value } : value))} placeholder={tr("Критерій", "Criterion")} className="min-h-11 min-w-0 w-full rounded-xl border border-border/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-bg-code" /><input disabled={rubricEditingDisabled} aria-label={tr("Максимум балів", "Maximum points")} type="number" min={1} max={100000} value={item.maxPoints} onChange={(event) => setRubric((items) => items.map((value) => value.id === item.id ? { ...value, maxPoints: Number(event.target.value) || 0 } : value))} className="min-h-11 min-w-0 w-full rounded-xl border border-border/10 bg-white px-2 py-2 text-sm dark:border-white/10 dark:bg-bg-code" /><button type="button" disabled={rubricEditingDisabled} aria-label={tr("Видалити критерій", "Delete criterion")} onClick={() => setRubric((items) => items.filter((value) => value.id !== item.id))} className="min-h-11 min-w-11 text-accent-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><Trash2 className="h-4 w-4" /></button></div>)}</div><button type="button" disabled={rubricEditingDisabled || rubric.length >= 30} onClick={() => setRubric((items) => items.length >= 30 ? items : [...items, { id: `criterion_${crypto.randomUUID()}`, label: "", maxPoints: 10 }])} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary-strong dark:text-primary-soft"><Plus className="h-4 w-4" />{tr("Додати критерій", "Add criterion")}</button><button type="button" disabled={rubricEditingDisabled || !rubricDirty} onClick={() => void saveRubric()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Save className="h-4 w-4" />{savingRubric ? tr("Зберігаємо…", "Saving…") : tr("Зберегти рубрику", "Save rubric")}</button></aside>
    </main>
  </div>;
};
