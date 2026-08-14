import React, { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { animate, motion, useReducedMotion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Logo } from "../../components/Logo";
import type { User, Task } from "../../types";
import { ArrowRight, FileText, GraduationCap, BookOpen, Users, TrendingUp, Clock as ClockIcon, CheckCircle2, TimerReset, Layers3, Gauge, Sparkles } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { showToast } from "../../lib/toast";

const CountUp: React.FC<{ value: number; decimals?: number; suffix?: string; className?: string }> = ({ value, decimals = 0, suffix = "", className }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = value.toFixed(decimals) + suffix;
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = v.toFixed(decimals) + suffix;
      },
    });
    return () => controls.stop();
  }, [value, decimals, suffix, reduce]);
  return <span ref={ref} className={className}>{value.toFixed(decimals) + suffix}</span>;
};
import { listTasks } from "../../lib/api/tasks";
import { getClasses, getStudentLessons, getStudentGrades, type Class, type Lesson, type Grade, type SummaryGrade } from "../../lib/api/edu";
import { formatDeadlineForDisplay, isDeadlineExpired } from "../../utils/timezone";
import { useUIMode } from "../../components/interface/UIModeProvider";
import type { ResumeState } from "../../lib/resumeState";
import { isResumableSession, loadResumeState, resolveResumeRoute } from "../../lib/resumeState";
import { PremiumDashboard } from "./PremiumPersonalExperience";
interface Props {
  user: User;
  onNavigate: (page: "home" | "tasks" | "grades" | "profile" | "teacher" | "student" | "admin") => void;
  suppressFocusAutoResume?: boolean;
}

