import { isAxiosError } from "axios";
import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calculator, ChevronRight, Plus, Save, Search, Settings2, Trash2, UsersRound, X } from "lucide-react";
import {
  createManualGrade,
  createSummaryGrade,
  deleteSummaryGrade,
  getClass,
  getClassGradebook,
  getSummaryGrades,
  getTopics,
  recomputeSemesterGrades,
  updateGrade,
  updateControlWorkGrade,
  clearControlWorkGradeOverride,
  updateSemesterGrade,
  updateSummaryGrade,
  type GradebookResponse,
  type GradebookStudent,
  type SummaryGradeGroup,
  type Topic,
} from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { showToast } from "../../lib/toast";
import { Modal } from "../../components/ui/Modal";
import { withDevPreview } from "../../lib/devPreview";
import {
  DEFAULT_GRADING_SYSTEM,
  formatGradeForSystem,
  gradingSystemInputHint,
  gradingSystemLabel,
  normalizeGradingSystem,
  normalizeScaleMode,
  parseGradeInputToRaw100,
} from "../../lib/gradingSystems";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { ClassWorkspaceNavigation, ClassWorkspaceFrame } from "./ClassWorkspaceNavigation";
import { StudentWorkReview } from "./StudentWorkReview";

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-data-workspace mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12";

type Column = {
  id: string;
  title: string;
  subtitle: string;
  taskId: number;
  lessonId: number;
  type: string;
  isSummary?: boolean;
  isControl?: boolean;
  isSemester?: boolean;
};
type EditingCell = {
  student: GradebookStudent;
  column: Column;
  grade: GradebookStudent["grades"][number] | null;
};

const demoTopics: Topic[] = [
  { id: 101, title: "Рядки", order: 1, language: "PYTHON" },
  { id: 102, title: "Цикли", order: 2, language: "PYTHON" },
];

const demoGradebook: GradebookResponse = {
  gradingSystem: "POINTS_12",
  gradeScaleMode: "LINEAR",
  lessons: [
    { id: 101, title: "Рядки", type: "TOPIC", tasks: [{ id: 1001, title: "Частотний словник" }] },
    { id: 102, title: "Цикли", type: "TOPIC", tasks: [{ id: 1002, title: "Сума парних" }] },
    { id: 201, title: "Тематична · Рядки", type: "SUMMARY", tasks: [], parentId: 101, parentTitle: "Рядки" },
    { id: 202, title: "Тематична · Цикли", type: "SUMMARY", tasks: [], parentId: 102, parentTitle: "Цикли" },
    { id: 301, title: "I семестр", type: "SEMESTER", tasks: [] },
  ],
  students: [
    { studentId: 1, studentName: "Марія Коваль", grades: [{ taskId: 1001, taskTitle: "Частотний словник", lessonId: 101, lessonTitle: "Рядки", grade: 96, gradeId: 1, createdAt: "", lessonType: "TOPIC" }, { taskId: 1002, taskTitle: "Сума парних", lessonId: 102, lessonTitle: "Цикли", grade: 84, gradeId: 2, createdAt: "", lessonType: "TOPIC" }, { taskId: 201, taskTitle: "Тематична · Рядки", lessonId: 201, lessonTitle: "Тематична", grade: 92, gradeId: 11, createdAt: "", lessonType: "SUMMARY", isSummaryGrade: true }] },
    { studentId: 2, studentName: "Андрій Левченко", grades: [{ taskId: 1001, taskTitle: "Частотний словник", lessonId: 101, lessonTitle: "Рядки", grade: 78, gradeId: 3, createdAt: "", lessonType: "TOPIC" }, { taskId: 1002, taskTitle: "Сума парних", lessonId: 102, lessonTitle: "Цикли", grade: 89, gradeId: 4, createdAt: "", lessonType: "TOPIC" }] },
    { studentId: 3, studentName: "Софія Данилюк", grades: [{ taskId: 1001, taskTitle: "Частотний словник", lessonId: 101, lessonTitle: "Рядки", grade: 92, gradeId: 5, createdAt: "", lessonType: "TOPIC" }, { taskId: 1002, taskTitle: "Сума парних", lessonId: 102, lessonTitle: "Цикли", grade: 98, gradeId: 6, createdAt: "", lessonType: "TOPIC" }, { taskId: 301, taskTitle: "I семестр", lessonId: 301, lessonTitle: "I семестр", grade: 95, gradeId: 31, createdAt: "", lessonType: "SEMESTER", isSemesterGrade: true }] },
  ] as GradebookStudent[],
};

