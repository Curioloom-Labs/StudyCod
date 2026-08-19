import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "../core/TasksPage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";
import { getLearningCourse, type LearningCourseItem } from "../../lib/api/learningCatalog";
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
  // The practice shell owns the whole sequence. It must mount before theory so
  // catalog generation can create the first task; TasksPage then opens theory
  // inside the native IDE for that generated task.
  return <TasksPage user={user} />;
};
