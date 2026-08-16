import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, Trophy } from "lucide-react";
import { usePersonalLearning } from "../../components/learning/PersonalLearningProvider";
import { listGrades } from "../../lib/api/grades";
import type { Grade } from "../../types";

export const CourseProgressPage: React.FC = () => {
  const { currentCourse, loading } = usePersonalLearning();
  const [grades, setGrades] = React.useState<Grade[]>([]);
  const { i18n } = useTranslation();
  const uk = !i18n.language?.startsWith("en");
  React.useEffect(() => { if (currentCourse) void listGrades(currentCourse.id).then(setGrades).catch(() => setGrades([])); }, [currentCourse?.id]);
  if (loading || !currentCourse) return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-[#718078]">{uk ? "Завантажуємо прогрес…" : "Loading progress…"}</div>;
  const items = currentCourse.modules.flatMap((module) => module.items);
  const completed = items.filter((item) => item.progress.status === "COMPLETED").length;
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12"><section className="rounded-[26px] border border-[#152219]/10 bg-white p-7 dark:border-white/[.08] dark:bg-[#111a14]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#00b96b]"><Trophy className="size-4" />{uk ? "Прогрес курсу" : "Course progress"}</p><h1 className="mt-3 text-4xl font-bold">{Math.round(currentCourse.enrollment.completionPercent)}%</h1><p className="mt-2 text-sm text-[#6f7d73]">{completed} / {items.length} {uk ? "елементів завершено" : "items completed"}</p></div><div className="w-full max-w-xs"><div className="h-2 overflow-hidden rounded-full bg-[#e5eee7] dark:bg-white/10"><div className="h-full rounded-full bg-[#00d782]" style={{ width: `${currentCourse.enrollment.completionPercent}%` }} /></div></div></div></section><section className="mt-6 space-y-4">{currentCourse.modules.map((module) => <article key={module.id} className="rounded-[22px] border border-[#152219]/10 bg-white p-5 dark:border-white/[.08] dark:bg-[#111a14]"><h2 className="text-lg font-bold">{module.title}</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{module.items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f4f8f4] px-3 py-3 text-sm dark:bg-white/[.04]">{item.progress.status === "COMPLETED" ? <CheckCircle2 className="size-4 text-[#00bb6b]" /> : <Circle className="size-4 text-[#839188]" />}<span className="min-w-0 flex-1 truncate">{item.title}</span>{item.progress.score != null ? <span className="text-xs font-semibold text-[#00a85f]">{item.progress.score}</span> : null}</div>)}</div></article>)}</section><p className="mt-6 text-sm text-[#718078]">{uk ? `Оцінок у поточному enrollment: ${grades.length}. Lab-спроби сюди не потрапляють.` : `${grades.length} grades in the current enrollment. Lab attempts stay separate.`}</p></main>;
};
