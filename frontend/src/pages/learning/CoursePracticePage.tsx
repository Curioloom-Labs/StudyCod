import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "../core/TasksPage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";
import { MarkdownView } from "../../components/MarkdownView";
import { completeCatalogItem, getLearningCourse, type LearningCourseItem } from "../../lib/api/learningCatalog";
import { tr } from "../../i18n";

const kindLabel = (kind: LearningCourseItem["kind"]): string => {
  switch (kind) {
    case "THEORY": return tr("теорією", "theory");
    case "QUIZ": return tr("тестом", "quiz");
    case "WEB_TASK": return tr("вебзавданням", "web task");
    case "MANUAL": return tr("навчальним елементом", "learning item");
    case "PAGE": return tr("сторінкою", "page");
    default: return tr("елементом курсу", "course item");
  }
};

export const CoursePracticePage: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const { courseId, courseItemId } = useParams<{ courseId: string; courseItemId: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [courseItem, setCourseItem] = React.useState<LearningCourseItem | null>(null);
  const [theoryItem, setTheoryItem] = React.useState<LearningCourseItem | null>(null);
  const [theoryBusy, setTheoryBusy] = React.useState(false);
  const [theoryError, setTheoryError] = React.useState<string | null>(null);
  const [courseLookupState, setCourseLookupState] = React.useState<"pending" | "loaded" | "failed">("pending");

  React.useEffect(() => {
    let cancelled = false;
    void getMe({ suppressAuthRedirect: true }).then((nextUser) => {
      if (!cancelled) setUser(nextUser);
    });
    if (!courseId || !courseItemId) {
      setCourseLookupState("failed");
      return () => { cancelled = true; };
    }
    void getLearningCourse(Number(courseId))
      .then((course) => {
        if (cancelled) return;
        const items = course.modules.flatMap((module) => module.items);
        const item = items.find((candidate) => candidate.id === Number(courseItemId));
        setCourseItem(item ?? null);
        const theoryId = Number(item?.content.theoryItemId ?? 0);
        setTheoryItem(theoryId > 0 ? items.find((candidate) => candidate.id === theoryId) ?? null : null);
        setCourseLookupState("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          setCourseItem(null);
          setCourseLookupState("failed");
        }
      })
    return () => { cancelled = true; };
  }, [courseId, courseItemId, locale]);

  const theoryRequired = Boolean(
    courseItem?.kind === "CODE_TASK"
      && courseItem.content.generatedAfterTheory === true
      && theoryItem
      && theoryItem.progress.status !== "COMPLETED"
  );

  const completeTheory = async () => {
    if (!theoryItem || theoryBusy) return;
    setTheoryBusy(true);
    setTheoryError(null);
    try {
      await completeCatalogItem(theoryItem.id);
      setTheoryItem((current) => current ? { ...current, progress: { ...current.progress, status: "COMPLETED", completedAt: new Date().toISOString() } } : current);
    } catch (caught: any) {
      setTheoryError(caught?.response?.data?.message === "COURSE_SEQUENCE_LOCKED"
        ? tr("Спочатку заверши попередню тему в курсі.", "Complete the previous topic in the course first.")
        : tr("Не вдалося завершити урок. Спробуй ще раз.", "Could not complete the lesson. Try again."));
    } finally {
      setTheoryBusy(false);
    }
  };

  if (!user || courseLookupState === "pending") return <BrandedPageLoader />;
  if (courseLookupState !== "loaded" || !courseItem || courseItem.kind !== "CODE_TASK") {
    const itemKindMessage = courseLookupState === "failed"
      ? tr("Не вдалося перевірити елемент курсу.", "Could not verify this course item.")
      : courseItem
      ? tr(`Відкритий елемент є ${kindLabel(courseItem.kind)}.`, `The opened item is a ${kindLabel(courseItem.kind)}.`)
      : tr("Цей елемент не знайдено в поточному курсі.", "This item was not found in the current course.");
    return <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-6 py-12">
      <section role="alert" className="w-full rounded-3xl border border-border bg-bg-surface p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Курсова практика", "Course practice")}</p>
        <h1 className="mt-3 text-2xl font-bold text-text-primary">{tr("Цей елемент не генерує кодове завдання", "This item does not generate a coding task")}</h1>
        <p className="mt-3 leading-7 text-text-secondary">{tr(`${itemKindMessage} Генерація доступна лише для кодових практик. Відкрий маршрут, щоб продовжити навчання.`, `${itemKindMessage} Generation is available only for coding practices. Open the path to continue learning.`)}</p>
        <button type="button" onClick={() => navigate(`/learning/course/${courseId}/path`, { replace: true })} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{tr("Відкрити маршрут", "Open path")}</button>
      </section>
    </main>;
  }
  if (theoryRequired && theoryItem) {
    const theoryMarkdown = typeof theoryItem.content.markdown === "string" ? theoryItem.content.markdown : "";
    return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <section className="rounded-[28px] border border-border bg-bg-surface p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{tr("Урок теми", "Topic lesson")}</p><h1 className="mt-2 text-3xl font-bold text-text-primary">{theoryItem.title}</h1><p className="mt-2 text-sm leading-6 text-text-secondary">{tr("Опрацюй теорію тут. Після завершення відкриється нативна IDE цієї практики.", "Study the theory here. The native IDE for this practice opens after completion.")}</p></div><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{tr("Крок 1 · Теорія", "Step 1 · Theory")}</span>
        </div>
        {theoryMarkdown ? <div className="mt-7 rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={theoryMarkdown} /></div> : <div className="mt-7 rounded-2xl border border-border bg-bg-base p-5 text-sm text-text-secondary">{tr("Матеріал уроку ще готується.", "The lesson material is still being prepared.")}</div>}
        {theoryError ? <div role="alert" className="mt-5 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{theoryError}</div> : null}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => navigate(`/learning/course/${courseId}/path`)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-text-primary">{tr("До тем", "Back to topics")}</button><button type="button" disabled={theoryBusy || !theoryMarkdown} onClick={() => void completeTheory()} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{theoryBusy ? tr("Зберігаємо…", "Saving…") : tr("Завершити урок і відкрити IDE", "Complete lesson and open IDE")}</button></div>
      </section>
    </main>;
  }
  return <TasksPage user={user} />;
};