const PREVIEW_TASKS: Task[] = [
  { id: -11, title: "Колекції та зрізи", subtitle: "Збери невеликий аналізатор витрат із list і dictionary.", topicTitle: "Python · колекції", descriptionMarkdown: "", starterCode: "", userCode: "", status: "OPEN", lessonInTopic: 3, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-10T09:30:00.000Z", language: "PYTHON" },
  { id: -12, title: "Функції з характером", subtitle: "", topicTitle: "Python · функції", descriptionMarkdown: "", starterCode: "", userCode: "", status: "GRADED", lessonInTopic: 2, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-09T12:00:00.000Z", language: "PYTHON" },
  { id: -13, title: "Пошук у тексті", subtitle: "", topicTitle: "Python · рядки", descriptionMarkdown: "", starterCode: "", userCode: "", status: "SUBMITTED", lessonInTopic: 4, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-08T16:45:00.000Z", language: "PYTHON" },
  { id: -14, title: "Маленька система бронювання", subtitle: "", topicTitle: "Практика", descriptionMarkdown: "", starterCode: "", userCode: "", status: "OPEN", lessonInTopic: 5, repeatAttempt: 0, kind: "CONTROL", createdAt: "2026-07-07T14:10:00.000Z", language: "PYTHON" },
];

export const HomePage: React.FC<Props> = ({
  user,
  onNavigate,
  suppressFocusAutoResume = false
}) => {
  const {
    t,
    i18n
  } = useTranslation();
  const navigate = useNavigate();
  const ui = useUIMode();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = !!user.studentId;
  const isTeacher = isEducational && !isStudent;
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
  const [resume, setResume] = useState<ResumeState | null>(() => loadResumeState(user.id));
  const [lastTask, setLastTask] = useState<Task | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>(() => isDesignPreview ? PREVIEW_TASKS : []);
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentLessons, setStudentLessons] = useState<Lesson[]>([]);
  const [studentGrades, setStudentGrades] = useState<Grade[]>([]);
  const [studentSummaryGrades, setStudentSummaryGrades] = useState<SummaryGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAverageBreakdown, setShowAverageBreakdown] = useState(false);

  useEffect(() => {
    setResume(loadResumeState(user.id));
  }, [user.id]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const next = e.detail as ResumeState | undefined;
      if (!next) return;
      if (next.userId !== user.id) return;
      setResume(next);
    };
    window.addEventListener("studycod:resumeState", handler as EventListener);
    return () => window.removeEventListener("studycod:resumeState", handler as EventListener);
  }, [user.id]);
  useEffect(() => {
    if (!isEducational) {
      setLoading(true);
      listTasks()
        .then(tasks => {
          setAllTasks(tasks);
          if (tasks.length) setLastTask(tasks[0]);
        })
        .catch(() => {
          showToast({ type: "error", message: "Не вдалося завантажити практику." });
          if (isDesignPreview) {
            setAllTasks(PREVIEW_TASKS);
            setLastTask(PREVIEW_TASKS[0]);
          }
        })
        .finally(() => setLoading(false));
    } else if (isTeacher) {
      setLoading(true);
      getClasses().then(setClasses).catch(() => showToast({ type: "error", message: "Не вдалося завантажити класи." })).finally(() => setLoading(false));
    } else if (isStudent && user.studentId) {
      setLoading(true);
      Promise.all([getStudentLessons(), getStudentGrades(user.studentId)]).then(([lessons, gradesData]) => {
        setStudentLessons(lessons);
        setStudentGrades(gradesData.grades || []);
        setStudentSummaryGrades(gradesData.summaryGrades || []);
      }).catch(() => showToast({ type: "error", message: "Не вдалося завантажити навчальний прогрес." })).finally(() => setLoading(false));
    }
  }, [isEducational, isStudent, isTeacher, user.studentId, isDesignPreview]);
  const totalStudents = classes.reduce((sum, cls) => sum + cls.studentsCount, 0);
  const activeLessons = useMemo(() => {
    if (!studentLessons.length) return 0;
    const gradesByLesson = new Map<number, Grade[]>();
    studentGrades.forEach(g => {
      const id = g.task?.lesson?.id ?? g.topicTask?.topicId;
      if (!id) return;
      if (!gradesByLesson.has(id)) gradesByLesson.set(id, []);
      gradesByLesson.get(id)!.push(g);
    });
    return studentLessons.filter(lesson => {
      if (lesson.deadline && isDeadlineExpired(lesson.deadline)) {
        if (lesson.tasks && lesson.tasks.length > 0) {
          const hasActiveTask = lesson.tasks.some((task) => {
            return !task.deadline || !isDeadlineExpired(task.deadline);
          });
          if (!hasActiveTask) {
            return false;
          }
        } else {
          return false;
        }
      }
      if (lesson.tasks && lesson.tasks.length > 0) {
        const hasActiveTask = lesson.tasks.some((task) => {
          return !task.deadline || !isDeadlineExpired(task.deadline);
        });
        if (!hasActiveTask) {
          return false;
        }
      }
      const grades = gradesByLesson.get(lesson.id) || [];
      return grades.length < lesson.tasksCount || grades.some(g => g.total < 6);
    }).length;
  }, [studentLessons, studentGrades]);
  const recentGrades = [...studentGrades].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);
  const averageGradeData = useMemo(() => {
    const items: Array<{
      label: string;
      grade: number;
      kind: "PRACTICE" | "CONTROL";
    }> = [];
    for (const l of studentLessons) {
      if (l.type !== "TOPIC") continue;
      for (const task of l.tasks || []) {
        const total = task?.grade?.total;
        if (typeof total === "number" && total > 0) {
          items.push({
            kind: "PRACTICE",
            grade: total,
            label: `${l.title} — ${task.title}`
          });
        }
      }
    }
    const controlIds = new Set(studentLessons.filter(l => l.type === "CONTROL").map(l => l.id));
    const controlTotals = (studentSummaryGrades || [])
      .filter((sg) => sg.assessmentType === "CONTROL")
      .filter((sg) => typeof sg.controlWorkId === "number" && controlIds.has(sg.controlWorkId))
      .map((sg) => ({
        grade: sg.grade,
        label: sg.controlWorkTitle || sg.name || tr("Контрольна", "Control work")
      }))
      .filter((x): x is { grade: number; label: string } => typeof x.grade === "number" && x.grade > 0);
    for (const cw of controlTotals) {
      items.push({
        kind: "CONTROL",
        grade: cw.grade,
        label: cw.label
      });
    }
    if (!items.length) return {
      average: null as number | null,
      items
    };
    const avg = items.reduce((s, it) => s + it.grade, 0) / items.length;
    return {
      average: Math.round(avg * 10) / 10,
      items
    };
  }, [studentLessons, studentSummaryGrades]);
  const averageGrade = averageGradeData.average;
  const hasControlInAverage = useMemo(() => {
    return averageGradeData.items.some((it) => it.kind === "CONTROL");
  }, [averageGradeData.items]);
  const personalStats = useMemo(() => {
    const total = allTasks.length;
    const done = allTasks.filter(task => task.status === "GRADED").length;
    const review = allTasks.filter(task => task.status === "SUBMITTED").length;
    const open = Math.max(0, total - done - review);
    const progress = total > 0 ? Math.round(done / total * 100) : 0;
    return { total, done, review, open, progress };
  }, [allTasks]);
  const openResume = () => {
    const r = resolveResumeRoute(user, resume);
    if (r.type === "path") {
      navigate(r.path);
      return;
    }
    if (r.type === "appPage") {
      if (r.extras?.openTaskId) {
        sessionStorage.setItem("openTaskId", String(r.extras.openTaskId));
      }
      startTransition(() => onNavigate(r.page));
      return;
    }

    // no resume: fallback
    if (!isEducational) {
      startTransition(() => onNavigate("tasks"));
    } else if (isStudent) {
      navigate("/edu/lessons");
    } else if (isTeacher) {
      startTransition(() => onNavigate("teacher"));
    }
  };

  const resumeTitle = useMemo(() => {
    if (user.role === "SYSTEM_ADMIN") return "Admin";
    if (!resume) {
      if (!isEducational) return lastTask?.title ?? tr("Почати", "Start");
      if (isTeacher) return tr("Ваші класи", "Your classes");
      return tr("Уроки", "Lessons");
    }
    if (resume.kind === "personal_task" && typeof resume.taskId === "number") {
      const hit = allTasks.find(t => t.id === resume.taskId);
      return hit?.title ?? tr(`Завдання #${resume.taskId}`, `Task #${resume.taskId}`);
    }
    if (resume.kind === "edu_task" && typeof resume.taskId === "number") {
      // We might not have task title available here; keep it lightweight.
      return tr(`EDU завдання #${resume.taskId}`, `EDU task #${resume.taskId}`);
    }
    if (resume.kind === "edu_lesson" && typeof resume.lessonId === "number") {
      const hit = studentLessons.find(l => l.id === resume.lessonId);
      return hit?.title ?? tr(`Урок #${resume.lessonId}`, `Lesson #${resume.lessonId}`);
    }
    if (resume.kind === "teacher_home") return tr("Ваші класи", "Your classes");
    if (resume.kind === "admin_home") return "Admin";
    return tr("Продовжити", "Continue");
  }, [resume, user.role, isEducational, isTeacher, isStudent, allTasks, lastTask?.title, studentLessons]);

  const resumeMeta = useMemo(() => {
    if (!resume) return null;
    const mins = Math.max(0, Math.floor((Date.now() - resume.updatedAt) / 60000));
    if (mins < 1) return tr("щойно", "just now");
    if (mins < 60) return tr(`${mins} хв тому`, `${mins}m ago`);
    const hours = Math.floor(mins / 60);
    if (hours < 24) return tr(`${hours} год тому`, `${hours}h ago`);
    const days = Math.floor(hours / 24);
    return tr(`${days} дн тому`, `${days}d ago`);
  }, [resume, i18n.language]);
  const sessionLabel = resumeMeta
    ? tr(`Остання активність ${resumeMeta}`, `Last activity ${resumeMeta}`)
    : tr("Готово до нової сесії", "Ready for a new session");

  const focusResumeActive = useMemo(() => {
    if (ui.mode !== "focus") return false;
    if (suppressFocusAutoResume) return false;
    return isResumableSession(user, resume);
  }, [ui.mode, user, resume, suppressFocusAutoResume]);

  // Focus must behave like reopening a document: if a resumable session exists,
  // immediately restore it (no intermediate entry screens).
  useEffect(() => {
    if (ui.mode !== "focus") return;
    if (suppressFocusAutoResume) return;
    if (!isResumableSession(user, resume)) return;

    const r = resolveResumeRoute(user, resume);
    if (r.type === "path") {
      navigate(r.path, { replace: true });
      return;
    }
    if (r.type === "appPage") {
      if (r.page === "home") return;
      if (r.extras?.openTaskId) {
        sessionStorage.setItem("openTaskId", String(r.extras.openTaskId));
      }
      startTransition(() => onNavigate(r.page));
    }
  }, [ui.mode, user, resume, navigate, onNavigate, suppressFocusAutoResume]);

  const nextStudentLesson = useMemo(() => {
    if (!isEducational || !isStudent) return null;
    if (!studentLessons.length) return null;

    const hasActiveTasks = (lesson: Lesson) => {
      const tasks = lesson.tasks || [];
      if (!tasks.length) return false;
      return tasks.some(task => !task.deadline || !isDeadlineExpired(task.deadline));
    };

    const isActionable = (lesson: Lesson) => {
      if (lesson.deadline && isDeadlineExpired(lesson.deadline)) {
        // If the lesson is past deadline but it still has active tasks, keep it actionable.
        return hasActiveTasks(lesson);
      }
      return hasActiveTasks(lesson);
    };

    return studentLessons.find(isActionable) ?? studentLessons[0] ?? null;
  }, [isEducational, isStudent, studentLessons]);

  // Personal learning now has its own calm, product-first workspace instead of
  // inheriting the old terminal home. Educational dashboards keep their
  // specialised flows below.
  if (!isEducational) {
    return <PremiumDashboard
      user={user}
      tasks={allTasks}
      loading={loading}
      onNavigate={onNavigate}
      onOpenTask={(task) => {
        sessionStorage.setItem("openTaskId", String(task.id));
        startTransition(() => onNavigate("tasks"));
      }}
    />;
  }

  if (ui.mode === "focus") {
    if (focusResumeActive) {
      // Avoid flashing an entry screen; navigation is handled in the effect above.
      return null;
    }

    const nextTitle = !isEducational
      ? (lastTask?.title ?? tr("Завдання", "Task"))
      : isTeacher
        ? (classes[0]?.name ?? tr("Клас", "Class"))
        : (nextStudentLesson?.title ?? tr("Урок", "Lesson"));

    const eta = !isEducational
      ? tr("≈ 25 хв", "≈ 25 min")
      : isTeacher
        ? tr("≈ 10 хв", "≈ 10 min")
        : tr("≈ 45 хв", "≈ 45 min");

    const openNext = () => {
      if (!isEducational) {
        if (lastTask?.id) {
          sessionStorage.setItem("openTaskId", String(lastTask.id));
        }
        startTransition(() => onNavigate("tasks"));
        return;
      }
      if (isTeacher) {
        startTransition(() => onNavigate("teacher"));
        return;
      }
      if (nextStudentLesson?.id) {
        navigate(`/edu/lessons/${nextStudentLesson.id}`);
        return;
      }
      navigate("/edu/lessons");
    };

    const queueTitle = !isEducational
      ? tr("Черга завдань", "Task queue")
      : isTeacher
        ? tr("Ваші класи", "Your classes")
        : tr("Черга уроків", "Lesson queue");

    const queueBody = !isEducational
      ? (
        <QueueTasks
          tasks={allTasks}
          loading={loading}
          onOpen={task => {
            sessionStorage.setItem("openTaskId", String(task.id));
            startTransition(() => onNavigate("tasks"));
          }}
        />
      )
      : isTeacher
        ? (
          <QueueClasses
            classes={classes}
            loading={loading}
            onOpen={() => startTransition(() => onNavigate("teacher"))}
          />
        )
        : (
          <QueueLessons
            lessons={studentLessons}
            loading={loading}
            onOpen={lesson => navigate(`/edu/lessons/${lesson.id}`)}
          />
        );

    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-mono font-medium uppercase tracking-[0.04em] text-primary">
                <Sparkles className="w-3.5 h-3.5" />
                {tr("Momentum home", "Momentum home")}
              </div>
              <h1 className="mt-3 text-2xl md:text-3xl font-mono font-semibold text-text-primary">
                {tr("Привіт", "Hello")}, {user.username}
              </h1>
              <p className="mt-1 text-sm font-mono text-text-secondary">{sessionLabel}</p>
            </div>
            <button type="button"
              onClick={openResume}
              className="inline-flex items-center justify-center gap-2 border border-border bg-bg-surface px-4 py-2 text-sm font-mono text-text-primary hover:border-primary/60 hover:bg-bg-hover transition-fast"
            >
              {tr("Продовжити останнє", "Resume last")}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="border border-border bg-bg-surface overflow-hidden">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <div className="p-5 md:p-7 border-b xl:border-b-0 xl:border-r border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-mono font-medium tracking-[0.04em] uppercase text-text-secondary">{tr("Наступний крок", "Next step")}</div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
                    <TimerReset className="w-3.5 h-3.5" />
                    {eta}
                  </div>
                </div>
                <div className="mt-4 text-xl md:text-2xl font-mono font-semibold text-text-primary leading-[1.3]" title={nextTitle}>
                  {loading ? tr("Завантаження…", "Loading…") : nextTitle}
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                  {!isEducational
                    ? tr("Відкрий задачу, продовж код і перевір рішення без зайвої навігації.", "Open a task, keep coding, and check the solution without extra navigation.")
                    : isTeacher
                      ? tr("Швидкий вхід у класи, перевірки та навчальний потік.", "Fast access to classes, reviews, and teaching flow.")
                      : tr("Повернись до уроку або контрольної з мінімумом зайвих кроків.", "Return to a lesson or control work with minimal friction.")}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button type="button"
                    onClick={openNext}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-mono border border-primary bg-primary text-bg-base hover:opacity-90 transition-fast disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {tr("Відкрити далі", "Open next")}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button"
                    onClick={openResume}
                    className="px-4 py-2 text-sm font-mono border border-border bg-bg-base text-text-secondary hover:text-text-primary hover:border-primary/50 transition-fast inline-flex items-center gap-2"
                  >
                    {tr("Остання сесія", "Last session")}
                  </button>
                </div>
              </div>

              <div>
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                  <div className="text-xs font-mono font-medium tracking-[0.04em] uppercase text-text-secondary">{queueTitle}</div>
                  <div className="text-[11px] font-mono text-text-muted">{tr("до 20 елементів", "up to 20 items")}</div>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {queueBody}
                </div>
              </div>
            </div>
          </div>

          <div className={`grid gap-3 ${isStudent && (!hasControlInAverage || averageGrade === null) ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
            <MetricTile icon={Gauge} label={tr("Роль", "Role")} value={user.role === "SYSTEM_ADMIN" ? "Admin" : user.role === "SUPPORT" ? tr("Підтримка", "Support") : isTeacher ? tr("Вчитель", "Teacher") : isStudent ? tr("Учень", "Student") : tr("Personal", "Personal")} />
            <MetricTile icon={Layers3} label={tr("Активне", "Active")} value={!isEducational ? String(personalStats.open) : isTeacher ? String(classes.length) : String(activeLessons)} />
            <MetricTile icon={CheckCircle2} label={tr("Готово", "Done")} value={!isEducational ? `${personalStats.done}/${personalStats.total || 0}` : resumeMeta ?? tr("щойно", "just now")} />
            {!(isStudent && (!hasControlInAverage || averageGrade === null)) ? (
              <MetricTile icon={TrendingUp} label={isStudent ? tr("Середній бал", "Average") : tr("Прогрес", "Progress")} value={isStudent && averageGrade !== null ? averageGrade.toFixed(1) : `${personalStats.progress}%`} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (ui.mode === "aurora") {
    // Progress as a single sentence (no stat tiles), with one 1px meter.
    const progressMeter = !isEducational
      ? personalStats.progress
      : isStudent && averageGrade !== null
        ? Math.round(averageGrade)
        : null;

    const progressLine = !isEducational
      ? `${personalStats.done}/${personalStats.total || 0} ${tr("розвʼязано", "solved")} · ${personalStats.progress}%`
      : isTeacher
        ? `${classes.length} ${tr("класів", "classes")} · ${totalStudents} ${tr("учнів", "students")}`
        : averageGrade !== null
          ? `${tr("Середній бал", "Average")} ${averageGrade.toFixed(1)} · ${activeLessons} ${tr("активних", "active")}`
          : `${activeLessons} ${tr("активних уроків", "active lessons")}`;

    const dateFmt = (d: string) => new Date(d).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA");

    // One uniform stream. The first row is "continue" — same shape as the rest.
    type StreamItem = { key: string; lead: string; title: string; meta: string; onClick: () => void };
    const stream: StreamItem[] = [{
      key: "resume",
      lead: tr("зараз", "now"),
      title: `${tr("Продовжити", "Continue")} — ${resumeTitle}`,
      meta: sessionLabel,
      onClick: openResume
    }];
    if (!isEducational) {
      allTasks.slice(0, 12).forEach((task) => stream.push({
        key: `t-${task.id}`,
        lead: "",
        title: task.title,
        meta: `${task.status === "GRADED" ? tr("Оцінено", "Graded") : task.status === "SUBMITTED" ? tr("Очікує", "Pending") : tr("Відкрите", "Open")} · ${dateFmt(task.createdAt)}`,
        onClick: () => { sessionStorage.setItem("openTaskId", String(task.id)); startTransition(() => onNavigate("tasks")); }
      }));
    } else if (isTeacher) {
      classes.slice(0, 12).forEach((cls) => stream.push({
        key: `c-${cls.id}`,
        lead: "",
        title: cls.name,
        meta: `${tr("Учнів", "Students")}: ${cls.studentsCount}`,
        onClick: () => startTransition(() => onNavigate("teacher"))
      }));
    } else {
      recentGrades.filter((g) => g.task || g.topicTask).forEach((g) => stream.push({
        key: `g-${g.id}`,
        lead: String(g.total),
        title: g.task?.title || g.topicTask?.title || tr("Завдання", "Task"),
        meta: dateFmt(g.createdAt),
        onClick: () => navigate(`/edu/grades/${g.id}`)
      }));
    }

    // Zones as plain inline text links — not a nav bar, not a quick-action grid.
    const zoneLinks: Array<{ label: string; onClick: () => void }> = !isEducational
      ? [
          { label: tr("Завдання", "Tasks"), onClick: () => startTransition(() => onNavigate("tasks")) },
          { label: tr("Оцінки", "Grades"), onClick: () => startTransition(() => onNavigate("grades")) },
          { label: tr("Бібліотека", "Library"), onClick: () => navigate("/library") },
          { label: tr("Контести", "Contests"), onClick: () => navigate("/contests") },
          { label: tr("Пісочниця", "Playground"), onClick: () => navigate("/playground") }
        ]
      : isTeacher
        ? [
            { label: tr("Класи", "Classes"), onClick: () => startTransition(() => onNavigate("teacher")) },
            { label: tr("Бібліотека", "Library"), onClick: () => navigate("/edu/library") },
            { label: tr("Контести", "Contests"), onClick: () => navigate("/contests") }
          ]
        : [
            { label: tr("Журнал", "Journal"), onClick: () => startTransition(() => onNavigate("student")) },
            { label: tr("Уроки", "Lessons"), onClick: () => navigate("/edu/lessons") },
            { label: tr("Бібліотека", "Library"), onClick: () => navigate("/edu/library") },
            { label: tr("Контести", "Contests"), onClick: () => navigate("/contests") }
          ];

    return (
      <div className="w-full">
        <div className="mx-auto w-full max-w-[640px] px-5 sm:px-6 pt-16 md:pt-24 pb-12">
          <h1 className="text-xl font-medium tracking-[-0.01em] text-text-primary">
            {tr("Привіт", "Hi")}, {user.username}
          </h1>
          <p className="mt-1 text-[13px] font-mono text-text-muted">{loading ? tr("Завантаження…", "Loading…") : progressLine}</p>
          {progressMeter !== null ? (
            <div className="mt-3 h-px w-full bg-bg-hover overflow-hidden" aria-hidden="true">
              <div className="h-px bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, progressMeter))}%` }} />
            </div>
          ) : null}

          <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]" aria-label={tr("Розділи", "Sections")}>
            {zoneLinks.map((z) => (
              <button key={z.label} type="button" onClick={z.onClick} className="text-text-secondary hover:text-primary underline-offset-4 hover:underline transition-fast focus-visible:outline-none focus-visible:text-primary">
                {z.label}
              </button>
            ))}
          </nav>


          <div className="mt-9">
            {stream.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={it.onClick}
                className="group w-full text-left flex items-baseline gap-3 py-3.5 border-t border-border first:border-t-0 focus-visible:outline-none"
              >
                <span className="w-9 shrink-0 text-[11px] font-mono text-text-muted tabular-nums">{it.lead}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-[15px] text-text-primary group-hover:text-primary transition-fast">{it.title}</span>
                  {it.meta ? <span className="ml-2 text-[12px] font-mono text-text-muted">{it.meta}</span> : null}
                </span>
              </button>
            ))}
            {stream.length === 1 && !loading ? (
              <p className="py-3.5 border-t border-border text-[13px] text-text-muted">
                {!isEducational ? tr("Відкрий першу задачу — активність зʼявиться тут.", "Open your first task — activity will show here.")
                  : isTeacher ? tr("Створи клас, щоб почати.", "Create a class to get started.")
                  : tr("Виконані завдання та оцінки зʼявляться тут.", "Completed tasks and grades will appear here.")}
              </p>
            ) : null}
          </div>
        </div>

        {isStudent && averageGrade !== null && hasControlInAverage ? (
          <Modal open={showAverageBreakdown} onClose={() => setShowAverageBreakdown(false)} title={tr("Середній бал — розрахунок", "Average grade — calculation")}>
            <div className="p-6 space-y-4">
              <div className="text-sm text-text-secondary font-mono">
                {tr("Середній бал рахується як середнє по всіх оцінках > 0 у поточному класі (практика + контрольні).", "The average grade is calculated as the mean of all grades > 0 in the current class (practice + control works).")}
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    );
  }

  const primaryAction = () => {
    if (isStudent) {
      startTransition(() => onNavigate("student"));
    } else if (isTeacher || isEducational) {
      startTransition(() => onNavigate("teacher"));
    } else {
      startTransition(() => onNavigate("tasks"));
    }
  };

  const quickActions: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; sub: string; onClick: () => void }> = isEducational
    ? [
        ...(isStudent
          ? [
              { icon: BookOpen, label: t("myJournal"), sub: tr("Уроки та оцінки", "Lessons & grades"), onClick: () => startTransition(() => onNavigate("student")) },
              { icon: ClockIcon, label: tr("Уроки", "Lessons"), sub: `${activeLessons} ${tr("активних", "active")}`, onClick: () => navigate("/edu/lessons") },
            ]
          : [
              { icon: GraduationCap, label: t("myClasses"), sub: `${classes.length} ${tr("класів", "classes")}`, onClick: () => startTransition(() => onNavigate("teacher")) },
              { icon: Users, label: t("studentsCount"), sub: `${totalStudents}`, onClick: () => startTransition(() => onNavigate("teacher")) },
            ]),
      ]
    : [
        { icon: FileText, label: tr("Завдання", "Tasks"), sub: `${personalStats.open} ${tr("відкрито", "open")}`, onClick: () => startTransition(() => onNavigate("tasks")) },
        { icon: TrendingUp, label: tr("Оцінки", "Grades"), sub: `${personalStats.done}/${personalStats.total || 0}`, onClick: () => startTransition(() => onNavigate("grades")) },
        { icon: Layers3, label: tr("Бібліотека", "Library"), sub: tr("Каталог задач", "Task catalog"), onClick: () => navigate("/library") },
        { icon: Gauge, label: tr("Пісочниця", "Playground"), sub: tr("Вільний код", "Free coding"), onClick: () => navigate("/playground") },
      ];

  return <div className="w-full bg-bg-base">
            <div className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto w-full">
                <motion.div variants={staggerContainer} initial="initial" animate="animate">
                    <motion.div variants={fadeUpItem} className="flex items-center gap-2 font-mono text-xs text-primary/70">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>// {isEducational ? "edu" : "home"}</span>
                    </motion.div>
                    <motion.div variants={fadeUpItem} className="mt-3 flex items-center gap-3">
                        <Logo size={44} />
                        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
                            StudyCod {isEducational ? "EDU" : ""}
                        </h1>
                    </motion.div>
                    <motion.p variants={fadeUpItem} className="mt-2 text-sm text-text-secondary">
                        {t('hello')}, <span className="text-text-primary font-medium">{user.username}</span> · {sessionLabel}
                    </motion.p>

                    <motion.div variants={fadeUpItem} className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
                        {isStudent ? (
                          <>
                            {averageGrade !== null && hasControlInAverage ? (
                              <button type="button" onClick={() => setShowAverageBreakdown(true)} title={tr("Показати, з яких оцінок рахується середній бал", "Show which grades are included in the average")} className="text-left group">
                                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Середній бал", "Average")}</div>
                                <div className="mt-1 text-3xl font-mono font-semibold text-text-primary group-hover:text-primary transition-fast"><CountUp value={averageGrade} decimals={1} /></div>
                              </button>
                            ) : null}
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Активних уроків", "Active lessons")}</div>
                              <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={activeLessons} /></div>
                            </div>
                          </>
                        ) : isTeacher ? (
                          <>
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{t("classesCount")}</div>
                              <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={classes.length} /></div>
                            </div>
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{t("studentsCount")}</div>
                              <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={totalStudents} /></div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Прогрес", "Progress")}</div>
                              <div className="mt-1 text-3xl font-mono font-semibold text-primary"><CountUp value={personalStats.progress} suffix="%" /></div>
                            </div>
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Виконано", "Done")}</div>
                              <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={personalStats.done} />/{personalStats.total || 0}</div>
                            </div>
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Відкрито", "Open")}</div>
                              <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={personalStats.open} /></div>
                            </div>
                          </>
                        )}
                    </motion.div>
                </motion.div>

                <div className="mt-6 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />
            </div>

            <div className="px-4 md:px-8 pb-12 max-w-6xl mx-auto w-full space-y-8">
                {}
                <motion.button
                  type="button"
                  onClick={openResume}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="group w-full text-left rounded-xl border border-primary/40 bg-bg-surface p-5 md:p-6 transition-fast hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 flex items-center justify-between gap-4"
                >
                    <div className="min-w-0">
                        <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-primary/80">{tr("Продовжити сесію", "Continue session")}</div>
                        <div className="mt-1.5 text-lg md:text-xl font-mono font-semibold text-text-primary truncate" title={resumeTitle}>
                            {loading ? tr("Завантаження…", "Loading…") : resumeTitle}
                        </div>
                        <div className="mt-1 text-xs font-mono text-text-secondary">{sessionLabel}</div>
                    </div>
                    <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-fast group-hover:translate-x-0.5">
                        <ArrowRight className="w-5 h-5" />
                    </div>
                </motion.button>

                {}
                <section className="space-y-4">
                    <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Швидкі дії", "Quick actions")}</div>
                    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {quickActions.map((action, idx) => (
                          <motion.button
                            key={idx}
                            variants={fadeUpItem}
                            type="button"
                            onClick={action.onClick}
                            className="group text-left rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
                          >
                            <action.icon className="w-5 h-5 text-primary transition-fast group-hover:scale-110" />
                            <div className="mt-3 text-sm font-mono text-text-primary truncate">{action.label}</div>
                            <div className="mt-0.5 text-[11px] font-mono text-text-secondary truncate">{action.sub}</div>
                          </motion.button>
                        ))}
                    </motion.div>
                </section>

                {}
                {isStudent && recentGrades.length > 0 && (
                  <section className="space-y-4">
                    <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Останні оцінки", "Recent grades")}</div>
                    <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.2 }} className="rounded-xl border border-border bg-bg-surface overflow-hidden">
                        {recentGrades.filter(g => g.task || g.topicTask).map(g => (
                          <motion.div key={g.id} variants={fadeUpItem} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-bg-hover transition-fast">
                            <span className="text-sm font-mono text-text-primary truncate">
                                {g.task?.title || g.topicTask?.title || tr("Невідоме завдання", "Unknown task")}
                            </span>
                            <span className="text-sm font-mono text-text-secondary shrink-0">{g.total}<span className="text-text-muted">/100</span></span>
                          </motion.div>
                        ))}
                    </motion.div>
                  </section>
                )}

                {}
                {isStudent && averageGrade !== null && hasControlInAverage && <Modal open={showAverageBreakdown} onClose={() => setShowAverageBreakdown(false)} title={tr("Середній бал — розрахунок", "Average grade — calculation")}>
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-text-secondary font-mono">
                                {tr("Середній бал рахується як середнє по всіх оцінках > 0 у поточному класі (практика + контрольні).", "The average grade is calculated as the mean of all grades > 0 in the current class (practice + control works).")}
                            </div>
                            <div className="flex items-center justify-between border border-border bg-bg-surface p-3">
                                <div className="text-sm font-mono text-text-secondary">{tr("Значення", "Value")}</div>
                                <div className="text-xl font-mono text-text-primary">{averageGrade.toFixed(1)}</div>
                            </div>

                            {averageGradeData.items.length === 0 ? <div className="text-sm text-text-secondary">{tr("Немає оцінок для розрахунку", "No grades to calculate")}</div> : <div className="border border-border">
                                    <div className="grid grid-cols-[1fr,90px] gap-2 p-3 border-b border-border bg-bg-surface text-xs font-mono text-text-secondary">
                                        <div>{t("grade")}</div>
                                        <div className="text-right">{tr("Бал", "Score")}</div>
                                    </div>
                                    <div className="max-h-[50vh] overflow-y-auto">
                                        {averageGradeData.items.slice().sort((a, b) => a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind.localeCompare(b.kind)).map((it, idx) => <div key={`${it.kind}-${idx}-${it.label}`} className="grid grid-cols-[1fr,90px] gap-2 p-3 border-b border-border text-sm">
                                                    <div className="text-text-primary">
                                                        <span className="text-xs text-text-muted mr-2">
                                                            {it.kind === "CONTROL" ? tr("Контрольна", "Control") : tr("Практика", "Practice")}
                                                        </span>
                                                        {it.label}
                                                    </div>
                                                    <div className="text-right font-mono text-text-primary">{it.grade}/100</div>
                                                </div>)}
                                    </div>
                                </div>}
                        </div>
                    </Modal>}

                {}
                {!isEducational && !isStudent && !isTeacher && allTasks.length > 0 && (
                  <section className="space-y-4">
                    <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Мої завдання", "My tasks")}</div>
                    <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.1 }} className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {allTasks.map(task => <motion.button variants={fadeUpItem} type="button" key={task.id} onClick={() => {
            sessionStorage.setItem("openTaskId", task.id.toString());
            startTransition(() => {
              onNavigate("tasks");
            });
          }} className="w-full p-4 text-left rounded-xl border border-border bg-bg-surface hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] transition-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60">
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                        <span className="text-sm font-mono text-text-primary truncate flex-1">
                                            {task.title}
                                        </span>
                                        <span className={`text-xs px-2 py-1 rounded ${task.status === "GRADED" ? "bg-accent-success/20 text-accent-success border border-accent-success/50" : task.status === "SUBMITTED" ? "bg-accent-warn/20 text-accent-warn border border-accent-warn/50" : "bg-bg-code text-text-secondary border border-border"}`}>
                                            {task.status === "GRADED" ? tr("✓ Оцінено", "✓ Graded") : task.status === "SUBMITTED" ? tr("… Очікує", "… Pending") : tr("○ Відкрито", "○ Open")}
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono text-text-muted">
                                        {new Date(task.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                                    </div>
                                </motion.button>)}
                    </motion.div>
                  </section>
                )}

                {}
                <div className="flex justify-center pt-2">
                {isStudent ? <Button onClick={primaryAction}>
                        <BookOpen className="w-5 h-5" /> {t("myJournal")}
                    </Button> : isTeacher || isEducational ? <Button onClick={primaryAction}>
                        <GraduationCap className="w-5 h-5" /> {t("myClasses")}
                    </Button> : <Button onClick={() => startTransition(() => onNavigate("tasks"))}>
                        <FileText className="w-5 h-5" /> {tr("Продовжити навчання", "Continue learning")}
                    </Button>}
                </div>
            </div>
        </div>;
};

