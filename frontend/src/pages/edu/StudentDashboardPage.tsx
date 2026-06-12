import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";
import {
  getStudentGrades,
  getMyStudentInfo,
  getStudentMasteryPath,
  getStudentSkillGraph,
  getStudentNextTaskRecommendation,
  type Grade,
  type SummaryGrade,
  type StudentMasteryPathResponse,
  type StudentSkillGraphResponse,
  type StudentNextTaskResponse,
  type MasteryStatus,
} from "../../lib/api/edu";
import { DEFAULT_GRADING_SYSTEM, formatGradeForSystem, getGradeToneForSystem, gradingSystemLabel, normalizeGradingSystem, type ClassGradingSystem } from "../../lib/gradingSystems";
import { FileText, BookOpen, MessageSquare, Sparkles, Target, GraduationCap, ArrowRight } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { Modal } from "../../components/ui/Modal";
import { MarkdownView } from "../../components/MarkdownView";
import type { User } from "../../types";
interface Props {
  user: User;
}
const getGradeColor = (grade: number | null | undefined, gradingSystem: ClassGradingSystem): string => {
  const tone = getGradeToneForSystem(grade, gradingSystem);
  if (tone === "success") return "text-accent-success";
  if (tone === "warn") return "text-accent-warn";
  if (tone === "warning") return "text-accent-warning";
  if (tone === "error") return "text-accent-error";
  return "text-text-muted";
};

const CountUp: React.FC<{ value: number; decimals?: number }> = ({ value, decimals = 0 }) => {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: latest => setDisplay(latest)
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</>;
};

