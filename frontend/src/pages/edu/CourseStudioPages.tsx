import React from "react";
import { Modal } from "../../components/ui/Modal";
import "./eduWorkspace.css";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Eye, FileText, FolderPlus, GraduationCap, Layers3, LoaderCircle, Pencil, Plus, Save, Sparkles } from "lucide-react";
import { api } from "../../lib/api/client";
import { MarkdownView } from "../../components/MarkdownView";
import { LessonBlocksEditor } from "../../components/lesson/LessonBlocksEditor";
import { LessonTheoryView } from "../../components/lesson/LessonTheoryView";
import { CourseQuizEditor } from "../../components/edu/CourseQuizEditor";
import { interactiveLessonToMarkdown, normalizeInteractiveLesson, type InteractiveLesson } from "../../lib/lessonBlocks";
import { isOlympiadPracticeContractText, OlympiadPracticeContractEditor } from "../../components/edu/OlympiadPracticeContractEditor";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { getClasses, type Class } from "../../lib/api/edu";
import { createOlympiadPracticeContractDraft, validateOlympiadPracticeContractDraft } from "../../lib/edu/olympiadPracticeContract";
import { emptyCourseQuizQuestion, normalizeCourseQuiz, serializeCourseQuiz, validateCourseQuiz, type CourseQuizQuestionDraft } from "../../lib/courseQuiz";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

type Org = { orgId: number; role: string; name: string | null };
type Course = { id: number; title: string; description?: string | null; catalogKey?: string | null; isSourceManagedCourse?: boolean; hasAuthoringOverrides?: boolean; status: "DRAFT" | "PUBLISHED"; variants?: Array<{ id: number; runtime: string; status?: string }>; updatedAt?: string | null };
type ItemKind = "THEORY" | "PAGE" | "CODE_TASK" | "WEB_TASK" | "QUIZ" | "MANUAL";
type CourseItem = { id: number; kind: ItemKind; title: string; order: number; content?: unknown };
type CourseModule = { id: number; title: string; order: number; items: CourseItem[] };
type CourseTree = Course & { description?: string | null; isGlobalCatalogCourse?: boolean; modules: CourseModule[] };

