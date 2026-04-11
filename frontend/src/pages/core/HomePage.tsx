import React, { useEffect, useMemo, useState, startTransition } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Logo } from "../../components/Logo";
import type { User, Task } from "../../types";
import { ArrowRight, FileText, GraduationCap, BookOpen, Users, TrendingUp, Clock as ClockIcon } from "lucide-react";
import { listTasks } from "../../lib/api/tasks";
import { getClasses, getStudentLessons, getStudentGrades, type Class, type Lesson, type Grade, type SummaryGrade } from "../../lib/api/edu";
import { isDeadlineExpired } from "../../utils/timezone";
import { useUIMode } from "../../components/interface/UIModeProvider";
import type { ResumeState } from "../../lib/resumeState";
import { isResumableSession, loadResumeState, resolveResumeRoute } from "../../lib/resumeState";
interface Props {
  user: User;
  onNavigate: (page: "home" | "tasks" | "grades" | "profile" | "teacher" | "student" | "admin") => void;
  suppressFocusAutoResume?: boolean;
}
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
  const [resume, setResume] = useState<ResumeState | null>(() => loadResumeState(user.id));
  const [lastTask, setLastTask] = useState<Task | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
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
        .finally(() => setLoading(false));
    } else if (isTeacher) {
      setLoading(true);
      getClasses().then(setClasses).finally(() => setLoading(false));
    } else if (isStudent && user.studentId) {
      setLoading(true);
      Promise.all([getStudentLessons(), getStudentGrades(user.studentId)]).then(([lessons, gradesData]) => {
        setStudentLessons(lessons);
        setStudentGrades(gradesData.grades || []);
        setStudentSummaryGrades(gradesData.summaryGrades || []);
      }).finally(() => setLoading(false));
    }
  }, [isEducational, isStudent, isTeacher, user.studentId]);
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
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div className="border border-border bg-bg-surface overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="p-5 md:p-6 border-b lg:border-b-0 lg:border-r border-border">
                <div className="text-xs font-mono font-medium tracking-[0.04em] uppercase text-text-secondary">{tr("Далі", "Next")}</div>
                <div className="mt-2 text-lg font-mono font-semibold text-text-primary leading-[1.35]" title={nextTitle}>
                  {loading ? tr("Завантаження…", "Loading…") : nextTitle}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-mono text-text-muted">
                  <span>{eta}</span>
                  <span className="text-border">•</span>
                  <span>{tr("Сесія", "Session")}: {resumeTitle}</span>
                  {resumeMeta ? <><span className="text-border">•</span><span>{tr("Оновлено", "Updated")}: {resumeMeta}</span></> : null}
                </div>

                <div className="mt-5">
                  <button
                    onClick={openNext}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-mono border border-primary bg-primary/10 text-primary hover:bg-primary/15 transition-fast disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {tr("Відкрити", "Open")}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                  <div className="text-xs font-mono font-medium tracking-[0.04em] uppercase text-text-secondary">{queueTitle}</div>
                  <button
                    onClick={openNext}
                    className="text-xs font-mono font-medium border border-border px-2 py-1 hover:bg-bg-hover transition-fast"
                  >
                    {tr("Відкрити далі", "Open next")}
                  </button>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {queueBody}
                </div>
              </div>
            </div>
          </div>

          <div className={`grid gap-3 ${isStudent && (!hasControlInAverage || averageGrade === null) ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
            <div className="border border-border bg-bg-surface px-3 py-2.5">
              <div className="text-[11px] font-mono text-text-secondary">{tr("Роль", "Role")}</div>
              <div className="mt-1 text-sm font-mono text-text-primary truncate">
                {user.role === "SYSTEM_ADMIN" ? "Admin" : isTeacher ? tr("Вчитель", "Teacher") : isStudent ? tr("Учень", "Student") : tr("Персональний", "Personal")}
              </div>
            </div>

            <div className="border border-border bg-bg-surface px-3 py-2.5">
              <div className="text-[11px] font-mono text-text-secondary">{tr("Активне", "Active")}</div>
              <div className="mt-1 text-sm font-mono text-text-primary">
                {!isEducational ? allTasks.length : isTeacher ? classes.length : activeLessons}
              </div>
            </div>

            <div className="border border-border bg-bg-surface px-3 py-2.5">
              <div className="text-[11px] font-mono text-text-secondary">{tr("Остання сесія", "Last session")}</div>
              <div className="mt-1 text-sm font-mono text-text-primary truncate">{resumeMeta ?? tr("щойно", "just now")}</div>
            </div>

            {!(isStudent && (!hasControlInAverage || averageGrade === null)) ? (
              <div className="border border-border bg-bg-surface px-3 py-2.5">
                <div className="text-[11px] font-mono text-text-secondary">{tr("Середній бал", "Average")}</div>
                <div className="mt-1 text-sm font-mono text-text-primary">{averageGrade !== null ? averageGrade.toFixed(1) : "—"}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return <div className="w-full bg-bg-base px-4 py-6 md:px-8 md:py-10">
            <div className="max-w-5xl w-full mx-auto space-y-8">
                {}
                <div className="mb-2 md:mb-4">
                    <div className="flex items-center gap-3 mb-3">
                        <Logo size={48} />
                        <h1 className="text-2xl font-mono text-text-primary">
                            StudyCod {isEducational ? "EDU" : ""}
                        </h1>
                    </div>
                    <p className="text-base text-text-secondary leading-[1.65]">
                        {t('hello')}, {user.username}
                    </p>
                </div>

                {}
                {isTeacher && !loading && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="p-4">
                            <Users className="w-5 h-5 text-primary" />
                            <p className="text-xs">{t("classesCount")}</p>
                            <p className="text-xl">{classes.length}</p>
                        </Card>
                        <Card className="p-4">
                            <GraduationCap className="w-5 h-5 text-primary" />
                            <p className="text-xs">{t("studentsCount")}</p>
                            <p className="text-xl">{totalStudents}</p>
                        </Card>
                    </div>}

                {}
                {isStudent && !loading && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {averageGrade !== null && hasControlInAverage && <Card className="p-4 cursor-pointer hover:bg-bg-hover transition-fast" onClick={() => setShowAverageBreakdown(true)} title={tr("Показати, з яких оцінок рахується середній бал", "Show which grades are included in the average")}>
                                <TrendingUp className="w-5 h-5 text-primary" />
                                <p className="text-xs">{tr("Середній бал", "Average grade")}</p>
                                <p className="text-xl">{averageGrade.toFixed(1)}</p>
                            </Card>}
                        <Card className="p-4">
                      <ClockIcon className="w-5 h-5 text-primary" />
                            <p className="text-xs">{tr("Активних уроків", "Active lessons")}</p>
                            <p className="text-xl">{activeLessons}</p>
                        </Card>
                    </div>}

                {}
                {isStudent && recentGrades.length > 0 && <Card className="p-4 space-y-2">
                        <h3 className="text-sm mb-3">{tr("Останні оцінки", "Recent grades")}</h3>
                        {recentGrades.filter(g => g.task || g.topicTask).map(g => <div key={g.id} className="flex justify-between text-sm py-1 border-b border-border/60 last:border-b-0">
                                    <span>
                                        {g.task?.title || g.topicTask?.title || tr("Невідоме завдання", "Unknown task")}
                                    </span>
                                    <span>{g.total}/100</span>
                                </div>)}
                    </Card>}

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
                {!isEducational && !isStudent && !isTeacher && allTasks.length > 0 && <Card className="p-4">
                        <h3 className="text-sm font-mono text-text-primary mb-3">{tr("Мої завдання", "My tasks")}</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {allTasks.map(task => <button type="button" key={task.id} onClick={() => {
            sessionStorage.setItem("openTaskId", task.id.toString());
            startTransition(() => {
              onNavigate("tasks");
            });
          }} className="w-full p-3 text-left border border-border hover:border-primary/50 hover:bg-bg-hover transition-fast rounded">
                                    <div className="flex items-center justify-between mb-1">
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
                                </button>)}
                        </div>
                    </Card>}

                {}
                <div className="flex justify-center">
                {isStudent ? <Button onClick={() => startTransition(() => onNavigate("student"))}>
                        <BookOpen className="w-5 h-5" /> {t("myJournal")}
                    </Button> : isTeacher || isEducational ? <Button onClick={() => startTransition(() => onNavigate("teacher"))}>
                        <GraduationCap className="w-5 h-5" /> {t("myClasses")}
                    </Button> : <Button onClick={() => startTransition(() => onNavigate("tasks"))}>
                        <FileText className="w-5 h-5" /> {tr("Продовжити навчання", "Continue learning")}
                    </Button>}
                </div>
            </div>
        </div>;
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
    return <div className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Немає завдань у черзі.", "No tasks in the queue.")}</div>;
  }

  return (
    <div>
      {tasks.slice(0, 20).map(task => (
        <button
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
    return <div className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Немає уроків.", "No lessons yet.")}</div>;
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
          <button
            key={lesson.id}
            onClick={() => onOpen(lesson)}
            className="w-full px-4 py-3 text-left border-b border-border hover:bg-bg-hover transition-fast"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-mono text-text-primary truncate">{lesson.title}</div>
                <div className="text-[11px] font-mono text-text-muted mt-0.5">
                  {lesson.deadline
                    ? `${trLocal("Дедлайн", "Deadline")}: ${new Date(lesson.deadline).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}`
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
    return <div className="px-4 py-4 text-sm font-mono text-text-secondary">{trLocal("Поки що немає класів.", "No classes yet.")}</div>;
  }

  return (
    <div>
      {classes.slice(0, 20).map(cls => (
        <button
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