// Animated horizontal score bar (visual only).
const ScoreBar: React.FC<{ percent: number; tone?: string }> = ({ percent, tone = "bg-primary" }) => {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
      <motion.div
        className={`h-full ${tone} rounded-full origin-left`}
        style={{ width: "100%" }}
        initial={reduce ? { scaleX: clamped / 100 } : { scaleX: 0 }}
        whileInView={{ scaleX: clamped / 100 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={reduce ? { duration: 0 } : { duration: 0.6, ease: easeOutQuint }}
      />
    </div>
  );
};

export const StudentDashboardPage: React.FC<Props> = ({
  user
}) => {
  const navigate = useNavigate();
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [summaryGrades, setSummaryGrades] = useState<SummaryGrade[]>([]);
  const [masteryPath, setMasteryPath] = useState<StudentMasteryPathResponse | null>(null);
  const [skillGraph, setSkillGraph] = useState<StudentSkillGraphResponse | null>(null);
  const [nextTaskRecommendation, setNextTaskRecommendation] = useState<StudentNextTaskResponse | null>(null);
  const [gradingSystem, setGradingSystem] = useState<ClassGradingSystem>(DEFAULT_GRADING_SYSTEM);
  const [loading, setLoading] = useState(true);
  const [showTheory, setShowTheory] = useState(false);
  const [theoryContent, setTheoryContent] = useState<{
    title: string;
    content: string;
  } | null>(null);
  useEffect(() => {
    loadGrades();
  }, []);

  const getMasteryStatusBadge = (status: MasteryStatus): string => {
    if (status === "MASTERED") return "text-accent-success border-accent-success/40 bg-accent-success/10";
    if (status === "IN_PROGRESS") return "text-accent-warning border-accent-warning/40 bg-accent-warning/10";
    return "text-text-muted border-border bg-bg-surface";
  };

  const getMasteryStatusLabel = (status: MasteryStatus): string => {
    if (status === "MASTERED") return tr("Опрацьовано", "Mastered");
    if (status === "IN_PROGRESS") return tr("В процесі", "In progress");
    return tr("Не розпочато", "Not started");
  };

  const getDifficultyLabel = (difficulty: "EASY" | "MEDIUM" | "HARD"): string => {
    if (difficulty === "EASY") return tr("Легкий", "Easy");
    if (difficulty === "MEDIUM") return tr("Середній", "Medium");
    return tr("Складний", "Hard");
  };

  const loadGrades = async () => {
    try {
      const studentInfo = await getMyStudentInfo();
      const data = await getStudentGrades(studentInfo.student.id);
      const uiLang = isEn ? "en" : "uk";

      const [masteryResult, graphResult, recommendationResult] = await Promise.allSettled([
        getStudentMasteryPath(uiLang),
        getStudentSkillGraph(uiLang),
        getStudentNextTaskRecommendation(uiLang)
      ]);

      const nextGradingSystem = normalizeGradingSystem(data.gradingSystem || studentInfo.student.class?.gradingSystem || DEFAULT_GRADING_SYSTEM);
      setGrades(data.grades || []);
      setSummaryGrades(data.summaryGrades || []);
      setGradingSystem(nextGradingSystem);

      setMasteryPath(masteryResult.status === "fulfilled" ? masteryResult.value : null);
      setSkillGraph(graphResult.status === "fulfilled" ? graphResult.value : null);
      setNextTaskRecommendation(recommendationResult.status === "fulfilled" ? recommendationResult.value : null);
    } catch (error) {
      console.error("Failed to load grades:", error);
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return <PageSkeleton variant="default" />;
  }
  const intermediateGrades = summaryGrades.filter(g => (g.assessmentType || "INTERMEDIATE") === "INTERMEDIATE");
  const controlGrades = summaryGrades.filter(g => g.assessmentType === "CONTROL");

  const taskGrades = grades.filter(grade => {
    if (!Boolean(grade.task || grade.topicTask)) return false;
    if (grade.task?.lesson?.type === "CONTROL") return false;
    if (grade.topicTask?.controlWorkId) return false;
    return true;
  });
  const avgTestPercent = (() => {
    const withTests = grades.filter(g => g.testsTotal > 0);
    if (withTests.length === 0) return 0;
    const sum = withTests.reduce((s, g) => s + (g.testsPassed / g.testsTotal) * 100, 0);
    return sum / withTests.length;
  })();

  return <div className="flex-1 min-h-0 overflow-y-auto bg-bg-base">
      {/* Hero */}
      <div className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto">
        <span className="font-mono text-xs text-primary/70">// journal</span>
        <div className="mt-2 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{t('myJournal')}</h1>
            <p className="mt-1.5 text-sm text-text-secondary">
              {tr("Ваші оцінки, прогрес та персональні рекомендації.", "Your grades, progress and personal recommendations.")}
              <span className="text-text-muted"> · {tr("Шкала", "Scale")}: {gradingSystemLabel(gradingSystem, !!isEn)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="ghost" onClick={() => navigate("/edu/appeals")}>
              <MessageSquare className="w-4 h-4 mr-2" />
              {tr("Апеляції", "Appeals")}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/edu/lessons")}>
              <BookOpen className="w-4 h-4 mr-2" />
              {t('lessons')}
            </Button>
          </div>
        </div>

        {/* Inline aggregate stats */}
        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          {masteryPath && (
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl md:text-3xl text-text-primary tabular-nums"><CountUp value={Math.round(masteryPath.summary.averageMasteryPercent)} />%</span>
              <span className="text-xs text-text-muted uppercase tracking-[0.08em] font-mono">{tr("Mastery", "Mastery")}</span>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl md:text-3xl text-text-primary tabular-nums"><CountUp value={taskGrades.length} /></span>
            <span className="text-xs text-text-muted uppercase tracking-[0.08em] font-mono">{tr("Завдань", "Tasks")}</span>
          </div>
          {avgTestPercent > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl md:text-3xl text-text-primary tabular-nums"><CountUp value={Math.round(avgTestPercent)} />%</span>
              <span className="text-xs text-text-muted uppercase tracking-[0.08em] font-mono">{tr("Тести", "Tests")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-8">
        {masteryPath && <section>
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4 flex items-center gap-2">
              <Target className="w-3.5 h-3.5" />
              {tr("Персональний шлях прогресу", "Personal progress path")}
            </h2>
            <Card className="p-5 space-y-5">
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-3">
                  <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Середній mastery", "Avg mastery")}</div>
                  <div className="text-xl font-mono text-text-primary mt-1 tabular-nums"><CountUp value={Math.round(masteryPath.summary.averageMasteryPercent)} />%</div>
                </motion.div>
                <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-3">
                  <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Опрацьовано", "Mastered")}</div>
                  <div className="text-xl font-mono text-accent-success mt-1 tabular-nums">{masteryPath.summary.masteredTopics}/{masteryPath.summary.topicsTotal}</div>
                </motion.div>
                <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-3">
                  <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("В процесі", "In progress")}</div>
                  <div className="text-xl font-mono text-accent-warning mt-1 tabular-nums">{masteryPath.summary.inProgressTopics}</div>
                </motion.div>
                <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-3">
                  <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Не розпочато", "Not started")}</div>
                  <div className="text-xl font-mono text-text-secondary mt-1 tabular-nums">{masteryPath.summary.notStartedTopics}</div>
                </motion.div>
              </motion.div>

              {nextTaskRecommendation?.recommendation && <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                  <div className="text-xs text-primary/80 font-mono uppercase tracking-[0.06em] mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {tr("Рекомендація: next best task", "Recommendation: next best task")}
                  </div>
                  <div className="text-sm font-mono text-text-primary">
                    {nextTaskRecommendation.recommendation.topicTitle} → {nextTaskRecommendation.recommendation.taskTitle}
                  </div>
                  <div className="text-xs text-text-muted mt-1">{nextTaskRecommendation.recommendation.reason}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="ghost" className="text-xs group" onClick={() => navigate(`/edu/tasks/${nextTaskRecommendation.recommendation?.taskId}`)}>
                      {tr("Відкрити завдання", "Open task")}
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                    <span className="text-[11px] text-text-muted px-2 py-1 rounded-full border border-border">
                      {tr("Оцінка складності", "Difficulty")}: {getDifficultyLabel(masteryPath.topics.find(topic => topic.topicId === nextTaskRecommendation.recommendation?.topicId)?.recommendedDifficulty || "MEDIUM")}
                    </span>
                  </div>
                </div>}

              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
                {masteryPath.topics.map(topic => <motion.div key={topic.topicId} variants={fadeUpItem} className="rounded-xl border border-border p-3.5 bg-bg-surface transition-fast hover:border-primary/40">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-text-primary">{topic.title}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getMasteryStatusBadge(topic.status)}`}>
                            {getMasteryStatusLabel(topic.status)}
                          </span>
                          <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-full border border-border">
                            {tr("Задач", "Tasks")}: {topic.completedTasks}/{topic.totalTasks}
                          </span>
                          <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-full border border-border">
                            {tr("Рівень", "Difficulty")}: {getDifficultyLabel(topic.recommendedDifficulty)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end shrink-0">
                        <div className="text-sm font-mono text-text-primary tabular-nums">{topic.masteryPercent}%</div>
                        {topic.nextTaskId && <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/tasks/${topic.nextTaskId}`)}>
                            {tr("Далі", "Next")}
                          </Button>}
                      </div>
                    </div>
                    <div className="mt-3">
                      <ScoreBar percent={topic.masteryPercent} />
                    </div>
                  </motion.div>)}
              </motion.div>

              {skillGraph && skillGraph.nodes.length > 0 && <div className="rounded-xl border border-border p-3.5 bg-bg-surface">
                  <div className="text-xs text-text-muted font-mono uppercase tracking-[0.06em] mb-2">
                    {tr("Skill graph (лінійний маршрут)", "Skill graph (linear path)")}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {skillGraph.nodes
                  .sort((a, b) => a.order - b.order)
                  .map((node, index) => <React.Fragment key={node.id}>
                        <span className={`px-2 py-1 rounded-full border ${getMasteryStatusBadge(node.status)}`} title={`${node.label}: ${node.masteryPercent}%`}>
                          {node.label}
                        </span>
                        {index < skillGraph.nodes.length - 1 && <span className="text-text-muted">→</span>}
                      </React.Fragment>)}
                  </div>
                </div>}
            </Card>
          </section>}

        {grades.length === 0 && summaryGrades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <p className="text-text-secondary">{t('noGradesYet')}</p>
          </div>
        ) : <div className="space-y-8">
            {intermediateGrades.length > 0 && <section>
                <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">{t('intermediateGrades')}</h2>
                <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
                  {intermediateGrades.map(summaryGrade => <motion.div key={summaryGrade.id} variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-text-secondary shrink-0" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {summaryGrade.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className={`text-2xl font-mono font-bold tabular-nums ${getGradeColor(summaryGrade.grade, gradingSystem)}`}>
                            {formatGradeForSystem(summaryGrade.grade, gradingSystem)}
                          </div>
                          <div className="text-xs text-text-muted">{gradingSystemLabel(gradingSystem, !!isEn)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                        <span>{new Date(summaryGrade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}</span>
                        {summaryGrade.topicTitle && <span>· {tr("Тема", "Topic")}: {summaryGrade.topicTitle}</span>}
                      </div>
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() => navigate(`/edu/appeals?new=1&targetType=SUMMARY_GRADE&targetId=${summaryGrade.id}`)}
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          {tr("Подати апеляцію", "Create appeal")}
                        </Button>
                      </div>
                    </motion.div>)}
                </motion.div>
              </section>}

            {controlGrades.length > 0 && <section>
                <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">{tr("Контрольні оцінки", "Control work grades")}</h2>
                <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
                  {controlGrades.map(summaryGrade => <motion.div key={summaryGrade.id} variants={fadeUpItem} className="rounded-xl border border-primary/40 bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {summaryGrade.controlWorkTitle || summaryGrade.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className={`text-2xl font-mono font-bold tabular-nums ${getGradeColor(summaryGrade.grade, gradingSystem)}`}>
                            {formatGradeForSystem(summaryGrade.grade, gradingSystem)}
                          </div>
                          <div className="text-xs text-text-muted">{gradingSystemLabel(gradingSystem, !!isEn)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                        <span>{new Date(summaryGrade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}</span>
                        {summaryGrade.topicTitle && <span>· {tr("Тема", "Topic")}: {summaryGrade.topicTitle}</span>}
                      </div>
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() => navigate(`/edu/appeals?new=1&targetType=SUMMARY_GRADE&targetId=${summaryGrade.id}`)}
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          {tr("Подати апеляцію", "Create appeal")}
                        </Button>
                      </div>
                    </motion.div>)}
                </motion.div>
              </section>}

            {grades.length > 0 && <section>
                <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">{tr("Оцінки за завдання", "Task grades")}</h2>
                <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
                  {taskGrades.map(grade => {
              const taskId = grade.task?.id ?? grade.topicTask?.id;
              const title = grade.task?.title ?? grade.topicTask?.title ?? tr("Без назви", "Untitled");
              const subtitle = grade.task?.lesson ? `${grade.task.lesson.title} • ${grade.task.lesson.type === "LESSON" ? t("lesson") : tr("Контрольна", "Control work")}` : grade.topicTask?.topicTitle ? `${tr("Тема", "Topic")}: ${grade.topicTask.topicTitle}` : null;
              const testPercent = grade.testsTotal > 0 ? (grade.testsPassed / grade.testsTotal) * 100 : 0;
              return <motion.div key={grade.id} variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-text-secondary shrink-0" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {title}
                            </h3>
                          </div>
                          {subtitle && <div className="text-sm text-text-secondary mb-2">
                              {subtitle}
                            </div>}

                          {grade.testsTotal > 0 && <div className="max-w-xs mb-3">
                              <ScoreBar percent={testPercent} tone={testPercent >= 100 ? "bg-accent-success" : "bg-primary"} />
                            </div>}

                          {taskId && <div className="flex flex-col sm:flex-row gap-2 mt-2">
                              <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/tasks/${taskId}`)}>
                                {tr("Переглянути завдання", "View task")}
                              </Button>
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={() => {
                                  navigate(`/edu/appeals?new=1&targetType=EDU_GRADE&targetId=${grade.id}`);
                                }}
                              >
                                <MessageSquare className="w-3 h-3 mr-1" />
                                {tr("Подати апеляцію", "Create appeal")}
                              </Button>
                              {grade.task?.lesson?.theory && <Button variant="ghost" className="text-xs" onClick={() => {
                        setTheoryContent({
                          title: grade.task?.title || tr("Теорія", "Theory"),
                          content: grade.task?.lesson?.theory || ""
                        });
                        setShowTheory(true);
                      }}>
                                  <FileText className="w-3 h-3 mr-1" /> {t("theory")}
                                </Button>}
                            </div>}
                          {grade.feedback && <div className="text-sm text-text-muted mt-3 p-3 bg-bg-base rounded-lg border border-border">
                              {grade.feedback}
                            </div>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className={`text-2xl font-mono font-bold tabular-nums ${getGradeColor(grade.total, gradingSystem)}`}>
                            {formatGradeForSystem(grade.total, gradingSystem)}
                          </div>
                          <div className="text-xs text-text-muted">{gradingSystemLabel(gradingSystem, !!isEn)}</div>
                          <div className="text-xs text-text-secondary tabular-nums">
                            {grade.testsPassed}/{grade.testsTotal} {t("tests")}
                          </div>
                          {grade.isManuallyGraded && <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-full border border-border">
                              {tr("Ручна оцінка", "Manual grade")}
                            </span>}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-text-muted">
                        {new Date(grade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                    </motion.div>;
            })}
                </motion.div>
              </section>}
          </div>}
      </div>

      {showTheory && theoryContent && <Modal open={showTheory} onClose={() => {
      setShowTheory(false);
      setTheoryContent(null);
    }} title={`${t("theory")}: ${theoryContent.title}`} showCloseButton={true}>
          <div className="max-w-4xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
            <div className="prose prose-invert max-w-none text-text-secondary font-mono">
              <MarkdownView content={theoryContent.content} />
            </div>
          </div>
        </Modal>}
    </div>;
};
