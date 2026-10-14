import React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api } from "../../lib/api/client";
import type { Lesson } from "../../lib/api/edu";
import { getEduErrorMessage } from "../../lib/eduError";
import { tr } from "../../i18n";
import { useTranslation } from "react-i18next";
import "./eduWorkspace.css";

type Results = {
  lesson: { id: number; title: string; className: string; hasQuiz: boolean; manualTasks: Array<{ id: number; title: string }> };
  students: Array<{ id: number; name: string; attempt: NonNullable<Lesson["courseAttempt"]>; report: NonNullable<Lesson["courseReport"]> }>;
  page: number; pageSize: number; total: number;
};

export const CourseControlReviewPage: React.FC = () => {
  useTranslation();
  const { lessonId } = useParams();
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<Results | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => { setPage(1); setData(null); }, [lessonId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    api.get<Results>(`/edu/course-lessons/${lessonId}/results`, { params: { page }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data); })
      .catch(caught => { if (!controller.signal.aborted) setError(getEduErrorMessage(caught, tr("Не вдалося завантажити результати.", "Could not load assessment results."))); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [lessonId, page, reload]);
  const status = (student: Results["students"][number]) => student.attempt.status === "NOT_STARTED"
    ? tr("Не розпочато", "Not started") : student.attempt.status === "IN_PROGRESS"
      ? tr("У роботі", "In progress") : student.report.pendingReview
        ? tr("Здано · очікує перевірки", "Submitted · awaiting review") : tr("Завершено", "Completed");
  return <main className="edu-workspace mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
    <Link to={`/edu/lessons/${lessonId}?source=course`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-strong"><ArrowLeft className="size-4" />{tr("До контрольної", "Back to assessment")}</Link>
    <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div><p className="text-sm text-text-secondary">{data?.lesson.className}</p><h1 className="mt-2 text-3xl font-bold">{data?.lesson.title || tr("Результати контрольної", "Assessment results")}</h1><p className="mt-3 text-sm text-text-secondary">{tr("Перевірте квіз і ручні роботи, щоб учні отримали підсумкову оцінку.", "Review quizzes and manual work so students receive their final grade.")}</p></div>
      <button type="button" disabled={loading} onClick={() => setReload(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50"><RefreshCw className="size-4" />{tr("Оновити", "Refresh")}</button>
    </header>
    {error && <p role="alert" className="mt-5 rounded-xl bg-accent-error/10 p-4 text-sm text-accent-error">{error}</p>}
    {data && <nav aria-label={tr("Перевірка робіт", "Review work")} className="mt-6 flex flex-wrap gap-3">{data.lesson.hasQuiz && <Link to={`/edu/lessons/${lessonId}/quiz/review`} className="min-h-11 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{tr("Перевірити квіз", "Review quiz")}</Link>}{data.lesson.manualTasks.map(task => <Link key={task.id} to={`/edu/manual-tasks/${task.id}/submissions`} className="min-h-11 max-w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold break-words">{tr("Перевірити:", "Review:")} {task.title}</Link>)}</nav>}
    <section className="mt-6 space-y-3" aria-busy={loading}>
      {loading ? <div role="status" className="rounded-2xl bg-bg-hover p-8 text-sm">{tr("Завантажуємо результати…", "Loading results…")}</div> : data?.students.map(student => <article key={student.id} className="rounded-2xl border border-border bg-bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">{student.name}</h2><p className="mt-2 text-sm text-text-secondary">{status(student)}</p>{student.attempt.finishedAt && <time dateTime={student.attempt.finishedAt} className="mt-1 block text-xs text-text-muted">{new Date(student.attempt.finishedAt).toLocaleString()}</time>}</div><p className="text-2xl font-bold tabular-nums text-primary-strong">{student.report.finalPercent == null ? "—" : `${student.report.finalPercent}%`}</p></div><div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary"><span>{tr("Практика:", "Practice:")} {student.report.submittedTasks}/{student.report.totalTasks}</span>{student.report.quizRequired && <span>{tr("Квіз:", "Quiz:")} {student.report.quizSubmitted ? tr("здано", "submitted") : tr("не здано", "not submitted")}</span>}{Boolean(student.report.pendingReview) && <span>{tr("На перевірці:", "Pending review:")} {student.report.pendingReview}</span>}</div>{student.attempt.status === "COMPLETED" && <p className="mt-3 text-sm text-text-secondary">{student.report.quizRequired && <span>{tr("Квіз:", "Quiz:")} {student.report.theoryPercent == null ? "—" : `${student.report.theoryPercent}%`} · </span>}{student.report.totalTasks > 0 && <span>{tr("Практика:", "Practice:")} {student.report.practicePercent == null ? "—" : `${student.report.practicePercent}%`}</span>}</p>}</article>)}
      {!loading && data?.students.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-sm text-text-secondary">{tr("У цьому класі ще немає учнів.", "This class has no students yet.")}</p>}
    </section>
    {data && data.total > data.pageSize && <nav aria-label={tr("Сторінки результатів", "Results pages")} className="mt-6 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-40">{tr("Назад", "Previous")}</button><span className="text-sm">{page} / {Math.ceil(data.total / data.pageSize)}</span><button type="button" disabled={loading || page >= Math.ceil(data.total / data.pageSize)} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-40">{tr("Далі", "Next")}</button></nav>}
  </main>;
};
