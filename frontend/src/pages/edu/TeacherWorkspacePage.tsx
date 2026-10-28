import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Library, Plus, Radio, RefreshCw, Users } from "lucide-react";
import { createClass, getClasses, getPendingReviews, type Class, type PendingReview } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { Modal } from "../../components/ui/Modal";
import { withDevPreview } from "../../lib/devPreview";
import "./eduWorkspace.css";
import "./eduVisualQuality.css";
import { api } from "../../lib/api/client";
import "./teacherOverview.css";

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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createPending = React.useRef(false);
  const [organizations, setOrganizations] = useState<Array<{ orgId: number; name: string | null; role: string }>>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationReload, setOrganizationReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setOrganizationsLoading(true);
    setCreateError(null);
    void (async () => {
      try {
        const items = isPreview ? [{ orgId: 1, name: "StudyCod", role: "TEACHER" }] : (await api.get("/edu/orgs", { signal: controller.signal })).data?.orgs || [];
        if (controller.signal.aborted) return;
        const allowed = items.filter((org: { role: string }) => ["TEACHER", "ORG_ADMIN"].includes(org.role));
        setOrganizations(allowed);
        setOrganizationId(current => allowed.some((org: { orgId: number }) => org.orgId === current) ? current : allowed[0]?.orgId || null);
      } catch (cause) {
        if (!controller.signal.aborted) { setOrganizations([]); setOrganizationId(null); setCreateError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити заклади.", "Could not load organizations."))); }
      } finally { if (!controller.signal.aborted) setOrganizationsLoading(false); }
    })();
    return () => controller.abort();
  }, [openCreate, organizationReload]);

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
      if (classesResult.status === "rejected" || reviewsResult.status === "rejected") setError(tr("Частину даних кабінету тимчасово не вдалося завантажити.", "Some workspace data could not be loaded right now."));
    } catch (cause: unknown) {
      setError(getErrorMessageFromUnknown(cause, tr("Не вдалося завантажити простір викладача.", "Could not load the teacher workspace.")));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createPending.current || organizationsLoading || !organizationId || !name.trim()) return;
    createPending.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      if (isPreview) {
        setClasses((current) => [...current, { id: Date.now(), name: name.trim(), gradingSystem: "POINTS_12", studentsCount: 0, createdAt: new Date().toISOString() }]);
        setName("");
        setOpenCreate(false);
        return;
      }
      await createClass(name.trim(), undefined, undefined, organizationId);
      setName("");
      setOpenCreate(false);
      await load();
    } catch (cause: unknown) {
      setCreateError(getErrorMessageFromUnknown(cause, tr("Не вдалося створити клас.", "Could not create the class.")));
    } finally {
      createPending.current = false;
      setCreating(false);
    }
  };

  const studentCount = classes.reduce((total, item) => total + item.studentsCount, 0);
  return <main className="edu-workspace edu-overview">
    <div className="edu-overview__container">
      <header className="edu-overview__header">
        <div>
          <p className="edu-overview__eyebrow">{tr("Навчальний простір", "Learning workspace")} <span>/</span> {tr("Огляд", "Overview")}</p>
          <h1>{tr("Кабінет викладача", "Teacher workspace")}</h1>
          <p className="edu-overview__description">{tr("Класи, заняття та роботи учнів — усе під рукою.", "Your classes, lessons, and student work, all in one place.")}</p>
        </div>
        {organizations.length > 0 && <button type="button" onClick={() => { setCreateError(null); setOpenCreate(true); }} className="edu-overview__primary"><Plus className="size-4" aria-hidden="true" />{tr("Створити клас", "Create a class")}</button>}
      </header>
      <dl className="edu-overview__metrics" aria-label={tr("Огляд навчального простору", "Learning workspace overview")}>
        <div><dt><BookOpen aria-hidden="true" />{tr("Мої класи", "My classes")}</dt><dd>{loading ? "—" : classes.length}</dd><dd className="edu-overview__metric-note">{tr("Навчальні групи", "Learning groups")}</dd></div>
        <div><dt><Users aria-hidden="true" />{tr("Учні", "Students")}</dt><dd>{loading ? "—" : studentCount}</dd><dd className="edu-overview__metric-note">{tr("У всіх класах", "Across all classes")}</dd></div>
        <div className={reviews.length ? "has-reviews" : undefined}><dt><ClipboardCheck aria-hidden="true" />{tr("На перевірку", "To review")}</dt><dd>{loading ? "—" : reviews.length}</dd><dd className="edu-overview__metric-note">{tr("Надіслані роботи", "Submitted work")}</dd></div>
      </dl>
      {!openCreate && createError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent-error/30 p-3 text-sm"><p>{createError}</p><button type="button" onClick={() => setOrganizationReload(value => value + 1)} className="min-h-11 px-3 font-semibold text-primary-strong">{tr("Повторити завантаження закладів", "Reload organizations")}</button></div>}

      {error ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-warn/35 bg-accent-warn/5 px-4 py-3 text-sm" role="status">
        <span className="text-text-secondary">{error} {classes.length || reviews.length ? tr("Показано дані, які вдалося завантажити.", "Showing the data that loaded successfully.") : ""}</span>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-primary-strong hover:bg-bg-hover"><RefreshCw className="size-4" aria-hidden="true" />{tr("Повторити", "Retry")}</button>
      </div> : null}

      <div className="edu-overview__workspace">
      <section className="edu-overview__classes" aria-labelledby="teacher-classes">
        <div className="edu-overview__section-heading">
          <div><h2 id="teacher-classes">{tr("Мої класи", "My classes")}</h2><p>{tr("Оберіть клас, щоб продовжити роботу", "Choose a class to pick up where you left off")}</p></div>
          <span className="edu-overview__count">{loading ? "—" : classes.length}</span>
        </div>
        {loading ? <div className="mt-1 divide-y divide-border" role="status" aria-label={tr("Завантаження класів", "Loading classes")}><div className="h-16 animate-pulse bg-bg-hover/60" /><div className="h-16 animate-pulse bg-bg-hover/40" /></div>
          : classes.length ? <ul className="edu-overview__class-list">
            {classes.map((item) => <li key={item.id} className="edu-overview__class">
              <button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${item.id}`))} className="edu-overview__class-main">
                <span className="edu-overview__class-mark" aria-hidden="true"><GraduationCap className="size-6" /></span>
                <span className="edu-overview__class-copy"><strong>{item.name}</strong><span><Users className="size-3.5" aria-hidden="true" />{item.studentsCount} {tr("учнів", "students")}</span></span>
                <ArrowRight className="edu-overview__class-arrow size-4" aria-hidden="true" />
              </button>
              <div className="edu-overview__class-actions">
                <button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${item.id}/gradebook`))}><ClipboardCheck className="size-3.5" aria-hidden="true" />{tr("Журнал", "Gradebook")}<span className="sr-only"> · {item.name}</span></button>
                <button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${item.id}/live`))} aria-label={`${tr("Відкрити онлайн-урок для класу", "Open live lesson for class")} ${item.name}`}><Radio className="size-3.5" aria-hidden="true" /><span>{tr("Онлайн-урок", "Live lesson")}</span></button>
              </div>
            </li>)}
          </ul>
          : error ? <p className="py-5 text-sm text-text-secondary">{tr("Не вдалося завантажити класи.", "We couldn’t load classes.")}</p>
            : <div className="flex flex-wrap items-center justify-between gap-3 py-5"><p className="text-sm text-text-secondary">{organizations.length ? tr("Створи клас, щоб запросити учнів і призначати їм завдання.", "Create a class to invite learners and assign work.") : organizationsLoading ? tr("Перевіряємо доступ до закладів…", "Checking organization access…") : tr("Адміністратор має призначити вам клас для роботи з учнями.", "Ask your administrator to assign a class so you can work with learners.")}</p>{organizations.length > 0 && <button type="button" onClick={() => { setCreateError(null); setOpenCreate(true); }} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-bg-hover">{tr("Створити клас", "Create a class")}</button>}{createError && <button type="button" onClick={() => setOrganizationReload(value => value + 1)} className="min-h-11 px-3 text-sm font-semibold text-primary-strong">{tr("Повторити завантаження закладів", "Reload organizations")}</button>}</div>}
      </section>

      <section className="edu-overview__reviews" aria-labelledby="teacher-review-queue">
        <div className="edu-overview__section-heading">
          <div><h2 id="teacher-review-queue">{tr("На перевірку", "To review")}</h2><p>{tr("Роботи, що чекають на ваш відгук", "Work waiting for your feedback")}</p></div>
          <span className="edu-overview__count">{loading ? "—" : reviews.length}</span>
        </div>
        {loading ? <div className="divide-y divide-border" role="status" aria-label={tr("Завантаження робіт", "Loading submissions")}><div className="h-16 animate-pulse bg-bg-hover/60" /><div className="h-16 animate-pulse bg-bg-hover/40" /></div>
          : reviews.length ? <ul className="edu-overview__review-list">
            {reviews.slice(0, 8).map((review) => <li key={review.gradeId}>
                <button type="button" disabled={!review.classId} onClick={() => { if (review.classId) navigate(withDevPreview(`/edu/classes/${review.classId}/gradebook?review=${review.gradeId}`)); }} className="edu-overview__review disabled:cursor-default disabled:opacity-70">
                <span className="edu-overview__avatar" aria-hidden="true">{review.student.firstName?.[0]}{review.student.lastName?.[0]}</span>
                <span className="edu-overview__review-copy"><strong>{review.task?.title || `${tr("Робота", "Submission")} #${review.gradeId}`}</strong><span>{review.student.firstName} {review.student.lastName}</span><small>{review.className || review.task?.lesson?.title || tr("Ручна перевірка", "Manual review")}</small></span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </li>)}
          </ul>
          : error ? <p className="py-5 text-sm text-text-secondary">{tr("Не вдалося підтвердити, чи є роботи в черзі.", "We couldn’t confirm whether there are submissions to review.")}</p>
            : <div className="edu-overview__empty">
              <span className="edu-overview__empty-mark"><ClipboardCheck className="size-5" aria-hidden="true" /></span>
              <div><strong>{tr("Усе перевірено", "You’re all caught up")}</strong><p>{tr("Нові роботи з’являться тут після того, як учні надішлють розв’язання.", "New submissions will appear here after learners send their solutions.")}</p></div>
              <button type="button" onClick={() => navigate(withDevPreview("/edu/calendar"))}><CalendarDays className="size-4" aria-hidden="true" />{tr("Відкрити календар", "Open calendar")}<ArrowRight className="size-4" aria-hidden="true" /></button>
            </div>}
      </section>
      </div>
      <nav className="edu-overview__resources" aria-label={tr("Інструменти викладача", "Teaching tools")}>
        {[
          { path: "/edu/calendar", Icon: CalendarDays, title: tr("Календар занять", "Lesson calendar"), description: tr("Заняття й дедлайни", "Lessons and deadlines") },
          { path: "/edu/courses", Icon: BookOpen, title: tr("Курси", "Courses"), description: tr("Навчальні матеріали й теми", "Teaching materials and topics") },
          { path: "/edu/library", Icon: Library, title: tr("Бібліотека задач", "Task library"), description: tr("Практика для ваших учнів", "Practice for your students") },
        ].map(({ path, Icon, title, description }) => <button key={path} type="button" onClick={() => navigate(withDevPreview(path))}><Icon className="size-5" aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span><ArrowRight className="size-4" aria-hidden="true" /></button>)}
      </nav>
    </div>

    <Modal open={openCreate} closable={!creating} showCloseButton={false} title={tr("Новий клас", "New class")} description={tr("Клас об’єднує учнів. Мову програмування обирай окремо для кожної теми.", "A class brings learners together. Choose a programming language for each topic.")} onClose={() => setOpenCreate(false)}>
      <form onSubmit={submit} className="edu-workspace grid gap-4" aria-busy={creating}>
        {createError && <p role="alert" className="rounded-xl bg-accent-error/10 p-3 text-sm text-accent-error">{createError}</p>}
        <label className="grid gap-2 text-sm font-medium">{tr("Навчальний заклад", "Organization")}<select disabled={creating || organizationsLoading} required value={organizationId || ""} onChange={event => setOrganizationId(Number(event.target.value))} className="min-h-11 rounded-lg border border-border bg-bg-base px-3"><option value="" disabled>{organizationsLoading ? tr("Завантажуємо…", "Loading…") : tr("Оберіть заклад", "Select an organization")}</option>{organizations.map(org => <option key={org.orgId} value={org.orgId}>{org.name || `#${org.orgId}`}</option>)}</select></label>
        {!organizationsLoading && !organizations.length && <div className="text-sm text-text-secondary">{tr("Потрібен доступ до навчального закладу, щоб створити клас.", "You need access to an organization to create a class.")} <button type="button" onClick={() => setOrganizationReload(value => value + 1)} className="min-h-11 px-3 font-semibold text-primary-strong">{tr("Повторити", "Retry")}</button></div>}
        <label htmlFor="teacher-class-name" className="grid gap-2 text-sm font-medium">{tr("Назва класу", "Class name")}<input id="teacher-class-name" name="className" required maxLength={100} disabled={creating} value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("Наприклад, 10-Б", "For example, Year 10 A")} className="min-h-11 rounded-lg border border-border bg-bg-base px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <div className="flex justify-end gap-2"><button type="button" disabled={creating} onClick={() => setOpenCreate(false)} className="min-h-11 rounded-lg px-4 text-sm font-semibold hover:bg-bg-hover">{tr("Скасувати", "Cancel")}</button><button type="submit" disabled={creating || organizationsLoading || !organizationId || !name.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{creating ? tr("Створюємо…", "Creating…") : tr("Створити клас", "Create class")}</button></div>
      </form>
    </Modal>
  </main>;
};
