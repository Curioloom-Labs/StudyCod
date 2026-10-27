import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Brain, CheckCircle2, Circle, Lightbulb, Trophy } from "lucide-react";
import { usePersonalLearning } from "../../components/learning/PersonalLearningProvider";
import { listGrades } from "../../lib/api/grades";
import { getMyLearningEvidence, type LearningSkillEvidence } from "../../lib/api/library";
import { withDevPreview } from "../../lib/devPreview";
import type { Grade } from "../../types";

export const CourseProgressPage: React.FC = () => {
  const { currentCourse, loading, error, refresh } = usePersonalLearning();
  const [grades, setGrades] = React.useState<Grade[]>([]);
  const [gradesLoading, setGradesLoading] = React.useState(false);
  const [gradesError, setGradesError] = React.useState<string | null>(null);
  const [gradesRetryToken, setGradesRetryToken] = React.useState(0);
  const [learningEvidence, setLearningEvidence] = React.useState<LearningSkillEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = React.useState(true);
  const [evidenceError, setEvidenceError] = React.useState(false);
  const [evidenceRetryToken, setEvidenceRetryToken] = React.useState(0);
  const { i18n } = useTranslation();
  const uk = !i18n.language?.startsWith("en");
  React.useEffect(() => {
    if (!currentCourse) return;
    let cancelled = false;
    setGradesLoading(true);
    setGradesError(null);
    void listGrades(currentCourse.id)
      .then((nextGrades) => {
        if (!cancelled) setGrades(nextGrades);
      })
      .catch(() => {
        if (!cancelled) {
          setGrades([]);
          setGradesError(uk ? "Не вдалося завантажити оцінки." : "Could not load grades.");
        }
      })
      .finally(() => {
        if (!cancelled) setGradesLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentCourse?.id, gradesRetryToken, uk]);
  React.useEffect(() => {
    if (!currentCourse) {
      setEvidenceLoading(false);
      return;
    }
    let cancelled = false;
    setEvidenceLoading(true);
    setEvidenceError(false);
    setLearningEvidence(null);
    void getMyLearningEvidence(currentCourse.enrollment.id)
      .then((evidence) => { if (!cancelled) setLearningEvidence(evidence); })
      .catch(() => { if (!cancelled) { setLearningEvidence(null); setEvidenceError(true); } })
      .finally(() => { if (!cancelled) setEvidenceLoading(false); });
    return () => { cancelled = true; };
  }, [evidenceRetryToken, currentCourse?.enrollment.id]);
  if (loading && !currentCourse) return <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-16 text-sm text-text-muted" role="status" aria-live="polite">{uk ? "Завантажуємо прогрес…" : "Loading progress…"}</div>;
  if (!currentCourse) return <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
    <section className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-7" role={error ? "alert" : undefined}>
      <h1 className="text-xl font-bold">{error ? (uk ? "Не вдалося завантажити прогрес" : "Could not load progress") : (uk ? "Оберіть курс, щоб переглянути прогрес" : "Choose a course to see your progress")}</h1>
      <p className="mt-2 text-sm text-text-secondary">{error ? (uk ? "Перевірте з’єднання та спробуйте ще раз." : "Check your connection and try again.") : (uk ? "Оберіть навчальний маршрут у каталозі." : "Choose a learning path in the catalog.")}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {error && <button type="button" onClick={() => void refresh()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{uk ? "Спробувати ще" : "Try again"}</button>}
        <Link to={withDevPreview("/learning/catalog")} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-primary">{uk ? "До каталогу" : "Go to catalog"}</Link>
      </div>
    </section>
  </main>;
  const items = currentCourse.modules.flatMap((module) => module.items);
  const completed = items.filter((item) => item.progress.status === "COMPLETED").length;
  const normalizedTopicName = (value: string) => value.replace(/^(?:Практика|Practice)\s+\d+\/\d+:\s*/i, "").trim().toLocaleLowerCase();
  const weakTopic = learningEvidence?.topics
    .filter((topic) => topic.practiced >= 2 && topic.solved < topic.practiced)
    .sort((a, b) => a.solved / a.practiced - b.solved / b.practiced || b.practiced - a.practiced)
    .find((topic) => items.some((item) => item.kind === "CODE_TASK"
      && item.progress.status !== "COMPLETED"
      && normalizedTopicName(item.title) === normalizedTopicName(topic.name)));
  const weakTopicPractice = weakTopic
    ? items.find((item) => item.kind === "CODE_TASK" && item.progress.status !== "COMPLETED" && normalizedTopicName(item.title) === normalizedTopicName(weakTopic.name))
    : undefined;
  const visibleTopics = [...(learningEvidence?.topics ?? [])]
    .sort((a, b) => a.solved / Math.max(1, a.practiced) - b.solved / Math.max(1, b.practiced) || b.practiced - a.practiced)
    .slice(0, 6);
  return <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    {loading ? <p className="mb-4 text-sm text-text-secondary" role="status">{uk ? "Оновлюємо прогрес…" : "Refreshing progress…"}</p> : error ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-warn/40 bg-bg-surface px-4 py-3 text-sm" role="status"><span>{uk ? "Не вдалося оновити прогрес. Показано останні завантажені дані." : "Could not refresh progress. Showing the last loaded data."}</span><button type="button" onClick={() => void refresh()} className="rounded-lg border border-border px-3 py-2 font-semibold text-primary-strong">{uk ? "Повторити" : "Retry"}</button></div> : null}
    <section className="rounded-[26px] border border-border/10 bg-white p-7 dark:border-white/[.08] dark:bg-bg-code">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary-strong"><Trophy className="size-4" />{uk ? "Прогрес курсу" : "Course progress"}</p><h1 className="mt-3 text-4xl font-bold">{Math.round(currentCourse.enrollment.completionPercent)}%</h1><p className="mt-2 text-sm text-text-muted">{completed} / {items.length} {uk ? "елементів завершено" : "items completed"}</p></div><div className="w-full max-w-xs"><div className="h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${currentCourse.enrollment.completionPercent}%` }} /></div></div></div>
    </section>
    <section className="mt-6 rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/[.08] dark:bg-bg-code" aria-labelledby="learning-skill-map-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary-strong"><Brain className="size-4" />{uk ? "Моя підготовка" : "My preparation"}</p>
          <h2 id="learning-skill-map-title" className="mt-2 text-2xl font-bold">{uk ? "Карта навичок" : "Skill map"}</h2>
          <p className="mt-1 text-sm text-text-muted">{uk ? "Докази з навчальних спроб, розв’язань і використаних підказок." : "Evidence from learning attempts, solved tasks, and hints used."}</p>
        </div>
        {evidenceError ? <button type="button" onClick={() => setEvidenceRetryToken((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover">{uk ? "Оновити карту" : "Retry skill map"}</button> : null}
      </div>
      {evidenceLoading ? <p className="mt-5 text-sm text-text-muted">{uk ? "Збираємо дані про навички…" : "Loading skill evidence…"}</p> : evidenceError ? <p role="alert" className="mt-5 text-sm text-accent-error">{uk ? "Карту навичок не вдалося завантажити. Прогрес курсу доступний нижче." : "Could not load the skill map. Course progress is available below."}</p> : learningEvidence ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: uk ? "Спроб у Judge" : "Judge attempts", value: learningEvidence.totalAttempts },
            { label: uk ? "Задач практиковано" : "Tasks practiced", value: learningEvidence.practicedTasks },
            { label: uk ? "Розв’язано" : "Solved", value: `${learningEvidence.solvedTasks}/${learningEvidence.practicedTasks}` },
            { label: uk ? "Виправлено після помилки" : "Solved after a failure", value: learningEvidence.solvedAfterFailure },
            { label: uk ? "Задач із підказками" : "Tasks with hints", value: learningEvidence.hintedTasks },
          ].map((stat) => <div key={stat.label} className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><p className="text-xs font-medium text-text-muted">{stat.label}</p><p className="mt-2 text-2xl font-bold text-text-primary">{stat.value}</p></div>)}
        </div>
        {visibleTopics.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">
          {visibleTopics.map((topic) => {
            const mastery = Math.round(100 * topic.solved / Math.max(1, topic.practiced));
            return <article key={topic.name} className="rounded-2xl border border-border/10 p-4 dark:border-white/[.08]">
              <div className="flex items-center justify-between gap-3"><h3 className="truncate text-sm font-semibold">{topic.name}</h3><span className="shrink-0 text-xs text-text-muted">{topic.solved}/{topic.practiced}</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${mastery}%` }} /></div>
              <p className="mt-2 text-xs text-text-muted">{topic.improving ? (uk ? "Є розв’язання після попередньої помилки" : "Solved after an earlier failure") : (uk ? "Підтверджених розв’язань" : "Confirmed solves")}</p>
            </article>;
          })}
        </div> : <p className="mt-5 rounded-2xl bg-bg-hover p-4 text-sm text-text-muted dark:bg-white/[.04]">{uk ? "Карта заповниться, коли ти розв’яжеш перші задачі. Саме відкриття уроку не вважається засвоєнням." : "The map will fill in after your first solved tasks. Opening a lesson alone does not count as mastery."}</p>}
        {weakTopic ? <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[.05] p-4"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary-strong" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">{uk ? "Наступна рекомендована дія" : "Recommended next step"}</p><p className="mt-1 text-sm text-text-secondary">{uk ? `Повернись до теми «${weakTopic.name}» і продовж практику на новій згенерованій задачі. Потім поясни складність і перевір крайні випадки.` : `Return to “${weakTopic.name}” and continue with a newly generated practice task. Then explain its complexity and check the edge cases.`}</p></div>{weakTopicPractice ? <Link className="shrink-0 text-sm font-semibold text-primary-strong hover:underline" to={`/learning/course/${currentCourse.id}/practice/${weakTopicPractice.id}`}>{uk ? "Продовжити практику" : "Continue practice"} <span aria-hidden="true">→</span></Link> : null}</div> : null}
        <p className="mt-4 text-xs text-text-muted">{uk ? `Рівні підказок за задачами: ${learningEvidence.hintLevelCounts.map(({ level, tasks }) => `${level}: ${tasks}`).join(" · ") || "—"}.` : `Hint levels by task: ${learningEvidence.hintLevelCounts.map(({ level, tasks }) => `${level}: ${tasks}`).join(" · ") || "—"}.`}</p>
      </> : null}
    </section>
    <section className="mt-6 space-y-4">{currentCourse.modules.map((module) => <article key={module.id} className="min-w-0 rounded-[22px] border border-border/10 bg-white p-5 dark:border-white/[.08] dark:bg-bg-code"><h2 className="break-words text-lg font-bold">{module.title}</h2><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">{module.items.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-bg-hover px-3 py-3 text-sm dark:bg-white/[.04]">{item.progress.status === "COMPLETED" ? <CheckCircle2 className="size-4 shrink-0 text-primary-strong" /> : <Circle className="size-4 shrink-0 text-text-muted" />}<span className="min-w-0 flex-1 break-words">{item.title}</span>{item.progress.score != null ? <span className="shrink-0 text-xs font-semibold text-primary-strong">{item.progress.score}</span> : null}</div>)}</div></article>)}</section>
    <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-text-muted" aria-live="polite">
      {gradesLoading ? (uk ? "Завантажуємо оцінки…" : "Loading grades…") : gradesError ? <><span role="alert" className="text-accent-error">{gradesError}</span><button type="button" onClick={() => setGradesRetryToken((value) => value + 1)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{uk ? "Спробувати ще" : "Try again"}</button></> : (uk ? `Оцінок у поточному enrollment: ${grades.length}. Lab-спроби сюди не потрапляють.` : `${grades.length} grades in the current enrollment. Lab attempts stay separate.`)}
    </div>
  </main>;
};
