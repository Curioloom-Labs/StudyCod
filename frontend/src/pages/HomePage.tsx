import React, { useEffect, useMemo, useState, startTransition } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Logo } from "../components/Logo";
import type { User, Task } from "../types";
import { FileText, GraduationCap, BookOpen, Users, TrendingUp, Clock } from "lucide-react";
import { listTasks } from "../lib/api/tasks";
import { getClasses, getStudentLessons, getStudentGrades, type Class, type Lesson, type Grade, type SummaryGrade } from "../lib/api/edu";
import { isDeadlineExpired } from "../utils/timezone";
interface Props {
  user: User;
  onNavigate: (page: "tasks" | "grades" | "profile" | "teacher" | "student") => void;
}
export const HomePage: React.FC<Props> = ({
  user,
  onNavigate
}) => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isEducational = user.userMode === "EDUCATIONAL";
  const isStudent = !!user.studentId;
  const isTeacher = isEducational && !isStudent;
  const [lastTask, setLastTask] = useState<Task | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentLessons, setStudentLessons] = useState<Lesson[]>([]);
  const [studentGrades, setStudentGrades] = useState<Grade[]>([]);
  const [studentSummaryGrades, setStudentSummaryGrades] = useState<SummaryGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAverageBreakdown, setShowAverageBreakdown] = useState(false);
  useEffect(() => {
    if (!isEducational && !isStudent && !isTeacher) {
      listTasks().then(tasks => {
        setAllTasks(tasks);
        if (tasks.length) setLastTask(tasks[0]);
      });
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
          const hasActiveTask = lesson.tasks.some((task: any) => {
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
        const hasActiveTask = lesson.tasks.some((task: any) => {
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
      for (const task of (l.tasks || []) as any[]) {
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
    const controlTotals = (studentSummaryGrades || []).filter((sg: any) => sg && sg.assessmentType === "CONTROL").filter((sg: any) => sg.controlWorkId && controlIds.has(sg.controlWorkId)).map((sg: any) => ({
      grade: sg.grade,
      label: sg.controlWorkTitle || sg.name || tr("Контрольна", "Control work")
    })).filter((x: any) => typeof x.grade === "number" && x.grade > 0) as Array<{
      grade: number;
      label: string;
    }>;
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
  return <div className="flex items-center justify-center bg-bg-base p-6">
            <div className="max-w-2xl w-full space-y-6">
                {}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <Logo size={48} />
                        <h1 className="text-2xl font-mono text-text-primary">
                            StudyCod {isEducational ? "EDU" : ""}
                        </h1>
                    </div>
                    <p className="text-sm font-mono text-text-secondary">
                        {t('hello')}, {user.username}
                    </p>
                </div>

                {}
                {isTeacher && !loading && <div className="grid grid-cols-2 gap-4">
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
                {isStudent && !loading && <div className="grid grid-cols-2 gap-4">
                        {averageGrade !== null && <Card className="p-4 cursor-pointer hover:bg-bg-hover transition-fast" onClick={() => setShowAverageBreakdown(true)} title={tr("Показати, з яких оцінок рахується середній бал", "Show which grades are included in the average")}>
                                <TrendingUp className="w-5 h-5 text-primary" />
                                <p className="text-xs">{tr("Середній бал", "Average grade")}</p>
                                <p className="text-xl">{averageGrade.toFixed(1)}</p>
                            </Card>}
                        <Card className="p-4">
                            <Clock className="w-5 h-5 text-primary" />
                            <p className="text-xs">{tr("Активних уроків", "Active lessons")}</p>
                            <p className="text-xl">{activeLessons}</p>
                        </Card>
                    </div>}

                {}
                {isStudent && recentGrades.length > 0 && <Card className="p-4">
                        <h3 className="text-sm mb-3">{tr("Останні оцінки", "Recent grades")}</h3>
                        {recentGrades.filter(g => g.task || g.topicTask).map(g => <div key={g.id} className="flex justify-between text-sm">
                                    <span>
                                        {g.task?.title || g.topicTask?.title || tr("Невідоме завдання", "Unknown task")}
                                    </span>
                                    <span>{g.total}/12</span>
                                </div>)}
                    </Card>}

                {}
                {isStudent && averageGrade !== null && <Modal open={showAverageBreakdown} onClose={() => setShowAverageBreakdown(false)} title={tr("Середній бал — розрахунок", "Average grade — calculation")}>
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
                                                    <div className="text-right font-mono text-text-primary">{it.grade}/12</div>
                                                </div>)}
                                    </div>
                                </div>}
                        </div>
                    </Modal>}

                {}
                {!isEducational && !isStudent && !isTeacher && allTasks.length > 0 && <Card className="p-4">
                        <h3 className="text-sm font-mono text-text-primary mb-3">{tr("Мої завдання", "My tasks")}</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {allTasks.map(task => <div key={task.id} onClick={() => {
            sessionStorage.setItem("openTaskId", task.id.toString());
            startTransition(() => {
              onNavigate("tasks");
            });
          }} className="p-3 border border-border hover:border-primary/50 hover:bg-bg-hover transition-fast cursor-pointer rounded">
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
                                </div>)}
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
export default HomePage;