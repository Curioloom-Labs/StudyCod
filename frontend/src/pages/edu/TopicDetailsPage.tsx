import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { ArrowLeft, Plus, Trash2, Edit2, Sparkles, Settings, Save, X, FileText, XCircle, Upload, Download } from "lucide-react";
import { api } from "../../lib/api/client";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { MarkdownView } from "../../components/MarkdownView";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import { generateTestData, getTestData, addTestData, updateTestData, deleteTestData, unassignTask, unassignControlWork, type TestData } from "../../lib/api/edu";
import { convertLocalToUTC, convertUTCToLocal, formatDeadlineForDisplay, getUserTimezone } from "../../utils/timezone";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
interface Topic {
  id: number;
  title: string;
  description?: string | null;
  order: number;
  language: "JAVA" | "PYTHON" | "CPP";
  tasks?: TopicTask[];
  controlWorks?: ControlWork[];
}
interface TopicTask {
  id: number;
  title: string;
  description: string;
  template: string;
  type: "PRACTICE" | "CONTROL";
  order: number;
  maxAttempts: number;
  deadline?: string | null;
  isClosed: boolean;
  isAssigned: boolean;
  theory?: TaskTheory | null;
}
interface TaskTheory {
  id: number;
  content: string;
}
interface ControlWork {
  id: number;
  title?: string | null;
  timeLimitMinutes?: number | null;
  quizJson?: string | null;
  hasTheory: boolean;
  hasPractice: boolean;
  isAssigned: boolean;
  deadline?: string | null;
}
export const TopicDetailsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const getErrorMessage = (error: unknown, fallback: string): string =>
    getErrorMessageFromUnknown(error, fallback);
  const parseTaskDifficulty = (value: string): "1" | "2" | "3" | "4" | "5" => {
    if (value === "1" || value === "2" || value === "3" || value === "4" || value === "5") return value;
    return "3";
  };
  const parseDisplayLimit = (value: string): 20 | 50 | 100 | "ALL" => {
    if (value === "ALL") return "ALL";
    const parsed = Number.parseInt(value, 10);
    if (parsed === 20 || parsed === 50 || parsed === 100) return parsed;
    return 20;
  };
  const {
    topicId
  } = useParams<{
    topicId: string;
  }>();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateControlWork, setShowCreateControlWork] = useState(false);
  const [newControlWorkTitle, setNewControlWorkTitle] = useState("");
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    template: "",
    type: "PRACTICE" as "PRACTICE" | "CONTROL",
    maxAttempts: 3,
    theory: ""
  });
  const [generatingCondition, setGeneratingCondition] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [generatingTheory, setGeneratingTheory] = useState(false);
  const [taskDifficulty, setTaskDifficulty] = useState<"1" | "2" | "3" | "4" | "5">("3");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showTaskTheory, setShowTaskTheory] = useState(false);
  const [taskTheory, setTaskTheory] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [showEditTask, setShowEditTask] = useState(false);
  const [editingTask, setEditingTask] = useState<TopicTask | null>(null);
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [assigningTask, setAssigningTask] = useState<TopicTask | null>(null);
  const [assignDeadline, setAssignDeadline] = useState("");
  const [showAssignControlWork, setShowAssignControlWork] = useState(false);
  const [assigningControlWork, setAssigningControlWork] = useState<ControlWork | null>(null);
  const [showTestDataModal, setShowTestDataModal] = useState(false);
  const [testDataTaskId, setTestDataTaskId] = useState<number | null>(null);
  const [testDataList, setTestDataList] = useState<TestData[]>([]);
  const [testDataDisplayLimit, setTestDataDisplayLimit] = useState<20 | 50 | 100 | "ALL">(20);
  const [editingTestIndex, setEditingTestIndex] = useState<number | null>(null);
  const [editingTest, setEditingTest] = useState<{
    input: string;
    expectedOutput: string;
    points: number;
    isHidden?: boolean;
  } | null>(null);
  const [newTestCount, setNewTestCount] = useState(10);
  const [generatingTestData, setGeneratingTestData] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importPoints, setImportPoints] = useState(1);
  const [importIsHidden, setImportIsHidden] = useState(false);
  const [importingFiles, setImportingFiles] = useState(false);
  const [importInputKey, setImportInputKey] = useState(0);
  const [importArchiveKey, setImportArchiveKey] = useState(0);
  const [importingArchive, setImportingArchive] = useState(false);
  const createDescriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const editDescriptionRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    loadUser();
  }, []);
  useEffect(() => {
    if (user && topicId) {
      loadTopic();
    }
  }, [user, topicId]);
  const loadUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };
  const loadTopic = async () => {
    if (!topicId) return;
    try {
      const res = await api.get(`/topics/${topicId}`);
      setTopic(res.data.topic);
    } catch (error: unknown) {
      console.error("Failed to load topic:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToLoadTopic')) });
    } finally {
      setLoading(false);
    }
  };
  const handleCreateTask = async () => {
    if (!topicId || !newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      showToast({ type: "error", message: t('fillAllFields') });
      return;
    }
    try {
      const taskData = {
        title: newTask.title,
        description: newTask.description,
        template: newTask.template,
        type: newTask.type,
        maxAttempts: newTask.maxAttempts,
        order: (topic?.tasks?.length || 0) + 1
      };
      const res = await api.post(`/topics/${topicId}/tasks`, taskData);
      const createdTaskId = res.data.task?.id;
      if (newTask.theory.trim() && createdTaskId) {
        try {
          await api.post(`/topics/${topicId}/tasks/${createdTaskId}/theory`, {
            content: newTask.theory
          });
        } catch (theoryError: unknown) {
          console.error("Failed to add theory:", theoryError);
        }
      }
      await loadTopic();
      setShowCreateTask(false);
      setNewTask({
        title: "",
        description: "",
        template: "",
        type: "PRACTICE",
        maxAttempts: 3,
        theory: ""
      });
    } catch (error: unknown) {
      console.error("Failed to create task:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToCreateTask')) });
    }
  };
  const handleGenerateCondition = async () => {
    if (!topic) return;
    if (!newTask.title.trim()) {
      showToast({ type: "error", message: tr("Спочатку введіть назву завдання", "Enter task title first") });
      return;
    }
    setGeneratingCondition(true);
    try {
      const userLanguage = i18n.language === 'en' ? 'en' : 'uk';
      const res = await api.post(`/topics/${topicId}/tasks/generate-condition`, {
        taskTitle: newTask.title.trim(),
        taskType: newTask.type,
        difficulty: parseInt(taskDifficulty),
        language: userLanguage
      });
      setNewTask({
        ...newTask,
        description: res.data.description
      });
    } catch (error: unknown) {
      console.error("Failed to generate condition:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToGenerateCondition')) });
    } finally {
      setGeneratingCondition(false);
    }
  };
  const handleGenerateTemplate = async () => {
    if (!topic) return;
    if (!newTask.title.trim()) {
      showToast({ type: "error", message: tr("Спочатку введіть назву завдання", "Enter task title first") });
      return;
    }
    setGeneratingTemplate(true);
    try {
      const res = await api.post(`/topics/${topicId}/tasks/generate-template`, {
        taskTitle: newTask.title.trim(),
        description: newTask.description
      });
      setNewTask({
        ...newTask,
        template: res.data.template
      });
    } catch (error: unknown) {
      console.error("Failed to generate template:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToGenerateTemplate')) });
    } finally {
      setGeneratingTemplate(false);
    }
  };
  const handleGenerateTheory = async () => {
    if (!topic || !newTask.description.trim()) {
      showToast({ type: "error", message: t('enterTaskConditionFirst') });
      return;
    }
    setGeneratingTheory(true);
    try {
      const res = await api.post(`/topics/${topicId}/tasks/generate-theory`, {
        taskTitle: newTask.title.trim(),
        taskDescription: newTask.description,
        taskType: newTask.type,
        difficulty: parseInt(taskDifficulty)
      });
      setNewTask({
        ...newTask,
        theory: res.data.theory
      });
    } catch (error: unknown) {
      console.error("Failed to generate theory:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToGenerateTheory')) });
    } finally {
      setGeneratingTheory(false);
    }
  };
  const handleCreateControlWork = async () => {
    if (!topicId) return;
    try {
      const res = await api.post(`/topics/${topicId}/control-works`, {
        title: newControlWorkTitle.trim() || null,
        timeLimitMinutes: null,
        hasTheory: false,
        hasPractice: true
      });
      await loadTopic();
      setShowCreateControlWork(false);
      setNewControlWorkTitle("");
    } catch (error: unknown) {
      console.error("Failed to create control work:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToCreateControlWork')) });
    }
  };
  const handleUpdateTask = async () => {
    if (!topicId || !editingTask || !newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      showToast({ type: "error", message: t('fillAllFields') });
      return;
    }
    try {
      await api.put(`/topics/${topicId}/tasks/${editingTask.id}`, {
        title: newTask.title,
        description: newTask.description,
        template: newTask.template,
        maxAttempts: newTask.maxAttempts
      });
      await loadTopic();
      setShowEditTask(false);
      setEditingTask(null);
      setNewTask({
        title: "",
        description: "",
        template: "",
        type: "PRACTICE",
        maxAttempts: 3,
        theory: ""
      });
    } catch (error: unknown) {
      console.error("Failed to update task:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToUpdateTask')) });
    }
  };
  const handleAssignTask = async () => {
    if (!topicId || !assigningTask || !assignDeadline) {
      showToast({ type: "error", message: t('fillAllFieldsRequired') });
      return;
    }
    try {
      const deadlineUTC = convertLocalToUTC(assignDeadline, user?.timezone || undefined);
      await api.post(`/topics/${topicId}/tasks/${assigningTask.id}/assign`, {
        deadline: deadlineUTC
      });
      await loadTopic();
      setShowAssignTask(false);
      setAssigningTask(null);
      setAssignDeadline("");
      showToast({ type: "success", message: t('taskAssignedSuccessfully') });
    } catch (error: unknown) {
      console.error("Failed to assign task:", error);
      showToast({ type: "error", message: getErrorMessage(error, t('failedToAssignTask')) });
    }
  };
  const handleAssignControlWork = async () => {
    if (!assigningControlWork || !assignDeadline) {
      showToast({ type: "error", message: t('fillAllFieldsRequired') });
      return;
    }
    try {
      const deadlineUTC = convertLocalToUTC(assignDeadline, user?.timezone || undefined);
      await api.post(`/topics/control-works/${assigningControlWork.id}/assign`, {
        deadline: deadlineUTC
      });
      await loadTopic();
      setShowAssignControlWork(false);
      setAssigningControlWork(null);
      setAssignDeadline("");
      showToast({ type: "success", message: t('controlWorkAssignedSuccessfully') });
    } catch (error: unknown) {
      console.error("Failed to assign control work:", error);
      const msg = getErrorMessage(error, tr("Не вдалося призначити контрольну роботу", "Failed to assign control work"));
      if (msg === "CONTROL_WORK_REQUIRES_EXACTLY_THREE_TASKS") {
        showToast({
          type: "error",
          message: tr(
            "Перед призначенням контрольної має бути рівно 3 практичні задачі.",
            "Before assigning the control work, it must contain exactly 3 practice tasks."
          )
        });
      } else {
        showToast({ type: "error", message: msg });
      }
    }
  };
  const handleAddTheory = async (taskId: number) => {
    if (!taskTheory.trim()) {
      showToast({ type: "error", message: tr("Введіть теорію", "Enter theory") });
      return;
    }
    try {
      await api.post(`/topics/${topicId}/tasks/${taskId}/theory`, {
        content: taskTheory
      });
      await loadTopic();
      setShowTaskTheory(false);
      setTaskTheory("");
      setSelectedTaskId(null);
    } catch (error: unknown) {
      console.error("Failed to add theory:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося додати теорію", "Failed to add theory")) });
    }
  };
  const handleOpenTestData = async (taskId: number) => {
    setTestDataTaskId(taskId);
    setShowTestDataModal(true);
    setTestDataDisplayLimit(20);
    try {
      const data = await getTestData(taskId);
      setTestDataList(data.testData || []);
    } catch (error: unknown) {
      console.error("Failed to load test data:", error);
      setTestDataList([]);
    }
  };
  const handleGenerateTestData = async () => {
    if (!testDataTaskId) return;
    setGeneratingTestData(true);
    try {
      const result = await generateTestData(testDataTaskId, newTestCount);
      setTestDataList(result.testData || []);
      showToast({ type: "success", message: tr(`Згенеровано ${result.count} тестів`, `Generated ${result.count} tests`) });
    } catch (error: unknown) {
      console.error("Failed to generate test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося згенерувати тести", "Failed to generate tests")) });
    } finally {
      setGeneratingTestData(false);
    }
  };
  const handleAddTestData = async () => {
    if (!testDataTaskId) return;
    try {
      await addTestData(testDataTaskId, [{
        input: "",
        expectedOutput: "",
        points: 1
      }]);
      const data = await getTestData(testDataTaskId);
      setTestDataList(data.testData || []);
    } catch (error: unknown) {
      console.error("Failed to add test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося додати тест", "Failed to add test")) });
    }
  };

  const handleImportTestFiles = async () => {
    if (!testDataTaskId) return;
    if (importingFiles) return;
    if (importFiles.length === 0) {
      showToast({ type: "error", message: tr("Оберіть файли .in та .out", "Choose .in and .out files") });
      return;
    }
    setImportingFiles(true);
    try {
      const { tests, errors } = await importTestsFromInOutFiles(importFiles);
      if (errors.length > 0) {
        showToast({
          type: "info",
          message: `${tr("Знайдено проблеми з файлами:", "Found issues with selected files:")}\n\n${errors.slice(0, 12).join("\n")}${errors.length > 12 ? `\n... (+${errors.length - 12})` : ""}`,
          durationMs: 8000
        });
      }
      if (tests.length === 0) return;

      await addTestData(testDataTaskId, tests.map(t => ({
        input: t.input,
        expectedOutput: t.expectedOutput,
        points: importPoints,
        isHidden: importIsHidden
      })));

      const data = await getTestData(testDataTaskId);
      setTestDataList(data.testData || []);
      setImportFiles([]);
      setImportInputKey(k => k + 1);
    } catch (error: unknown) {
      console.error("Failed to import tests:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося імпортувати тести", "Failed to import tests")) });
    } finally {
      setImportingFiles(false);
    }
  };
  const handleUpdateTestData = async (testDataId: number) => {
    if (!testDataTaskId || !editingTest) return;
    try {
      await updateTestData(testDataTaskId, testDataId, editingTest);
      const data = await getTestData(testDataTaskId);
      setTestDataList(data.testData || []);
      setEditingTestIndex(null);
      setEditingTest(null);
    } catch (error: unknown) {
      console.error("Failed to update test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося оновити тест", "Failed to update test")) });
    }
  };
  const handleDeleteTestData = async (testDataId: number) => {
    if (!testDataTaskId) return;
    if (!confirm(t('deleteThisTest'))) return;
    try {
      await deleteTestData(testDataTaskId, testDataId);
      const data = await getTestData(testDataTaskId);
      setTestDataList(data.testData || []);
    } catch (error: unknown) {
      console.error("Failed to delete test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити тест", "Failed to delete test")) });
    }
  };
  const handleDeleteTask = async (taskId: number) => {
    if (!topicId) return;
    try {
      await api.delete(`/topics/${topicId}/tasks/${taskId}`);
      await loadTopic();
      showToast({ type: "success", message: tr("Завдання успішно видалено", "Task deleted successfully") });
    } catch (error: unknown) {
      console.error("Failed to delete task:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити завдання", "Failed to delete task")) });
    }
  };

  function parseFilenameFromContentDisposition(v: string | undefined): string | null {
    if (!v) return null;
    const m = v.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
    const raw = (m?.[1] || m?.[2] || m?.[3] || "").trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  const handleExportTaskArchive = async (taskId: number) => {
    if (!topicId) return;
    try {
      const res = await api.get(`/topics/${topicId}/tasks/${taskId}/export-archive`, {
        responseType: "blob"
      });
      const headers = res.headers as Record<string, string | undefined> | undefined;
      const cd = headers?.["content-disposition"];
      const filename = parseFilenameFromContentDisposition(cd) || `task_${taskId}.zip`;
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error("Failed to export archive:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося експортувати архів", "Failed to export archive")) });
    }
  };

  const handleImportTaskArchiveFile = async (file: File | null) => {
    if (!topicId) return;
    if (!file) return;
    if (importingArchive) return;
    setImportingArchive(true);
    try {
      const form = new FormData();
      form.append("archive", file);
      await api.post(`/topics/${topicId}/tasks/import-archive`, form);
      await loadTopic();
      showToast({ type: "success", message: tr("Завдання імпортовано", "Task imported") });
    } catch (error: unknown) {
      console.error("Failed to import archive:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося імпортувати архів", "Failed to import archive")) });
    } finally {
      setImportingArchive(false);
      setImportArchiveKey(k => k + 1);
    }
  };
  const handleDeleteControlWork = async (controlWorkId: number) => {
    try {
      await api.delete(`/topics/control-works/${controlWorkId}`);
      await loadTopic();
      showToast({ type: "success", message: tr("Контрольну роботу успішно видалено", "Control work deleted successfully") });
    } catch (error: unknown) {
      console.error("Failed to delete control work:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити контрольну роботу", "Failed to delete control work")) });
    }
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center">
        <div className="text-text-primary font-mono">{t("loading")}</div>
      </div>;
  }
  if (!topic) {
    return <div className="h-full flex items-center justify-center">
        <div className="text-text-primary font-mono">{t('topicNotFound')}</div>
      </div>;
  }
  const practiceTasks = topic.tasks?.filter(t => t.type === "PRACTICE") || [];
  const controlWorks = topic.controlWorks || [];
  return <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div>
            <h1 className="text-2xl font-mono text-text-primary">{topic.title}</h1>
            {topic.description && <p className="text-text-secondary text-sm mt-1">{topic.description}</p>}
          </div>
        </div>

        {}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-mono text-text-primary">{t('practicalTasks')} ({practiceTasks.length})</h2>
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex items-center gap-2">
                <input key={importArchiveKey} id="import-task-archive" type="file" accept=".zip" className="hidden" onChange={e => {
              const f = e.target.files?.[0] || null;
              handleImportTaskArchiveFile(f);
            }} />
                <Button variant="ghost" onClick={() => {
              const el = document.getElementById("import-task-archive") as HTMLInputElement | null;
              el?.click();
            }} disabled={importingArchive} title={tr("Імпорт архіву завдання (.zip)", "Import task archive (.zip)")}>
                  <Upload className="w-4 h-4 mr-2" />
                  {tr("Імпорт", "Import")}
                </Button>
                <Button onClick={() => setShowCreateTask(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('addTask')}
                </Button>
              </div>}
          </div>

          <div className="space-y-2">
            {practiceTasks.length === 0 ? <p className="text-text-secondary text-sm">{t('noTasks')}</p> : practiceTasks.map(task => <div key={task.id} className="p-3 border border-border hover:bg-bg-hover transition-fast">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-mono text-text-primary">{task.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {task.theory && <div className="text-xs text-text-secondary">✓ {t('theoryAdded')}</div>}
                        {task.isAssigned && <div className="text-xs text-green-500">✓ {t('assigned')}</div>}
                        {task.deadline && <div className="text-xs text-text-secondary">
                            {t('deadlineLabel')}: {formatDeadlineForDisplay(task.deadline, user?.timezone || undefined)}
                          </div>}
                      </div>
                    </div>
                    {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex gap-2 items-center">
                        <div className="flex gap-2">
                          {!task.isAssigned ? <Button variant="ghost" onClick={e => {
                    e.stopPropagation();
                    setAssigningTask(task);
                    setShowAssignTask(true);
                  }} className="text-xs">
                              <Plus className="w-3 h-3 mr-1" />
                              {t('assign')}
                            </Button> : <Button variant="ghost" onClick={async e => {
                    e.stopPropagation();
                    if (confirm(tr(`Відкликати завдання "${task.title}"?`, `Unassign task "${task.title}"?`))) {
                      try {
                        await unassignTask(task.id);
                        await loadTopic();
                        showToast({ type: "success", message: tr("Завдання відкликано", "Task unassigned") });
                      } catch (error: unknown) {
                        console.error("Failed to unassign task:", error);
                        showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося відкликати завдання", "Failed to unassign task")) });
                      }
                    }
                  }} className="text-xs text-accent-warning hover:text-accent-warning">
                              <X className="w-3 h-3 mr-1" />
                              {tr("Відкликати", "Unassign")}
                            </Button>}
                          <Button variant="ghost" onClick={e => {
                    e.stopPropagation();
                    handleOpenTestData(task.id);
                  }} className="text-xs">
                            <FileText className="w-3 h-3 mr-1" />
                            {t('tests')}
                          </Button>
                          <Button variant="ghost" onClick={e => {
                    e.stopPropagation();
                    setEditingTask(task);
                    setNewTask({
                      title: task.title,
                      description: task.description,
                      template: task.template,
                      type: task.type,
                      maxAttempts: task.maxAttempts,
                      theory: task.theory?.content || ""
                    });
                    setShowEditTask(true);
                  }} className="text-xs">
                            <Edit2 className="w-3 h-3 mr-1" />
                            {t('edit')}
                          </Button>
                          <Button variant="ghost" onClick={e => {
                    e.stopPropagation();
                    setSelectedTaskId(task.id);
                    setTaskTheory(task.theory?.content || "");
                    setShowTaskTheory(true);
                  }} className="text-xs">
                            <Edit2 className="w-3 h-3 mr-1" />
                            {t('theory')}
                          </Button>
                          <Button variant="ghost" onClick={e => {
                    e.stopPropagation();
                    handleExportTaskArchive(task.id);
                  }} className="text-xs" title={tr("Експортувати архів завдання", "Export task archive")}
                  >
                            <Download className="w-3 h-3 mr-1" />
                            {tr("Експорт", "Export")}
                          </Button>
                        </div>
                        <Button variant="ghost" onClick={e => {
                  e.stopPropagation();
                  if (confirm(`${t('deleteTask')} "${task.title}"?`)) {
                    handleDeleteTask(task.id);
                  }
                }} className="text-xs text-accent-error hover:text-accent-error ml-auto">
                          <Trash2 className="w-3 h-3 mr-1" />
                          {t('delete')}
                        </Button>
                      </div>}
                  </div>
                </div>)}
          </div>
        </Card>

        {}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-mono text-text-primary">{t('controlWorks')} ({controlWorks.length})</h2>
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button onClick={() => setShowCreateControlWork(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('createControlWork')}
              </Button>}
          </div>


          <div className="space-y-2">
            {controlWorks.length === 0 ? <p className="text-text-secondary text-sm">{t('noControlWorks')}</p> : controlWorks.map(cw => <div key={cw.id} className="p-3 border border-border hover:bg-bg-hover transition-fast">
                  <div className="flex items-center justify-between">
                    <button type="button" className="flex-1 text-left" onClick={() => {
                navigate(`/edu/control-works/${cw.id}`);
              }}>
                      <div className="text-sm font-mono text-text-primary">
                        {cw.title || `${t('controlWork')} #${cw.id}`}
                        {cw.timeLimitMinutes && ` (${cw.timeLimitMinutes} ${t('min')})`}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="text-xs text-text-secondary">
                          {cw.hasTheory && `✓ ${t('test')}`} {cw.hasTheory && cw.hasPractice && " + "} {cw.hasPractice && `✓ ${t('practice')}`}
                        </div>
                        {cw.isAssigned && <div className="text-xs text-green-500">✓ {t('assigned')}</div>}
                        {cw.deadline && <div className="text-xs text-text-secondary">
                            {t('deadlineLabel')}: {formatDeadlineForDisplay(cw.deadline, user?.timezone || undefined)}
                          </div>}
                      </div>
                    </button>
                    {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex gap-2 items-center">
                        {!cw.isAssigned ? <Button variant="ghost" onClick={e => {
                  e.stopPropagation();
                  setAssigningControlWork(cw);
                  setShowAssignControlWork(true);
                }} className="text-xs">
                            <Plus className="w-3 h-3 mr-1" />
                            {t('assign')}
                          </Button> : <Button variant="ghost" onClick={async e => {
                  e.stopPropagation();
                  if (confirm(tr(`Відкликати контрольну роботу "${cw.title || `Контрольна робота #${cw.id}`}"?`, `Unassign control work "${cw.title || `Control work #${cw.id}`}"?`))) {
                    try {
                      await unassignControlWork(cw.id);
                      await loadTopic();
                      showToast({ type: "success", message: tr("Контрольну роботу відкликано", "Control work unassigned") });
                    } catch (error: unknown) {
                      console.error("Failed to unassign control work:", error);
                      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося відкликати контрольну роботу", "Failed to unassign control work")) });
                    }
                  }
                }} className="text-xs text-accent-warning hover:text-accent-warning">
                            <X className="w-3 h-3 mr-1" />
                            {tr("Відкликати", "Unassign")}
                          </Button>}
                        <Button variant="ghost" onClick={e => {
                  e.stopPropagation();
                  if (confirm(`${t('delete')} ${t('controlWork')} #${cw.id}?`)) {
                    handleDeleteControlWork(cw.id);
                  }
                }} className="text-xs text-accent-error hover:text-accent-error ml-auto">
                          <Trash2 className="w-3 h-3 mr-1" />
                          {t('delete')}
                        </Button>
                      </div>}
                  </div>
                </div>)}
          </div>
        </Card>

        {}
        {showCreateTask && <Modal open={showCreateTask} onClose={() => {
        setShowCreateTask(false);
        setNewTask({
          title: "",
          description: "",
          template: "",
          type: "PRACTICE",
          maxAttempts: 3,
          theory: ""
        });
      }} title={newTask.type === "CONTROL" ? tr("Створити контрольне завдання", "Create control task") : tr("Створити практичне завдання", "Create practice task")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Назва завдання", "Task title")} *</label>
                <input type="text" value={newTask.title} onChange={e => setNewTask({
              ...newTask,
              title: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Назва завдання", "Task title")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Умова завдання", "Task statement")} *
                  <Button variant="ghost" onClick={handleGenerateCondition} disabled={generatingCondition} className="ml-2 text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingCondition ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                  <MarkdownImageInsertButton
                    value={newTask.description}
                    onChange={value => setNewTask({
                      ...newTask,
                      description: value
                    })}
                    textareaRef={createDescriptionRef}
                    className="ml-2 text-xs"
                  />
                </label>
                <textarea ref={createDescriptionRef} value={newTask.description} onChange={e => setNewTask({
              ...newTask,
              description: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[150px]" placeholder={tr("Умова завдання...", "Task statement...")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Шаблон коду", "Code template")} *
                  <Button variant="ghost" onClick={handleGenerateTemplate} disabled={generatingTemplate} className="ml-2 text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingTemplate ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                </label>
                <textarea value={newTask.template} onChange={e => setNewTask({
              ...newTask,
              template: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[200px] font-mono text-sm" placeholder={tr("Шаблон коду...", "Code template...")} />
              </div>

              {newTask.type === "PRACTICE" && <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {tr("Максимальна кількість спроб", "Max attempts")}
                  </label>
                  <input type="number" min="1" value={newTask.maxAttempts} onChange={e => setNewTask({
              ...newTask,
              maxAttempts: parseInt(e.target.value) || 1
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
                </div>}

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Теорія (необов'язково)", "Theory (optional)")}
                  <Button variant="ghost" onClick={handleGenerateTheory} disabled={generatingTheory || !newTask.description.trim()} className="ml-2 text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingTheory ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                </label>
                <textarea value={newTask.theory} onChange={e => setNewTask({
              ...newTask,
              theory: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[150px]" placeholder={tr("Теорія до завдання (Markdown)...", "Task theory (Markdown)...")} />
                <p className="text-xs text-text-muted mt-1">
                  {tr("Теорія буде доступна учням для вивчення та як підказка після помилки", "Theory will be available to students for learning and as a hint after mistakes")}
                </p>
              </div>

              {newTask.type === "PRACTICE" && <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {tr("Складність (для генерації умови)", "Difficulty (for generation)")}
                  </label>
                  <select value={taskDifficulty} onChange={e => setTaskDifficulty(parseTaskDifficulty(e.target.value))} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary">
                    <option value="1">{tr("Легка (1) - базові концепції", "Easy (1) — basics")}</option>
                    <option value="2">{tr("Проста (2) - прості алгоритми", "Simple (2) — simple algorithms")}</option>
                    <option value="3">{tr("Середня (3) - стандартні задачі", "Medium (3) — standard problems")}</option>
                    <option value="4">{tr("Складна (4) - алгоритми середньої складності", "Hard (4) — intermediate algorithms")}</option>
                    <option value="5">{tr("Дуже складна (5) - складні алгоритми та структури даних", "Very hard (5) — advanced algorithms and data structures")}</option>
                  </select>
                  <p className="text-xs text-text-muted mt-1">
                    {tr("Впливає на складність згенерованої умови завдання", "Affects the generated task difficulty")}
                  </p>
                </div>}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowCreateTask(false);
              setNewTask({
                title: "",
                description: "",
                template: "",
                type: "PRACTICE",
                maxAttempts: 3,
                theory: ""
              });
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleCreateTask}>{t("create")}</Button>
              </div>
            </div>
          </Modal>}

        {}
        {showEditTask && editingTask && <Modal open={showEditTask} onClose={() => {
        setShowEditTask(false);
        setEditingTask(null);
        setNewTask({
          title: "",
          description: "",
          template: "",
          type: "PRACTICE",
          maxAttempts: 3,
          theory: ""
        });
      }} title={tr("Редагувати завдання", "Edit task")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Назва завдання", "Task title")} *</label>
                <input type="text" value={newTask.title} onChange={e => setNewTask({
              ...newTask,
              title: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Назва завдання", "Task title")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Умова завдання", "Task description")} *
                  <Button variant="ghost" onClick={handleGenerateCondition} disabled={generatingCondition} className="ml-2 text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingCondition ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                  <MarkdownImageInsertButton
                    value={newTask.description}
                    onChange={value => setNewTask({
                      ...newTask,
                      description: value
                    })}
                    textareaRef={editDescriptionRef}
                    className="ml-2 text-xs"
                  />
                </label>
                <textarea ref={editDescriptionRef} value={newTask.description} onChange={e => setNewTask({
              ...newTask,
              description: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[150px]" placeholder={tr("Умова завдання...", "Task description...")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Шаблон коду", "Code template")} *
                  <Button variant="ghost" onClick={handleGenerateTemplate} disabled={generatingTemplate} className="ml-2 text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingTemplate ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                </label>
                <textarea value={newTask.template} onChange={e => setNewTask({
              ...newTask,
              template: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[200px] font-mono text-sm" placeholder={tr("Шаблон коду...", "Code template...")} />
              </div>

              {editingTask.type === "PRACTICE" && <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {tr("Максимальна кількість спроб", "Max attempts")}
                  </label>
                  <input type="number" min="1" value={newTask.maxAttempts} onChange={e => setNewTask({
              ...newTask,
              maxAttempts: parseInt(e.target.value) || 1
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
                </div>}

              {editingTask.type === "PRACTICE" && <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {tr("Складність (для генерації умови)", "Difficulty (for generation)")}
                  </label>
                  <select value={taskDifficulty} onChange={e => setTaskDifficulty(parseTaskDifficulty(e.target.value))} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary">
                    <option value="1">{tr("Легка (1) - базові концепції", "Easy (1) — basics")}</option>
                    <option value="2">{tr("Проста (2) - прості алгоритми", "Simple (2) — simple algorithms")}</option>
                    <option value="3">{tr("Середня (3) - стандартні задачі", "Medium (3) — standard problems")}</option>
                    <option value="4">{tr("Складна (4) - алгоритми середньої складності", "Hard (4) — intermediate algorithms")}</option>
                    <option value="5">{tr("Дуже складна (5) - складні алгоритми та структури даних", "Very hard (5) — advanced algorithms and data structures")}</option>
                  </select>
                  <p className="text-xs text-text-muted mt-1">
                    {tr("Впливає на складність згенерованої умови завдання", "Affects the difficulty of the generated task description")}
                  </p>
                </div>}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowEditTask(false);
              setEditingTask(null);
              setNewTask({
                title: "",
                description: "",
                template: "",
                type: "PRACTICE",
                maxAttempts: 3,
                theory: ""
              });
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleUpdateTask}>{t("save")}</Button>
              </div>
            </div>
          </Modal>}

        {}
        {showAssignTask && assigningTask && <Modal open={showAssignTask} onClose={() => {
        setShowAssignTask(false);
        setAssigningTask(null);
        setAssignDeadline("");
      }} title={tr("Призначити завдання учням", "Assign task to students")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Дедлайн", "Deadline")} *
                </label>
                <input type="datetime-local" value={assignDeadline} onChange={e => setAssignDeadline(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowAssignTask(false);
              setAssigningTask(null);
              setAssignDeadline("");
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleAssignTask}>{tr("Призначити", "Assign")}</Button>
              </div>
            </div>
          </Modal>}

        {}
        {showAssignControlWork && assigningControlWork && <Modal open={showAssignControlWork} onClose={() => {
        setShowAssignControlWork(false);
        setAssigningControlWork(null);
        setAssignDeadline("");
      }} title={tr("Призначити контрольну роботу учням", "Assign control work to students")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Дедлайн", "Deadline")} *
                </label>
                <input type="datetime-local" value={assignDeadline} onChange={e => setAssignDeadline(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowAssignControlWork(false);
              setAssigningControlWork(null);
              setAssignDeadline("");
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleAssignControlWork}>{tr("Призначити", "Assign")}</Button>
              </div>
            </div>
          </Modal>}

        {}
        {showTaskTheory && <Modal open={showTaskTheory} onClose={() => {
        setShowTaskTheory(false);
        setTaskTheory("");
        setSelectedTaskId(null);
      }} title={tr("Теорія до завдання", "Task theory")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Контент теорії (Markdown)", "Theory content (Markdown)")}
                </label>
                <textarea value={taskTheory} onChange={e => setTaskTheory(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[300px]" placeholder={tr("Введіть теорію...", "Enter theory...")} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowTaskTheory(false);
              setTaskTheory("");
              setSelectedTaskId(null);
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={() => selectedTaskId && handleAddTheory(selectedTaskId)}>
                  {t("save")}
                </Button>
              </div>
            </div>
          </Modal>}

        {}
        {showCreateControlWork && <Modal open={showCreateControlWork} onClose={() => {
        setShowCreateControlWork(false);
        setNewControlWorkTitle("");
      }} title={t('createControlWork')}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Назва контрольної роботи", "Control work title")} ({t('optional')})
                </label>
                <input type="text" value={newControlWorkTitle} onChange={e => setNewControlWorkTitle(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Контрольна робота №1", "Example: Control work #1")} />
                <p className="text-xs text-text-muted mt-1">
                  {tr('Якщо не вказано, буде використано "Контрольна робота #ID"', 'If empty, we will use "Control work #ID"')}
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowCreateControlWork(false);
              setNewControlWorkTitle("");
            }}>
                  {t('cancel')}
                </Button>
                <Button onClick={handleCreateControlWork}>
                  {t('create')}
                </Button>
              </div>
            </div>
          </Modal>}

        {}
        {showTestDataModal && testDataTaskId && <Modal open={showTestDataModal} onClose={() => {
        setShowTestDataModal(false);
        setTestDataTaskId(null);
        setTestDataList([]);
        setTestDataDisplayLimit(20);
        setEditingTestIndex(null);
        setEditingTest(null);
        setImportFiles([]);
        setImportPoints(1);
        setImportIsHidden(false);
        setImportingFiles(false);
        setImportInputKey(k => k + 1);
      }} title={tr("Тестові дані для перевірки завдання", "Test data for checking")}>
            <div className="space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button onClick={handleGenerateTestData} disabled={generatingTestData} className="text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingTestData ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                  <input type="number" min="1" max="20" value={newTestCount} onChange={e => setNewTestCount(parseInt(e.target.value) || 10)} className="w-20 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs" placeholder={tr("Кількість", "Count")} />
                  <span className="text-xs text-text-secondary">{tr("тестів", "tests")}</span>
                </div>
                <Button onClick={handleAddTestData} variant="ghost" className="text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  {tr("Додати вручну", "Add manually")}
                </Button>
              </div>

              <Card className="p-3">
                <div className="text-xs font-mono text-text-secondary mb-2">
                  {tr("Імпорт тестів з файлів (.in/.out)", "Import tests from files (.in/.out)")}
                </div>
                <input key={importInputKey} type="file" multiple accept=".in,.out,text/plain" onChange={e => setImportFiles(Array.from(e.target.files || []))} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-xs" />
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">{tr("Бали", "Points")}</label>
                    <input type="number" min="1" max="100" value={importPoints} onChange={e => setImportPoints(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-xs" />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                    <input type="checkbox" checked={importIsHidden} onChange={e => setImportIsHidden(e.target.checked)} className="h-4 w-4" />
                    {tr("Імпортувати як приховані", "Import as hidden")}
                  </label>
                  <Button onClick={handleImportTestFiles} disabled={importingFiles || importFiles.length === 0} className="text-xs">
                    {importingFiles ? tr("Імпорт...", "Importing...") : tr("Імпортувати", "Import")}
                  </Button>
                </div>
                <p className="text-[11px] text-text-muted mt-2">
                  {tr("Пари визначаються за назвою: sample.in + sample.out", "Pairs are matched by name: sample.in + sample.out")}
                </p>
              </Card>

              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-text-secondary">
                  {testDataList.length > 0
                    ? tr(
                        `Показано ${testDataDisplayLimit === "ALL" ? testDataList.length : Math.min(testDataList.length, testDataDisplayLimit)} з ${testDataList.length}`,
                        `Showing ${testDataDisplayLimit === "ALL" ? testDataList.length : Math.min(testDataList.length, testDataDisplayLimit)} of ${testDataList.length}`
                      )
                    : ""}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-secondary">{tr("Показувати", "Show")}</span>
                  <select
                    value={testDataDisplayLimit}
                    onChange={(e) => setTestDataDisplayLimit(parseDisplayLimit(e.target.value))}
                    className="px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs focus:outline-none"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value="ALL">{tr("Усі", "All")}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {testDataList.length === 0 ? <p className="text-text-secondary text-sm text-center py-4">
                    {tr("Немає тестових даних. Згенеруйте або додайте вручну.", "No test data. Generate or add manually.")}
                  </p> : (testDataDisplayLimit === "ALL" ? testDataList : testDataList.slice(0, testDataDisplayLimit)).map((test, index) => <Card key={test.id} className="p-3">
                      {editingTestIndex === index ? <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-text-secondary">
                              {tr("Тест", "Test")} #{index + 1}
                            </span>
                            <div className="flex gap-1">
                              <Button variant="ghost" onClick={() => handleUpdateTestData(test.id)} className="text-xs p-1 h-6 w-6 flex items-center justify-center" title={t("save")}>
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" onClick={() => {
                      setEditingTestIndex(null);
                      setEditingTest(null);
                    }} className="text-xs p-1 h-6 w-6 flex items-center justify-center" title={t("cancel")}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-mono text-text-secondary mb-1">
                              {tr("Вхідні дані", "Input")}
                            </label>
                            <textarea value={editingTest?.input || ""} onChange={e => setEditingTest({
                    ...editingTest!,
                    input: e.target.value
                  })} placeholder={tr("Наприклад: 5 10", "Example: 5 10")} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary min-h-[80px] resize-y" />
                          </div>
                          <div>
                            <label className="block text-xs font-mono text-text-secondary mb-1">
                              {tr("Очікуваний вивід", "Expected output")}
                            </label>
                            <textarea value={editingTest?.expectedOutput || ""} onChange={e => setEditingTest({
                    ...editingTest!,
                    expectedOutput: e.target.value
                  })} placeholder={tr("Наприклад: 15", "Example: 15")} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary min-h-[80px] resize-y" />
                          </div>
                          <div>
                            <label className="block text-xs font-mono text-text-secondary mb-1">
                              {tr("Бали", "Points")}
                            </label>
                            <input type="number" min="1" max="100" value={editingTest?.points || 1} onChange={e => setEditingTest({
                    ...editingTest!,
                    points: parseInt(e.target.value) || 1
                  })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                          </div>
                              <div className="flex items-center gap-2">
                                <input id={`test-hidden-${test.id}`} type="checkbox" checked={editingTest?.isHidden === true} onChange={e => setEditingTest({
                        ...editingTest!,
                        isHidden: e.target.checked
                      })} className="h-4 w-4" />
                                <label htmlFor={`test-hidden-${test.id}`} className="text-xs font-mono text-text-secondary" title={tr("Прихований тест не показується учню, але впливає на оцінку.", "Hidden test is not shown to the student but affects scoring.")}>{tr("Прихований", "Hidden")}</label>
                              </div>
                        </div> : <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono text-text-secondary">
                                  {tr("Тест", "Test")} #{index + 1} • {test.points} {tr("балів", "points")}{test.isHidden ? ` • ${tr("прихований", "hidden")}` : ""}
                            </span>
                            <div className="flex gap-2">
                              <button onClick={() => {
                      setEditingTestIndex(index);
                      setEditingTest({
                        input: test.input,
                            expectedOutput: test.expectedOutput || "",
                            points: test.points,
                            isHidden: test.isHidden === true
                      });
                    }} className="h-11 w-11 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-primary transition-fast" title={tr("Редагувати", "Edit")} aria-label={tr("Редагувати тест", "Edit test")}>
                                <Edit2 className="w-4 h-4 text-primary" />
                              </button>
                              <button onClick={() => handleDeleteTestData(test.id)} className="h-11 w-11 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent-error transition-fast" title={t('delete')} aria-label={tr("Видалити тест", "Delete test")}>
                                <Trash2 className="w-4 h-4 text-accent-error" />
                              </button>
                            </div>
                          </div>
                          <div className="text-xs font-mono">
                            <div className="text-text-secondary mb-1">
                              <strong>{tr("Вхід", "Input")}:</strong> {test.input || tr("(порожньо)", "(empty)")}
                            </div>
                            <div className="text-text-secondary">
                              <strong>{tr("Вивід", "Output")}:</strong> {test.expectedOutput || tr("(порожньо)", "(empty)")}
                            </div>
                          </div>
                        </div>}
                    </Card>)}
              </div>
            </div>
          </Modal>}
      </div>
    </div>;
};
