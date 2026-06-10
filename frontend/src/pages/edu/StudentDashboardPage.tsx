import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
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
import { DEFAULT_GRADE_SCALE_MODE, DEFAULT_GRADING_SYSTEM, formatGradeForSystem, getGradeToneForSystem, gradingSystemLabel, normalizeGradingSystem, normalizeScaleMode, type ClassGradingSystem, type GradeScaleMode } from "../../lib/gradingSystems";
import { FileText, BookOpen, MessageSquare } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { MarkdownView } from "../../components/MarkdownView";
import type { User } from "../../types";
interface Props {
  user: User;
}
const getGradeColor = (grade: number | null | undefined, gradingSystem: ClassGradingSystem, scaleMode: GradeScaleMode): string => {
  const tone = getGradeToneForSystem(grade, gradingSystem, scaleMode);
  if (tone === "success") return "text-accent-success";
  if (tone === "warn") return "text-accent-warn";
  if (tone === "warning") return "text-accent-warning";
  if (tone === "error") return "text-accent-error";
  return "text-text-muted";
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
  const [gradeScaleMode, setGradeScaleMode] = useState<GradeScaleMode>(DEFAULT_GRADE_SCALE_MODE);
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
      const nextScaleMode = normalizeScaleMode(data.gradeScaleMode ?? studentInfo.student.class?.gradeScaleMode);
      setGrades(data.grades || []);
      setSummaryGrades(data.summaryGrades || []);
      setGradingSystem(nextGradingSystem);
      setGradeScaleMode(nextScaleMode);

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
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }
  const intermediateGrades = summaryGrades.filter(g => (g.assessmentType || "INTERMEDIATE") === "INTERMEDIATE");
  const controlGrades = summaryGrades.filter(g => g.assessmentType === "CONTROL");
  return <div className="flex-1 min-h-0 p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-mono text-text-primary">{t('myJournal')}</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => {
            navigate("/edu/appeals");
          }}>
              <MessageSquare className="w-4 h-4 mr-2" />
              {tr("Апеляції", "Appeals")}
            </Button>
            <Button variant="ghost" onClick={() => {
            navigate("/edu/lessons");
          }}>
              <BookOpen className="w-4 h-4 mr-2" />
              {t('lessons')}
            </Button>
          </div>
        </div>
        <div className="mb-4 text-xs text-text-muted">
          {tr("Шкала", "Scale")}: {gradingSystemLabel(gradingSystem, !!isEn)}
        </div>

        {masteryPath && <div className="mb-6">
            <h2 className="text-lg font-mono text-text-primary mb-3">
              {tr("Персональний шлях прогресу", "Personal progress path")}
            </h2>
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-[11px] text-text-muted">{tr("Середній mastery", "Avg mastery")}</div>
                  <div className="text-lg font-mono text-text-primary">{Math.round(masteryPath.summary.averageMasteryPercent)}%</div>
                </div>
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-[11px] text-text-muted">{tr("Опрацьовано", "Mastered")}</div>
                  <div className="text-lg font-mono text-accent-success">{masteryPath.summary.masteredTopics}/{masteryPath.summary.topicsTotal}</div>
                </div>
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-[11px] text-text-muted">{tr("В процесі", "In progress")}</div>
                  <div className="text-lg font-mono text-accent-warning">{masteryPath.summary.inProgressTopics}</div>
                </div>
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-[11px] text-text-muted">{tr("Не розпочато", "Not started")}</div>
                  <div className="text-lg font-mono text-text-secondary">{masteryPath.summary.notStartedTopics}</div>
                </div>
              </div>

              {nextTaskRecommendation?.recommendation && <div className="border border-primary/40 bg-primary/5 p-3">
                  <div className="text-xs text-text-secondary mb-1">{tr("Рекомендація: next best task", "Recommendation: next best task")}</div>
                  <div className="text-sm font-mono text-text-primary">
                    {nextTaskRecommendation.recommendation.topicTitle} → {nextTaskRecommendation.recommendation.taskTitle}
                  </div>
                  <div className="text-xs text-text-muted mt-1">{nextTaskRecommendation.recommendation.reason}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/tasks/${nextTaskRecommendation.recommendation?.taskId}`)}>
                      {tr("Відкрити завдання", "Open task")}
                    </Button>
                    <span className="text-[11px] text-text-muted px-2 py-1 border border-border">
                      {tr("Оцінка складності", "Difficulty")}: {getDifficultyLabel(masteryPath.topics.find(topic => topic.topicId === nextTaskRecommendation.recommendation?.topicId)?.recommendedDifficulty || "MEDIUM")}
                    </span>
                  </div>
                </div>}

              <div className="space-y-2">
                {masteryPath.topics.map(topic => <div key={topic.topicId} className="border border-border p-3 bg-bg-surface">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-mono text-text-primary">{topic.title}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-[10px] px-2 py-1 border ${getMasteryStatusBadge(topic.status)}`}>
                            {getMasteryStatusLabel(topic.status)}
                          </span>
                          <span className="text-[10px] text-text-muted px-2 py-1 border border-border">
                            {tr("Задач", "Tasks")}: {topic.completedTasks}/{topic.totalTasks}
                          </span>
                          <span className="text-[10px] text-text-muted px-2 py-1 border border-border">
                            {tr("Рівень", "Difficulty")}: {getDifficultyLabel(topic.recommendedDifficulty)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <div className="text-sm font-mono text-text-primary">{topic.masteryPercent}%</div>
                        {topic.nextTaskId && <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/tasks/${topic.nextTaskId}`)}>
                            {tr("Далі", "Next")}
                          </Button>}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-bg-base border border-border overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{
                    width: `${Math.max(0, Math.min(100, topic.masteryPercent))}%`
                  }} />
                    </div>
                  </div>)}
              </div>

              {skillGraph && skillGraph.nodes.length > 0 && <div className="border border-border p-3 bg-bg-surface">
                  <div className="text-xs text-text-secondary mb-2">
                    {tr("Skill graph (лінійний маршрут)", "Skill graph (linear path)")}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {skillGraph.nodes
                  .sort((a, b) => a.order - b.order)
                  .map((node, index) => <React.Fragment key={node.id}>
                        <span className={`px-2 py-1 border ${getMasteryStatusBadge(node.status)}`} title={`${node.label}: ${node.masteryPercent}%`}>
                          {node.label}
                        </span>
                        {index < skillGraph.nodes.length - 1 && <span className="text-text-muted">→</span>}
                      </React.Fragment>)}
                  </div>
                </div>}
            </Card>
          </div>}

        {grades.length === 0 && summaryGrades.length === 0 ? <Card className="p-8 text-center">
            <p className="text-text-secondary">{t('noGradesYet')}</p>
          </Card> : <div className="space-y-6">
            {}
            {intermediateGrades.length > 0 && <div>
                <h2 className="text-lg font-mono text-text-primary mb-3">{t('intermediateGrades')}</h2>
                <div className="space-y-3">
                  {intermediateGrades.map(summaryGrade => <Card key={summaryGrade.id} className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-text-secondary" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {summaryGrade.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`text-2xl font-mono font-bold ${getGradeColor(summaryGrade.grade, gradingSystem, gradeScaleMode)}`}>
                            {formatGradeForSystem(summaryGrade.grade, gradingSystem, gradeScaleMode)}
                          </div>
                          <div className="text-xs text-text-muted">{gradingSystemLabel(gradingSystem, !!isEn)}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-text-muted">
                        {new Date(summaryGrade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                      {summaryGrade.topicTitle && <div className="mt-1 text-xs text-text-muted">
                          {tr("Тема", "Topic")}: {summaryGrade.topicTitle}
                        </div>}
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
                    </Card>)}
                </div>
              </div>}

            {}
            {controlGrades.length > 0 && <div>
                <h2 className="text-lg font-mono text-text-primary mb-3">{tr("Контрольні оцінки", "Control work grades")}</h2>
                <div className="space-y-3">
                  {controlGrades.map(summaryGrade => <Card key={summaryGrade.id} className="p-4 border-primary/40">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {summaryGrade.controlWorkTitle || summaryGrade.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`text-2xl font-mono font-bold ${getGradeColor(summaryGrade.grade, gradingSystem, gradeScaleMode)}`}>
                            {formatGradeForSystem(summaryGrade.grade, gradingSystem, gradeScaleMode)}
                          </div>
                          <div className="text-xs text-text-muted">{gradingSystemLabel(gradingSystem, !!isEn)}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-text-muted">
                        {new Date(summaryGrade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                      {summaryGrade.topicTitle && <div className="mt-1 text-xs text-text-muted">
                          {tr("Тема", "Topic")}: {summaryGrade.topicTitle}
                        </div>}
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
                    </Card>)}
                </div>
              </div>}

            {}
            {grades.length > 0 && <div>
                <h2 className="text-lg font-mono text-text-primary mb-3">{tr("Оцінки за завдання", "Task grades")}</h2>
                <div className="space-y-3">
                  {grades.filter(grade => {
              if (!Boolean(grade.task || grade.topicTask)) return false;
              if (grade.task?.lesson?.type === "CONTROL") return false;
              if (grade.topicTask?.controlWorkId) return false;
              return true;
            }).map(grade => {
              const taskId = grade.task?.id ?? grade.topicTask?.id;
              const title = grade.task?.title ?? grade.topicTask?.title ?? tr("Без назви", "Untitled");
              const subtitle = grade.task?.lesson ? `${grade.task.lesson.title} • ${grade.task.lesson.type === "LESSON" ? t("lesson") : tr("Контрольна", "Control work")}` : grade.topicTask?.topicTitle ? `${tr("Тема", "Topic")}: ${grade.topicTask.topicTitle}` : null;
              return <Card key={grade.id} className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-text-secondary" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {title}
                            </h3>
                          </div>
                          {subtitle && <div className="text-sm text-text-secondary mb-2">
                              {subtitle}
                            </div>}

                          {taskId && <div className="flex flex-col sm:flex-row gap-2 mt-2">
                              <Button variant="ghost" className="text-xs" onClick={() => {
                        navigate(`/edu/tasks/${taskId}`);
                      }}>
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
                          {grade.feedback && <div className="text-sm text-text-muted mt-2 p-2 bg-bg-surface border border-border">
                              {grade.feedback}
                            </div>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`text-2xl font-mono font-bold ${getGradeColor(grade.total, gradingSystem, gradeScaleMode)}`}>
                            {formatGradeForSystem(grade.total, gradingSystem, gradeScaleMode)}
                          </div>
                          <div className="text-xs text-text-muted">{gradingSystemLabel(gradingSystem, !!isEn)}</div>
                          <div className="text-xs text-text-secondary">
                            {grade.testsPassed}/{grade.testsTotal} {t("tests")}
                          </div>
                          {grade.isManuallyGraded && <span className="text-xs text-text-muted px-2 py-1 border border-border">
                              {tr("Ручна оцінка", "Manual grade")}
                            </span>}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-text-muted">
                        {new Date(grade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                    </Card>;
            })}
                </div>
              </div>}
          </div>}
      </div>

      {}
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