function buildColumns(data: GradebookResponse | null): Column[] {
  if (!data) return [];
  return data.lessons.flatMap((lesson) => {
    const isSummary = lesson.type === "SUMMARY";
    const isSemester = lesson.type === "SEMESTER";
    const isControl = lesson.type === "CONTROL";
    if (isSummary || isSemester || isControl || !lesson.tasks?.length) {
      return [{
        id: `${lesson.type}-${lesson.id}`,
        title: lesson.title,
        subtitle: isSemester ? tr("семестр", "semester") : isSummary ? tr("тематична", "thematic") : lesson.type.toLowerCase(),
        taskId: lesson.id,
        lessonId: lesson.id,
        type: lesson.type,
        isSummary,
        isSemester,
        isControl,
      }];
    }
    return lesson.tasks.map((task) => ({
      id: `${lesson.id}-${task.id}`,
      title: task.title,
      subtitle: lesson.title,
      taskId: task.id,
      lessonId: lesson.id,
      type: task.type || lesson.type,
    }));
  });
}

function findGrade(student: GradebookStudent, column: Column) {
  return (student.grades || []).find((grade) => {
    if (column.isControl) return grade.isControlWork === true && grade.lessonId === column.lessonId;
    if (column.isSummary) return grade.isSummaryGrade === true && grade.lessonId === column.lessonId;
    if (column.isSemester) return grade.isSemesterGrade === true && grade.lessonId === column.lessonId;
    return !grade.isControlWork && !grade.isSummaryGrade && !grade.isSemesterGrade && grade.taskId === column.taskId;
  }) ?? null;
}

function missingThematicTopics(data: GradebookResponse | null, topics: Topic[]) {
  if (!data) return [];
  // The topics endpoint is authoritative. The gradebook omits topics that do
  // not yet have an assigned practice task, so deriving this list from its
  // visible columns misses topics that still need a thematic column.
  const sourceTopics = topics.length
    ? topics.map((topic) => ({ id: topic.id, title: topic.title }))
    : data.lessons
      .filter((lesson) => lesson.type === "TOPIC")
      .map((lesson) => ({ id: lesson.id, title: lesson.title }));
  const summaries = data.lessons.filter((lesson) => lesson.type === "SUMMARY");
  return sourceTopics.filter((topic) => !summaries.some((summary) => {
    if (summary.parentId === topic.id) return true;
    if (summary.parentTitle && summary.parentTitle.trim().toLowerCase() === topic.title.trim().toLowerCase()) return true;
    return summary.title.toLowerCase().includes(topic.title.trim().toLowerCase());
  }));
}

const gradeTone = (value: number | null | undefined) => {
  if (value == null) return "bg-bg-hover text-text-muted dark:bg-white/[.05] dark:text-text-secondary";
  if (value >= 90) return "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft";
  if (value >= 70) return "bg-bg-hover text-accent-warn dark:bg-accent-warn/14 dark:text-accent-warn";
  return "bg-bg-hover text-accent-error dark:bg-accent-error/10 dark:text-accent-error";
};

