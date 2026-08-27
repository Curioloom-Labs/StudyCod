import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, CalendarDays, Calculator, ChevronRight, GraduationCap, Plus, Save, Settings2, Trash2, UsersRound, X } from "lucide-react";
import {
  createManualGrade,
  createSummaryGrade,
  deleteSummaryGrade,
  getAttendance,
  getClassGradebook,
  getSummaryGrades,
  getTopics,
  recomputeSemesterGrades,
  updateGrade,
  updateSemesterGrade,
  updateSummaryGrade,
  setAttendance,
  type AttendanceStatus,
  type GradebookResponse,
  type GradebookStudent,
  type SummaryGradeGroup,
  type Topic,
} from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { showToast } from "../../lib/toast";
import {
  DEFAULT_GRADING_SYSTEM,
  formatGradeForSystem,
  gradingSystemInputHint,
  gradingSystemLabel,
  normalizeGradingSystem,
  normalizeScaleMode,
  parseGradeInputToRaw100,
} from "../../lib/gradingSystems";

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12";

type Column = {
  id: string;
  title: string;
  subtitle: string;
  taskId: number;
  lessonId: number;
  type: string;
  isSummary?: boolean;
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
    if (isSummary || isSemester || !lesson.tasks?.length) {
      return [{
        id: `${lesson.type}-${lesson.id}`,
        title: lesson.title,
        subtitle: isSemester ? "семестр" : isSummary ? "тематична" : lesson.type.toLowerCase(),
        taskId: lesson.id,
        lessonId: lesson.id,
        type: lesson.type,
        isSummary,
        isSemester,
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
    if (column.isSummary || column.isSemester) return grade.lessonId === column.lessonId || grade.taskId === column.taskId;
    return grade.taskId === column.taskId;
  }) ?? null;
}

function missingThematicTopics(data: GradebookResponse | null, topics: Topic[]) {
  if (!data) return [];
  const topicLessons = data.lessons.filter((lesson) => lesson.type === "TOPIC");
  const sourceTopics = topicLessons.length
    ? topicLessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))
    : topics.map((topic) => ({ id: topic.id, title: topic.title }));
  const summaries = data.lessons.filter((lesson) => lesson.type === "SUMMARY");
  return sourceTopics.filter((topic) => !summaries.some((summary) => {
    if (summary.parentId === topic.id) return true;
    if (summary.parentTitle && summary.parentTitle.trim().toLowerCase() === topic.title.trim().toLowerCase()) return true;
    return summary.title.toLowerCase().includes(topic.title.trim().toLowerCase());
  }));
}

const gradeTone = (value: number | null | undefined) => {
  if (value == null) return "bg-[#f0f3f0] text-[#87958c] dark:bg-white/[.05] dark:text-[#a6b4a9]";
  if (value >= 90) return "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]";
  if (value >= 70) return "bg-[#fff0d7] text-[#a55e00] dark:bg-[#ff8c00]/14 dark:text-[#ffbb6a]";
  return "bg-[#fff0f4] text-[#c4436b] dark:bg-[#ff6b9d]/10 dark:text-[#ff9abd]";
};

const attendanceStatuses: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
const attendanceLabel: Record<AttendanceStatus, string> = { PRESENT: "Присутній", LATE: "Запізнення", ABSENT: "Відсутній", EXCUSED: "Поважна" };
const attendanceShort: Record<AttendanceStatus, string> = { PRESENT: "П", LATE: "З", ABSENT: "В", EXCUSED: "У" };
const attendanceTone: Record<AttendanceStatus, string> = {
  PRESENT: "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]",
  LATE: "bg-[#fff0d7] text-[#a55e00] dark:bg-[#ff8c00]/14 dark:text-[#ffbb6a]",
  ABSENT: "bg-[#fff0f5] text-[#bd4067] dark:bg-[#ff6b9d]/12 dark:text-[#ff9abd]",
  EXCUSED: "bg-[#edf0ff] text-[#545db9] dark:bg-[#8791ff]/12 dark:text-[#b8beff]",
};

