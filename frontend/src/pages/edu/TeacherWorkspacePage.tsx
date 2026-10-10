import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ClipboardCheck, Plus, RefreshCw, Users } from "lucide-react";
import { createClass, getClasses, getPendingReviews, type Class, type PendingReview } from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { Modal } from "../../components/ui/Modal";
import { withDevPreview } from "../../lib/devPreview";

export const TeacherWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
  const [classes, setClasses] = useState<Class[]>([]);
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isPreview) {
        const now = new Date().toISOString();
        setClasses([{ id: 31, name: tr("10-Б · StudyCod", "Year 10 B · StudyCod"), gradingSystem: "POINTS_12", studentsCount: 24, createdAt: "2026-07-01" }, { id: 32, name: tr("9-А · Основи коду", "Year 9 A · Coding foundations"), gradingSystem: "POINTS_12", studentsCount: 19, createdAt: "2026-07-01" }]);
        setReviews([{ gradeId: 1, classId: 31, className: tr("10-Б", "Year 10 B"), student: { id: 1, firstName: tr("Софія", "Sofia"), lastName: tr("Мельник", "Melnyk"), email: "" }, task: { id: 1001, title: tr("Частотний словник", "Frequency map"), lesson: { id: 101, title: tr("Рядки", "Strings"), type: "LESSON" } }, submittedCode: "from collections import Counter\nprint(Counter(['a', 'b', 'a']))", submittedAt: now, system: "new" }, { gradeId: 2, classId: 31, className: tr("10-Б", "Year 10 B"), student: { id: 2, firstName: tr("Марко", "Marko"), lastName: tr("Литвин", "Lytvyn"), email: "" }, task: { id: 1002, title: tr("Сума парних", "Sum of even numbers"), lesson: { id: 102, title: tr("Цикли", "Loops"), type: "LESSON" } }, submittedCode: "print(sum(x for x in numbers if x % 2 == 0))", submittedAt: now, system: "new" }]);
        return;
      }
      const [classesResult, reviewsResult] = await Promise.allSettled([getClasses(), getPendingReviews()]);
      if (classesResult.status === "rejected" && reviewsResult.status === "rejected") throw classesResult.reason;
      if (classesResult.status === "fulfilled") setClasses(classesResult.value);
      if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value.pendingReviews || []);
      if (classesResult.status === "rejected" || reviewsResult.status === "rejected") setError("Частину даних кабінету тимчасово не вдалося завантажити.");
    } catch (cause: unknown) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити простір викладача.", "Could not load the teacher workspace.")));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (isPreview) {
        setClasses((current) => [...current, { id: Date.now(), name, gradingSystem: "POINTS_12", studentsCount: 0, createdAt: new Date().toISOString() }]);
        setName("");
        setOpenCreate(false);
        return;
      }
      await createClass(name);
      setName("");
      setOpenCreate(false);
      await load();
    } catch (cause: unknown) {
      setError(getErrorMessageFromUnknown(cause, "Не вдалося створити клас."));
    }
  };

  return <main className="min-h-full bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Освітній простір", "Education")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.04em]">{tr("Кабінет викладача", "Teacher workspace")}</h1>
          <p className="mt-2 text-sm text-text-secondary">{tr("Перевір роботи учнів і керуй класами з одного місця.", "Review student work and manage classes from one place.")}</p>
        </div>
        <button type="button" onClick={() => setOpenCreate(true)} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover sm:self-auto"><Plus className="size-4" aria-hidden="true" />{tr("Новий клас", "New class")}</button>
      </header>

      {error ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-warn/35 bg-accent-warn/5 px-4 py-3 text-sm" role="status">
        <span className="text-text-secondary">{error} {classes.length || reviews.length ? tr("Показано дані, які вдалося завантажити.", "Showing the data that loaded successfully.") : ""}</span>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-primary-strong hover:bg-bg-hover"><RefreshCw className="size-4" aria-hidden="true" />{tr("Повторити", "Retry")}</button>
      </div> : null}

      <section className="mt-6" aria-labelledby="teacher-review-queue">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Перша дія", "Next action")}</p><h2 id="teacher-review-queue" className="mt-1 text-xl font-bold">{tr("На перевірку", "To review")}</h2></div>
          <span className="text-sm tabular-nums text-text-muted">{reviews.length} {tr("робіт", "submissions")}</span>
        </div>
        {loading ? <div className="divide-y divide-border" role="status" aria-label="Завантаження робіт"><div className="h-16 animate-pulse bg-bg-hover/60" /><div className="h-16 animate-pulse bg-bg-hover/40" /></div>
          : reviews.length ? <ul className="divide-y divide-border">
            {reviews.slice(0, 8).map((review) => <li key={review.gradeId}>
              <button type="button" disabled={!review.classId} onClick={() => { if (review.classId) navigate(withDevPreview(`/edu/classes/${review.classId}/gradebook?review=${review.gradeId}`)); }} className="grid min-h-[68px] w-full grid-cols-[36px_1fr_auto] items-center gap-3 py-3 text-left transition-colors hover:bg-bg-hover/50 disabled:cursor-default disabled:opacity-70">
                <span className="grid size-9 place-items-center rounded-lg bg-bg-hover text-text-secondary"><ClipboardCheck className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{review.task?.title || `Робота #${review.gradeId}`}</span><span className="mt-1 block truncate text-xs text-text-muted">{review.student.firstName} {review.student.lastName} · {review.className || review.task?.lesson?.title || "Ручна перевірка"}</span></span>
                <ArrowRight className="size-4 text-text-muted" aria-hidden="true" />
              </button>
            </li>)}
          </ul>
          : error ? <p className="py-5 text-sm text-text-secondary">{tr("Не вдалося підтвердити, чи є роботи в черзі.", "We couldn’t confirm whether there are submissions to review.")}</p>
            : <p className="py-5 text-sm text-text-secondary">{tr("Черга порожня. Можна перейти до найближчих занять.", "The queue is empty. You can prepare an upcoming lesson.")}</p>}
      </section>

      <section className="mt-8" aria-labelledby="teacher-classes">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Навчальні групи", "Learning groups")}</p><h2 id="teacher-classes" className="mt-1 text-xl font-bold">{tr("Мої класи", "My classes")}</h2></div>
          <span className="text-sm tabular-nums text-text-muted">{classes.length} {tr("класів", "classes")}</span>
        </div>
        {loading ? <div className="mt-1 divide-y divide-border" role="status" aria-label="Завантаження класів"><div className="h-16 animate-pulse bg-bg-hover/60" /><div className="h-16 animate-pulse bg-bg-hover/40" /></div>
          : classes.length ? <ul className="divide-y divide-border">
            {classes.map((item) => <li key={item.id}><button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${item.id}`))} className="grid min-h-[68px] w-full grid-cols-[36px_1fr_auto] items-center gap-3 py-3 text-left hover:bg-bg-hover/50">
              <span className="grid size-9 place-items-center rounded-lg bg-bg-hover text-text-secondary"><Users className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs text-text-muted">{item.studentsCount} {tr("учнів", "students")}</span></span>
              <ArrowRight className="size-4 text-text-muted" aria-hidden="true" />
            </button></li>)}
          </ul>
          : error ? <p className="py-5 text-sm text-text-secondary">{tr("Не вдалося завантажити класи.", "We couldn’t load classes.")}</p>
            : <div className="flex flex-wrap items-center justify-between gap-3 py-5"><p className="text-sm text-text-secondary">{tr("Створи клас, щоб запросити учнів і призначати їм завдання.", "Create a class to invite learners and assign work.")}</p><button type="button" onClick={() => setOpenCreate(true)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-bg-hover">{tr("Створити клас", "Create a class")}</button></div>}
      </section>
    </div>

    <Modal open={openCreate} title={tr("Новий клас", "New class")} description={tr("Клас об’єднує учнів. Мову програмування обирай окремо для кожної теми.", "A class brings learners together. Choose a programming language for each topic.")} onClose={() => setOpenCreate(false)}>
      <form onSubmit={submit} className="grid gap-4">
        <label htmlFor="teacher-class-name" className="grid gap-2 text-sm font-medium">{tr("Назва класу", "Class name")}<input id="teacher-class-name" name="className" required value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("Наприклад, 10-Б", "For example, Year 10 A")} className="min-h-11 rounded-lg border border-border bg-bg-base px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpenCreate(false)} className="min-h-11 rounded-lg px-4 text-sm font-semibold hover:bg-bg-hover">{tr("Скасувати", "Cancel")}</button><button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{tr("Створити клас", "Create class")}</button></div>
      </form>
    </Modal>
  </main>;
};
