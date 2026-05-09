import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { getClassGradebook, createManualGrade, updateGrade, createSummaryGrade, updateSummaryGrade, deleteThematicForTopic, getControlWorkDetails, getControlWorkStudentWork, getTopicTaskStudentWork, getTopicTaskAIDetection, unassignTask, unassignControlWork, updateControlWorkGrade, deleteTaskGrade, type GradebookResponse, type GradebookStudent, type GradebookLesson, type UpdateGradeRequest, type ControlWorkDetails, type ControlWorkStudentWork, type TopicTaskStudentWork, type TopicTaskAIDetectionResponse } from "../../lib/api/edu";
import { ArrowLeft, Calculator, Download, Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { DEFAULT_GRADING_SYSTEM, formatGradeForSystem, getGradeToneForSystem, gradingSystemInputHint, gradingSystemLabel, normalizeGradingSystem, parseGradeInputToRaw100, type ClassGradingSystem } from "../../lib/gradingSystems";

type GradebookGrade = GradebookStudent["grades"][number];

const THEMATIC_CANONICAL_NAME = "THEMATIC";
const PRACTICE_WORK_PAGE_SIZE = 20;

function getErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessageFromUnknown(error, fallback);
}

export const ClassGradebookPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const {
    classId
  } = useParams<{
    classId: string;
  }>();
  const navigate = useNavigate();
  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState<number | "all">("all");
  const [editingGrade, setEditingGrade] = useState<{
    studentId: number;
    taskId: number;
    gradeId: number | null;
    currentGrade: number | null;
    studentName: string;
    taskTitle: string;
    isControlWork?: boolean;
    isSummaryGrade?: boolean;
  } | null>(null);
  const [gradeValue, setGradeValue] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [controlWorkDetails, setControlWorkDetails] = useState<ControlWorkDetails | null>(null);
  const [showControlWorkDetails, setShowControlWorkDetails] = useState(false);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [workLoading, setWorkLoading] = useState(false);
  const [loadingMorePracticeWork, setLoadingMorePracticeWork] = useState(false);
  const [practiceWork, setPracticeWork] = useState<TopicTaskStudentWork | null>(null);
  const [controlWorkWork, setControlWorkWork] = useState<ControlWorkStudentWork | null>(null);
  const [aiDetection, setAiDetection] = useState<TopicTaskAIDetectionResponse | null>(null);
  const [aiDetectLoading, setAiDetectLoading] = useState(false);
  const workLoadTokenRef = useRef(0);
  const [showCreateThematic, setShowCreateThematic] = useState(false);
  const [thematicTopicId, setThematicTopicId] = useState<number | null>(null);
  const [calculatingThematic, setCalculatingThematic] = useState(false);
  useEffect(() => {
    if (classId) {
      loadGradebook();
    }
  }, [classId]);
  const loadGradebook = async () => {
    if (!classId) return;
    try {
      const data = await getClassGradebook(parseInt(classId, 10));
      setGradebook(data);
    } catch (error) {
      console.error("Failed to load gradebook:", error);
    } finally {
      setLoading(false);
    }
  };
  const getGradeColor = (grade: number | null, system: ClassGradingSystem) => {
    const tone = getGradeToneForSystem(grade, system);
    if (tone === "success") return "text-accent-success font-bold";
    if (tone === "warn") return "text-accent-warn font-semibold";
    if (tone === "warning") return "text-accent-warning font-semibold";
    if (tone === "error") return "text-accent-error font-semibold";
    return "text-text-muted";
  };
  const handleGradeClick = async (student: GradebookStudent, taskId: number, grade: GradebookGrade | undefined, taskTitle: string) => {
    const activeGradingSystem = normalizeGradingSystem(gradebook?.gradingSystem || DEFAULT_GRADING_SYSTEM);
    const isControlWork = grade?.lessonType === "CONTROL" || grade?.isControlWork;
    const isSummaryGrade = grade?.lessonType === "SUMMARY" || grade?.isSummaryGrade;
    setEditingGrade({
      studentId: student.studentId,
      taskId: taskId,
      gradeId: grade?.gradeId || null,
      currentGrade: grade?.grade ?? null,
      studentName: student.studentName,
      taskTitle: taskTitle,
      isControlWork: isControlWork,
      isSummaryGrade
    });
    setGradeValue(grade?.grade === null || grade?.grade === undefined ? "" : formatGradeForSystem(grade.grade, activeGradingSystem));
    setFeedback("");
  };
  const handleSaveGrade = async () => {
    if (!editingGrade || !classId) return;
    const activeGradingSystem = normalizeGradingSystem(gradebook?.gradingSystem || DEFAULT_GRADING_SYSTEM);
    const gradeNum = parseGradeInputToRaw100(gradeValue, activeGradingSystem);
    if (gradeNum === null) {
      showToast({ type: "error", message: `${tr("Некоректна оцінка", "Invalid grade")}. ${gradingSystemInputHint(activeGradingSystem, !!isEn)}` });
      return;
    }
    setSaving(true);
    try {
      if (editingGrade.isControlWork) {
        await updateControlWorkGrade(editingGrade.taskId, editingGrade.studentId, gradeNum);
      } else if (editingGrade.isSummaryGrade) {
        if (!editingGrade.gradeId) {
          showToast({ type: "error", message: tr("Спочатку створіть тематичну в журналі кнопкою «Створити тематичну».", "Create a thematic column first using “Create thematic”.") });
        } else {
          await updateSummaryGrade(parseInt(classId, 10), editingGrade.gradeId, gradeNum);
        }
      } else {
        if (editingGrade.gradeId) {
          const update: UpdateGradeRequest = {
            total: gradeNum,
            feedback: feedback || undefined
          };
          await updateGrade(editingGrade.gradeId, update);
        } else {
          const payload = {
            total: gradeNum,
            feedback: feedback || undefined
          };
          await createManualGrade(editingGrade.taskId, editingGrade.studentId, payload);
        }
      }
      await loadGradebook();
      setEditingGrade(null);
      setGradeValue("");
      setFeedback("");
    } catch (error: unknown) {
      console.error("Failed to save grade:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToSave')) });
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteGrade = async () => {
    if (!editingGrade || !classId) return;
    if (!editingGrade.gradeId) return;
    if (editingGrade.isControlWork || editingGrade.isSummaryGrade) {
      showToast({ type: "error", message: tr("Видалення доступне тільки для оцінок за практичні завдання.", "Deletion is available only for practice task grades.") });
      return;
    }
    if (!confirm(tr(`Видалити оцінку за завдання "${editingGrade.taskTitle}" для учня "${editingGrade.studentName}"?\nПісля цього учень зможе виконати завдання та отримати оцінку самостійно.`, `Delete the grade for "${editingGrade.taskTitle}" for student "${editingGrade.studentName}"?\nAfter that, the student will be able to submit the task and earn a grade themselves.`))) {
      return;
    }
    try {
      await deleteTaskGrade(editingGrade.taskId, editingGrade.studentId);
      await loadGradebook();
      setEditingGrade(null);
      setGradeValue("");
      setFeedback("");
      showToast({ type: "success", message: tr("Оцінку видалено. Учень розблокований.", "Grade deleted. Student unlocked.") });
    } catch (error: unknown) {
      console.error("Failed to delete grade:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити оцінку", "Failed to delete grade")) });
    }
  };
  const optionLabel = (key: string) => {
    const map: Record<string, string> = {
      "А": "A",
      "Б": "B",
      "В": "C",
      "Г": "D",
      "Д": "E"
    };
    return i18n.language?.toLowerCase().startsWith("en") ? map[key] || key : key;
  };
  const handleViewWork = async () => {
    if (!editingGrade) return;
    const currentGrade = editingGrade;
    const loadToken = workLoadTokenRef.current + 1;
    workLoadTokenRef.current = loadToken;
    setWorkLoading(true);
    setLoadingMorePracticeWork(false);
    setPracticeWork(null);
    setControlWorkWork(null);
    setAiDetection(null);
    setAiDetectLoading(false);
    setShowWorkModal(true);
    try {
      if (currentGrade.isControlWork) {
        const data = await getControlWorkStudentWork(currentGrade.taskId, currentGrade.studentId);
        if (workLoadTokenRef.current !== loadToken) return;
        setControlWorkWork(data);
      } else if (!currentGrade.isSummaryGrade) {
        const data = await getTopicTaskStudentWork(currentGrade.taskId, currentGrade.studentId, {
          limit: PRACTICE_WORK_PAGE_SIZE
        });
        if (workLoadTokenRef.current !== loadToken) return;
        setPracticeWork(data);

        setAiDetectLoading(true);
        void getTopicTaskAIDetection(currentGrade.taskId, currentGrade.studentId)
          .then(detect => {
            if (workLoadTokenRef.current !== loadToken) return;
            setAiDetection(detect);
          })
          .catch(err => {
            console.warn("[ClassGradebookPage] AI detector failed:", err);
          })
          .finally(() => {
            if (workLoadTokenRef.current !== loadToken) return;
            setAiDetectLoading(false);
          });
      }
    } catch (error: unknown) {
      if (workLoadTokenRef.current !== loadToken) return;
      console.error("Failed to load student work:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося завантажити роботу учня", "Failed to load student work")) });
      setShowWorkModal(false);
    } finally {
      if (workLoadTokenRef.current === loadToken) {
        setWorkLoading(false);
      }
    }
  };

  const handleLoadMorePracticeWork = async () => {
    if (!editingGrade || editingGrade.isControlWork || editingGrade.isSummaryGrade) return;
    if (!practiceWork?.hasMore || loadingMorePracticeWork) return;

    const beforeId = practiceWork.nextCursor ?? practiceWork.submissions[practiceWork.submissions.length - 1]?.id;
    if (!beforeId) return;

    setLoadingMorePracticeWork(true);
    try {
      const data = await getTopicTaskStudentWork(editingGrade.taskId, editingGrade.studentId, {
        limit: PRACTICE_WORK_PAGE_SIZE,
        beforeId
      });

      setPracticeWork(prev => {
        if (!prev) return data;
        const seen = new Set(prev.submissions.map(s => s.id));
        const appended = data.submissions.filter(s => !seen.has(s.id));
        return {
          ...prev,
          submissions: [...prev.submissions, ...appended],
          submissionsTotal: data.submissionsTotal ?? prev.submissionsTotal,
          hasMore: data.hasMore,
          nextCursor: data.nextCursor
        };
      });
    } catch (error: unknown) {
      console.error("Failed to load more submissions:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося підвантажити спроби", "Failed to load more submissions")) });
    } finally {
      setLoadingMorePracticeWork(false);
    }
  };

  const formatAiBadge = (det: TopicTaskAIDetectionResponse | null) => {
    const d = det?.detection;
    if (!d) return null;
    const pct = Math.round((d.score || 0) * 100);
    const label = d.likelihood === "likely" ? tr("ймовірно AI", "likely AI") : d.likelihood === "possible" ? tr("можливо AI", "possible AI") : tr("малоймовірно AI", "unlikely AI");
    const color = d.likelihood === "likely" ? "text-accent-warn" : d.likelihood === "possible" ? "text-text-secondary" : "text-text-muted";
    return {
      text: `AI: ${label} (${pct}%)`,
      color,
      tooltip: tr("Оцінка AI-асистованості (не вирок). На простих задачах можливі хибні спрацювання — перевіряйте усно/по кроках.", "AI assistance likelihood (not a verdict). Simple tasks can trigger false positives—verify orally/step-by-step."),
      reasons: d.reasons || [],
      caveats: d.caveats || [],
      cached: d.cached
    };
  };
  const handleCreateThematic = async () => {
    if (!classId) return;
    if (!thematicTopicId) {
      showToast({ type: "error", message: tr("Виберіть тему", "Select a topic") });
      return;
    }
    try {
      if (!confirm(tr("Автоматично порахувати (і перезаписати, якщо вже є) “Тематичну” для цієї теми?", "Auto-calculate (and overwrite if already exists) the “Thematic” grade for this topic?"))) {
        return;
      }
      setCalculatingThematic(true);
      await createSummaryGrade(parseInt(classId, 10), {
        name: THEMATIC_CANONICAL_NAME,
        topicId: thematicTopicId
      });
      setShowCreateThematic(false);
      setThematicTopicId(null);
      await loadGradebook();
    } catch (error: unknown) {
      console.error("Failed to create thematic:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося створити тематичну", "Failed to create thematic")) });
    } finally {
      setCalculatingThematic(false);
    }
  };
  const recalculateThematicForTopic = async (topicId: number, topicTitle?: string) => {
    if (!classId) return;
    if (!confirm(tr(`Автоматично порахувати (і перезаписати) “Тематичну” для теми "${topicTitle || topicId}"?`, `Auto-calculate (and overwrite) the “Thematic” grade for topic "${topicTitle || topicId}"?`))) {
      return;
    }
    setCalculatingThematic(true);
    try {
      await createSummaryGrade(parseInt(classId, 10), {
        name: THEMATIC_CANONICAL_NAME,
        topicId
      });
      await loadGradebook();
    } catch (error: unknown) {
      console.error("Failed to recalculate thematic:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося порахувати тематичну", "Failed to calculate thematic")) });
    } finally {
      setCalculatingThematic(false);
    }
  };
  const recalculateAllThematics = async () => {
    if (!classId || !gradebook) return;
    const topics = gradebook.lessons.filter(l => l.type === "TOPIC");
    if (topics.length === 0) {
      showToast({ type: "error", message: tr("Немає тем для перерахунку", "No topics to recalculate") });
      return;
    }
    if (!confirm(tr(`Порахувати тематичні для всіх тем (${topics.length})? Це перезапише існуючі.`, `Calculate thematics for all topics (${topics.length})? This will overwrite existing ones.`))) {
      return;
    }
    setCalculatingThematic(true);
    try {
      for (const topic of topics) {
        await createSummaryGrade(parseInt(classId, 10), {
          name: THEMATIC_CANONICAL_NAME,
          topicId: topic.id
        });
      }
      await loadGradebook();
      showToast({ type: "success", message: tr("Тематичні перераховано", "Thematics recalculated") });
    } catch (error: unknown) {
      console.error("Failed to recalculate all thematics:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося порахувати тематичні", "Failed to calculate thematics")) });
    } finally {
      setCalculatingThematic(false);
    }
  };
  const exportToCSV = () => {
    if (!gradebook) return;
    const activeGradingSystem = normalizeGradingSystem(gradebook.gradingSystem || DEFAULT_GRADING_SYSTEM);
    const headers = [tr("Учень", "Student"), ...gradebook.lessons.flatMap(l => l.tasks.map(t => `${l.title} - ${t.title}`))];
    const rows = gradebook.students.map(student => {
      const studentName = student.studentName;
      const grades = student.grades.map(g => g.grade === null || g.grade === undefined ? "" : formatGradeForSystem(g.grade, activeGradingSystem));
      return [studentName, ...grades];
    });
    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `journal_${classId}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }
  if (!gradebook) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t('failedToLoad')}
      </div>;
  }
  const activeGradingSystem = normalizeGradingSystem(gradebook.gradingSystem || DEFAULT_GRADING_SYSTEM);
  const filteredLessons = selectedLesson === "all" ? gradebook.lessons : gradebook.lessons.filter(l => l.type === "TOPIC" && l.id === selectedLesson || l.type === "CONTROL" && l.parentId === selectedLesson || l.type === "SUMMARY" && l.parentId === selectedLesson);
  const allTasks = filteredLessons.flatMap(l => l.tasks.map(t => ({
    ...t,
    lessonId: l.id,
    lessonTitle: l.parentTitle || l.title,
    lessonType: l.type
  })));
  return <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-3 sm:p-4 md:p-6 pb-3 sm:pb-4">
        <div className="max-w-full mx-auto">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('back')}
              </Button>
              <h1 className="text-2xl font-mono text-text-primary">{t('gradebook')}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="px-2 py-1 text-[10px] border border-border text-text-muted">
                {tr("Шкала", "Scale")}: {gradingSystemLabel(activeGradingSystem, !!isEn)}
              </span>
              <Button variant="ghost" onClick={() => setShowCreateThematic(true)} disabled={calculatingThematic}>
                {tr("Порахувати тематичну", "Calculate thematic")}
              </Button>
              <Button variant="ghost" onClick={recalculateAllThematics} disabled={calculatingThematic}>
                {tr("Порахувати всі тематичні", "Calculate all thematics")}
              </Button>
              <Button onClick={exportToCSV}>
                <Download className="w-4 h-4 mr-2" />
                {t('exportCSV')}
              </Button>
            </div>
          </div>

          {}
          <Card className="p-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono text-text-secondary">{t("filter")}:</span>
              <button onClick={() => setSelectedLesson("all")} className={`px-3 py-1 text-xs font-mono border transition-fast ${selectedLesson === "all" ? "border-primary bg-bg-hover text-text-primary" : "border-border text-text-secondary hover:text-text-primary"}`}>
                {tr("Всі уроки", "All lessons")}
              </button>
              {(() => {
              const topicsMap = new Map<number, {
                id: number;
                title: string;
              }>();
              for (const l of gradebook.lessons) {
                if (l.type === "TOPIC") {
                  topicsMap.set(l.id, {
                    id: l.id,
                    title: l.title
                  });
                } else if (l.type === "CONTROL" && l.parentId && l.parentTitle) {
                  if (!topicsMap.has(l.parentId)) {
                    topicsMap.set(l.parentId, {
                      id: l.parentId,
                      title: l.parentTitle
                    });
                  }
                }
              }
              return Array.from(topicsMap.values()).map(topic => <button key={`TOPIC-${topic.id}`} onClick={() => setSelectedLesson(topic.id)} className={`px-3 py-1 text-xs font-mono border transition-fast ${selectedLesson === topic.id ? "border-primary bg-bg-hover text-text-primary" : "border-border text-text-secondary hover:text-text-primary"}`}>
                    {topic.title}
                  </button>);
            })()}
            </div>
          </Card>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pb-3 sm:pb-6">
        <div className="max-w-full mx-auto">
          {}
          <Card className="p-0">
            <div className="overflow-auto max-h-[calc(100dvh-260px)]">
              <div className="min-w-full">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-bg-surface">
                      <th className="px-4 py-3 text-left text-sm font-mono text-text-primary sticky left-0 top-0 bg-bg-surface z-30 border-r border-border">
                        {t('student')}
                      </th>
                      {allTasks.map(task => <th key={`${task.type}-${task.id}`} className="px-3 py-3 text-center text-xs font-mono text-text-secondary border-r border-border min-w-[80px] relative group sticky top-0 bg-bg-surface z-20" title={`${task.lessonTitle} - ${task.title}`}>
                          <div className="flex flex-col items-center justify-center gap-1">
                            <div className="w-full max-w-[140px] text-center truncate px-1">
                              {task.title}
                            </div>
                            <div className="w-full max-w-[140px] text-center text-[10px] text-text-muted truncate px-1">
                              {task.lessonTitle}
                            </div>
                          </div>
                          {}
                          {task.type !== "SUMMARY" && <button onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(tr(`Ви впевнені, що хочете відкликати завдання "${task.title}"? Всі оцінки будуть видалені.`, `Are you sure you want to unassign "${task.title}"? All grades will be deleted.`))) {
                          return;
                        }
                        try {
                          const isControlWork = task.type === "CONTROL";
                          if (isControlWork) {
                            await unassignControlWork(task.id);
                          } else {
                            await unassignTask(task.id);
                          }
                          await loadGradebook();
                          showToast({ type: "success", message: tr("Завдання відкликано", "Task unassigned") });
                        } catch (error: unknown) {
                          console.error("Failed to unassign task:", error);
                          showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося відкликати завдання", "Failed to unassign task")) });
                        }
                      }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-accent-error hover:text-accent-error/80 text-xs font-bold" title={tr("Відкликати завдання", "Unassign task")}>
                              ×
                            </button>}
                          {task.type === "SUMMARY" && gradebook.students.some(s => s.grades.some(g => g.lessonType === "SUMMARY" && g.taskId === task.id && g.gradeId)) && <button onClick={async e => {
                        e.stopPropagation();
                        if (!classId) return;
                        if (!confirm(tr(`Видалити тематичну для теми "${task.lessonTitle}"? Це прибере оцінки для всіх учнів.`, `Delete thematic for topic "${task.lessonTitle}"? This will remove grades for all students.`))) {
                          return;
                        }
                        try {
                          const result = await deleteThematicForTopic(parseInt(classId, 10), task.id);
                          await loadGradebook();
                          if (!result.deleted) {
                            showToast({ type: "info", message: tr("Немає тематичної для видалення", "No thematic to delete") });
                          } else {
                            showToast({ type: "success", message: tr(`Тематичну видалено (оцінок: ${result.deleted})`, `Thematic deleted (grades: ${result.deleted})`) });
                          }
                        } catch (error: unknown) {
                          console.error("Failed to delete thematic:", error);
                          showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити тематичну", "Failed to delete thematic")) });
                        }
                      }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-accent-error hover:text-accent-error/80 p-1" title={tr("Видалити тематичну", "Delete thematic")}>
                              <Trash2 className="w-3 h-3" />
                            </button>}
                          {task.type === "SUMMARY" && <button onClick={e => {
                        e.stopPropagation();
                        void recalculateThematicForTopic(task.id, task.lessonTitle);
                      }} className="absolute top-1 right-7 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-primary p-1" title={tr("Автоматично порахувати тематичну", "Auto-calculate thematic")} disabled={calculatingThematic}>
                              <Calculator className="w-3 h-3" />
                            </button>}
                        </th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {gradebook.students.map(student => <tr key={student.studentId} className="border-b border-border hover:bg-bg-hover transition-fast">
                        <td className="px-4 py-2 text-sm font-mono text-text-primary sticky left-0 bg-bg-base z-10 border-r border-border">
                          {student.studentName}
                        </td>
                        {allTasks.map(task => {
                      const grade = student.grades.find(g => g.taskId === task.id && g.lessonType === task.lessonType);
                      return <td key={`${task.type}-${task.id}`} onClick={() => handleGradeClick(student, task.id, grade, task.title)} className={`px-3 py-2 text-center text-sm font-mono border-r border-border cursor-pointer hover:bg-bg-hover transition-fast ${getGradeColor(grade?.grade ?? null, activeGradingSystem)}`} title={t('gradeFor')}>
                              {formatGradeForSystem(grade?.grade ?? null, activeGradingSystem)}
                            </td>;
                    })}
                      </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {gradebook.students.length === 0 && <Card className="p-8 text-center">
              <p className="text-text-secondary">{t('noStudents')}</p>
            </Card>}
        </div>
      </div>

      {}
      {editingGrade && <Modal open={!!editingGrade} onClose={() => {
      setEditingGrade(null);
      setGradeValue("");
      setFeedback("");
    }} title={t('edit')}>
          <div className="p-4 sm:p-6">
            <div className="mb-4">
              <p className="text-sm text-text-secondary mb-1">{t('student')}:</p>
              <p className="text-text-primary font-mono">{editingGrade.studentName}</p>
            </div>
            <div className="mb-4">
              <p className="text-sm text-text-secondary mb-1">{t('task')}:</p>
              <p className="text-text-primary font-mono">{editingGrade.taskTitle}</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">
                {t('grade')} ({gradingSystemInputHint(activeGradingSystem, !!isEn)}):
              </label>
              <input type="text" value={gradeValue} onChange={e => setGradeValue(e.target.value)} className="w-full px-3 py-2 bg-bg-code border border-border text-text-primary font-mono rounded focus:outline-none focus:border-primary" placeholder={gradingSystemInputHint(activeGradingSystem, !!isEn)} autoFocus />
            </div>
            <div className="mb-6">
              <label className="block text-sm text-text-secondary mb-2">
                {t('feedback')} ({t('optional')}):
              </label>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} className="w-full px-3 py-2 bg-bg-code border border-border text-text-primary font-mono rounded focus:outline-none focus:border-primary" rows={3} placeholder={t('feedback')} />
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {!editingGrade.isSummaryGrade && <Button variant="ghost" onClick={handleViewWork} disabled={saving}>
                  {tr("Переглянути роботу", "View work")}
                </Button>}
              <Button variant="ghost" onClick={() => {
            setEditingGrade(null);
            setGradeValue("");
            setFeedback("");
          }} disabled={saving}>
                {t('cancel')}
              </Button>
              {!editingGrade.isControlWork && !editingGrade.isSummaryGrade && editingGrade.gradeId && <Button variant="ghost" onClick={handleDeleteGrade} disabled={saving} className="text-accent-error border border-accent-error hover:bg-bg-hover">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("delete")}
                </Button>}
              <Button onClick={handleSaveGrade} disabled={saving || !gradeValue}>
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </Modal>}

      {}
      {showWorkModal && <Modal open={showWorkModal} onClose={() => {
      workLoadTokenRef.current += 1;
      setShowWorkModal(false);
      setPracticeWork(null);
      setControlWorkWork(null);
      setAiDetection(null);
      setAiDetectLoading(false);
      setLoadingMorePracticeWork(false);
    }} title={editingGrade ? `${editingGrade.studentName} — ${editingGrade.taskTitle}` : tr("Робота учня", "Student work")}>
          <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto">
            {workLoading ? <div className="text-sm font-mono text-text-secondary">{tr("Завантаження...", "Loading...")}</div> : practiceWork ? <div className="space-y-4">
                <div className="text-xs text-text-muted">
                  {tr("Спроби:", "Submissions:")} {practiceWork.submissionsTotal}
                  {practiceWork.submissions.length < practiceWork.submissionsTotal ? ` · ${tr("показано", "shown")}: ${practiceWork.submissions.length}` : ""}
                </div>

                {editingGrade && !editingGrade.isControlWork && !editingGrade.isSummaryGrade && <div className="text-xs text-text-muted space-y-1">
                    {aiDetectLoading ? <span>{tr("AI детектор: аналіз...", "AI detector: analyzing...")}</span> : (() => {
                  const badge = formatAiBadge(aiDetection);
                  if (!badge) {
                    return <span>{tr("AI детектор: —", "AI detector: —")}</span>;
                  }
                  return <div>
                        <div className={badge.color} title={badge.tooltip}>
                          {badge.text}{badge.cached ? tr(" (кеш)", " (cached)") : ""}
                        </div>
                        {badge.reasons.length > 0 && <div className="mt-1 text-[11px] text-text-muted" title={badge.caveats.join("\n") || undefined}>
                            {badge.reasons.slice(0, 3).join(" • ")}
                          </div>}
                      </div>;
                })()}
                  </div>}
                {practiceWork.submissions.length === 0 ? <div className="text-sm text-text-secondary">{tr("Немає відправлених спроб.", "No submissions yet.")}</div> : <>
                    {practiceWork.submissions.map((s, idx) => <Card key={s.id} className="p-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="text-sm font-mono text-text-primary">
                            {tr("Спроба", "Submission")} #{Math.max(1, practiceWork.submissionsTotal - idx)}
                          </div>
                          <div className="text-xs text-text-muted">
                            {s.createdAt ? new Date(s.createdAt).toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA") : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-text-secondary">{tr("Оцінка", "Grade")}</div>
                          <div className="text-lg font-mono text-text-primary">{s.total ?? "—"}</div>
                          <div className="text-[10px] text-text-muted">
                            {s.testsTotal ? `${s.testsPassed}/${s.testsTotal} ${tr("тести", "tests")}` : ""}
                          </div>
                        </div>
                      </div>
                      {s.feedback && <div className="mb-3 text-xs text-text-secondary whitespace-pre-wrap">
                          <span className="text-text-muted">{tr("Коментар:", "Comment:")}</span> {s.feedback}
                        </div>}
                      <div className="border border-border bg-bg-code p-3 overflow-x-auto">
                        <pre className="text-xs text-text-primary whitespace-pre-wrap m-0 font-mono">
                          {s.submittedCode || tr("// Немає коду", "// No code")}
                        </pre>
                      </div>
                    </Card>)}

                    {practiceWork.hasMore && <div className="flex justify-center pt-2">
                        <Button variant="ghost" onClick={() => void handleLoadMorePracticeWork()} disabled={loadingMorePracticeWork}>
                          {loadingMorePracticeWork ? tr("Завантаження...", "Loading...") : tr("Показати старіші спроби", "Load older submissions")}
                        </Button>
                      </div>}
                  </>}
              </div> : controlWorkWork ? <div className="space-y-6">
                <Card className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-text-muted">{tr("Фінальна оцінка", "Final grade")}</div>
                      <div className="text-2xl font-mono text-text-primary">{controlWorkWork.summaryGrade?.grade ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">{tr("Оцінка за тест", "Quiz grade")}</div>
                      <div className="text-2xl font-mono text-text-primary">
                        {controlWorkWork.summaryGrade?.theoryGrade ?? "—"}
                      </div>
                    </div>
                  </div>
                </Card>

                {}
                <div>
                  <h3 className="text-lg font-mono text-text-primary mb-3">{tr("Тест", "Quiz")}</h3>
                  {!controlWorkWork.quizReview ? <div className="text-sm text-text-secondary">{tr("Немає відповідей на тест.", "No quiz submission yet.")}</div> : <div className="space-y-3">
                      <div className="text-xs text-text-muted">
                        {tr("Результат:", "Result:")} {controlWorkWork.quizReview.correctAnswers}/{controlWorkWork.quizReview.totalQuestions}
                      </div>
                      {controlWorkWork.quizReview.questions.map(q => <Card key={q.index} className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="text-sm font-mono text-text-primary">
                              {tr("Питання", "Question")} {q.index + 1}: {q.question}
                            </div>
                            <div className={`text-xs font-mono ${q.isCorrect ? "text-accent-success" : "text-accent-error"}`}>
                              {q.isCorrect ? tr("✓ Правильно", "✓ Correct") : tr("✗ Неправильно", "✗ Incorrect")}
                            </div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {Object.entries(q.options || {}).map(([key, text]) => {
                    const isCorrect = String(q.correct).toUpperCase() === key.toUpperCase();
                    const isStudent = (q.student || "").toUpperCase() === key.toUpperCase();
                    return <div key={key} className={`p-2 border text-xs font-mono ${isCorrect ? "border-accent-success bg-accent-success/10" : isStudent ? "border-primary/60 bg-primary/10" : "border-border bg-bg-surface"}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-text-primary">
                                      <span className="text-text-muted">{optionLabel(key)}.</span> {text}
                                    </div>
                                    <div className="text-[10px] text-text-muted">
                                      {isCorrect ? tr("правильна", "correct") : isStudent ? tr("вибір учня", "student") : ""}
                                    </div>
                                  </div>
                                </div>;
                  })}
                          </div>
                        </Card>)}
                    </div>}
                </div>

                {}
                <div>
                  <h3 className="text-lg font-mono text-text-primary mb-3">{tr("Практичні завдання", "Practice tasks")}</h3>
                  {controlWorkWork.practiceTasks.length === 0 ? <div className="text-sm text-text-secondary">{tr("Немає практичних завдань.", "No practice tasks.")}</div> : <div className="space-y-3">
                      {controlWorkWork.practiceTasks.map(pt => <Card key={pt.taskId} className="p-4">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <div className="text-sm font-mono text-text-primary">{pt.taskTitle}</div>
                              <div className="text-xs text-text-muted">
                                {pt.createdAt ? new Date(pt.createdAt).toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA") : "—"}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-text-secondary">{tr("Оцінка", "Grade")}</div>
                              <div className="text-lg font-mono text-text-primary">{pt.grade ?? "—"}</div>
                              <div className="text-[10px] text-text-muted">
                                {pt.testsTotal ? `${pt.testsPassed}/${pt.testsTotal} ${tr("тести", "tests")}` : ""}
                              </div>
                            </div>
                          </div>
                          {pt.feedback && <div className="mb-3 text-xs text-text-secondary whitespace-pre-wrap">
                              <span className="text-text-muted">{tr("Коментар:", "Comment:")}</span> {pt.feedback}
                            </div>}
                          <div className="border border-border bg-bg-code p-3 overflow-x-auto">
                            <pre className="text-xs text-text-primary whitespace-pre-wrap m-0 font-mono">
                              {pt.submittedCode || tr("// Немає коду", "// No code")}
                            </pre>
                          </div>
                        </Card>)}
                    </div>}
                </div>
              </div> : <div className="text-sm text-text-secondary">{tr("Немає даних для перегляду.", "No data to show.")}</div>}
          </div>
        </Modal>}

      {}
      {showControlWorkDetails && controlWorkDetails && <Modal open={showControlWorkDetails} onClose={() => {
      setShowControlWorkDetails(false);
      setControlWorkDetails(null);
    }} title={controlWorkDetails.controlWork.title}>
          <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto">
            {}
            <div className="mb-6">
              <h3 className="text-lg font-mono text-text-primary mb-4">{tr("Загальна оцінка", "Overall grade")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 border border-border bg-bg-surface">
                  <div className="text-sm text-text-secondary mb-1">{tr("Фінальна оцінка", "Final grade")}</div>
                  <div className="text-2xl font-mono font-bold text-text-primary">
                    {controlWorkDetails.calculatedGrade ?? "—"}
                  </div>
                  <div className="text-xs text-text-muted">{tr("з 12", "out of 12")}</div>
                </div>
                {controlWorkDetails.controlWork.hasTheory && controlWorkDetails.summaryGrade?.theoryGrade != null && <div className="p-3 border border-border bg-bg-surface">
                    <div className="text-sm text-text-secondary mb-1">{tr("Оцінка за тест", "Quiz grade")}</div>
                    <div className="text-2xl font-mono font-bold text-text-primary">
                      {controlWorkDetails.summaryGrade?.theoryGrade ?? "—"}
                    </div>
                    <div className="text-xs text-text-muted">{tr("з 12", "out of 12")}</div>
                  </div>}
                {controlWorkDetails.controlWork.hasPractice && <div className="p-3 border border-border bg-bg-surface">
                    <div className="text-sm text-text-secondary mb-1">{tr("Середнє за практичні", "Practice average")}</div>
                    <div className="text-2xl font-mono font-bold text-text-primary">
                      {controlWorkDetails.averagePracticeGrade.toFixed(2)}
                    </div>
                    <div className="text-xs text-text-muted">{tr("з 12", "out of 12")}</div>
                  </div>}
              </div>
            </div>

            {}
            {controlWorkDetails.controlWork.hasPractice && controlWorkDetails.practiceTasks.length > 0 && <div className="mb-6">
                <h3 className="text-lg font-mono text-text-primary mb-4">{tr("Практичні завдання", "Practice tasks")}</h3>
                <div className="space-y-3">
                  {controlWorkDetails.practiceTasks.map(task => <div key={task.taskId} className="p-4 border border-border bg-bg-surface">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-mono text-text-primary mb-1">{task.taskTitle}</h4>
                          <div className="text-xs text-text-secondary">
                            {tr("Тести", "Tests")}: {task.testsPassed}/{task.testsTotal}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-mono font-bold text-text-primary">
                            {task.grade ?? "—"}
                          </div>
                          <div className="text-xs text-text-muted">{tr("з 12", "out of 12")}</div>
                        </div>
                      </div>
                      {task.feedback && <div className="mt-2 text-xs text-text-secondary">
                          <strong>{tr("Коментар", "Feedback")}:</strong> {task.feedback}
                        </div>}
                      {task.createdAt && <div className="mt-2 text-xs text-text-muted">
                          {new Date(task.createdAt).toLocaleDateString("uk-UA")}
                        </div>}
                    </div>)}
                </div>
              </div>}

            {}
            <div className="mt-6 p-4 border border-border bg-bg-surface">
              <h4 className="text-sm font-mono text-text-primary mb-2">{tr("Формула розрахунку", "Formula")}:</h4>
              {controlWorkDetails.controlWork.hasTheory && controlWorkDetails.summaryGrade?.theoryGrade !== null ? <div className="text-xs text-text-secondary">
                  {tr("За замовчуванням: Оцінка = 0.35 × Тест + 0.65 × середнє за практичні (або користувацька формула контрольної).", "Default: Grade = 0.35 × Quiz + 0.65 × practice average (or control work custom formula).")}
                </div> : <div className="text-xs text-text-secondary">
                  {tr("Оцінка = середнє за практичні завдання", "Grade = practice tasks average")}
                </div>}
            </div>
          </div>
        </Modal>}

      {}
      {showCreateThematic && <Modal open={showCreateThematic} onClose={() => {
      setShowCreateThematic(false);
      setThematicTopicId(null);
    }} title={tr("Порахувати тематичну", "Calculate thematic")} showCloseButton={false}>
          <div className="p-4 sm:p-6">
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">{tr("Тема", "Topic")} *</label>
              <select value={thematicTopicId || ""} onChange={e => setThematicTopicId(e.target.value ? parseInt(e.target.value, 10) : null)} className="w-full px-3 py-2 bg-bg-code border border-border text-text-primary font-mono rounded focus:outline-none focus:border-primary">
                <option value="">{tr("Виберіть тему", "Select a topic")}</option>
                    {gradebook.lessons.filter(l => l.type === "TOPIC").map(t => <option key={t.id} value={t.id}>
                      {t.title}
                    </option>)}
              </select>
              <div className="text-xs text-text-muted mt-2">
                {tr("Буде створено/перераховано одну “Тематичну” для обраної теми та додано в журнал.", "One “Thematic” grade will be created/recalculated for the selected topic and added to the gradebook.")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" onClick={() => {
            setShowCreateThematic(false);
            setThematicTopicId(null);
          }} disabled={calculatingThematic}>
                {t('cancel')}
              </Button>
              <Button onClick={handleCreateThematic} disabled={!thematicTopicId || calculatingThematic}>
                {tr("Порахувати", "Calculate")}
              </Button>
            </div>
          </div>
        </Modal>}
    </div>;
};