const Header: React.FC<{ title: string; text: string; classId?: string; actions?: React.ReactNode }> = ({ title, text, classId, actions }) => {
  const navigate = useNavigate();
  return (
    <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-[#16834d] dark:text-[#72edb0]">EDU / журнал</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[#69796e] dark:text-[#a9b6ac]">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions}
        <button type="button" onClick={() => navigate(`/edu/classes/${classId}${preview() ? "?preview=true" : ""}`)} className="inline-flex items-center gap-2 rounded-xl border border-[#19291d]/12 px-4 py-3 text-sm font-bold dark:border-white/10">
          <ArrowLeft className="size-4" />
          Клас
        </button>
      </div>
    </header>
  );
};

export const GradebookWorkspace: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [data, setData] = React.useState<GradebookResponse | null>(null);
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [gradeValue, setGradeValue] = React.useState("");
  const [thematicOpen, setThematicOpen] = React.useState(false);
  const [thematicTopicId, setThematicTopicId] = React.useState("");
  const [busyAction, setBusyAction] = React.useState(false);
  const [attendanceDate, setAttendanceDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceMap, setAttendanceMap] = React.useState<Record<number, AttendanceStatus>>({});
  const [attendanceSaving, setAttendanceSaving] = React.useState(false);
  const autoThematicGuardRef = React.useRef(false);

  const gradingSystem = normalizeGradingSystem(data?.gradingSystem || DEFAULT_GRADING_SYSTEM);
  const scaleMode = normalizeScaleMode(data?.gradeScaleMode);
  const quickGrades = gradingSystem === "PERCENT_100" ? ["100", "90", "80", "70", "60"] : gradingSystem === "POINTS_10" ? ["10", "9", "8", "7", "6"] : gradingSystem === "GPA_4" ? ["4.0", "3.7", "3.3", "3.0", "2.0"] : ["12", "10", "8", "6", "4"];
  const columns = React.useMemo(() => buildColumns(data), [data]);
  const missingThematics = React.useMemo(() => missingThematicTopics(data, topics), [data, topics]);
  const canUseSemesterGrades = missingThematics.length === 0;
  const students = data?.students ?? [];

  const load = React.useCallback(async () => {
    setError(null);
    try {
      if (preview()) {
        setData(demoGradebook);
        setTopics(demoTopics);
        setAttendanceMap({ 1: "PRESENT", 2: "LATE", 3: "PRESENT" });
        return;
      }
      const [book, topicList, attendance] = await Promise.all([
        getClassGradebook(Number(classId)),
        getTopics(Number(classId)),
        getAttendance(Number(classId), attendanceDate),
      ]);
      const nextAttendance: Record<number, AttendanceStatus> = {};
      book.students.forEach((student) => { nextAttendance[student.studentId] = "PRESENT"; });
      (attendance.records || []).forEach((record) => { nextAttendance[record.studentId] = record.status; });
      setTopics(topicList);
      let nextBook = book;
      const missing = missingThematicTopics(book, topicList);
      if (missing.length && !autoThematicGuardRef.current) {
        autoThematicGuardRef.current = true;
        try {
          for (const topic of missing) await createSummaryGrade(Number(classId), { name: "THEMATIC", topicId: topic.id });
          nextBook = await getClassGradebook(Number(classId));
          showToast({ type: "success", message: `Тематичні колонки синхронізовано: ${missing.length}.` });
        } catch (syncError) {
          console.warn("[GradebookWorkspace] thematic auto-sync failed:", syncError);
          showToast({ type: "error", message: "Не вдалося автоматично створити всі тематичні колонки." });
        } finally {
          autoThematicGuardRef.current = false;
        }
      }
      setData(nextBook);
      setAttendanceMap(nextAttendance);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося завантажити журнал."));
    }
  }, [attendanceDate, classId]);

  React.useEffect(() => { void load(); }, [load]);

  const openEditor = (student: GradebookStudent, column: Column) => {
    const grade = findGrade(student, column);
    setEditing({ student, column, grade });
    setGradeValue(grade?.grade == null ? "" : formatGradeForSystem(grade.grade, gradingSystem, scaleMode));
  };

  const saveGrade = async () => {
    if (!editing) return;
    const raw = parseGradeInputToRaw100(gradeValue, gradingSystem, scaleMode);
    if (raw === null) {
      showToast({ type: "error", message: `Некоректна оцінка. ${gradingSystemInputHint(gradingSystem, false)}` });
      return;
    }
    if (editing.column.isSemester && !canUseSemesterGrades) {
      showToast({ type: "error", message: `Семестрову не можна виставити: спочатку потрібні тематичні для всіх тем (${missingThematics.length} ще немає).` });
      return;
    }
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
      } else if (editing.column.isSemester) {
        if (!editing.grade?.gradeId) throw new Error("Спочатку перерахуйте семестрові оцінки в журналі.");
        await updateSemesterGrade(Number(classId), editing.grade.gradeId, raw);
      } else if (editing.column.isSummary) {
        if (!editing.grade?.gradeId) throw new Error("Спочатку створіть тематичну колонку в журналі.");
        await updateSummaryGrade(Number(classId), editing.grade.gradeId, raw);
      } else if (editing.grade?.gradeId) {
        await updateGrade(editing.grade.gradeId, { total: raw });
      } else {
        await createManualGrade(editing.column.taskId, editing.student.studentId, { total: raw });
      }
      setEditing(null);
      setGradeValue("");
      if (!preview()) await load();
      showToast({ type: "success", message: "Оцінку збережено." });
    } catch (caught) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(caught, "Не вдалося зберегти оцінку.") });
    } finally {
      setSaving(false);
    }
  };

  const addThematic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!thematicTopicId) return;
    setBusyAction(true);
    try {
      if (preview()) {
        const topic = topics.find((item) => item.id === Number(thematicTopicId));
        setData((old) => old ? { ...old, lessons: [...old.lessons, { id: Date.now(), title: `Тематична · ${topic?.title || "тема"}`, type: "SUMMARY", tasks: [], parentId: topic?.id, parentTitle: topic?.title }] } : old);
      } else {
        await createSummaryGrade(Number(classId), { name: "THEMATIC", topicId: Number(thematicTopicId) });
        await load();
      }
      setThematicOpen(false);
      setThematicTopicId("");
      showToast({ type: "success", message: "Тематичну додано до журналу." });
    } catch (caught) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(caught, "Не вдалося створити тематичну.") });
    } finally {
      setBusyAction(false);
    }
  };

  const recomputeSemester = async () => {
    if (!canUseSemesterGrades) {
      showToast({ type: "error", message: `Семестрові заблоковано: створіть тематичні для всіх тем (${missingThematics.length} ще немає).` });
      return;
    }
    setBusyAction(true);
    try {
      if (!preview()) {
        await recomputeSemesterGrades(Number(classId));
        await load();
      }
      showToast({ type: "success", message: "Семестрові оновлено в журналі." });
    } catch (caught) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(caught, "Не вдалося перерахувати семестрові.") });
    } finally {
      setBusyAction(false);
    }
  };

  const attendanceSummary = attendanceStatuses.reduce((summary, status) => ({
    ...summary,
    [status]: students.filter((student) => (attendanceMap[student.studentId] || "PRESENT") === status).length,
  }), {} as Record<AttendanceStatus, number>);

  const markAllPresent = () => {
    setAttendanceMap(Object.fromEntries(students.map((student) => [student.studentId, "PRESENT"] as const)));
  };

  const saveAttendance = async () => {
    if (!classId) return;
    setAttendanceSaving(true);
    try {
      const entries = students.map((student) => ({ studentId: student.studentId, status: attendanceMap[student.studentId] || ("PRESENT" as AttendanceStatus) }));
      if (!preview()) await setAttendance(Number(classId), attendanceDate, entries);
      showToast({ type: "success", message: "Відвідуваність збережено в журналі." });
    } catch (caught) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(caught, "Не вдалося зберегти відвідуваність.") });
    } finally {
      setAttendanceSaving(false);
    }
  };

  return (
    <div className={root}>
      <Header
        classId={classId}
        title="Журнал класу"
        text="Оцінки, тематичні, семестрові та присутність — в одному журналі класу, без дублювання окремими розділами."
        actions={
          <>
            <button type="button" onClick={() => navigate(`/edu/classes/${classId}`)} className="inline-flex items-center gap-2 rounded-xl border border-[#19291d]/12 px-4 py-3 text-sm font-bold dark:border-white/10"><Settings2 className="size-4" />Налаштування класу</button>
            <button type="button" onClick={() => setThematicOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]"><Plus className="size-4" />Тематична</button>
            <button type="button" disabled={busyAction || !canUseSemesterGrades} onClick={() => void recomputeSemester()} className="inline-flex items-center gap-2 rounded-xl border border-[#19291d]/12 px-4 py-3 text-sm font-bold text-[#304138] disabled:opacity-55 dark:border-white/10 dark:text-[#dce7df]"><Calculator className="size-4" />Семестрові</button>
          </>
        }
      />

      {error && <div className="mb-5 rounded-2xl bg-[#ff6b9d]/10 px-4 py-3 text-sm text-[#c4436b]" role="alert">{error}</div>}
      {!data ? (
        <div className="h-80 animate-pulse rounded-[28px] bg-[#e8eeea] dark:bg-white/[.05]" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_.8fr]">
            <div className={`rounded-[24px] border px-5 py-4 text-sm font-bold ${canUseSemesterGrades ? "border-[#00d978]/20 bg-[#e8f8ee] text-[#16623d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "border-[#ff8c00]/25 bg-[#fff1dc] text-[#8b5300] dark:bg-[#ff8c00]/12 dark:text-[#ffca7e]"}`}>
              {canUseSemesterGrades
                ? "Журнал строгий: тематичні колонки готові, семестрові можна перераховувати."
                : `Семестрові заблоковано: бракує тематичних колонок для ${missingThematics.length} тем.`}
            </div>
            <div className="rounded-[24px] border border-[#19291d]/10 bg-white px-5 py-4 text-sm dark:border-white/10 dark:bg-[#111b14]">
              <div className="text-xs font-bold uppercase tracking-[.14em] text-[#718075] dark:text-[#a6b4a9]">Система оцінювання класу</div>
              <div className="mt-1 text-lg font-bold">{gradingSystemLabel(gradingSystem, false)}</div>
              <div className="mt-1 text-xs text-[#718075] dark:text-[#a6b4a9]">Введення: {gradingSystemInputHint(gradingSystem, false)}</div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric icon={UsersRound} value={students.length} label="учнів" tone="green" />
            <Metric icon={BarChart3} value={columns.length} label="колонок у журналі" tone="orange" />
            <Metric icon={GraduationCap} value={columns.filter((item) => item.isSummary || item.isSemester).length} label="підсумкових колонок" tone="yellow" />
          </div>

          <section className="mb-4 rounded-[28px] border border-[#19291d]/10 bg-white p-5 shadow-[0_18px_50px_rgba(12,36,20,.04)] dark:border-white/[.09] dark:bg-[#111b14]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf6ee] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]"><CalendarDays className="size-5" /></span>
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]">Присутність у журналі</p><h2 className="mt-1 text-lg font-bold">Відмітки за обрану дату</h2><p className="mt-1 text-sm text-[#718075] dark:text-[#a6b4a9]">П, З, В або У зберігаються разом з оцінками класу.</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} className="rounded-xl border border-[#19291d]/12 bg-[#f8fbf8] px-3 py-2.5 text-sm font-bold outline-none dark:border-white/10 dark:bg-[#0d1510]" aria-label="Дата відвідуваності" />
                <button type="button" onClick={markAllPresent} className="rounded-xl border border-[#19291d]/12 px-3 py-2.5 text-sm font-bold text-[#38493e] dark:border-white/10 dark:text-[#dce7df]">Усі присутні</button>
                <button type="button" onClick={() => void saveAttendance()} disabled={attendanceSaving} className="inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-3 py-2.5 text-sm font-bold text-[#062211] disabled:opacity-55"><Save className="size-4" />{attendanceSaving ? "Зберігаємо…" : "Зберегти"}</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{attendanceStatuses.map((status) => <span key={status} className={`rounded-full px-3 py-1.5 text-xs font-bold ${attendanceTone[status]}`}>{attendanceLabel[status]} · {attendanceSummary[status]}</span>)}</div>
          </section>

          <div className="overflow-x-auto rounded-[28px] border border-[#19291d]/10 bg-white shadow-[0_18px_50px_rgba(12,36,20,.05)] dark:border-white/[.09] dark:bg-[#111b14]">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-[#19291d]/10 dark:border-white/[.08]">
                  <th className="sticky left-0 z-20 min-w-56 bg-white px-5 py-4 text-left text-xs font-bold uppercase tracking-[.13em] text-[#718075] dark:bg-[#111b14]">Учень</th>
                  <th className="min-w-52 px-3 py-4 text-left align-bottom"><div className="text-xs font-bold text-[#26362c] dark:text-[#e4ede7]">Присутність</div><div className="mt-1 text-[11px] font-medium text-[#718075] dark:text-[#a6b4a9]">{attendanceDate}</div></th>
                  {columns.map((column) => <th key={column.id} className="min-w-40 px-3 py-4 text-left align-bottom"><div className="text-xs font-bold text-[#26362c] dark:text-[#e4ede7]">{column.title}</div><div className="mt-1 text-[11px] font-medium text-[#718075] dark:text-[#a6b4a9]">{column.subtitle}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.studentId} className="border-b border-[#19291d]/8 last:border-0 dark:border-white/[.06]">
                  <td className="sticky left-0 z-10 bg-white px-5 py-4 text-sm font-bold dark:bg-[#111b14]">{student.studentName}</td>
                    <td className="px-3 py-3 align-middle"><div className="flex min-w-[210px] flex-wrap gap-1">{attendanceStatuses.map((status) => { const active = (attendanceMap[student.studentId] || "PRESENT") === status; return <button type="button" key={status} title={attendanceLabel[status]} aria-pressed={active} onClick={() => setAttendanceMap((old) => ({ ...old, [student.studentId]: status }))} className={`rounded-lg px-2.5 py-2 text-xs font-extrabold transition ${active ? attendanceTone[status] : "text-[#75847a] hover:bg-[#edf2ed] dark:text-[#a6b4a9] dark:hover:bg-white/[.06]"}`}>{attendanceShort[status]}</button>; })}</div></td>
                    {columns.map((column) => {
                      const grade = findGrade(student, column);
                      return <td key={column.id} className="px-3 py-3"><button type="button" onClick={() => openEditor(student, column)} className={`inline-flex min-h-11 min-w-12 items-center justify-center rounded-xl px-3 text-sm font-extrabold transition hover:-translate-y-0.5 hover:ring-4 hover:ring-[#00ff88]/15 ${gradeTone(grade?.grade)}`}>{grade?.grade == null ? "—" : formatGradeForSystem(grade.grade, gradingSystem, scaleMode)}</button></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <div data-material="grade-dialog-scrim" className="fixed inset-0 z-[80] flex items-end justify-center bg-[#071009]/45 p-4 backdrop-blur-sm sm:items-center" role="presentation">
          <section role="dialog" aria-modal="true" aria-label="Редагування оцінки" tabIndex={-1} className="w-full max-w-md rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#142018]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]">Оцінка</p><h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">{editing.student.studentName}</h2><p className="mt-1 text-sm text-[#718075] dark:text-[#a6b4a9]">{editing.column.title}</p></div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Закрити редагування оцінки" className="rounded-xl bg-[#edf1ed] p-2 text-[#526157] dark:bg-white/[.08] dark:text-[#c0cdc2]"><X className="size-4" aria-hidden="true" /></button>
            </div>
 <label htmlFor="teacher-grade-value" className="sr-only">Оцінка</label><input id="teacher-grade-value" name="gradeValue" inputMode="decimal" value={gradeValue} onChange={(event) => setGradeValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveGrade(); }} className="mt-6 w-full rounded-2xl border border-[#19291d]/12 bg-[#f8fbf8] px-4 py-4 text-center text-3xl font-bold outline-none ring-[#00ff88]/25 focus:ring-4 dark:border-white/10 dark:bg-[#0d1510]" placeholder={gradingSystemInputHint(gradingSystem, false)} />
            <div className="mt-4 grid grid-cols-5 gap-2">{quickGrades.map((value) => <button key={value} type="button" onClick={() => setGradeValue(value)} className="rounded-xl bg-[#f0f4f0] px-3 py-2 text-sm font-bold dark:bg-white/[.06]">{value}</button>)}</div>
            <div className="mt-6 flex gap-2"><button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-xl px-4 py-3 font-bold">Скасувати</button><button type="button" disabled={saving || !gradeValue.trim()} onClick={() => void saveGrade()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3 font-bold text-[#062211] disabled:opacity-55"><Save className="size-4" />Зберегти</button></div>
          </section>
        </div>
      )}

      {thematicOpen && (
        <div data-material="grade-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/45 p-4 backdrop-blur-sm" role="presentation">
          <form role="dialog" aria-modal="true" aria-label="Додати тематичну оцінку" tabIndex={-1} onSubmit={addThematic} className="w-full max-w-md rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#142018]">
            <h2 className="text-2xl font-bold tracking-[-.04em]">Додати тематичну в журнал</h2>
            <p className="mt-2 text-sm leading-6 text-[#6d7c71] dark:text-[#a2b1a6]">Оберіть тему, і колонка зʼявиться в цьому журналі поруч з іншими оцінками.</p>
            <select required value={thematicTopicId} onChange={(event) => setThematicTopicId(event.target.value)} className="mt-5 w-full rounded-xl border border-[#19291d]/12 px-4 py-3 dark:border-white/10 dark:bg-[#0d1510]"><option value="">Оберіть тему</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select>
            <div className="mt-5 flex gap-2"><button type="button" onClick={() => setThematicOpen(false)} className="flex-1 rounded-xl px-4 py-3 font-bold">Скасувати</button><button type="submit" disabled={busyAction || !thematicTopicId} className="flex-1 rounded-xl bg-[#00d978] px-4 py-3 font-bold text-[#062211] disabled:opacity-55">Додати</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export const SummaryGradesWorkspace: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = React.useState<SummaryGradeGroup[]>([]);
  const [gradebook, setGradebook] = React.useState<GradebookResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const gradingSystem = normalizeGradingSystem(gradebook?.gradingSystem || DEFAULT_GRADING_SYSTEM);
  const scaleMode = normalizeScaleMode(gradebook?.gradeScaleMode);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (preview()) {
          setGradebook(demoGradebook);
          setGroups([{ name: "Рядки", grades: [{ id: 1, studentId: 1, studentName: "Марія Коваль", grade: 92, createdAt: new Date().toISOString() }] }]);
          return;
        }
        const [grades, book] = await Promise.all([getSummaryGrades(Number(classId)), getClassGradebook(Number(classId))]);
        if (alive) {
          setGroups(grades);
          setGradebook(book);
        }
      } catch (caught) {
        if (alive) setError(getErrorMessageFromUnknown(caught, "Не вдалося завантажити підсумки."));
      }
    })();
    return () => { alive = false; };
  }, [classId]);

  const remove = async (id: number) => {
    if (!window.confirm("Видалити цей підсумок?")) return;
    if (preview()) {
      setGroups((old) => old.map((item) => ({ ...item, grades: item.grades.filter((grade) => grade.id !== id) })));
      return;
    }
    try {
      await deleteSummaryGrade(Number(classId), id);
      setGroups((old) => old.map((item) => ({ ...item, grades: item.grades.filter((grade) => grade.id !== id) })));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося видалити підсумок."));
    }
  };

  return (
    <div className={root}>
      <Header
        classId={classId}
        title="Підсумкові оцінки"
        text="Це архів і перегляд. Створення тематичних та семестрових перенесено в журнал класу, щоб оцінювання не дублювалось."
        actions={<button type="button" onClick={() => navigate(`/edu/classes/${classId}/gradebook${preview() ? "?preview=true" : ""}`)} className="inline-flex items-center gap-2 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]">Відкрити журнал <ChevronRight className="size-4" /></button>}
      />
      {error && <div className="mb-5 rounded-2xl bg-[#ff6b9d]/10 px-4 py-3 text-sm text-[#c4436b]" role="alert">{error}</div>}
      <div className="mb-5 rounded-[24px] border border-[#19291d]/10 bg-white px-5 py-4 text-sm dark:border-white/10 dark:bg-[#111b14]">
        <div className="text-xs font-bold uppercase tracking-[.14em] text-[#718075] dark:text-[#a6b4a9]">Система оцінювання класу</div>
        <div className="mt-1 text-lg font-bold">{gradingSystemLabel(gradingSystem, false)}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.name} className="rounded-[26px] border border-[#19291d]/10 bg-white p-6 dark:border-white/[.09] dark:bg-[#111b14]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.13em] text-[#ff8c00]">тематичний зріз</p><h2 className="mt-2 text-xl font-bold">{group.name}</h2></div>
              <button type="button" disabled={!group.grades[0]} onClick={() => group.grades[0] && void remove(group.grades[0].id)} aria-label={`Видалити оцінку ${group.name}`} className="rounded-xl bg-[#fff0f4] p-2 text-[#c4436b] disabled:opacity-40 dark:bg-[#ff6b9d]/10 dark:text-[#ff9abd]"><Trash2 className="size-4" aria-hidden="true" /></button>
            </div>
            <div className="mt-5 space-y-2">
              {(group.grades || []).map((grade) => <div key={grade.id} className="flex items-center justify-between rounded-xl bg-[#f5f8f5] px-3 py-2.5 text-sm dark:bg-white/[.045]"><span>{grade.studentName || `Учень #${grade.studentId}`}</span><b className="text-[#16834d] dark:text-[#72edb0]">{formatGradeForSystem(grade.grade, gradingSystem, scaleMode)}</b></div>)}
              {!group.grades?.length && <p className="rounded-xl bg-[#f5f8f5] p-3 text-sm text-[#718075] dark:bg-white/[.045] dark:text-[#a6b4a9]">Оцінки ще не додані.</p>}
            </div>
          </section>
        ))}
        {!groups.length && <div className="rounded-[26px] border border-dashed border-[#19291d]/15 bg-white px-5 py-16 text-center text-sm text-[#718075] dark:border-white/10 dark:bg-[#111b14] dark:text-[#a7b5aa]">Підсумкових оцінок ще немає. Додайте тематичну у журналі.</div>}
      </div>
    </div>
  );
};

const Metric: React.FC<{ icon: React.ComponentType<{ className?: string }>; value: React.ReactNode; label: string; tone: "green" | "orange" | "yellow" }> = ({ icon: Icon, value, label, tone }) => (
  <div className={`rounded-2xl p-4 ${tone === "green" ? "bg-[#e8f6ed] dark:bg-[#00ff88]/10" : tone === "orange" ? "bg-[#fff5df] dark:bg-[#ff8c00]/10" : "bg-[#fff8d5] dark:bg-[#ffd93d]/10"}`}>
    <Icon className={`size-5 ${tone === "green" ? "text-[#16834d] dark:text-[#72edb0]" : tone === "orange" ? "text-[#b66a00] dark:text-[#ffb760]" : "text-[#9c7400] dark:text-[#ffe780]"}`} />
    <b className="mt-4 block text-xl">{value}</b>
    <span className="text-sm text-[#627166] dark:text-[#aab8ad]">{label}</span>
  </div>
);