const MetricTile: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => {
  return (
    <div className="border border-border bg-bg-surface px-3 py-3 min-h-[76px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-mono text-text-secondary truncate">{label}</div>
        <Icon className="w-4 h-4 text-primary shrink-0" />
      </div>
      <div className="mt-2 text-base font-mono text-text-primary truncate">{value}</div>
    </div>
  );
};

const QueueTasks: React.FC<{
  tasks: Task[];
  loading: boolean;
  onOpen: (t: Task) => void;
}> = ({ tasks, loading, onOpen }) => {
  const { i18n } = useTranslation();
  const trLocal = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);

  if (loading) {
    return <div className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Завантаження…", "Loading…")}</div>;
  }
  if (!tasks.length) {
    return <div role="status" className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Немає завдань у черзі.", "No tasks in the queue.")}</div>;
  }

  return (
    <div>
      {tasks.slice(0, 20).map(task => (
        <button type="button"
          key={task.id}
          onClick={() => onOpen(task)}
          className="w-full px-4 py-3 text-left border-b border-border hover:bg-bg-hover transition-fast"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-mono text-text-primary truncate">{task.title}</div>
              <div className="text-[11px] font-mono text-text-muted mt-0.5">
                {new Date(task.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
              </div>
            </div>
            <div className="text-[11px] font-mono text-text-secondary whitespace-nowrap">
              {task.status === "GRADED"
                ? trLocal("Оцінено", "Graded")
                : task.status === "SUBMITTED"
                  ? trLocal("Очікує", "Pending")
                  : trLocal("Відкрите", "Open")}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

const QueueLessons: React.FC<{
  lessons: Lesson[];
  loading: boolean;
  onOpen: (l: Lesson) => void;
}> = ({ lessons, loading, onOpen }) => {
  const { i18n } = useTranslation();
  const trLocal = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);

  if (loading) {
    return <div className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Завантаження…", "Loading…")}</div>;
  }
  if (!lessons.length) {
    return <div role="status" className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Немає уроків.", "No lessons yet.")}</div>;
  }

  const sorted = lessons
    .slice()
    .sort((a, b) => {
      const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return (a.id ?? 0) - (b.id ?? 0);
    })
    .slice(0, 20);

  return (
    <div>
      {sorted.map(lesson => {
        const expired = lesson.deadline ? isDeadlineExpired(lesson.deadline) : false;
        return (
          <button type="button"
            key={lesson.id}
            onClick={() => onOpen(lesson)}
            className="w-full px-4 py-3 text-left border-b border-border hover:bg-bg-hover transition-fast"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-mono text-text-primary truncate">{lesson.title}</div>
                <div className="text-[11px] font-mono text-text-muted mt-0.5">
                  {lesson.deadline
                    ? `${trLocal("Дедлайн", "Deadline")}: ${formatDeadlineForDisplay(lesson.deadline, lesson.deadlineTimezone || undefined, { dateStyle: "short", timeStyle: "short" })}`
                    : trLocal("Без дедлайну", "No deadline")}
                </div>
              </div>
              <div className={"text-[11px] font-mono whitespace-nowrap " + (expired ? "text-accent-warn" : "text-text-secondary")}>
                {expired ? trLocal("Дедлайн минув", "Expired") : trLocal("Активний", "Active")}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

const QueueClasses: React.FC<{
  classes: Class[];
  loading: boolean;
  onOpen: () => void;
}> = ({ classes, loading, onOpen }) => {
  const { i18n } = useTranslation();
  const trLocal = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);

  if (loading) {
    return <div className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Завантаження…", "Loading…")}</div>;
  }
  if (!classes.length) {
    return <div role="status" className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Поки що немає класів.", "No classes yet.")}</div>;
  }

  return (
    <div>
      {classes.slice(0, 20).map(cls => (
        <button type="button"
          key={cls.id}
          onClick={onOpen}
          className="w-full px-4 py-3 text-left border-b border-border hover:bg-bg-hover transition-fast"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-mono text-text-primary truncate">{cls.name}</div>
              <div className="text-[11px] font-mono text-text-muted mt-0.5">
                {trLocal("Учнів", "Students")}: {cls.studentsCount}
              </div>
            </div>
            <div className="text-[11px] font-mono text-text-secondary whitespace-nowrap">{trLocal("Відкрити", "Open")}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default HomePage;
