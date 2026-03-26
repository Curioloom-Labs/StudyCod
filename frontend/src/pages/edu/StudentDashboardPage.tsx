import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { getStudentGrades, getMyStudentInfo, type Grade, type SummaryGrade } from "../../lib/api/edu";
import { FileText, BookOpen } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { MarkdownView } from "../../components/MarkdownView";
import type { User } from "../../types";
interface Props {
  user: User;
}
const getGradeColor = (grade: number): string => {
  if (grade <= 0) return "text-text-muted";
  if (grade >= 85) return "text-accent-success";
  if (grade >= 65) return "text-accent-warn";
  if (grade >= 40) return "text-yellow-500";
  return "text-accent-error";
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
  const [grades, setGrades] = useState<Grade[]>([]);
  const [summaryGrades, setSummaryGrades] = useState<SummaryGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTheory, setShowTheory] = useState(false);
  const [theoryContent, setTheoryContent] = useState<{
    title: string;
    content: string;
  } | null>(null);
  useEffect(() => {
    loadGrades();
  }, []);
  const loadGrades = async () => {
    try {
      const studentInfo = await getMyStudentInfo();
      const data = await getStudentGrades(studentInfo.student.id);
      setGrades(data.grades || []);
      setSummaryGrades(data.summaryGrades || []);
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
  return <div className="flex-1 min-h-0 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-mono text-text-primary">{t('myJournal')}</h1>
          <Button variant="ghost" onClick={() => {
          navigate("/edu/lessons");
        }}>
            <BookOpen className="w-4 h-4 mr-2" />
            {t('lessons')}
          </Button>
        </div>

        {grades.length === 0 && summaryGrades.length === 0 ? <Card className="p-8 text-center">
            <p className="text-text-secondary">{t('noGradesYet')}</p>
          </Card> : <div className="space-y-6">
            {}
            {intermediateGrades.length > 0 && <div>
                <h2 className="text-lg font-mono text-text-primary mb-3">{t('intermediateGrades')}</h2>
                <div className="space-y-3">
                  {intermediateGrades.map(summaryGrade => <Card key={summaryGrade.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-text-secondary" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {summaryGrade.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`text-2xl font-mono font-bold ${getGradeColor(summaryGrade.grade)}`}>
                            {summaryGrade.grade}
                          </div>
                          <div className="text-xs text-text-muted">{t("outOf")} 100</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-text-muted">
                        {new Date(summaryGrade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                      {summaryGrade.topicTitle && <div className="mt-1 text-xs text-text-muted">
                          {tr("Тема", "Topic")}: {summaryGrade.topicTitle}
                        </div>}
                    </Card>)}
                </div>
              </div>}

            {}
            {controlGrades.length > 0 && <div>
                <h2 className="text-lg font-mono text-text-primary mb-3">{tr("Контрольні оцінки", "Control work grades")}</h2>
                <div className="space-y-3">
                  {controlGrades.map(summaryGrade => <Card key={summaryGrade.id} className="p-4 border-primary/40">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <h3 className="text-lg font-mono text-text-primary">
                              {summaryGrade.controlWorkTitle || summaryGrade.name}
                            </h3>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`text-2xl font-mono font-bold ${getGradeColor(summaryGrade.grade)}`}>
                            {summaryGrade.grade}
                          </div>
                          <div className="text-xs text-text-muted">{t("outOf")} 100</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-text-muted">
                        {new Date(summaryGrade.createdAt).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                      {summaryGrade.topicTitle && <div className="mt-1 text-xs text-text-muted">
                          {tr("Тема", "Topic")}: {summaryGrade.topicTitle}
                        </div>}
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
                      <div className="flex items-start justify-between">
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

                          {taskId && <div className="flex gap-2 mt-2">
                              <Button variant="ghost" className="text-xs" onClick={() => {
                        navigate(`/edu/tasks/${taskId}`);
                      }}>
                                {tr("Переглянути завдання", "View task")}
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
                          <div className={`text-2xl font-mono font-bold ${getGradeColor(grade.total)}`}>
                            {grade.total}
                          </div>
                          <div className="text-xs text-text-muted">{t("outOf")} 100</div>
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
          <div className="max-w-4xl max-h-[80vh] overflow-y-auto p-6">
            <div className="prose prose-invert max-w-none text-text-secondary font-mono">
              <MarkdownView content={theoryContent.content} />
            </div>
          </div>
        </Modal>}
    </div>;
};