const review = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const control = "w-full rounded-2xl border border-border/12 bg-white px-4 py-3 text-sm font-medium outline-none ring-primary/25 transition placeholder:text-text-muted focus:ring-4 dark:border-white/10 dark:bg-bg-code dark:text-text-primary";
const emptyInteractiveLesson = (): InteractiveLesson => ({ objectives: [], sections: [{ heading: "", blocks: [] }], summary: [] });
const lessonFromMarkdown = (markdown: string): InteractiveLesson => normalizeInteractiveLesson(markdown) ?? ({
  objectives: [],
  sections: [{ heading: "", blocks: markdown.trim() ? [{ type: "prose", markdown }] : [] }],
  summary: [],
});
const lessonMarkdownLabels = () => ({
  objectives: tr("Цілі уроку", "Lesson objectives"),
  summary: tr("Підсумок", "Summary"),
  callout: { info: tr("Примітка", "Note"), tip: tr("Підказка", "Tip"), warning: tr("Увага", "Warning") },
  correctAnswer: tr("Правильна відповідь", "Correct answer"),
});
const demoCourses: Course[] = [{ id: 701, title: "Python без хаосу", variants: [{ id: 1, runtime: "PYTHON", status: "PUBLISHED" }], status: "PUBLISHED" }, { id: 702, title: "Мислення алгоритмами", variants: [{ id: 2, runtime: "CPP", status: "DRAFT" }], status: "DRAFT" }];
const demoTree: CourseTree = { ...demoCourses[0], description: "Короткі модулі поєднують пояснення, практику і маленькі точки перевірки, щоб учень не губився між темами.", modules: [{ id: 801, title: "Починаємо впевнено", order: 1, items: [{ id: 901, kind: "THEORY", title: "Змінні та типи", order: 1 }, { id: 902, kind: "CODE_TASK", title: "Склади вітання", order: 2 }] }, { id: 802, title: "Умови й логіка", order: 2, items: [{ id: 903, kind: "CODE_TASK", title: "Три числа", order: 1 }] }] };
const iconFor = (kind: ItemKind) => kind === "CODE_TASK" || kind === "WEB_TASK" ? <Sparkles className="size-4 text-primary-strong dark:text-primary-soft" /> : kind === "QUIZ" ? <GraduationCap className="size-4 text-accent-warn dark:text-accent-warn" /> : <FileText className="size-4 text-text-muted" />;
const CourseAssignmentButton: React.FC<{ courseId: number }> = ({ courseId }) => {
  useTranslation();
  const [open, setOpen] = React.useState(false);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [classId, setClassId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const load = async () => {
    setMessage(null);
    try {
      const next: Class[] = review()
        ? [
            { id: -1, name: "10-А · StudyCod Lab", gradingSystem: "POINTS_10", studentsCount: 24, createdAt: "" },
            { id: -2, name: "11-Б · Алгоритми", gradingSystem: "POINTS_10", studentsCount: 18, createdAt: "" }
          ]
        : await getClasses();
      setClasses(next);
      setClassId((current) => current || String(next[0]?.id || ""));
      setOpen(true);
    } catch (caught) {
      setMessage(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити класи.", "Could not load classes.")));
    }
  };
  const assign = async () => {
    if (!classId) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!review()) await api.post(`/edu/classes/${classId}/assign-course`, { courseId });
      setMessage(review() ? tr("Курс призначено класу (preview).", "Course assigned to class (preview).") : tr("Курс призначено класу.", "Course assigned to class."));
    } catch (caught) {
      setMessage(getErrorMessageFromUnknown(caught, tr("Не вдалося призначити курс.", "Could not assign course.")));
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button type="button" onClick={() => void load()} className="rounded-xl border border-primary/35 bg-bg-hover px-4 py-3 text-sm font-bold text-primary-strong hover:bg-bg-hover dark:border-primary/30 dark:bg-primary/10 dark:text-primary-soft">{tr("Призначити класу", "Assign to class")}</button>
    <Modal open={open} title={tr("Призначення курсу", "Course assignment")} onClose={() => setOpen(false)} closable={!busy} showCloseButton={false}><section className="edu-workspace"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{tr("Доставка курсу", "Course delivery")}</p><h2 id="course-assignment-title" className="mt-2 text-2xl font-bold">{tr("Оберіть клас", "Select a class")}</h2></div><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label={tr("Закрити", "Close")} className="rounded-full bg-bg-hover px-3 py-1 text-lg dark:bg-white/[.07]">×</button></div><select value={classId} disabled={busy} onChange={(event) => setClassId(event.target.value)} aria-label={tr("Клас", "Class")} className={`${control} mt-6`}><option value="">{tr("Оберіть клас…", "Select a class…")}</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{message && <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-bg-hover px-3 py-2 text-sm text-primary-strong dark:bg-primary/10 dark:text-primary-strong">{message}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold">{tr("Закрити", "Close")}</button><button type="button" disabled={!classId || busy} onClick={() => void assign()} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">{busy ? tr("Призначаємо…", "Assigning…") : tr("Призначити", "Assign")}</button></div></section></Modal>
  </>;
};
const Page: React.FC<{ eyebrow: string; title: string; action?: React.ReactNode; children: React.ReactNode; showAssignment?: boolean }> = ({ eyebrow, title, action, children, showAssignment = true }) => {
  const location = useLocation();
  const match = location.pathname.match(/^\/edu\/courses\/(\d+)$/);
  return <div className="edu-workspace mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12"><header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{eyebrow}</p><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{title}</h1></div><div className="flex flex-wrap items-center gap-2">{match && showAssignment && <CourseAssignmentButton courseId={Number(match[1])} />}{action}</div></header>{children}</div>;
};
export const CourseStudioPage: React.FC = () => {
  useTranslation();
  const navigate = useNavigate();
  const [orgs, setOrgs] = React.useState<Org[]>([]);
  const [org, setOrg] = React.useState<number | null>(null);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [globalCourses, setGlobalCourses] = React.useState<Course[]>([]);
  const [globalAuthoringAvailable, setGlobalAuthoringAvailable] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [create, setCreate] = React.useState<"org" | "course" | "global-course" | null>(null);
  const [name, setName] = React.useState("");
  const [runtime, setRuntime] = React.useState("PYTHON");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (review()) {
        setOrgs([{ orgId: 77, role: "ORG_ADMIN", name: "StudyCod Lab" }]);
        setOrg(77);
        setCourses(demoCourses);
        return;
      }
      const { data } = await api.get("/edu/orgs");
      const list = data?.orgs || [];
      setOrgs(list);
      if (list[0]) {
        setOrg(list[0].orgId);
        const response = await api.get(`/edu/orgs/${list[0].orgId}/courses`);
        setCourses(response.data?.courses || []);
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося отримати простір курсів.", "Could not load the course workspace.")));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (review()) return;
    let cancelled = false;
    void api.get("/edu/global/courses")
      .then(({ data }) => {
        if (cancelled) return;
        setGlobalCourses(Array.isArray(data?.courses) ? data.courses : []);
        setGlobalAuthoringAvailable(true);
      })
      .catch(() => { if (!cancelled) setGlobalAuthoringAvailable(false); });
    return () => { cancelled = true; };
  }, []);
  const orgRequest = React.useRef(0);
  const chooseOrg = async (next: number) => {
    const generation = ++orgRequest.current;
    setOrg(next); setError(null); setCourses([]);
    if (review()) { setCourses(demoCourses); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/edu/orgs/${next}/courses`);
      if (generation === orgRequest.current) setCourses(data?.courses || []);
    } catch (caught) {
      if (generation === orgRequest.current) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити курси.", "Could not load courses.")));
    } finally { if (generation === orgRequest.current) setLoading(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim() || (create === "course" && !org) || (create === "global-course" && !globalAuthoringAvailable)) return;
    setBusy(true);
    try {
      if (create === "org") {
        if (review()) {
          const next = { orgId: Date.now(), role: "ORG_ADMIN", name: name.trim() };
          setOrgs((old) => [...old, next]);
          setOrg(next.orgId);
          setCourses([]);
        } else {
          const { data } = await api.post("/edu/orgs", { name: name.trim() });
          const created = { orgId: data.org.id, role: "ORG_ADMIN", name: data.org.name };
          setOrgs((old) => [...old, created]);
          await chooseOrg(created.orgId);
        }
      } else if (create === "global-course") {
        if (review()) {
          const next = { id: Date.now(), title: name.trim(), variants: [{ id: Date.now() + 1, runtime, status: "DRAFT" }], status: "DRAFT" as const };
          setGlobalCourses((old) => [next, ...old]);
          navigate(`/edu/courses/${next.id}?preview=true`);
        } else {
          const { data } = await api.post("/edu/global/courses", { title: name.trim(), runtime });
          setGlobalCourses((old) => [data.course, ...old]);
          navigate(`/edu/courses/${data.course.id}`);
        }
      } else if (org) {
        const next = review() ? { id: Date.now(), title: name.trim(), variants: [{ id: Date.now() + 1, runtime, status: "DRAFT" }], status: "DRAFT" as const } : null;
        if (next) {
          setCourses((old) => [next, ...old]);
          navigate(`/edu/courses/${next.id}?preview=true`);
        } else {
          const { data } = await api.post(`/edu/orgs/${org}/courses`, { title: name.trim(), runtime });
          setCourses((old) => [data.course, ...old]);
          navigate(`/edu/courses/${data.course.id}`);
        }
      }
      setName("");
      setCreate(null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти зміни.", "Could not save changes.")));
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Page eyebrow="EDU / courses" title={tr("Налаштовуємо студію", "Loading course studio")}><div className="h-72 animate-pulse rounded-[28px] bg-bg-hover dark:bg-white/[.05]" /></Page>;
 return <Page eyebrow="EDU / courses" title={tr("Курси, з яких складається навчання", "Courses that shape the learning experience")} action={<div className="flex flex-wrap gap-2">{globalAuthoringAvailable && <button type="button" onClick={() => { setName(""); setCreate("global-course"); }} className="rounded-xl border border-primary/30 px-4 py-3 text-sm font-bold text-primary-strong">{tr("Глобальний курс", "Global course")}</button>}<button type="button" onClick={() => setCreate(orgs.length ? "course" : "org")} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_12px_28px_rgba(20,67,40,.18)] dark:bg-primary dark:text-primary-foreground"><Plus className="mr-2 inline size-4" />{orgs.length ? tr("Новий курс", "New course") : tr("Створити простір", "Create workspace")}</button></div>}>{error && <div className="mb-5 rounded-2xl bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}{globalAuthoringAvailable && <section className="mb-8 rounded-[26px] border border-primary/15 bg-primary/[.035] p-5 dark:border-primary/20"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong">{tr("Адміністрування каталогу", "Catalog administration")}</p><h2 className="mt-2 text-xl font-bold">{tr("Глобальні курси", "Global courses")}</h2><p className="mt-1 text-sm text-text-muted">{tr("Глобальні курси й курси навчального плану редагуються тут в одній структурі.", "Global and curriculum courses share this editor.")}</p></div><button type="button" onClick={() => { setName(""); setCreate("global-course"); }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"><Plus className="mr-2 inline size-4" />{tr("Створити глобальний курс", "Create global course")}</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{globalCourses.map((course) => <button type="button" key={course.id} onClick={() => navigate(`/edu/courses/${course.id}`)} className="group rounded-2xl border border-border/10 bg-white p-4 text-left dark:border-white/[.08] dark:bg-bg-surface"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-bg-hover px-2.5 py-1 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{course.variants?.[0]?.runtime ?? "COURSE"}</span><span className="text-xs font-bold text-text-muted">{course.status === "PUBLISHED" ? tr("Опубліковано", "Published") : tr("Чернетка", "Draft")}</span></div><h3 className="mt-4 font-bold">{course.title}</h3><p className="mt-1 text-xs text-text-muted group-hover:text-primary-strong">{tr("Відкрити редактор", "Open editor")} →</p></button>)}{!globalCourses.length && <button type="button" onClick={() => { setName(""); setCreate("global-course"); }} className="rounded-2xl border border-dashed border-border/20 p-4 text-left"><span className="text-sm font-bold">{tr("Почни з глобальної чернетки", "Start with a global draft")}</span><span className="mt-1 block text-xs text-text-muted">{tr("Додай модулі, теорію, практику й опублікуй, коли готово.", "Add modules, theory, practice, and publish when ready.")}</span></button>}</div></section>}<div className="mb-7 flex gap-2 overflow-x-auto">{orgs.map((item) => <button type="button" key={item.orgId} onClick={() => void chooseOrg(item.orgId)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${org === item.orgId ? "bg-bg-base text-text-primary dark:bg-bg-hover dark:text-text-primary" : "bg-bg-hover text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}>{item.name || tr("Навчальний простір", "Learning workspace")}</button>)}<button type="button" onClick={() => setCreate("org")} className="rounded-full px-3 py-2 text-sm font-bold text-primary-strong dark:text-primary-soft">+ {tr("Простір", "Workspace")}</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{courses.map((course) => <button type="button" key={course.id} onClick={() => navigate(`/edu/courses/${course.id}${review() ? "?preview=true" : ""}`)} className="group min-h-[230px] rounded-[25px] border border-border/10 bg-white p-6 text-left shadow-[0_16px_42px_rgba(26,43,31,.05)] transition edu-hover-lift  dark:border-white/[.09] dark:bg-bg-surface"><div className="flex justify-between"><span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{course.variants?.[0]?.runtime ?? "COURSE"}</span><span className={course.status === "PUBLISHED" ? "text-xs font-bold text-primary-strong dark:text-primary-soft" : "text-xs font-bold text-accent-warn dark:text-accent-warn"}>{course.status === "PUBLISHED" ? tr("Опубліковано", "Published") : tr("Чернетка", "Draft")}</span></div><h2 className="mt-8 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">{course.title}</h2><span className="mt-8 flex items-center gap-2 text-sm font-bold text-text-muted group-hover:text-primary-strong dark:text-text-secondary dark:group-hover:text-primary-soft">{tr("Відкрити структуру", "Open course") }<ChevronRight className="size-4" /></span></button>)}{!courses.length && <button type="button" onClick={() => setCreate("course")} className="min-h-[230px] rounded-[25px] border border-dashed border-border/18 p-6 text-left"><FolderPlus className="size-7 text-primary-strong dark:text-primary-soft" /><h2 className="mt-7 text-xl font-bold">{tr("Перший курс", "Your first course")}</h2><p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Задай назву й мову — структуру добудуєш наступним кроком.", "Choose a name and language. You can build the structure next.")}</p></button>}</div><Modal open={!!create} title={create === "org" ? tr("Навчальний простір", "Learning workspace") : create === "global-course" ? tr("Новий глобальний курс", "New global course") : tr("Новий курс", "New course")} onClose={() => setCreate(null)} closable={!busy} showCloseButton={false}><form onSubmit={submit} className="edu-workspace"><p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong">{create === "org" ? tr("Навчальний простір", "Learning workspace") : create === "global-course" ? tr("Глобальний каталог", "Global catalog") : tr("Новий курс", "New course")}</p><h2 className="mt-2 text-2xl font-bold">{create === "org" ? tr("Як назвати простір?", "Name your workspace") : tr("Починаємо з назви", "Start with a name")}</h2><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} aria-label={tr("Назва", "Name")} className={`${control} mt-6`} placeholder={create === "org" ? tr("Наприклад, Ліцей №12", "For example, Westside School") : tr("Наприклад, Олімпіадна підготовка", "For example, Olympiad practice")} />{(create === "course" || create === "global-course") && <select value={runtime} onChange={(event) => setRuntime(event.target.value)} className={`${control} mt-3`}><option value="PYTHON">Python</option><option value="JAVA">Java</option><option value="CPP">C++</option></select>}<div className="mt-6 flex gap-2"><button type="button" disabled={busy} onClick={() => setCreate(null)} className="flex-1 rounded-xl px-4 py-3 text-sm font-bold">{tr("Скасувати", "Cancel")}</button><button type="submit" disabled={busy || !name.trim() || (create === "course" && !org)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{busy && <LoaderCircle className="size-4 animate-spin" />}{create === "global-course" ? tr("Створити чернетку", "Create draft") : tr("Продовжити", "Continue")}</button></div></form></Modal></Page>;
};

export const CourseStudioDetailPage: React.FC = () => {
  useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const numericId = Number(courseId);
  const [course, setCourse] = React.useState<CourseTree | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = React.useState("");
  const [itemTitle, setItemTitle] = React.useState("");
  const [itemContent, setItemContent] = React.useState("");
  const [itemTemplate, setItemTemplate] = React.useState("");
  const [kind, setKind] = React.useState<ItemKind>("THEORY");
  const [itemTheoryMode, setItemTheoryMode] = React.useState<"markdown" | "blocks">("markdown");
  const [itemLessonBlocks, setItemLessonBlocks] = React.useState<InteractiveLesson>(emptyInteractiveLesson);
  const [itemQuizMode, setItemQuizMode] = React.useState<"structured" | "json">("structured");
  const [itemQuizQuestions, setItemQuizQuestions] = React.useState<CourseQuizQuestionDraft[]>([emptyCourseQuizQuestion()]);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [courseTitle, setCourseTitle] = React.useState("");
  const [courseDescription, setCourseDescription] = React.useState("");
  const [moduleTitles, setModuleTitles] = React.useState<Record<number, string>>({});
  const [editingItemId, setEditingItemId] = React.useState<number | null>(null);
  const [editingItemTitle, setEditingItemTitle] = React.useState("");
  const [editingItemKind, setEditingItemKind] = React.useState<ItemKind>("THEORY");
  const [editingItemOrder, setEditingItemOrder] = React.useState(0);
  const [editingItemJson, setEditingItemJson] = React.useState("{}");
  const [editingMarkdown, setEditingMarkdown] = React.useState("");
  const [editingTheoryMode, setEditingTheoryMode] = React.useState<"markdown" | "blocks">("markdown");
  const [editingLessonBlocks, setEditingLessonBlocks] = React.useState<InteractiveLesson>(emptyInteractiveLesson);
  const [editingQuizMode, setEditingQuizMode] = React.useState<"structured" | "json">("structured");
  const [editingQuizQuestions, setEditingQuizQuestions] = React.useState<CourseQuizQuestionDraft[]>([emptyCourseQuizQuestion()]);
  const [editingQuizJson, setEditingQuizJson] = React.useState("[]");
  const [editingPrompt, setEditingPrompt] = React.useState("");
  const [editingStarterCode, setEditingStarterCode] = React.useState("");
  const [editingLearningContract, setEditingLearningContract] = React.useState("");
  const [previewItem, setPreviewItem] = React.useState<{ id: number; kind: ItemKind; markdown: string } | null>(null);
  const kinds = [
    { value: "CODE_TASK" as const, label: tr("Задача", "Problem"), hint: tr("динамічна умова й Judge", "generated prompt and Judge") },
    { value: "WEB_TASK" as const, label: tr("Web-задача", "Web task"), hint: "HTML/CSS/JS" },
    { value: "THEORY" as const, label: tr("Теорія", "Theory"), hint: tr("пояснення й приклади", "explanation and examples") },
    { value: "PAGE" as const, label: tr("Сторінка", "Page"), hint: tr("навчальний матеріал", "learning material") },
    { value: "QUIZ" as const, label: tr("Квіз", "Quiz"), hint: tr("перевірка знань", "knowledge check") },
    { value: "MANUAL" as const, label: tr("Ручна", "Manual"), hint: tr("робота на оцінку", "graded assignment") },
  ];
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (review()) {
        const next = { ...demoTree, id: numericId || demoTree.id };
        setCourse(next);
        setCourseTitle(next.title);
        setCourseDescription(next.description ?? "");
        setModuleTitles(Object.fromEntries(next.modules.map((module) => [module.id, module.title])));
        return;
      }
      const { data } = await api.get(`/edu/courses/${numericId}`);
      const next = data?.course as CourseTree | undefined;
      setCourse(next || null);
      setCourseTitle(next?.title ?? "");
      setCourseDescription(next?.description ?? "");
      setModuleTitles(Object.fromEntries((next?.modules ?? []).map((module) => [module.id, module.title])));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося отримати структуру курсу.", "Could not load the course structure.")));
    } finally {
      setLoading(false);
    }
  }, [numericId]);
  React.useEffect(() => { void load(); }, [load]);

  const saveCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!course || !courseTitle.trim()) return;
    setBusy(true);
    try {
      if (review()) setCourse({ ...course, title: courseTitle.trim(), description: courseDescription });
      else {
        await api.put(`/edu/courses/${numericId}`, { title: courseTitle.trim(), description: courseDescription });
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти курс.", "Could not save the course.")));
    } finally { setBusy(false); }
  };

  const addModule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!course || !moduleTitle.trim()) return;
    const nextOrder = course.modules.reduce((max, module) => Math.max(max, module.order), -1) + 1;
    setBusy(true);
    try {
      if (review()) {
        const next = { id: Date.now(), title: moduleTitle.trim(), order: nextOrder, items: [] };
        setCourse({ ...course, modules: [...course.modules, next] });
        setModuleTitles((old) => ({ ...old, [next.id]: next.title }));
      } else {
        await api.post(`/edu/courses/${numericId}/modules`, { title: moduleTitle.trim(), order: nextOrder });
        await load();
      }
      setModuleTitle("");
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося додати модуль.", "Could not add module.")));
    } finally { setBusy(false); }
  };

  const saveModule = async (module: CourseModule, order: number) => {
    if (!course) return;
    setBusy(true);
    try {
      const title = String(moduleTitles[module.id] ?? module.title).trim();
      if (!title) throw new Error("TITLE_REQUIRED");
      if (review()) setCourse({ ...course, modules: course.modules.map((entry) => entry.id === module.id ? { ...entry, title, order } : entry) });
      else {
        await api.put(`/edu/modules/${module.id}`, { title, order });
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти модуль.", "Could not save the module.")));
    } finally { setBusy(false); }
  };

  const moveModule = async (index: number, direction: -1 | 1) => {
    if (!course) return;
    const orderedModules = course.modules.slice().sort((a, b) => a.order - b.order || a.id - b.id);
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= orderedModules.length) return;
    const current = orderedModules[index];
    const other = orderedModules[otherIndex];
    setBusy(true);
    try {
      if (review()) {
        setCourse({ ...course, modules: course.modules.map((module) => module.id === current.id ? { ...module, order: other.order } : module.id === other.id ? { ...module, order: current.order } : module) });
      } else {
        await Promise.all([
          api.put(`/edu/modules/${current.id}`, { title: String(moduleTitles[current.id] ?? current.title).trim(), order: other.order }),
          api.put(`/edu/modules/${other.id}`, { title: String(moduleTitles[other.id] ?? other.title).trim(), order: current.order }),
        ]);
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося змінити порядок модулів.", "Could not change module order.")));
    } finally { setBusy(false); }
  };

  const addItem = async (module: CourseModule) => {
    if (!course || !itemTitle.trim()) return;
    const body = itemContent.trim();
    const nextOrder = module.items.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const structuredTheory = kind === "THEORY" && itemTheoryMode === "blocks"
      ? normalizeInteractiveLesson(itemLessonBlocks)
      : null;
    if (kind === "THEORY" && itemTheoryMode === "blocks" && !structuredTheory) {
      setError(tr("Додай до структурованої теорії хоча б один непорожній блок.", "Add at least one non-empty block to the structured lesson."));
      return;
    }
    if (!body && kind !== "QUIZ" && !structuredTheory) {
      setError(tr("Додай зміст або бриф, перш ніж створювати елемент.", "Add real content or a generation brief before creating this item."));
      return;
    }
    let quiz: ReturnType<typeof serializeCourseQuiz> | undefined;
    if (kind === "QUIZ") {
      if (itemQuizMode === "structured") {
        const issues = validateCourseQuiz(itemQuizQuestions);
        if (issues.length > 0) {
          setError(`${tr("Перевір квіз:", "Review the quiz:")} ${issues.map((issue) => issue.replaceAll("_", " ").toLowerCase()).join(" · ")}`);
          return;
        }
        quiz = serializeCourseQuiz(itemQuizQuestions);
      } else {
        try {
          const parsed: unknown = JSON.parse(body);
          const normalized = normalizeCourseQuiz(parsed);
          if (!normalized) throw new Error("INVALID_QUIZ");
          const issues = validateCourseQuiz(normalized);
          if (issues.length > 0) throw new Error("INVALID_QUIZ");
          quiz = serializeCourseQuiz(normalized);
        } catch {
          setError(tr("Встав непорожній JSON-масив коректних запитань квізу.", "Enter a non-empty JSON array of valid quiz questions."));
          return;
        }
      }
    }
    setBusy(true);
    try {
      const runtime = String(course.variants?.[0]?.runtime ?? "PYTHON").toUpperCase();
      const content = kind === "THEORY"
        ? { markdown: structuredTheory ? JSON.stringify(structuredTheory) : body }
        : kind === "PAGE"
          ? { markdown: body }
        : kind === "CODE_TASK"
          ? {
              generated: true,
              exercisePolicy: "generate-after-reading",
              runtime,
              required: true,
              generatedAfterTheory: true,
              exercise: { prompt: body, starterCode: itemTemplate, runtime },
            }
          : kind === "QUIZ"
            ? { quiz: quiz ?? [] }
            : { description: body, template: itemTemplate };
      if (review()) {
        const next = { id: Date.now(), kind, title: itemTitle.trim(), order: nextOrder, content };
        setCourse({ ...course, modules: course.modules.map((entry) => entry.id === module.id ? { ...entry, items: [...entry.items, next] } : entry) });
      } else {
        await api.post(`/edu/modules/${module.id}/items`, { kind, title: itemTitle.trim(), order: nextOrder, content });
        await load();
      }
      setItemTitle(""); setItemContent(""); setItemTemplate(""); setItemTheoryMode("markdown"); setItemLessonBlocks(emptyInteractiveLesson()); setItemQuizMode("structured"); setItemQuizQuestions([emptyCourseQuizQuestion()]); setExpanded(null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося додати елемент.", "Could not add item.")));
    } finally { setBusy(false); }
  };

  const editItem = (item: CourseItem) => {
    const content = item.content && typeof item.content === "object" && !Array.isArray(item.content)
      ? item.content as Record<string, unknown>
      : {};
    const exercise = typeof content.exercise === "object" && content.exercise !== null ? content.exercise as Record<string, unknown> : {};
    setEditingItemId(item.id);
    setEditingItemTitle(item.title);
    setEditingItemKind(item.kind);
    setEditingItemOrder(item.order);
    setEditingItemJson(JSON.stringify(content, null, 2));
    const quizQuestions = item.kind === "QUIZ" ? normalizeCourseQuiz(content.quiz) : null;
    setEditingQuizMode(quizQuestions ? "structured" : "json");
    setEditingQuizQuestions(quizQuestions ?? [emptyCourseQuizQuestion()]);
    setEditingQuizJson(JSON.stringify(content.quiz ?? [], null, 2));
    const markdown = typeof content.markdown === "string" ? content.markdown : typeof content.html === "string" ? content.html : "";
    const structuredTheory = item.kind === "THEORY" ? normalizeInteractiveLesson(markdown) : null;
    setEditingMarkdown(markdown);
    setEditingTheoryMode(structuredTheory ? "blocks" : "markdown");
    setEditingLessonBlocks(structuredTheory ?? emptyInteractiveLesson());
    setEditingPrompt(typeof exercise.prompt === "string" ? exercise.prompt : "");
    setEditingStarterCode(typeof exercise.starterCode === "string" ? exercise.starterCode : typeof content.template === "string" ? content.template : "");
    setEditingLearningContract(exercise.learningContract && typeof exercise.learningContract === "object" ? JSON.stringify(exercise.learningContract, null, 2) : "");
    setPreviewItem(null);
  };

  const addOlympiadContract = (item: CourseItem) => {
    if (!course) return;
    const runtime = String(course.variants?.[0]?.runtime ?? "PYTHON").toUpperCase();
    const catalogKey = String(course.catalogKey ?? "").trim();
    const contract = createOlympiadPracticeContractDraft({
      courseKey: catalogKey.startsWith("olympiad-") ? catalogKey : `olympiad-author-${course.id}`,
      topicKey: `course-item-${item.id}`,
      runtime,
      objective: editingPrompt,
    });
    setEditingLearningContract(JSON.stringify(contract, null, 2));
  };

  const saveItem = async (item: CourseItem) => {
    if (!course) return;
    let content: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(editingItemJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("CONTENT_MUST_BE_OBJECT");
      content = parsed as Record<string, unknown>;
    } catch {
      setError(tr("Вміст має бути коректним JSON-об’єктом. Зміни не збережено.", "Content must be a valid JSON object. Changes were not saved."));
      return;
    }
    if (editingItemKind === "THEORY" || editingItemKind === "PAGE") {
      if (editingItemKind === "THEORY" && editingTheoryMode === "blocks") {
        const structuredTheory = normalizeInteractiveLesson(editingLessonBlocks);
        if (!structuredTheory) {
          setError(tr("Додай до структурованої теорії хоча б один непорожній блок.", "Add at least one non-empty block to the structured lesson."));
          return;
        }
        content.markdown = JSON.stringify(structuredTheory);
      } else {
        content.markdown = editingMarkdown;
      }
    } else if (editingItemKind === "QUIZ") {
      let questions: CourseQuizQuestionDraft[] | null;
      if (editingQuizMode === "structured") {
        questions = editingQuizQuestions;
      } else {
        try {
          questions = normalizeCourseQuiz(JSON.parse(editingQuizJson));
        } catch {
          questions = null;
        }
      }
      if (!questions) {
        setError(tr("Квіз має бути непорожнім масивом запитань із щонайменше двома варіантами.", "The quiz must be a non-empty question array with at least two options per question."));
        return;
      }
      const quizIssues = validateCourseQuiz(questions);
      if (quizIssues.length > 0) {
        setError(`${tr("Перевір квіз:", "Review the quiz:")} ${quizIssues.map((issue) => issue.replaceAll("_", " ").toLowerCase()).join(" · ")}`);
        return;
      }
      content.quiz = serializeCourseQuiz(questions);
    } else if (editingItemKind === "CODE_TASK") {
      let learningContract: Record<string, unknown> | undefined;
      if (editingLearningContract.trim()) {
        try {
          const parsedContract: unknown = JSON.parse(editingLearningContract);
          if (!parsedContract || typeof parsedContract !== "object" || Array.isArray(parsedContract)) throw new Error("CONTRACT_MUST_BE_OBJECT");
          learningContract = parsedContract as Record<string, unknown>;
        } catch {
          setError(tr("Контракт генерації має бути JSON-об’єктом.", "The generation contract must be a JSON object."));
          return;
        }
        if (learningContract.kind === "OLYMPIAD_ALGORITHMIC_PRACTICE") {
          const runtime = String(course.variants?.[0]?.runtime ?? "PYTHON").toUpperCase();
          const issues = validateOlympiadPracticeContractDraft(learningContract, runtime);
          if (issues.length > 0) {
            setError(`${tr("Олімпіадний контракт не готовий до збереження:", "The Olympiad contract is not ready to save:")} ${issues.map((issue) => issue.replaceAll("_", " ").toLowerCase()).join(" · ")}`);
            return;
          }
        }
      }
      const oldExercise = typeof content.exercise === "object" && content.exercise !== null ? content.exercise as Record<string, unknown> : {};
      const exercise: Record<string, unknown> = { ...oldExercise, prompt: editingPrompt, starterCode: editingStarterCode, runtime: String(course.variants?.[0]?.runtime ?? "PYTHON").toUpperCase() };
      if (learningContract) exercise.learningContract = learningContract;
      else delete exercise.learningContract;
      content = { ...content, generated: true, exercisePolicy: "generate-after-reading", runtime: exercise.runtime, required: true, generatedAfterTheory: true, exercise };
    }
    setBusy(true);
    setError(null);
    try {
      const patch = { title: editingItemTitle.trim(), kind: editingItemKind, order: editingItemOrder, content };
      if (review()) setCourse({ ...course, modules: course.modules.map((module) => ({ ...module, items: module.items.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry) })) });
      else {
        await api.put(`/edu/items/${item.id}`, patch);
        await load();
      }
      setEditingItemId(null);
      setPreviewItem(null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти елемент.", "Could not save the item.")));
    } finally { setBusy(false); }
  };

  const moveItem = async (module: CourseModule, index: number, direction: -1 | 1) => {
    const orderedItems = module.items.slice().sort((a, b) => a.order - b.order || a.id - b.id);
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= orderedItems.length) return;
    const current = orderedItems[index];
    const other = orderedItems[otherIndex];
    setBusy(true);
    try {
      if (review() && course) {
        setCourse({ ...course, modules: course.modules.map((entry) => entry.id === module.id ? { ...entry, items: entry.items.map((item) => item.id === current.id ? { ...item, order: other.order } : item.id === other.id ? { ...item, order: current.order } : item) } : entry) });
      } else {
        await Promise.all([
          api.put(`/edu/items/${current.id}`, { order: other.order }),
          api.put(`/edu/items/${other.id}`, { order: current.order }),
        ]);
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося змінити порядок.", "Could not change the order.")));
    } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!course) return;
    setBusy(true);
    try {
      const status = course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      if (review()) setCourse({ ...course, status });
      else { await api.put(`/edu/courses/${numericId}/status`, { status }); await load(); }
    } catch (caught) {
      const payload = typeof caught === "object" && caught !== null && "response" in caught
        ? (caught as { response?: { data?: { message?: unknown; issues?: unknown } } }).response?.data
        : undefined;
      if (payload?.message === "COURSE_CONTENT_INCOMPLETE") {
        const issues = Array.isArray(payload.issues) ? payload.issues.map(String) : [];
        const messages = issues.map((issue) => {
          if (issue.includes("_QUIZ_INVALID")) return tr(`Квіз ${issue.split("_")[1]} неповний або некоректний: перевір запитання, варіанти відповідей і правильні відповіді.`, `Quiz ${issue.split("_")[1]} is incomplete or invalid. Check each question, its options, and the correct answer.`);
          if (issue === "COURSE_HAS_NO_MODULES") return tr("Додай до курсу хоча б один модуль.", "Add at least one module to the course.");
          if (issue.startsWith("MODULE_") && issue.endsWith("_IS_EMPTY")) return tr(`Модуль ${issue.split("_")[1]} порожній. Додай до нього матеріал.`, `Module ${issue.split("_")[1]} is empty. Add course content to it.`);
          if (issue.startsWith("ITEM_") && issue.endsWith("_HAS_NO_CONTENT")) return tr(`Елемент ${issue.split("_")[1]} не має змісту.`, `Item ${issue.split("_")[1]} has no content.`);
          if (issue.startsWith("ITEM_") && issue.endsWith("_OLYMPIAD_PRACTICE_CONTRACT_INVALID")) return tr(`Елемент ${issue.split("_")[1]} має неповний контракт динамічної олімпіадної задачі. Відкрий його редактор і заповни алгоритм, IO, обмеження та тести.`, `Item ${issue.split("_")[1]} has an incomplete dynamic Olympiad task contract. Open its editor and complete the algorithm, IO, constraints, and test coverage.`);
          return issue;
        });
        setError(`${tr("Курс ще не готовий до публікації:", "The course is not ready to publish:")} ${messages.join(" ")}`);
      } else {
        setError(getErrorMessageFromUnknown(caught, tr("Не вдалося змінити статус курсу.", "Could not change course status.")));
      }
    } finally { setBusy(false); }
  };

  if (loading) return <Page eyebrow="EDU / course" title={tr("Відкриваємо структуру", "Loading course")}><div className="h-80 animate-pulse rounded-[28px] bg-bg-hover dark:bg-white/[.05]" /></Page>;
  if (!course) return <Page eyebrow="EDU / course" title={tr("Курс недоступний", "Course unavailable")}><p className="rounded-2xl bg-accent-error/10 p-4 text-accent-error">{error || tr("Курс не знайдено.", "Course not found.")}</p></Page>;

  return <Page eyebrow={`EDU / ${course.variants?.[0]?.runtime ?? "COURSE"}`} title={course.title} showAssignment={!course.isGlobalCatalogCourse} action={<button type="button" onClick={() => navigate(`/edu/courses${review() ? "?preview=true" : ""}`)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-text-muted"><ArrowLeft className="size-4" />{tr("Усі курси", "All courses")}</button>}>
    {error && <div role="alert" className="mb-5 rounded-2xl bg-accent-error/10 p-4 text-sm text-accent-error">{error}</div>}
    {course.isSourceManagedCourse && <div className="mb-5 rounded-2xl border border-primary/15 bg-primary/[.04] p-4 text-sm leading-6 text-text-secondary">{tr("Курс синхронізується з навчальною програмою. Зміни, внесені тут, зберігаються окремо й переживають наступний sync; поля, які ти не редагував, і далі оновлюються з програми.", "This course is synced from the curriculum. Edits made here are stored separately and survive later syncs; fields you have not edited continue to update from the curriculum.")}{course.hasAuthoringOverrides && <span className="ml-1 font-semibold text-primary-strong">{tr("Є збережені зміни автора.", "Author edits are saved.")}</span>}</div>}
    <form onSubmit={saveCourse} className="mb-7 grid gap-3 rounded-[28px] bg-bg-surface p-5 text-text-primary sm:grid-cols-[1fr_auto] sm:items-end sm:p-7">
      <div className="space-y-3"><label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Назва курсу", "Course title")}<input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} maxLength={200} className={`${control} mt-1 normal-case tracking-normal`} /></label><label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Опис", "Description")}<textarea value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} maxLength={50000} rows={2} className={`${control} mt-1 resize-y normal-case tracking-normal`} /></label><p className="flex items-center gap-2 text-sm font-bold text-primary-strong"><Layers3 className="size-4" />{tr(`${course.modules.length} модулів · ${course.modules.reduce((sum, module) => sum + module.items.length, 0)} елементів`, `${course.modules.length} modules · ${course.modules.reduce((sum, module) => sum + module.items.length, 0)} items`)}</p></div>
      <div className="flex flex-wrap gap-2"><button disabled={busy || !courseTitle.trim()} type="submit" className="inline-flex items-center gap-2 rounded-xl border border-border/15 px-4 py-3 text-sm font-bold disabled:opacity-50"><Save className="size-4" />{tr("Зберегти опис", "Save course")}</button><button disabled={busy} type="button" onClick={() => void publish()} className={`rounded-xl px-4 py-3 text-sm font-bold ${course.status === "PUBLISHED" ? "bg-bg-hover text-text-primary" : "bg-primary text-primary-foreground"}`}>{course.status === "PUBLISHED" ? tr("Зняти з публікації", "Unpublish") : tr("Опублікувати", "Publish")}</button></div>
    </form>
    <form onSubmit={addModule} className="mb-6 flex flex-col gap-2 rounded-2xl border border-border/10 bg-bg-hover p-3 sm:flex-row dark:border-white/[.09] dark:bg-white/[.04]"><input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} className={control} placeholder={tr("Назва нового модуля", "New module name")} /><button type="submit" disabled={busy || !moduleTitle.trim()} className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-55"><Plus className="mr-2 inline size-4" />{tr("Додати модуль", "Add module")}</button></form>
    <div className="space-y-3">{course.modules.slice().sort((a, b) => a.order - b.order || a.id - b.id).map((module, index) => <section key={module.id} className="overflow-hidden rounded-[23px] border border-border/10 bg-white dark:border-white/[.09] dark:bg-bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-5"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary-strong dark:text-primary-soft">{String(index + 1).padStart(2, "0")}</span><input value={moduleTitles[module.id] ?? module.title} onChange={(event) => setModuleTitles((old) => ({ ...old, [module.id]: event.target.value }))} aria-label={tr("Назва модуля", "Module title")} className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-[family-name:var(--font-display)] text-xl font-bold focus:border-border focus:outline-none" /><span className="text-sm text-text-muted">{tr(`${module.items.length} елементів`, `${module.items.length} items`)}</span><button type="button" disabled={busy} onClick={() => void saveModule(module, module.order)} className="rounded-lg border border-border/15 px-2.5 py-2 text-xs font-bold">{tr("Зберегти", "Save")}</button><button type="button" aria-label={tr("Перемістити модуль угору", "Move module up")} disabled={busy || index === 0} onClick={() => void moveModule(index, -1)} className="rounded-lg border border-border/15 p-2 disabled:opacity-40"><ArrowUp className="size-4" /></button><button type="button" aria-label={tr("Перемістити модуль униз", "Move module down")} disabled={busy || index === course.modules.length - 1} onClick={() => void moveModule(index, 1)} className="rounded-lg border border-border/15 p-2 disabled:opacity-40"><ArrowDown className="size-4" /></button><button type="button" onClick={() => { setExpanded(expanded === module.id ? null : module.id); setItemTitle(""); }} className="rounded-xl bg-bg-hover px-3 py-2 text-sm font-bold">+ {tr("Елемент", "Item")}</button></div>
      {module.items.length > 0 && <div className="border-t border-border/8 px-5 py-3 dark:border-white/[.08]">{module.items.slice().sort((a, b) => a.order - b.order || a.id - b.id).map((item, itemIndex) => <React.Fragment key={item.id}><div className="flex flex-wrap items-center gap-3 py-2.5"><span className="grid size-8 place-items-center rounded-lg bg-bg-hover dark:bg-white/[.05]">{iconFor(item.kind)}</span><span className="min-w-40 flex-1 text-sm font-semibold">{item.title}</span><span className="text-xs font-bold text-text-muted">{kinds.find((entry) => entry.value === item.kind)?.label || item.kind}</span><button type="button" aria-label={tr("Перемістити елемент угору", "Move item up")} disabled={busy || itemIndex === 0} onClick={() => void moveItem(module, itemIndex, -1)} className="rounded-lg border border-border/15 p-2 disabled:opacity-40"><ArrowUp className="size-4" /></button><button type="button" aria-label={tr("Перемістити елемент униз", "Move item down")} disabled={busy || itemIndex === module.items.length - 1} onClick={() => void moveItem(module, itemIndex, 1)} className="rounded-lg border border-border/15 p-2 disabled:opacity-40"><ArrowDown className="size-4" /></button><button type="button" onClick={() => editItem(item)} className="inline-flex items-center gap-1 rounded-lg border border-border/15 px-2.5 py-2 text-xs font-bold"><Pencil className="size-3.5" />{tr("Редагувати", "Edit")}</button></div>
        {editingItemId === item.id && <div className="mb-4 rounded-2xl border border-primary/20 bg-bg-hover p-4 dark:bg-white/[.035]"><div className="grid gap-2 sm:grid-cols-[1fr_160px_100px]"><input value={editingItemTitle} onChange={(event) => setEditingItemTitle(event.target.value)} aria-label={tr("Назва елемента", "Item title")} className={control} /><select value={editingItemKind} onChange={(event) => { const nextKind = event.target.value as ItemKind; setEditingItemKind(nextKind); if (nextKind === "QUIZ" && item.kind !== "QUIZ") { setEditingQuizMode("structured"); setEditingQuizQuestions([emptyCourseQuizQuestion()]); setEditingQuizJson("[]"); } }} className={control}>{kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input type="number" min={0} value={editingItemOrder} onChange={(event) => setEditingItemOrder(Math.max(0, Number(event.target.value) || 0))} aria-label={tr("Порядок", "Order")} className={control} /></div>{editingItemKind === "THEORY" && <div className="mt-3 space-y-3">
  <div role="group" aria-label={tr("Формат теорії", "Theory format")} className="flex flex-wrap gap-2">
    <button type="button" aria-pressed={editingTheoryMode === "markdown"} onClick={() => {
      if (editingTheoryMode === "blocks") setEditingMarkdown(interactiveLessonToMarkdown(editingLessonBlocks, lessonMarkdownLabels()));
      setEditingTheoryMode("markdown");
    }} className={editingTheoryMode === "markdown" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>Markdown</button>
    <button type="button" aria-pressed={editingTheoryMode === "blocks"} onClick={() => {
      if (editingTheoryMode === "markdown") setEditingLessonBlocks(lessonFromMarkdown(editingMarkdown));
      setEditingTheoryMode("blocks");
    }} className={editingTheoryMode === "blocks" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>{tr("Структуровані блоки", "Structured blocks")}</button>
  </div>
  <p className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-text-secondary">{editingTheoryMode === "blocks" ? tr("Блоки зберігають приклади коду, підказки та інтерактивні перевірки окремо. Перемикання на Markdown перетворює перевірки на текст із правильною відповіддю.", "Blocks keep code examples, hints, and interactive checks separate. Switching to Markdown flattens checks into text with the correct answer.") : tr("Markdown-режим зручний для вільного тексту. Структуровані блоки додають поля для прикладів коду, підказок і перевірок.", "Markdown is useful for free-form text. Structured blocks add fields for code examples, hints, and checks.")}</p>
  {editingTheoryMode === "blocks" ? <LessonBlocksEditor value={editingLessonBlocks} onChange={setEditingLessonBlocks} /> : <label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Теорія · Markdown", "Lesson theory · Markdown")}<textarea value={editingMarkdown} onChange={(event) => setEditingMarkdown(event.target.value)} rows={12} className={control + " mt-1 min-h-48 resize-y font-mono text-sm normal-case tracking-normal"} /></label>}
</div>}
{editingItemKind === "PAGE" && <label className="mt-3 block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Вміст сторінки · Markdown", "Page content · Markdown")}<textarea value={editingMarkdown} onChange={(event) => setEditingMarkdown(event.target.value)} rows={12} className={control + " mt-1 min-h-48 resize-y font-mono text-sm normal-case tracking-normal"} /></label>}
{editingItemKind === "QUIZ" && <div className="mt-3 space-y-3">
  <div role="group" aria-label={tr("Формат квізу", "Quiz format")} className="flex flex-wrap gap-2">
    <button type="button" aria-pressed={editingQuizMode === "structured"} onClick={() => {
      if (editingQuizMode === "json") {
        try {
          const questions = normalizeCourseQuiz(JSON.parse(editingQuizJson));
          if (!questions) throw new Error("INVALID_QUIZ");
          setEditingQuizQuestions(questions);
          setEditingQuizMode("structured");
          setError(null);
        } catch {
          setError(tr("Спочатку виправ JSON квізу, щоб відкрити структурований редактор.", "Fix the quiz JSON before opening the structured editor."));
        }
      }
    }} className={editingQuizMode === "structured" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>{tr("Форма запитань", "Question form")}</button>
    <button type="button" aria-pressed={editingQuizMode === "json"} onClick={() => {
      if (editingQuizMode === "structured") setEditingQuizJson(JSON.stringify(serializeCourseQuiz(editingQuizQuestions), null, 2));
      setEditingQuizMode("json");
    }} className={editingQuizMode === "json" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>{tr("Розширений JSON", "Advanced JSON")}</button>
  </div>
  <p className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-text-secondary">{tr("Кожне питання має 2–5 варіантів і одну позначену правильну відповідь. Публікація квізів у персональний каталог стане доступна після підключення учнівського оцінювання.", "Each question needs 2–5 options and one marked correct answer. Personal catalog publishing will be available when learner-side grading is integrated.")}</p>
  {editingQuizMode === "structured" ? <CourseQuizEditor questions={editingQuizQuestions} onChange={setEditingQuizQuestions} idPrefix={`edit-quiz-${item.id}`} /> : <label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Масив запитань квізу · JSON", "Quiz question array · JSON")}<textarea value={editingQuizJson} onChange={(event) => setEditingQuizJson(event.target.value)} spellCheck={false} rows={12} className={`${control} mt-1 resize-y font-mono text-xs normal-case tracking-normal`} /></label>}
</div>}
{editingItemKind === "CODE_TASK" && <div className="mt-3 space-y-3"><p className="rounded-xl bg-primary/5 p-3 text-sm leading-6 text-text-secondary">{tr("Це навчальний бриф для генератора. Він створить окрему умову, приклади й приховані перевірки Judge, коли учень відкриє практику.", "This is a learning brief for the generator. It creates the statement, examples, and hidden Judge checks when a learner opens the practice.")}</p><label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Бриф динамічної практики", "Dynamic practice brief")}<textarea value={editingPrompt} onChange={(event) => setEditingPrompt(event.target.value)} rows={5} className={`${control} mt-1 min-h-28 resize-y text-sm normal-case tracking-normal`} placeholder={tr("Опиши навичку й алгоритмічну мету, формат вводу/виводу та важливі обмеження. Не вставляй готову умову.", "Describe the skill and algorithmic goal, input/output shape, and important constraints. Do not paste a fixed problem statement.")} /></label><label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Стартовий код", "Starter code")}<textarea value={editingStarterCode} onChange={(event) => setEditingStarterCode(event.target.value)} rows={5} className={`${control} mt-1 resize-y font-mono text-xs normal-case tracking-normal`} /></label>{isOlympiadPracticeContractText(editingLearningContract)
  ? <OlympiadPracticeContractEditor value={editingLearningContract} runtime={String(course.variants?.[0]?.runtime ?? "PYTHON")} onChange={setEditingLearningContract} />
  : <div className="space-y-3 rounded-xl border border-border/10 p-3 dark:border-white/[.08]">
      <p className="text-xs leading-5 text-text-muted">{tr("Для олімпіадної задачі задай алгоритм, точний IO, обмеження й обов’язкове покриття. Генератор створюватиме нові варіанти за контрактом.", "For an Olympiad problem, define the algorithm, exact IO, constraints, and required coverage. The generator will create fresh variants from this contract.")}</p>
      {editingLearningContract.trim() && <label className="block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Розширений контракт генерації · JSON", "Advanced generation contract · JSON")}<textarea value={editingLearningContract} onChange={(event) => setEditingLearningContract(event.target.value)} rows={6} spellCheck={false} className={`${control} mt-1 resize-y font-mono text-xs normal-case tracking-normal`} /></label>}
      <button type="button" onClick={() => addOlympiadContract(item)} className="rounded-lg border border-primary/25 px-3 py-2 text-xs font-bold text-primary-strong dark:text-primary-soft">{tr("Налаштувати контракт олімпіадної задачі", "Set up an Olympiad task contract")}</button>
    </div>}</div>}
{editingItemKind !== "THEORY" && editingItemKind !== "PAGE" && editingItemKind !== "CODE_TASK" && editingItemKind !== "QUIZ" && <label className="mt-3 block text-xs font-bold uppercase tracking-[.12em] text-text-muted">{tr("Вміст елемента · JSON", "Item content · JSON")}<textarea value={editingItemJson} onChange={(event) => setEditingItemJson(event.target.value)} spellCheck={false} rows={12} className={`${control} mt-1 resize-y font-mono text-xs normal-case tracking-normal`} /></label>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { try { const content = JSON.parse(editingItemJson) as Record<string, unknown>; const markdown = editingItemKind === "THEORY" && editingTheoryMode === "blocks" ? JSON.stringify(normalizeInteractiveLesson(editingLessonBlocks) ?? editingLessonBlocks) : editingItemKind === "THEORY" || editingItemKind === "PAGE" ? editingMarkdown : editingItemKind === "CODE_TASK" ? "## " + tr("Бриф генерації Judge", "Judge generation brief") + "\n\n" + editingPrompt + "\n\n_" + tr("Умова, приклади й приховані тести створюються під час проходження практики.", "The statement, examples, and hidden tests are generated when the learner opens the practice.") + "_\n\n" + String.fromCharCode(96).toString().repeat(3) + "\n" + editingStarterCode + "\n" + String.fromCharCode(96).toString().repeat(3) : [content.markdown, content.html, content.description].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n\n"); setPreviewItem({ id: item.id, kind: editingItemKind, markdown: markdown || `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\`` }); } catch { setError(tr("Спочатку виправ JSON, тоді можна переглянути матеріал.", "Fix the JSON before previewing the content.")); } }} className="inline-flex items-center gap-2 rounded-xl border border-border/15 px-3 py-2 text-sm font-bold"><Eye className="size-4" />{tr("Попередній перегляд", "Preview")}</button><button type="button" disabled={busy || !editingItemTitle.trim()} onClick={() => void saveItem(item)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><Save className="size-4" />{tr("Зберегти елемент", "Save item")}</button><button type="button" disabled={busy} onClick={() => { setEditingItemId(null); setPreviewItem(null); }} className="rounded-xl px-3 py-2 text-sm font-bold">{tr("Закрити", "Close")}</button></div>{previewItem?.id === item.id && <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-border bg-white p-4 dark:bg-bg-code">{previewItem.kind === "THEORY" ? <LessonTheoryView theory={previewItem.markdown} /> : <MarkdownView content={previewItem.markdown} />}</div>}</div>}
      </React.Fragment>)}</div>}
      {expanded === module.id && <div className="border-t border-border/8 bg-bg-hover p-5 dark:border-white/[.08] dark:bg-white/[.025]"><div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select value={kind} onChange={(event) => setKind(event.target.value as ItemKind)} className={control}>{kinds.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>)}</select><input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} className={control} placeholder={tr("Назва елемента", "Item title")} /><button disabled={busy || !itemTitle.trim()} type="button" onClick={() => void addItem(module)} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-55">{tr("Додати", "Add")}</button></div>{kind === "THEORY" && <div className="mt-2 space-y-3">
  <div role="group" aria-label={tr("Формат теорії", "Theory format")} className="flex flex-wrap gap-2">
    <button type="button" aria-pressed={itemTheoryMode === "markdown"} onClick={() => {
      if (itemTheoryMode === "blocks") setItemContent(interactiveLessonToMarkdown(itemLessonBlocks, lessonMarkdownLabels()));
      setItemTheoryMode("markdown");
    }} className={itemTheoryMode === "markdown" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>Markdown</button>
    <button type="button" aria-pressed={itemTheoryMode === "blocks"} onClick={() => {
      if (itemTheoryMode === "markdown") setItemLessonBlocks(lessonFromMarkdown(itemContent));
      setItemTheoryMode("blocks");
    }} className={itemTheoryMode === "blocks" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>{tr("Структуровані блоки", "Structured blocks")}</button>
  </div>
  <p className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-text-secondary">{itemTheoryMode === "blocks" ? tr("Додавай пояснення, приклади коду, підказки та запитання-перевірки через окремі поля.", "Add explanations, code examples, hints, and check questions in separate fields.") : tr("Можна почати з Markdown, а потім перенести його в структурований редактор як текстовий блок.", "Start in Markdown, then move it into the structured editor as a text block.")}</p>
  {itemTheoryMode === "blocks" ? <LessonBlocksEditor value={itemLessonBlocks} onChange={setItemLessonBlocks} /> : <textarea value={itemContent} onChange={(event) => setItemContent(event.target.value)} rows={8} className={control + " min-h-32 resize-y font-mono text-sm"} placeholder={tr("Markdown або текст уроку", "Markdown or lesson text")} aria-label={tr("Теорія уроку у Markdown", "Lesson theory in Markdown")} />}
</div>}
{(kind === "PAGE" || kind === "CODE_TASK" || kind === "WEB_TASK" || kind === "MANUAL") && <textarea value={itemContent} onChange={(event) => setItemContent(event.target.value)} className={control + " mt-2 min-h-24 resize-y"} placeholder={kind === "CODE_TASK" ? tr("Короткий опис цілі динамічно згенерованої практики", "Brief for a dynamically generated practice task") : tr("Markdown або текст матеріалу", "Markdown or learning content")} aria-label={tr("Текст або опис елемента", "Item text or description")} />}
{kind === "QUIZ" && <div className="mt-3 space-y-3">
  <div role="group" aria-label={tr("Формат квізу", "Quiz format")} className="flex flex-wrap gap-2">
    <button type="button" aria-pressed={itemQuizMode === "structured"} onClick={() => {
      if (itemQuizMode === "json") {
        try {
          const questions = normalizeCourseQuiz(JSON.parse(itemContent));
          if (!questions) throw new Error("INVALID_QUIZ");
          setItemQuizQuestions(questions);
          setItemQuizMode("structured");
          setError(null);
        } catch {
          setError(tr("Спочатку виправ JSON квізу, щоб відкрити структурований редактор.", "Fix the quiz JSON before opening the structured editor."));
        }
      }
    }} className={itemQuizMode === "structured" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>{tr("Форма запитань", "Question form")}</button>
    <button type="button" aria-pressed={itemQuizMode === "json"} onClick={() => {
      if (itemQuizMode === "structured") setItemContent(JSON.stringify(serializeCourseQuiz(itemQuizQuestions), null, 2));
      setItemQuizMode("json");
    }} className={itemQuizMode === "json" ? "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-lg border border-border/15 px-3 py-2 text-xs font-bold"}>{tr("Розширений JSON", "Advanced JSON")}</button>
  </div>
  <p className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-text-secondary">{tr("Кожне питання має 2–5 варіантів і одну позначену правильну відповідь. Для олімпіадної практики використовуй окремий тип «Задача»: умову й тести Judge система генерує для проходження.", "Each question needs 2–5 options and one marked correct answer. For Olympiad practice, use the separate Problem type: the system generates each Judge statement and tests for the learner.")}</p>
  {itemQuizMode === "structured" && <CourseQuizEditor questions={itemQuizQuestions} onChange={setItemQuizQuestions} idPrefix={`new-quiz-${module.id}`} />}
 </div>}
{kind === "QUIZ" && itemQuizMode === "json" && <textarea value={itemContent} onChange={(event) => setItemContent(event.target.value)} spellCheck={false} rows={8} className={`${control} mt-2 resize-y font-mono text-xs`} placeholder={'[{"question":"...","options":{"А":"...","Б":"..."},"correct":"А"}]}'} aria-label={tr("Запитання квізу у форматі JSON", "Quiz questions as JSON")} />}{kind === "CODE_TASK" && <textarea value={itemTemplate} onChange={(event) => setItemTemplate(event.target.value)} className={`${control} mt-2 min-h-24 resize-y font-mono`} placeholder={tr("Необов’язковий стартовий код", "Optional starter code")} aria-label={tr("Стартовий код", "Starter code")} />}</div>}
    </section>)}</div>
  </Page>;
};