const Header: React.FC<{ title: string; text: string; classId?: string; actions?: React.ReactNode; showBackButton?: boolean }> = ({ title, text, classId, actions, showBackButton = true }) => {
  const navigate = useNavigate();
  return (
    <header className="class-data-header">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{tr("EDU / журнал", "EDU / gradebook")}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-.045em]">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions}
        {showBackButton && classId && <button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${classId}`))} className="inline-flex items-center gap-2 rounded-xl border border-border/12 px-4 py-3 text-sm font-bold dark:border-white/10">
          <ArrowLeft className="size-4" />{tr("Клас", "Class")}
        </button>}
      </div>
    </header>
  );
};

export const GradebookWorkspace: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = React.useState<GradebookResponse | null>(null);
  const [className, setClassName] = React.useState("");
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [reviewingWork, setReviewingWork] = React.useState(false);
  const [gradeValue, setGradeValue] = React.useState("");
  const [thematicOpen, setThematicOpen] = React.useState(false);
  const [thematicTopicId, setThematicTopicId] = React.useState("");
  const [busyAction, setBusyAction] = React.useState(false);
  const [gradeError, setGradeError] = React.useState<string | null>(null);
  const [gradeConflict, setGradeConflict] = React.useState<"loading" | "ready" | "failed" | null>(null);
  const routeClassId = React.useRef(classId); routeClassId.current = classId;
  const [recomputeConfirm, setRecomputeConfirm] = React.useState(false);
  const [recomputeError, setRecomputeError] = React.useState<string | null>(null);
  const mutationPending = React.useRef(false);
  const gradeInputRef = React.useRef<HTMLInputElement>(null);
  const recomputeNoticeRef = React.useRef<HTMLDivElement>(null);
  const semesterButtonRef = React.useRef<HTMLButtonElement>(null);
  const [studentFilter, setStudentFilter] = React.useState<"all" | "missing" | "low">("all");
  const [studentQuery, setStudentQuery] = React.useState("");

  const gradingSystem = normalizeGradingSystem(data?.gradingSystem || DEFAULT_GRADING_SYSTEM);
  const scaleMode = normalizeScaleMode(data?.gradeScaleMode);
  const quickGrades = gradingSystem === "PERCENT_100" ? ["100", "90", "80", "70", "60"] : gradingSystem === "POINTS_10" ? ["10", "9", "8", "7", "6"] : gradingSystem === "GPA_4" ? ["4.0", "3.7", "3.3", "3.0", "2.0"] : ["12", "10", "8", "6", "4"];
  const columns = React.useMemo(() => buildColumns(data), [data]);
  const missingThematics = React.useMemo(() => missingThematicTopics(data, topics), [data, topics]);
  const canUseSemesterGrades = missingThematics.length === 0;
  const students = data?.students ?? [];
  const missingStudentIds = React.useMemo(() => new Set(students.filter(student => columns.some(column => findGrade(student, column)?.grade == null)).map(student => student.studentId)), [students, columns]);
  const visibleStudents = React.useMemo(() => students.filter((student) => {
    if (!student.studentName.toLocaleLowerCase().includes(studentQuery.toLocaleLowerCase())) return false;
    if (studentFilter === "all") return true;
    if (studentFilter === "missing") return missingStudentIds.has(student.studentId);
    return student.grades.some((grade) => grade.grade != null && grade.grade < 60);
  }), [students, studentFilter, studentQuery, missingStudentIds]);
  const load = React.useCallback(async () => {
    setError(null);
    try {
      if (preview()) {
        setData(demoGradebook);
        setTopics(demoTopics);
        setClassName("11-А");
        return;
      }
      const [book, topicList, classInfo] = await Promise.all([
        getClassGradebook(Number(classId)),
        getTopics(Number(classId)),
        getClass(Number(classId)).catch(() => null),
      ]);
      setTopics(topicList);
      setData(book);
      setClassName(classInfo?.name || "");
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити журнал.", "Could not load the gradebook.")));
    }
  }, [classId]);

  React.useEffect(() => { void load(); }, [load]);

  const openEditor = (student: GradebookStudent, column: Column) => {
    if (mutationPending.current) return;
    const grade = findGrade(student, column);
    setGradeError(null); setGradeConflict(null); setReviewingWork(false);
    setEditing({ student, column, grade });
    setGradeValue(grade?.grade == null ? "" : formatGradeForSystem(grade.grade, gradingSystem, scaleMode));
  };

  React.useEffect(() => {
    const reviewGradeId = Number(searchParams.get("review"));
    if (editing || mutationPending.current || !data || !Number.isFinite(reviewGradeId) || reviewGradeId === 0) return;
    for (const student of students) {
      const grade = student.grades.find((item) => !item.isControlWork && !item.isSummaryGrade && !item.isSemesterGrade && item.gradeId === reviewGradeId);
      if (!grade) continue;
      const column = columns.find((item) => findGrade(student, item) === grade);
      if (!column) continue;
      setEditing({ student, column, grade });
      setGradeValue(grade.grade == null ? "" : formatGradeForSystem(grade.grade, gradingSystem, scaleMode));
      return;
    }
  }, [columns, data, gradingSystem, scaleMode, searchParams, students]);

  const refreshConflictedGrade = async () => {
    if (!editing) return;
    const capturedClassId = classId;
    setGradeConflict("loading");
    try {
      const book = await getClassGradebook(Number(capturedClassId));
      if (routeClassId.current !== capturedClassId) return;
      const student = book.students.find(item => item.studentId === editing.student.studentId);
      const column = buildColumns(book).find(item => item.id === editing.column.id);
      if (!student || !column) throw new Error(tr("Ця клітинка більше недоступна. Закрийте редактор і оновіть журнал.", "This cell is no longer available. Close the editor and reload the gradebook."));
      setData(book); setEditing({ student, column, grade: findGrade(student, column) }); setGradeConflict("ready");
    } catch (caught) {
      if (routeClassId.current !== capturedClassId) return;
      setGradeConflict("failed"); setGradeError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити актуальну оцінку. Введене значення збережено.", "Could not load the current grade. Your input is retained.")));
    }
  };

  const saveGrade = async () => {
    if (!editing || mutationPending.current || gradeConflict) return;
    const raw = parseGradeInputToRaw100(gradeValue, gradingSystem, scaleMode);
    if (raw === null) {
      setGradeError(`${tr("Некоректна оцінка.", "Invalid grade.")} ${gradingSystemInputHint(gradingSystem, isEn)}`);
      gradeInputRef.current?.focus();
      return;
    }
    if (editing.column.isSemester && !canUseSemesterGrades) {
      setGradeError(tr(`Спочатку потрібні тематичні для всіх тем (${missingThematics.length} ще немає).`, `Add thematic grades for all topics first (${missingThematics.length} remaining).`));
      gradeInputRef.current?.focus();
      return;
    }
    mutationPending.current = true;
    setGradeError(null);
    setSaving(true);
    try {
      if (preview()) {
        setData((old) => {
          if (!old) return old;
          return {
            ...old,
            students: old.students.map((student) => {
              if (student.studentId !== editing.student.studentId) return student;
              const oldGrades = student.grades || [];
              const nextGrade = {
                taskId: editing.column.taskId,
                taskTitle: editing.column.title,
                lessonId: editing.column.lessonId,
                lessonTitle: editing.column.subtitle,
                lessonType: editing.column.type,
                grade: raw,
                gradeId: editing.grade?.gradeId ?? Date.now(),
                createdAt: new Date().toISOString(),
                isSummaryGrade: editing.column.isSummary,
                isSemesterGrade: editing.column.isSemester,
              };
              const exists = oldGrades.some((grade) => grade.gradeId === editing.grade?.gradeId && editing.grade?.gradeId != null);
              return { ...student, grades: exists ? oldGrades.map((grade) => grade.gradeId === editing.grade?.gradeId ? nextGrade : grade) : [...oldGrades, nextGrade] };
            }),
          };
        });
      } else if (editing.column.isControl) {
        await updateControlWorkGrade(editing.column.taskId, editing.student.studentId, raw, editing.grade?.revision);
      } else if (editing.column.isSemester) {
        if (!editing.grade?.gradeId) throw new Error(tr("Спочатку перерахуйте семестрові оцінки в журналі.", "Recalculate semester grades in the gradebook first."));
        await updateSemesterGrade(Number(classId), editing.grade.gradeId, raw, editing.grade.revision);
      } else if (editing.column.isSummary) {
        if (!editing.grade?.gradeId) throw new Error(tr("Спочатку створіть тематичну колонку в журналі.", "Create a thematic column in the gradebook first."));
        await updateSummaryGrade(Number(classId), editing.grade.gradeId, raw, editing.grade.revision);
      } else if (editing.grade?.gradeId) {
        await updateGrade(editing.grade.gradeId, { total: raw, expectedRevision: editing.grade.revision, latestOnly: true });
      } else {
        await createManualGrade(editing.column.taskId, editing.student.studentId, { total: raw, expectedRevision: editing.grade?.revision });
      }
      setEditing(null);
      setGradeValue("");
      if (!preview()) await load();
      showToast({ type: "success", message: tr("Оцінку збережено.", "Grade saved.") });
    } catch (caught) {
      setGradeError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти оцінку. Введене значення збережено — спробуйте ще раз.", "Could not save the grade. Your input is retained — try again.")));
      if (isAxiosError(caught) && caught.response?.status === 409 && ["GRADE_CHANGED", "REVIEW_REVISION_REQUIRED"].includes(caught.response.data?.message)) await refreshConflictedGrade();
      gradeInputRef.current?.focus();
    } finally {
      mutationPending.current = false;
      setSaving(false);
    }
  };

  const clearControlOverride = async () => {
    if (!editing?.column.isControl || mutationPending.current || gradeConflict) return;
    mutationPending.current = true; setSaving(true); setGradeError(null);
    try {
      await clearControlWorkGradeOverride(editing.column.taskId, editing.student.studentId, editing.grade?.revision);
      setEditing(null); setGradeValue(""); await load();
      showToast({ type: "success", message: tr("Ручну оцінку знято. Журнал показує актуальний розрахунок.", "Manual override removed. The gradebook shows the current calculation.") });
    } catch (caught) {
      setGradeError(getErrorMessageFromUnknown(caught, tr("Не вдалося зняти ручну оцінку. Введене значення збережено.", "Could not remove the override. Your input is retained.")));
      if (isAxiosError(caught) && caught.response?.status === 409 && ["GRADE_CHANGED", "REVIEW_REVISION_REQUIRED"].includes(caught.response.data?.message)) await refreshConflictedGrade();
    } finally { mutationPending.current = false; setSaving(false); }
  };

  const addThematic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mutationPending.current) return;
    if (!thematicTopicId || !missingThematics.some((topic) => topic.id === Number(thematicTopicId))) return;
    mutationPending.current = true;
    setBusyAction(true);
    try {
      if (preview()) {
        const topic = topics.find((item) => item.id === Number(thematicTopicId));
        setData((old) => old ? { ...old, lessons: [...old.lessons, { id: Date.now(), title: `${tr("Тематична", "Thematic")} · ${topic?.title || tr("тема", "topic")}`, type: "SUMMARY", tasks: [], parentId: topic?.id, parentTitle: topic?.title }] } : old);
      } else {
        await createSummaryGrade(Number(classId), { name: "THEMATIC", topicId: Number(thematicTopicId) });
        await load();
      }
      setThematicOpen(false);
      setThematicTopicId("");
      showToast({ type: "success", message: tr("Тематичну додано до журналу.", "Thematic grade added to the gradebook.") });
    } catch (caught) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(caught, tr("Не вдалося створити тематичну.", "Could not create the thematic grade.")) });
    } finally {
      mutationPending.current = false;
      setBusyAction(false);
    }
  };

  const recomputeSemester = async () => {
    if (mutationPending.current) return;
    if (!canUseSemesterGrades) {
      showToast({ type: "error", message: tr(`Семестрові заблоковано: створіть тематичні для всіх тем (${missingThematics.length} ще немає).`, `Semester grades are blocked. Create thematic grades for all topics first (${missingThematics.length} remaining).`) });
      return;
    }
    mutationPending.current = true;
    setRecomputeError(null);
    setBusyAction(true);
    try {
      if (!preview()) {
        await recomputeSemesterGrades(Number(classId));
        await load();
      }
      setRecomputeConfirm(false);
      semesterButtonRef.current?.focus();
      showToast({ type: "success", message: tr("Семестрові оновлено в журналі.", "Semester grades updated in the gradebook.") });
    } catch (caught) {
      setRecomputeError(getErrorMessageFromUnknown(caught, tr("Не вдалося перерахувати семестрові. Попередні оцінки збережено. Повторіть дію.", "Could not recalculate semester grades. Previous grades are retained. Retry the action.")));
      recomputeNoticeRef.current?.focus();
    } finally {
      mutationPending.current = false;
      setBusyAction(false);
    }
  };

  React.useEffect(() => {
    if (recomputeConfirm) recomputeNoticeRef.current?.focus();
  }, [recomputeConfirm]);

  React.useEffect(() => {
    if (editing && !saving) gradeInputRef.current?.focus();
  }, [editing, saving, gradeError]);

  return (
    <div data-gradebook-workspace className={`${root} min-w-0 w-full`}>
      <ClassWorkspaceFrame classId={classId || "0"} className={className || tr("Клас", "Class")} active="gradebook">
      <Header
        classId={classId}
        showBackButton={false}
        title={tr("Журнал класу", "Class gradebook")}
        text={tr("Результати завдань, тематичні та семестрові оцінки.", "Task results, thematic grades, and semester grades.")}
        actions={
          <>
            <button type="button" aria-label={tr("Налаштування журналу", "Gradebook settings")} onClick={() => navigate(withDevPreview(`/edu/classes/${classId}/manage?tab=settings`))} className="classroom-gradebook-settings inline-flex items-center gap-2 rounded-xl border border-border/12 px-4 py-3 text-sm font-bold dark:border-white/10"><Settings2 className="size-4" aria-hidden="true" /><span>{tr("Налаштування", "Settings")}</span></button>
            <button type="button" disabled={!missingThematics.length} onClick={() => setThematicOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45 dark:bg-primary dark:text-primary-foreground"><Plus className="size-4" />{tr("Тематична", "Thematic")}</button>
            <button ref={semesterButtonRef} type="button" disabled={busyAction || saving || !canUseSemesterGrades} onClick={() => { setRecomputeError(null); setRecomputeConfirm(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/12 px-4 py-3 text-sm font-bold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55 dark:border-white/10 dark:text-text-primary"><Calculator className="size-4" />{tr("Семестрові", "Semester grades")}</button>
          </>
        }
      />

      {recomputeConfirm && (
        <div ref={recomputeNoticeRef} role="alert" tabIndex={-1} className="mb-4 rounded-2xl border border-border/20 bg-bg-surface p-4 focus:outline focus:outline-2 focus:outline-primary">
          <p className="font-semibold">{tr("Перерахувати семестрові оцінки?", "Recalculate semester grades?")}</p>
          <p className="mt-2 text-sm text-text-secondary">{tr("Оцінки буде обчислено з тематичних. Вручну змінені семестрові оцінки буде замінено. Історія архівованих учнів збережеться.", "Grades will be calculated from thematic grades. Manual semester overrides will be replaced. Archived learner history will be retained.")}</p>
          {recomputeError && <p className="mt-3 text-sm text-accent-error">{recomputeError}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busyAction} onClick={() => { setRecomputeConfirm(false); semesterButtonRef.current?.focus(); }} className="min-h-11 rounded-xl border border-border/20 px-4 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55">{tr("Скасувати", "Cancel")}</button>
            <button type="button" disabled={busyAction} onClick={() => void recomputeSemester()} className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55">{busyAction ? tr("Перераховуємо…", "Recalculating…") : tr("Перерахувати", "Recalculate")}</button>
          </div>
        </div>
      )}

      {error && <div className="class-gradebook__error" role="alert">{error}<button type="button" onClick={() => void load()}>{tr("Спробувати ще раз", "Try again")}</button></div>}
      {!data ? (
        error ? <div className="class-gradebook__empty" role="status">{tr("Журнал не завантажився. Спробуйте ще раз.", "The gradebook did not load. Try again.")}</div> : <div className="h-64 animate-pulse rounded-xl bg-bg-hover" role="status" aria-label={tr("Завантажуємо журнал", "Loading gradebook")} />
      ) : (
        <>
          <section className="class-gradebook__summary" aria-label={tr("Стан журналу й система оцінювання", "Gradebook status and grading scale")}>
            <div className={`class-gradebook__status ${canUseSemesterGrades ? "is-ready" : "is-blocked"}`}>
              <span className="class-gradebook__status-dot" aria-hidden="true" />
              <span>{canUseSemesterGrades
                ? tr("Тематичні готові до підсумку", "Thematic grades are ready for the term")
                : tr(`Семестрові оцінки: бракує тематичних для ${missingThematics.length} тем`, `Semester grades need thematic columns for ${missingThematics.length} more topic(s)`)}
              </span>
            </div>
            <div className="class-gradebook__scale"><span>{tr("Шкала", "Scale")}</span><strong>{gradingSystemLabel(gradingSystem, isEn)}</strong><small>{gradingSystemInputHint(gradingSystem, isEn)}</small></div>
            <div className="class-gradebook__counts"><span><strong>{students.length}</strong>{tr("учнів", "students")}</span><span><strong>{columns.length}</strong>{tr("колонок", "columns")}</span></div>
          </section>

          <section className="class-gradebook__filters">
            <label className="classroom-search"><Search className="size-4" aria-hidden="true" /><input type="search" value={studentQuery} onChange={event => setStudentQuery(event.target.value)} aria-label={tr("Знайти учня в журналі", "Search the gradebook")} placeholder={tr("Знайти учня…", "Search students…")} /></label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="class-gradebook__filter-label">{tr("Учні", "Students")}</span>
              <div className="class-gradebook__filter-options">{(["all", "missing", "low"] as const).map((filter) => <button type="button" key={filter} aria-pressed={studentFilter === filter} onClick={() => setStudentFilter(filter)}>{filter === "all" ? `${tr("Усі", "All")} · ${students.length}` : filter === "missing" ? `${tr("Без оцінки", "No grade")} · ${missingStudentIds.size}` : `${tr("Низькі", "Low grades")} · ${students.filter((student) => student.grades.some((grade) => grade.grade != null && grade.grade < 60)).length}`}</button>)}</div>
              <span className="class-gradebook__visible-count">{tr("Показано", "Showing")} {visibleStudents.length} {tr("із", "of")} {students.length}</span>
            </div>
          </section>

          <div className="class-gradebook__table-wrap">
            <table style={{ width: `max(100%, ${192 + Math.max(columns.length, 1) * 132}px)`, tableLayout: "fixed" }}>
              <caption className="sr-only">{tr("Оцінки учнів класу. Натисніть оцінку, щоб редагувати.", "Class grades. Select a grade to edit it.")}</caption>
              <colgroup><col style={{ width: 192 }} />{columns.map((column) => <col key={column.id} />)}</colgroup>
              <thead>
                <tr className="border-b border-border/10 dark:border-white/[.08]">
                  <th scope="col" className="class-gradebook__student-head">{tr("Учень", "Student")}</th>
                  {columns.map((column) => <th scope="col" key={column.id} data-column-kind={column.isSemester ? "semester" : column.isSummary ? "summary" : "task"} className="class-gradebook__column-head"><span>{column.title}</span><small>{column.subtitle}</small></th>)}
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr key={student.studentId} data-student-id={student.studentId}>
                  <td className="class-gradebook__student-cell">{student.studentName}</td>
                    {columns.map((column) => {
                      const grade = findGrade(student, column);
                      return <td key={column.id} data-column-kind={column.isSemester ? "semester" : column.isSummary ? "summary" : "task"} className="class-gradebook__grade-cell"><button type="button" data-grade-id={grade?.gradeId} disabled={saving || busyAction} aria-label={`${student.studentName} · ${column.title} · ${grade?.grade == null ? tr("Без оцінки", "No grade") : formatGradeForSystem(grade.grade, gradingSystem, scaleMode)}`} onClick={() => openEditor(student, column)} data-grade-tone={grade?.grade == null ? "empty" : grade.grade < 60 ? "low" : "normal"} className="class-gradebook__grade">{grade?.grade == null ? "—" : formatGradeForSystem(grade.grade, gradingSystem, scaleMode)}</button></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleStudents.length && <div className="class-gradebook__empty">{tr("За цим фільтром учнів не знайдено.", "No students match this filter.")}</div>}
          </div>
          <p className="classroom-list-hint">{tr("Натисніть оцінку, щоб змінити її. Тематичні й семестрові колонки виділено фоном.", "Select a grade to edit it. Thematic and semester columns have a tinted background.")}</p>
        </>
      )}

      {editing && !reviewingWork && (
        <Modal open onClose={() => { if (!mutationPending.current) setEditing(null); }} title={tr("Редагування оцінки", "Edit grade")} description={`${editing.student.studentName} · ${editing.column.title}`} showCloseButton={false} panelClassName="classroom-grade-editor max-w-md">
            <form onSubmit={event => { event.preventDefault(); void saveGrade(); }}>
              {editing.column.isControl && editing.grade?.manualOverrideGrade != null && <div data-control-override role="status" className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p>{tr("Ручна оцінка збережена. Нові результати тесту й практики оновлюють розрахунок, не змінюючи вашу оцінку.", "Your manual grade is retained. New quiz and practice results update the calculation while preserving your decision.")}</p><p className="mt-2 font-semibold">{tr("Розрахована оцінка:", "Calculated grade:")} {editing.grade.calculatedGrade == null ? tr("Ще немає результатів для розрахунку", "No results to calculate yet") : formatGradeForSystem(editing.grade.calculatedGrade, gradingSystem, scaleMode)}</p><button type="button" disabled={saving || Boolean(gradeConflict)} onClick={() => void clearControlOverride()} className="mt-3 min-h-11 rounded-xl border border-border/20 px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55">{editing.grade.calculatedGrade == null ? tr("Прибрати ручну оцінку", "Remove manual grade") : tr("Використати розраховану оцінку", "Use calculated grade")}</button></div>}
              {!editing.column.isSummary && !editing.column.isSemester && <button type="button" disabled={saving} className="student-work__entry" onClick={() => setReviewingWork(true)}><span><strong>{tr("Переглянути подачі", "View submissions")}</strong><small>{tr("Код, усі спроби та результати перевірки", "Code, all attempts, and review results")}</small></span><ChevronRight className="size-5" aria-hidden="true" /></button>}
              <label htmlFor="teacher-grade-value" className="classroom-grade-label">{tr("Оцінка", "Grade")}</label><input ref={gradeInputRef} id="teacher-grade-value" name="gradeValue" inputMode="decimal" disabled={saving} aria-invalid={Boolean(gradeError)} aria-describedby={gradeError ? "teacher-grade-error" : undefined} value={gradeValue} onChange={(event) => { setGradeValue(event.target.value); setGradeError(null); }} className="classroom-grade-input" placeholder={gradingSystemInputHint(gradingSystem, isEn)} />
              {gradeError && <p id="teacher-grade-error" role="alert" className="mt-3 text-sm text-accent-error">{gradeError}</p>}
              {gradeConflict && <div role="status" className="mt-4 rounded-xl border border-accent-warn/30 bg-accent-warn/10 p-4 text-sm"><p>{tr("Оцінка змінилася. Введене значення збережено. Перегляньте актуальну оцінку перед продовженням.", "The grade changed. Your input is retained. Review the current grade before continuing.")}</p>{gradeConflict === "ready" && <p className="mt-2 font-semibold">{tr("Актуальна оцінка:", "Current grade:")} {editing.grade?.grade == null ? tr("Без оцінки", "No grade") : formatGradeForSystem(editing.grade.grade, gradingSystem, scaleMode)}</p>}<button type="button" disabled={saving || gradeConflict === "loading"} onClick={() => { if (gradeConflict === "ready") { setGradeConflict(null); setGradeError(null); gradeInputRef.current?.focus(); } else void refreshConflictedGrade(); }} className="mt-3 min-h-11 rounded-xl border border-border/20 px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55">{gradeConflict === "ready" ? tr("Переглянув зміни — продовжити", "Reviewed changes — continue") : tr("Завантажити актуальну оцінку", "Load current grade")}</button></div>}
              <div className="mt-4 grid grid-cols-5 gap-2">{quickGrades.map((value) => <button key={value} type="button" disabled={saving} onClick={() => { setGradeValue(value); setGradeError(null); }} className="min-h-11 rounded-xl bg-bg-hover px-3 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55 dark:bg-white/[.06]">{value}</button>)}</div>
              <div className="mt-6 flex gap-2"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="min-h-11 flex-1 rounded-xl px-4 py-3 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55">{tr("Скасувати", "Cancel")}</button><button type="submit" disabled={saving || Boolean(gradeConflict) || !gradeValue.trim()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-55"><Save className="size-4" />{saving ? tr("Зберігаємо…", "Saving…") : tr("Зберегти", "Save")}</button></div>
            </form>
        </Modal>
      )}

      {editing && reviewingWork && <StudentWorkReview key={String(classId) + "-" + editing.student.studentId + "-" + editing.column.id} studentId={editing.student.studentId} studentName={editing.student.studentName} taskId={editing.column.taskId} taskTitle={editing.column.title} isControl={Boolean(editing.column.isControl)} gradingSystem={gradingSystem} scaleMode={scaleMode} onClose={() => setReviewingWork(false)} />}

      <Modal open={thematicOpen} onClose={() => setThematicOpen(false)} title={tr("Додати тематичну оцінку", "Add thematic grade")} description={tr("Оберіть тему, щоб додати підсумкову колонку до журналу класу.", "Choose a topic to add a summary column to the class gradebook.")} showCloseButton={false} panelClassName="max-w-md">
          <form onSubmit={addThematic}>
            <label htmlFor="thematic-topic" className="text-sm font-semibold">{tr("Тема", "Topic")}</label>
            <select id="thematic-topic" required value={thematicTopicId} onChange={(event) => setThematicTopicId(event.target.value)} className="mt-2 w-full rounded-xl border border-border/12 bg-bg-surface px-4 py-3 dark:border-white/10"><option value="">{tr("Оберіть тему", "Choose a topic")}</option>{missingThematics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select>
            <div className="mt-5 flex gap-2"><button type="button" onClick={() => setThematicOpen(false)} className="flex-1 rounded-xl px-4 py-3 font-bold">{tr("Скасувати", "Cancel")}</button><button type="submit" disabled={busyAction || !thematicTopicId} className="flex-1 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-55">{tr("Додати", "Add")}</button></div>
          </form>
      </Modal>
      </ClassWorkspaceFrame>
    </div>
);
};

export const SummaryGradesWorkspace: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = React.useState<SummaryGradeGroup[]>([]);
  const [gradebook, setGradebook] = React.useState<GradebookResponse | null>(null);
  const [className, setClassName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const gradingSystem = normalizeGradingSystem(gradebook?.gradingSystem || DEFAULT_GRADING_SYSTEM);
  const scaleMode = normalizeScaleMode(gradebook?.gradeScaleMode);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (preview()) {
          setGradebook(demoGradebook);
          setClassName("11-А");
          setGroups([{ name: "Рядки", grades: [{ id: 1, studentId: 1, studentName: "Марія Коваль", grade: 92, createdAt: new Date().toISOString() }] }]);
          return;
        }
        const [grades, book, classInfo] = await Promise.all([getSummaryGrades(Number(classId)), getClassGradebook(Number(classId)), getClass(Number(classId)).catch(() => null)]);
        if (alive) {
          setGroups(grades);
          setGradebook(book);
          setClassName(classInfo?.name || "");
        }
      } catch (caught) {
        if (alive) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити підсумки.", "Could not load summary grades.")));
      }
    })();
    return () => { alive = false; };
  }, [classId]);

  const remove = async (id: number) => {
    if (!window.confirm(tr("Видалити цей підсумок?", "Delete this summary grade?"))) return;
    if (preview()) {
      setGroups((old) => old.map((item) => ({ ...item, grades: item.grades.filter((grade) => grade.id !== id) })));
      return;
    }
    try {
      await deleteSummaryGrade(Number(classId), id);
      setGroups((old) => old.map((item) => ({ ...item, grades: item.grades.filter((grade) => grade.id !== id) })));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити підсумок.", "Could not delete the summary grade.")));
    }
  };

  return (
    <div className={root}>
      <ClassWorkspaceNavigation classId={classId || "0"} className={className || tr("Клас", "Class")} active="gradebook" />
      <Header
        classId={classId}
        showBackButton={false}
        title={tr("Підсумкові оцінки", "Summary grades")}
        text={tr("Це архів і перегляд. Створення тематичних та семестрових перенесено в журнал класу, щоб оцінювання не дублювалось.", "This page is for reviewing archived grades. Create thematic and semester grades in the class gradebook to keep grading in one place.")}
        actions={<button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${classId}/gradebook`))} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground">{tr("Відкрити журнал", "Open gradebook")} <ChevronRight className="size-4" /></button>}
      />
      {error && <div className="mb-5 rounded-2xl bg-accent-error/10 px-4 py-3 text-sm text-accent-error" role="alert">{error}</div>}
      <div className="mb-5 rounded-[24px] border border-border/10 bg-white px-5 py-4 text-sm dark:border-white/10 dark:bg-bg-surface">
        <div className="text-xs font-bold uppercase tracking-[.14em] text-text-muted dark:text-text-secondary">{tr("Система оцінювання класу", "Class grading system")}</div>
        <div className="mt-1 text-lg font-bold">{gradingSystemLabel(gradingSystem, isEn)}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.name} className="rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.13em] text-accent-warn">{tr("тематичний зріз", "thematic summary")}</p><h2 className="mt-2 text-xl font-bold">{group.name}</h2></div>
              <button type="button" disabled={!group.grades[0]} onClick={() => group.grades[0] && void remove(group.grades[0].id)} aria-label={tr(`Видалити оцінку ${group.name}`, `Delete grade for ${group.name}`)} className="rounded-xl bg-bg-hover p-2 text-accent-error disabled:opacity-40 dark:bg-accent-error/10 dark:text-accent-error"><Trash2 className="size-4" aria-hidden="true" /></button>
            </div>
            <div className="mt-5 space-y-2">
              {(group.grades || []).map((grade) => <div key={grade.id} className="flex items-center justify-between rounded-xl bg-bg-hover px-3 py-2.5 text-sm dark:bg-white/[.045]"><span>{grade.studentName || `${tr("Учень", "Student")} #${grade.studentId}`}</span><b className="text-primary-strong dark:text-primary-soft">{formatGradeForSystem(grade.grade, gradingSystem, scaleMode)}</b></div>)}
              {!group.grades?.length && <p className="rounded-xl bg-bg-hover p-3 text-sm text-text-muted dark:bg-white/[.045] dark:text-text-secondary">{tr("Оцінки ще не додані.", "No grades added yet.")}</p>}
            </div>
          </section>
        ))}
        {!groups.length && <div className="rounded-[26px] border border-dashed border-border/15 bg-white px-5 py-16 text-center text-sm text-text-muted dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary">{tr("Підсумкових оцінок ще немає. Додайте тематичну у журналі.", "No summary grades yet. Add a thematic grade in the gradebook.")}</div>}
      </div>
    </div>
  );
};
