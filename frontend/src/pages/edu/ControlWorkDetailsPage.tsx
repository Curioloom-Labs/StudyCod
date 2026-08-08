import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { Button } from "../../components/ui/Button";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { ArrowLeft, Plus, Trash2, Edit2, Sparkles, Settings, Save, X, FileText, ShieldCheck, Clock, Calculator } from "lucide-react";
import { PageSkeleton, Skeleton } from "../../components/ui/Skeleton";
import { api } from "../../lib/api/client";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import { generateTestData, getTestData, getTestDataItem, addTestData, updateTestData, deleteTestData, deleteGeneratedTestData, type TestData, updateControlWorkFormula } from "../../lib/api/edu";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { toast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
interface ControlWork {
  id: number;
  title?: string | null;
  topicId?: number;
  topic?: {
    id: number;
    title: string;
  };
  timeLimitMinutes?: number | null;
  quizJson?: string | null;
  hasTheory: boolean;
  hasPractice: boolean;
  formula?: string | null;
  tasks?: ControlTask[];
}
interface ControlTask {
  id: number;
  title: string;
  description: string;
  template: string;
  order: number;
  maxAttempts: number;
}

type QuizQuestion = {
  question?: string;
  q?: string;
  options?: string[] | Record<string, string>;
  correct?: number | string;
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  getErrorMessageFromUnknown(error, fallback);

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const status = Reflect.get(response, "status");
  return typeof status === "number" ? status : null;
};

const DEFAULT_CONTROL_WORK_FORMULA = "0.35 * test + 0.65 * avg(practice)";
const BALANCED_CONTROL_WORK_FORMULA = "0.5 * test + 0.5 * avg(practice)";
const PRACTICE_ONLY_FORMULA = "avg(practice)";
const QUIZ_ONLY_FORMULA = "test";

export const ControlWorkDetailsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const {
    controlWorkId
  } = useParams<{
    controlWorkId: string;
  }>();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [controlWork, setControlWork] = useState<ControlWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showQuizSettings, setShowQuizSettings] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    template: "",
    maxAttempts: 1
  });
  const [generatingCondition, setGeneratingCondition] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [taskDifficulty, setTaskDifficulty] = useState(3);
  const [aiResponseLanguage, setAiResponseLanguage] = useState(i18n.language?.toLowerCase().startsWith("en") ? "English" : "Українська");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [hasTheory, setHasTheory] = useState(false);
  const [hasPractice, setHasPractice] = useState(true);
  const [quizTopicTitle, setQuizTopicTitle] = useState("");
  const [quizCount, setQuizCount] = useState(12);
  const [showGenerateQuizModal, setShowGenerateQuizModal] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    question: "",
    options: {
      А: "",
      Б: "",
      В: "",
      Г: "",
      Д: ""
    },
    correct: "А" as "А" | "Б" | "В" | "Г" | "Д"
  });
  const [showEditTask, setShowEditTask] = useState(false);
  const [editingTask, setEditingTask] = useState<ControlTask | null>(null);
  const [showTestDataModal, setShowTestDataModal] = useState(false);
  const [testDataTaskId, setTestDataTaskId] = useState<number | null>(null);
  const [testDataList, setTestDataList] = useState<TestData[]>([]);
  const [testDataPageSize, setTestDataPageSize] = useState<20 | 50 | 100>(20);
  const [testDataOffset, setTestDataOffset] = useState(0);
  const [testDataTotal, setTestDataTotal] = useState(0);
  const [testDataHasMore, setTestDataHasMore] = useState(false);
  const [testDataSourceFilter, setTestDataSourceFilter] = useState<"ALL" | "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED">("ALL");
  const [loadingTestDataPage, setLoadingTestDataPage] = useState(false);
  const [replaceGeneratedOnGenerate, setReplaceGeneratedOnGenerate] = useState(true);
  const [clearingGeneratedTests, setClearingGeneratedTests] = useState(false);
  const [editingTestIndex, setEditingTestIndex] = useState<number | null>(null);
  const [editingTest, setEditingTest] = useState<{
    input: string;
    expectedOutput: string;
    points: number;
    isHidden?: boolean;
    subtask?: string;
  } | null>(null);
  const [newTestCount, setNewTestCount] = useState(10);
  const [generatingTestData, setGeneratingTestData] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importPoints, setImportPoints] = useState(1);
  const [importIsHidden, setImportIsHidden] = useState(false);
  const [importSubtask, setImportSubtask] = useState("");
  const [importingFiles, setImportingFiles] = useState(false);
  const [importInputKey, setImportInputKey] = useState(0);
  const [controlWorkTitle, setControlWorkTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [formula, setFormula] = useState<string>("");
  const [savingFormula, setSavingFormula] = useState(false);
  const createDescriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const editDescriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isAurora = useUIMode().mode === "aurora";
  const normalizeSubtask = (value: string | null | undefined): string | null => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized.slice(0, 64) : null;
  };
  const parsePageSize = (value: string): 20 | 50 | 100 => {
    const parsed = Number.parseInt(value, 10);
    if (parsed === 20 || parsed === 50 || parsed === 100) return parsed;
    return 20;
  };
  const TEST_DATA_PREVIEW_CHARS = 600;
  const optionLabel = (key: "А" | "Б" | "В" | "Г" | "Д") => {
    const map: Record<"А" | "Б" | "В" | "Г" | "Д", "A" | "B" | "C" | "D" | "E"> = {
      А: "A",
      Б: "B",
      В: "C",
      Г: "D",
      Д: "E"
    };
    return i18n.language?.toLowerCase().startsWith("en") ? map[key] : key;
  };
  const normalizeCorrectLetter = (value: string): ("А" | "Б" | "В" | "Г" | "Д") | null => {
    const upper = value.toUpperCase();
    if (["А", "Б", "В", "Г", "Д"].includes(upper)) return upper as "А" | "Б" | "В" | "Г" | "Д";
    const enToUk: Record<string, "А" | "Б" | "В" | "Г" | "Д"> = {
      A: "А",
      B: "Б",
      C: "В",
      D: "Г",
      E: "Д"
    };
    return enToUk[upper] ?? null;
  };
  useEffect(() => {
    setAiResponseLanguage(prev => prev.trim().length > 0 ? prev : i18n.language?.toLowerCase().startsWith("en") ? "English" : "Українська");
  }, [i18n.language]);
  useEffect(() => {
    const init = async () => {
      await loadUser();
    };
    init();
  }, []);
  useEffect(() => {
    if (user && controlWorkId) {
      loadControlWork();
    }
  }, [user, controlWorkId]);
  const loadUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };
  const loadControlWork = async () => {
    if (!controlWorkId) {
      console.error("No controlWorkId provided");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/topics/control-works/${controlWorkId}`);
      const cw = res.data.controlWork;
      if (!cw) {
        throw new Error("Control work not found in response");
      }
      setControlWork(cw);
      setControlWorkTitle(cw.title || "");
      setTimeLimitMinutes(cw.timeLimitMinutes || null);
      setHasTheory(cw.hasTheory || false);
      setHasPractice(cw.hasPractice !== undefined ? cw.hasPractice : true);
      setFormula(cw.formula || "");
      if (cw.topic?.title) {
        setQuizTopicTitle(cw.topic.title);
      }
      if (cw.quizJson) {
        try {
          const parsed = JSON.parse(cw.quizJson);
          setQuizQuestions(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          console.error("Failed to parse quiz:", e);
          setQuizQuestions([]);
        }
      } else {
        setQuizQuestions([]);
      }
    } catch (error: unknown) {
      console.error("Failed to load control work:", error);
      const errorMessage = getErrorMessage(error, tr("Не вдалося завантажити контрольну роботу", "Failed to load control work"));
      const status = getErrorStatus(error);
      console.error("Error details:", errorMessage, status);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  const handleCreateTask = async () => {
    if (!controlWorkId || !newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      toast.error(tr("Заповніть всі обов'язкові поля", "Fill all required fields"));
      return;
    }
    if (!controlWork) {
      toast.error(tr("Контрольна робота не завантажена", "Control work not loaded"));
      return;
    }
    try {
      const topicId = controlWork.topic?.id;
      if (!topicId) {
        toast.error(tr("Не вдалося визначити тему", "Failed to determine topic"));
        return;
      }
      await api.post(`/topics/${topicId}/tasks`, {
        title: newTask.title,
        description: newTask.description,
        template: newTask.template,
        type: "CONTROL",
        controlWorkId: parseInt(controlWorkId!, 10),
        order: (controlWork?.tasks?.length || 0) + 1,
        maxAttempts: 1
      });
      await loadControlWork();
      setShowCreateTask(false);
      setNewTask({
        title: "",
        description: "",
        template: "",
        maxAttempts: 1
      });
    } catch (error: unknown) {
      console.error("Failed to create task:", error);
      const msg = getErrorMessage(error, tr("Не вдалося створити завдання", "Failed to create task"));
      if (msg === "CONTROL_WORK_MAX_TASKS_REACHED") {
        toast.error(tr("У контрольній може бути максимум 3 практичні задачі.", "A control work can contain at most 3 practice tasks."));
      } else {
        toast.error(msg);
      }
    }
  };
  const handleUpdateTask = async () => {
    if (!controlWork || !controlWork.topic?.id || !editingTask) return;
    if (!newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      toast.error(tr("Заповніть всі обов'язкові поля", "Fill all required fields"));
      return;
    }
    try {
      await api.put(`/topics/${controlWork.topic.id}/tasks/${editingTask.id}`, {
        title: newTask.title,
        description: newTask.description,
        template: newTask.template,
        maxAttempts: newTask.maxAttempts
      });
      await loadControlWork();
      setShowEditTask(false);
      setEditingTask(null);
      setNewTask({
        title: "",
        description: "",
        template: "",
        maxAttempts: 1
      });
    } catch (error: unknown) {
      console.error("Failed to update task:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося оновити завдання", "Failed to update task")));
    }
  };
  const handleGenerateCondition = async () => {
    if (!controlWork) return;
    if (!newTask.title.trim()) {
      toast.error(tr("Спочатку введіть назву завдання", "Enter task title first"));
      return;
    }
    setGeneratingCondition(true);
    try {
      const topicId = controlWork.topic?.id;
      if (!topicId) {
        toast.error(tr("Не вдалося визначити тему", "Failed to determine topic"));
        return;
      }
      const userLanguage = i18n.language === 'en' ? 'en' : 'uk';
      const res = await api.post(`/topics/${topicId}/tasks/generate-condition`, {
        taskTitle: newTask.title.trim(),
        taskType: "CONTROL",
        difficulty: taskDifficulty,
        language: userLanguage,
        responseLanguage: aiResponseLanguage.trim() || undefined
      });
      setNewTask({
        ...newTask,
        description: res.data.description
      });
    } catch (error: unknown) {
      console.error("Failed to generate condition:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося згенерувати умову", "Failed to generate condition")));
    } finally {
      setGeneratingCondition(false);
    }
  };
  const handleGenerateTemplate = async () => {
    if (!controlWork) return;
    if (!newTask.title.trim()) {
      toast.error(tr("Спочатку введіть назву завдання", "Enter task title first"));
      return;
    }
    setGeneratingTemplate(true);
    try {
      const topicId = controlWork.topicId || controlWork.topic?.id;
      if (!topicId) {
        toast.error(tr("Не вдалося визначити тему", "Failed to determine topic"));
        return;
      }
      const res = await api.post(`/topics/${topicId}/tasks/generate-template`, {
        taskTitle: newTask.title.trim(),
        description: newTask.description,
        language: i18n.language === 'en' ? 'en' : 'uk',
        responseLanguage: aiResponseLanguage.trim() || undefined
      });
      setNewTask({
        ...newTask,
        template: res.data.template
      });
    } catch (error: unknown) {
      console.error("Failed to generate template:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося згенерувати шаблон", "Failed to generate template")));
    } finally {
      setGeneratingTemplate(false);
    }
  };
  const handleSaveTitle = async () => {
    if (!controlWorkId) return;
    try {
      await api.put(`/topics/control-works/${controlWorkId}`, {
        title: controlWorkTitle || null
      });
      await loadControlWork();
      setEditingTitle(false);
    } catch (error: unknown) {
      console.error("Failed to save title:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося зберегти назву", "Failed to save title")));
    }
  };
  const handleSaveSettings = async () => {
    if (!controlWorkId) return;
    try {
      await api.put(`/topics/control-works/${controlWorkId}`, {
        timeLimitMinutes: timeLimitMinutes,
        hasTheory: hasTheory,
        hasPractice: hasPractice,
        quizJson: hasTheory && quizQuestions.length > 0 ? JSON.stringify(quizQuestions) : null
      });
      await loadControlWork();
      setShowQuizSettings(false);
    } catch (error: unknown) {
      console.error("Failed to save settings:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося зберегти налаштування", "Failed to save settings")));
    }
  };
  const handleSaveQuiz = async (questionsToSave?: QuizQuestion[]) => {
    if (!controlWorkId) return;
    try {
      const questions = questionsToSave !== undefined ? questionsToSave : quizQuestions;
      await api.put(`/topics/control-works/${controlWorkId}`, {
        quizJson: questions.length > 0 ? JSON.stringify(questions) : null
      });
      if (questionsToSave !== undefined) {
        setQuizQuestions(questions);
      }
      const res = await api.get(`/topics/control-works/${controlWorkId}`);
      const cw = res.data.controlWork;
      if (cw) {
        setControlWork(cw);
        setControlWorkTitle(cw.title || "");
        setTimeLimitMinutes(cw.timeLimitMinutes || null);
        setHasTheory(cw.hasTheory || false);
        setHasPractice(cw.hasPractice !== undefined ? cw.hasPractice : true);
        setFormula(cw.formula || "");
      }
    } catch (error: unknown) {
      console.error("Failed to save quiz:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося зберегти тест", "Failed to save quiz")));
      await loadControlWork();
    }
  };
  const handleAddQuestion = () => {
    setNewQuestion({
      question: "",
      options: {
        А: "",
        Б: "",
        В: "",
        Г: "",
        Д: ""
      },
      correct: "А"
    });
    setShowAddQuestion(true);
  };
  const handleSaveNewQuestion = async () => {
    if (!newQuestion.question.trim()) {
      toast.error(tr("Введіть питання", "Enter a question"));
      return;
    }
    if (!newQuestion.options.А.trim() || !newQuestion.options.Б.trim() || !newQuestion.options.В.trim() || !newQuestion.options.Г.trim() || !newQuestion.options.Д.trim()) {
      toast.error(tr("Заповніть всі варіанти відповіді", "Fill all answer options"));
      return;
    }
    const questionForSave = {
      q: newQuestion.question.trim(),
      options: [newQuestion.options.А.trim(), newQuestion.options.Б.trim(), newQuestion.options.В.trim(), newQuestion.options.Г.trim(), newQuestion.options.Д.trim()],
      correct: ["А", "Б", "В", "Г", "Д"].indexOf(newQuestion.correct)
    };
    const updatedQuestions = [...quizQuestions, questionForSave];
    setShowAddQuestion(false);
    await handleSaveQuiz(updatedQuestions);
  };
  const handleEditQuestion = (index: number) => {
    const question = quizQuestions[index];
    let optionsObj: {
      А: string;
      Б: string;
      В: string;
      Г: string;
      Д: string;
    };
    if (Array.isArray(question.options)) {
      optionsObj = {
        А: question.options[0] || "",
        Б: question.options[1] || "",
        В: question.options[2] || "",
        Г: question.options[3] || "",
        Д: question.options[4] || ""
      };
    } else if (typeof question.options === 'object' && question.options !== null) {
      optionsObj = {
        А: question.options.А || question.options["А"] || question.options.A || question.options["A"] || "",
        Б: question.options.Б || question.options["Б"] || question.options.B || question.options["B"] || "",
        В: question.options.В || question.options["В"] || question.options.C || question.options["C"] || "",
        Г: question.options.Г || question.options["Г"] || question.options.D || question.options["D"] || "",
        Д: question.options.Д || question.options["Д"] || question.options.E || question.options["E"] || ""
      };
    } else {
      optionsObj = {
        А: "",
        Б: "",
        В: "",
        Г: "",
        Д: ""
      };
    }
    let correctLetter: "А" | "Б" | "В" | "Г" | "Д" = "А";
    if (typeof question.correct === 'number') {
      const letters: ("А" | "Б" | "В" | "Г" | "Д")[] = ["А", "Б", "В", "Г", "Д"];
      correctLetter = letters[question.correct] || "А";
    } else if (typeof question.correct === 'string') {
      const normalized = normalizeCorrectLetter(question.correct);
      if (normalized) correctLetter = normalized;
    }
    setNewQuestion({
      question: question.question || question.q || "",
      options: optionsObj,
      correct: correctLetter
    });
    setEditingQuestionIndex(index);
    setShowAddQuestion(true);
  };
  const handleSaveEditedQuestion = async () => {
    if (editingQuestionIndex === null) return;
    if (!newQuestion.question.trim()) {
      toast.error(tr("Введіть питання", "Enter a question"));
      return;
    }
    if (!newQuestion.options.А.trim() || !newQuestion.options.Б.trim() || !newQuestion.options.В.trim() || !newQuestion.options.Г.trim() || !newQuestion.options.Д.trim()) {
      toast.error(tr("Заповніть всі варіанти відповіді", "Fill all answer options"));
      return;
    }
    const questionForSave = {
      q: newQuestion.question.trim(),
      options: [newQuestion.options.А.trim(), newQuestion.options.Б.trim(), newQuestion.options.В.trim(), newQuestion.options.Г.trim(), newQuestion.options.Д.trim()],
      correct: ["А", "Б", "В", "Г", "Д"].indexOf(newQuestion.correct)
    };
    const updatedQuestions = [...quizQuestions];
    updatedQuestions[editingQuestionIndex] = questionForSave;
    setEditingQuestionIndex(null);
    setShowAddQuestion(false);
    await handleSaveQuiz(updatedQuestions);
  };
  const handleDeleteQuestion = async (index: number) => {
    if (!confirm(tr("Видалити це питання?", "Delete this question?"))) return;
    const updatedQuestions = quizQuestions.filter((_, i) => i !== index);
    await handleSaveQuiz(updatedQuestions);
  };
  const handleSaveFormula = async () => {
    if (!controlWorkId) return;
    setSavingFormula(true);
    try {
      await updateControlWorkFormula(parseInt(controlWorkId, 10), formula.trim() || null);
      toast.success(tr("Формулу оновлено. Всі оцінки перераховано.", "Formula updated. All grades recalculated."));
      await loadControlWork();
    } catch (error: unknown) {
      console.error("Failed to save formula:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося зберегти формулу", "Failed to save formula")));
    } finally {
      setSavingFormula(false);
    }
  };
  const handleGenerateQuiz = async () => {
    if (!controlWork || !controlWorkId) return;
    if (!quizTopicTitle.trim()) {
      toast.error(tr("Введіть тему для тесту", "Enter quiz topic"));
      return;
    }
    if (generatingQuiz) return;
    setGeneratingQuiz(true);
    try {
      const res = await api.post(`/topics/control-works/${controlWorkId}/generate-quiz`, {
        topicTitle: quizTopicTitle.trim(),
        count: quizCount,
        language: i18n.language === 'en' ? 'en' : 'uk',
        responseLanguage: aiResponseLanguage.trim() || undefined
      });
      let questions = res.data?.questions;
      if (!questions) {
        console.error("No questions field in response:", res.data);
        toast.error(tr("Не вдалося згенерувати питання. Спробуйте ще раз.", "Failed to generate questions. Please try again."));
        setGeneratingQuiz(false);
        return;
      }
      if (!Array.isArray(questions)) {
        console.error("Questions is not an array:", questions);
        try {
          questions = JSON.parse(questions);
        } catch (e) {
          console.error("Failed to parse questions as JSON:", e);
          toast.error(tr("Не вдалося згенерувати питання. Спробуйте ще раз.", "Failed to generate questions. Please try again."));
          setGeneratingQuiz(false);
          return;
        }
      }
      if (questions.length === 0) {
        console.error("Empty questions array");
        toast.error(tr("Не вдалося згенерувати питання. Спробуйте ще раз.", "Failed to generate questions. Please try again."));
        setGeneratingQuiz(false);
        return;
      }
      setQuizQuestions(questions);
      setHasTheory(true);
      setShowGenerateQuizModal(false);
      await loadControlWork();
    } catch (error: unknown) {
      console.error("Failed to generate quiz:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося згенерувати тест", "Failed to generate quiz")));
    } finally {
      setGeneratingQuiz(false);
    }
  };
  const loadTestDataPage = async (
    taskId: number,
    options?: {
      offset?: number;
      pageSize?: 20 | 50 | 100;
      source?: "ALL" | "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED";
    }
  ) => {
    const nextOffset = options?.offset ?? testDataOffset;
    const nextPageSize = options?.pageSize ?? testDataPageSize;
    const nextSource = options?.source ?? testDataSourceFilter;
    setLoadingTestDataPage(true);
    try {
      const data = await getTestData(taskId, {
        preview: true,
        previewChars: TEST_DATA_PREVIEW_CHARS,
        limit: nextPageSize,
        offset: nextOffset,
        source: nextSource
      });
      const list = data.testData || [];
      setTestDataList(list);
      setTestDataOffset(nextOffset);
      setTestDataPageSize(nextPageSize);
      setTestDataSourceFilter(nextSource);
      if (data.pagination) {
        setTestDataTotal(data.pagination.total);
        setTestDataHasMore(data.pagination.hasMore);
      } else {
        setTestDataTotal(list.length);
        setTestDataHasMore(false);
      }
    } catch (error) {
      setTestDataList([]);
      setTestDataTotal(0);
      setTestDataHasMore(false);
      throw error;
    } finally {
      setLoadingTestDataPage(false);
    }
  };
  const handleOpenTestData = async (taskId: number) => {
    setTestDataTaskId(taskId);
    setShowTestDataModal(true);
    setTestDataPageSize(20);
    setTestDataOffset(0);
    setTestDataTotal(0);
    setTestDataHasMore(false);
    setTestDataSourceFilter("ALL");
    setReplaceGeneratedOnGenerate(true);
    setClearingGeneratedTests(false);
    try {
      await loadTestDataPage(taskId, {
        offset: 0,
        pageSize: 20,
        source: "ALL"
      });
    } catch (error: unknown) {
      console.error("Failed to load test data:", error);
      setTestDataList([]);
    }
  };
  const handleGenerateTestData = async () => {
    if (!testDataTaskId) return;
    setGeneratingTestData(true);
    try {
      const result = await generateTestData(testDataTaskId, newTestCount, {
        replaceGenerated: replaceGeneratedOnGenerate
      });
      await loadTestDataPage(testDataTaskId, {
        offset: 0
      });
      const extras: string[] = [];
      if ((result.replacedGeneratedCount || 0) > 0) {
        extras.push(tr(`замінено AI: ${result.replacedGeneratedCount}`, `replaced AI: ${result.replacedGeneratedCount}`));
      }
      if ((result.skippedDuplicates || 0) > 0) {
        extras.push(tr(`дублі пропущено: ${result.skippedDuplicates}`, `duplicates skipped: ${result.skippedDuplicates}`));
      }
      toast.success(
        extras.length > 0
          ? `${tr(`Згенеровано ${result.count} тестів`, `Generated ${result.count} tests`)} (${extras.join(", ")})`
          : tr(`Згенеровано ${result.count} тестів`, `Generated ${result.count} tests`)
      );
    } catch (error: unknown) {
      console.error("Failed to generate test data:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося згенерувати тести", "Failed to generate tests")));
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
      await loadTestDataPage(testDataTaskId, {
        offset: testDataOffset
      });
    } catch (error: unknown) {
      console.error("Failed to add test data:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося додати тест", "Failed to add test")));
    }
  };

  const handleImportTestFiles = async () => {
    if (!testDataTaskId) return;
    if (importingFiles) return;
    if (importFiles.length === 0) {
      toast.error(tr("Оберіть файли .in та .out", "Choose .in and .out files"));
      return;
    }
    setImportingFiles(true);
    try {
      const { tests, errors } = await importTestsFromInOutFiles(importFiles);
      if (errors.length > 0) {
        toast.info(`${tr("Знайдено проблеми з файлами:", "Found issues with selected files:")}\n\n${errors.slice(0, 12).join("\n")}${errors.length > 12 ? `\n... (+${errors.length - 12})` : ""}`, 7000);
      }
      if (tests.length === 0) return;

      await addTestData(testDataTaskId, tests.map(t => ({
        input: t.input,
        expectedOutput: t.expectedOutput,
        points: importPoints,
        isHidden: importIsHidden,
        subtask: normalizeSubtask(importSubtask)
      })));
      await loadTestDataPage(testDataTaskId, {
        offset: testDataOffset
      });
      setImportFiles([]);
      setImportInputKey(k => k + 1);
    } catch (error: unknown) {
      console.error("Failed to import tests:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося імпортувати тести", "Failed to import tests")));
    } finally {
      setImportingFiles(false);
    }
  };
  const handleUpdateTestData = async (testDataId: number) => {
    if (!testDataTaskId || !editingTest) return;
    try {
      await updateTestData(testDataTaskId, testDataId, {
        ...editingTest,
        subtask: normalizeSubtask(editingTest.subtask)
      });
      await loadTestDataPage(testDataTaskId, {
        offset: testDataOffset
      });
      setEditingTestIndex(null);
      setEditingTest(null);
    } catch (error: unknown) {
      console.error("Failed to update test data:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося оновити тест", "Failed to update test")));
    }
  };
  const handleStartEditTestData = async (index: number, testDataId: number) => {
    if (!testDataTaskId) return;
    try {
      const data = await getTestDataItem(testDataTaskId, testDataId);
      const test = data.testData;
      setEditingTestIndex(index);
      setEditingTest({
        input: test.input,
        expectedOutput: test.expectedOutput || "",
        points: test.points,
        isHidden: test.isHidden === true,
        subtask: test.subtask || ""
      });
    } catch (error: unknown) {
      console.error("Failed to load full test data:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося завантажити повний тест", "Failed to load full test")));
    }
  };
  const handleDeleteTestData = async (testDataId: number) => {
    if (!testDataTaskId) return;
    if (!confirm(tr("Видалити цей тест?", "Delete this test?"))) return;
    try {
      await deleteTestData(testDataTaskId, testDataId);
      const nextOffset = testDataOffset > 0 && testDataList.length <= 1
        ? Math.max(0, testDataOffset - testDataPageSize)
        : testDataOffset;
      await loadTestDataPage(testDataTaskId, {
        offset: nextOffset
      });
    } catch (error: unknown) {
      console.error("Failed to delete test data:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося видалити тест", "Failed to delete test")));
    }
  };
  const handleClearGeneratedTestData = async () => {
    if (!testDataTaskId) return;
    if (!confirm(tr("Видалити всі AI-згенеровані тести для цього завдання?", "Delete all AI-generated tests for this task?"))) {
      return;
    }
    setClearingGeneratedTests(true);
    try {
      const result = await deleteGeneratedTestData(testDataTaskId);
      await loadTestDataPage(testDataTaskId, {
        offset: 0
      });
      toast.success(tr(`Видалено AI-тестів: ${result.deleted}`, `Deleted AI tests: ${result.deleted}`));
    } catch (error: unknown) {
      console.error("Failed to clear generated tests:", error);
      toast.error(getErrorMessage(error, tr("Не вдалося очистити AI-тести", "Failed to clear AI tests")));
    } finally {
      setClearingGeneratedTests(false);
    }
  };
  if (loading) {
    return <PageSkeleton variant="default" />;
  }
  if (!controlWork) {
    return <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-text-primary font-mono">
          {tr("Контрольна робота не знайдена", "Control work not found")}
        </div>
      </div>;
  }
  const savedFormula = (controlWork.formula || "").trim();
  const formulaToPersist = formula.trim();
  const formulaPreview = formulaToPersist || DEFAULT_CONTROL_WORK_FORMULA;
  const formulaInputHasUnsupportedChars = formulaToPersist.length > 0 && !/^[0-9A-Za-z_+\-*/().,\s]+$/.test(formulaToPersist);
  return <div className="flex-1 min-h-0 p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.3 }}
          className="mb-6"
        >
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3 -ml-1">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
          <span className={`font-mono text-accent-warn/80 ${isAurora ? "text-[11px] uppercase tracking-[0.2em]" : "text-xs"}`}>{isAurora ? tr("Контрольна", "Control work") : "// control work"}</span>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {editingTitle ? <div className="flex items-center gap-2 flex-1">
                <input type="text" value={controlWorkTitle} onChange={e => setControlWorkTitle(e.target.value)} className="px-3 py-1 bg-bg-surface border border-border text-text-primary font-mono text-2xl focus:outline-none focus:border-primary" placeholder={tr("Назва контрольної роботи", "Control work title")} autoFocus onKeyDown={async e => {
              if (e.key === "Enter") {
                await handleSaveTitle();
              } else if (e.key === "Escape") {
                setControlWorkTitle(controlWork.title || "");
                setEditingTitle(false);
              }
            }} />
                <Button variant="ghost" size="sm" onClick={handleSaveTitle} aria-label={tr("Зберегти назву", "Save title")} title={tr("Зберегти назву", "Save title")}>
                  <Save className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
              setControlWorkTitle(controlWork.title || "");
              setEditingTitle(false);
            }} aria-label={tr("Скасувати редагування назви", "Cancel title editing")} title={tr("Скасувати редагування назви", "Cancel title editing")}>
                  <X className="w-4 h-4" />
                </Button>
              </div> : <div className="flex items-center gap-2 flex-wrap">
                <ShieldCheck className="w-5 h-5 text-accent-warn shrink-0" />
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
                  {controlWork.title || tr(`Контрольна робота #${controlWork.id}`, `Control work #${controlWork.id}`)}
                </h1>
                <span className="text-[10px] font-mono uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border border-accent-warn/40 text-accent-warn">
                  {tr("Контрольна", "Control work")}
                </span>
                {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTitle(true)}
                aria-label={tr("Редагувати назву", "Edit title")}
                title={tr("Редагувати назву", "Edit title")}
              >
                    <Edit2 className="w-4 h-4" />
                  </Button>}
              </div>}
          </div>
        </motion.div>

        <div className="h-px mb-6 bg-gradient-to-r from-accent-warn/40 via-border to-transparent" />

        {}
        <Card className="p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
              <Settings className="w-3.5 h-3.5" />
              {tr("Налаштування", "Settings")}
            </h2>
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button variant="ghost" onClick={() => setShowQuizSettings(true)}>
                <Settings className="w-4 h-4 mr-2" />
                {tr("Налаштувати", "Configure")}
              </Button>}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em] flex items-center gap-1"><Clock className="w-3 h-3" />{tr("Час", "Time limit")}</div>
                <div className="text-sm font-mono text-text-primary mt-1 tabular-nums">{timeLimitMinutes ? `${timeLimitMinutes} ${t("min")}` : tr("—", "—")}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Тест", "Quiz")}</div>
                <div className={`text-sm font-mono mt-1 ${hasTheory ? "text-accent-success" : "text-text-muted"}`}>{hasTheory ? tr("Увімкнено", "Enabled") : tr("Вимкнено", "Disabled")}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Практика", "Practice")}</div>
                <div className={`text-sm font-mono mt-1 ${hasPractice ? "text-accent-success" : "text-text-muted"}`}>{hasPractice ? tr("Увімкнено", "Enabled") : tr("Вимкнено", "Disabled")}</div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Питань", "Questions")}</div>
                <div className="text-sm font-mono text-text-primary mt-1 tabular-nums">{hasTheory ? quizQuestions.length : "—"}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-mono text-text-primary mb-1 flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5 text-accent-warn" />{tr("Формула оцінки", "Grading formula")}:</div>
              <div className="text-xs font-mono text-text-secondary bg-bg-code p-2 rounded border border-border">
                {savedFormula || DEFAULT_CONTROL_WORK_FORMULA}
              </div>
              {!savedFormula && <div className="text-[11px] text-text-muted mt-1">
                  {tr("Використовується стандартна формула платформи", "Using platform default formula")}
                </div>}
              {savedFormula && <div className="text-[11px] text-text-muted mt-1">
                  {tr("Користувацька формула", "Custom formula")}
                </div>}
            </div>
          </div>
        </Card>

        {}
        <Card className="p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
              <FileText className="w-3.5 h-3.5" />
              {tr("Теоретична частина", "Theory part")}
              <span className="text-text-muted/70">· {quizQuestions.length}</span>
            </h2>
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex gap-2">
                {!hasTheory && <Button variant="ghost" onClick={() => setShowQuizSettings(true)}>
                    {tr("Увімкнути тест", "Enable quiz")}
                  </Button>}
                {hasTheory && <Button variant="ghost" onClick={() => setShowGenerateQuizModal(true)} disabled={generatingQuiz}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {generatingQuiz ? tr("Генерація...", "Generating...") : tr("Згенерувати тест", "Generate quiz")}
                  </Button>}
              </div>}
          </div>
          {!hasTheory ? <p className="text-text-secondary text-sm">
              {tr("Теоретична частина вимкнена. Увімкніть її в налаштуваннях.", "Theory part is disabled. Enable it in settings.")}
            </p> : quizQuestions.length === 0 ? <div className="space-y-4">
              <p className="text-text-secondary text-sm">{tr("Немає питань тесту.", "No quiz questions.")}</p>
              {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleAddQuestion}>
                    <Plus className="w-4 h-4 mr-2" />
                    {tr("Додати питання", "Add question")}
                  </Button>
                </div>}
            </div> : <div className="space-y-4">
              {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex justify-end">
                  <Button variant="ghost" onClick={handleAddQuestion}>
                    <Plus className="w-4 h-4 mr-2" />
                    {tr("Додати питання", "Add question")}
                  </Button>
                </div>}
              {quizQuestions.map((q, idx) => <div key={idx} className="rounded-xl border border-border bg-bg-surface p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-mono text-text-primary mb-2">
                        {idx + 1}. {q.question || q.q}
                      </div>
                      <div className="text-xs text-text-secondary space-y-1">
                        {Array.isArray(q.options) ? q.options.map((opt: string, optIdx: number) => {
                    const letters = ["А", "Б", "В", "Г", "Д"];
                    return <div key={optIdx}>
                                {letters[optIdx]}: {opt}
                              </div>;
                  }) : Object.entries(q.options || {}).map(([key, value]) => <div key={key}>
                              {key}: {typeof value === "string" ? value : typeof value === "number" ? value : value === null ? "null" : typeof value === "boolean" ? String(value) : (() => {
                      try {
                        return JSON.stringify(value);
                      } catch {
                        return String(value);
                      }
                    })()}
                            </div>)}
                      </div>
                      <div className="text-xs text-text-secondary mt-2">
                        {tr("Правильна відповідь", "Correct answer")}: {typeof q.correct === 'number' ? ["А", "Б", "В", "Г", "Д"][q.correct] || String(q.correct) : q.correct}
                      </div>
                    </div>
                    {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex gap-2 ml-4">
                        <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditQuestion(idx)}
                        aria-label={tr("Редагувати питання", "Edit question")}
                        title={tr("Редагувати питання", "Edit question")}
                      >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(idx)}
                        aria-label={tr("Видалити питання", "Delete question")}
                        title={tr("Видалити питання", "Delete question")}
                      >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>}
                  </div>
                </div>)}
            </div>}
        </Card>

        {}
        {hasPractice && <Card className="p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
                <ShieldCheck className="w-3.5 h-3.5 text-accent-warn" />
                {tr("Практична частина", "Practice part")}
                <span className="text-text-muted/70">· {controlWork.tasks?.length || 0}</span>
              </h2>
              {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button onClick={() => {
            setNewTask({
              title: "",
              description: "",
              template: "",
              maxAttempts: 1
            });
            setShowCreateTask(true);
          }}>
                  <Plus className="w-4 h-4 mr-2" />
                  {tr("Додати завдання", "Add task")}
                </Button>}
            </div>

            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
              {!controlWork.tasks || controlWork.tasks.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-accent-warn/10 flex items-center justify-center mb-3">
                    <ShieldCheck className="w-6 h-6 text-accent-warn" />
                  </div>
                  <p className="text-text-secondary">{tr("Немає завдань", "No tasks")}</p>
                </div> : controlWork.tasks.map(task => <motion.div key={task.id} variants={fadeUpItem} className="group rounded-xl border border-border bg-bg-surface p-4 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <div className="text-sm font-mono text-text-primary">{task.title}</div>
                      </div>
                      {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => {
                  setEditingTask(task);
                  setNewTask({
                    title: task.title,
                    description: task.description,
                    template: task.template,
                    maxAttempts: task.maxAttempts
                  });
                  setShowEditTask(true);
                }} className="text-xs">
                            <Edit2 className="w-3 h-3 mr-1" />
                            {t("edit")}
                          </Button>
                          <Button variant="ghost" onClick={e => {
                  e.stopPropagation();
                  handleOpenTestData(task.id);
                }} className="text-xs">
                            <FileText className="w-3 h-3 mr-1" />
                            {t("tests")}
                          </Button>
                        </div>}
                    </div>
                  </motion.div>)}
            </motion.div>
          </Card>}

        {}
        {showCreateTask && <Modal open={showCreateTask} onClose={() => {
        setShowCreateTask(false);
        setNewTask({
          title: "",
          description: "",
          template: "",
          maxAttempts: 1
        });
      }} title={tr("Створити контрольне завдання", "Create control task")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Назва завдання", "Task title")} *</label>
                <input type="text" value={newTask.title} onChange={e => setNewTask({
              ...newTask,
              title: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Назва завдання", "Task title")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Мова відповіді AI", "AI response language")}</label>
                <input type="text" value={aiResponseLanguage} onChange={e => setAiResponseLanguage(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Українська / English / Polski", "Example: English / Українська / Español")} />
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

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Складність (для генерації)", "Difficulty (for generation)")}
                </label>
                <input type="number" min="1" max="5" value={taskDifficulty} onChange={e => setTaskDifficulty(parseInt(e.target.value) || 3)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowCreateTask(false);
              setNewTask({
                title: "",
                description: "",
                template: "",
                maxAttempts: 1
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
          maxAttempts: 1
        });
      }} title={tr("Редагувати контрольне завдання", "Edit control task")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Назва завдання", "Task title")} *</label>
                <input type="text" value={newTask.title} onChange={e => setNewTask({
              ...newTask,
              title: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Назва завдання", "Task title")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Мова відповіді AI", "AI response language")}</label>
                <input type="text" value={aiResponseLanguage} onChange={e => setAiResponseLanguage(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Українська / English / Polski", "Example: English / Українська / Español")} />
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
                    textareaRef={editDescriptionRef}
                    className="ml-2 text-xs"
                  />
                </label>
                <textarea ref={editDescriptionRef} value={newTask.description} onChange={e => setNewTask({
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

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Складність (для генерації)", "Difficulty (for generation)")}
                </label>
                <input type="number" min="1" max="5" value={taskDifficulty} onChange={e => setTaskDifficulty(parseInt(e.target.value) || 3)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowEditTask(false);
              setEditingTask(null);
              setNewTask({
                title: "",
                description: "",
                template: "",
                maxAttempts: 1
              });
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleUpdateTask}>{t("save")}</Button>
              </div>
            </div>
          </Modal>}

        {}
        {showQuizSettings && <Modal open={showQuizSettings} onClose={() => {
        setShowQuizSettings(false);
        setFormula(controlWork?.formula || "");
      }} title={tr("Налаштування контрольної роботи", "Control work settings")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Обмеження часу (хвилини)", "Time limit (minutes)")}
                </label>
                <input type="number" min="1" value={timeLimitMinutes || ""} onChange={e => setTimeLimitMinutes(e.target.value ? parseInt(e.target.value) : null)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: 30", "Example: 30")} />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={hasTheory} onChange={e => setHasTheory(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-mono text-text-secondary">{tr("Теоретична частина (тест)", "Theory part (quiz)")}</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={hasPractice} onChange={e => setHasPractice(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-mono text-text-secondary">{tr("Практична частина (завдання)", "Practice part (tasks)")}</span>
                </label>
              </div>

              <div className="border-t border-border pt-4">
                <label className="block text-sm font-mono text-text-primary mb-2">
                  {tr("Формула розрахунку оцінки", "Grading formula")}
                </label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" type="button" className="text-xs" onClick={() => setFormula(DEFAULT_CONTROL_WORK_FORMULA)}>
                      {tr("Рекомендована", "Recommended")}
                    </Button>
                    <Button variant="ghost" type="button" className="text-xs" onClick={() => setFormula(BALANCED_CONTROL_WORK_FORMULA)}>
                      {tr("Збалансована", "Balanced")}
                    </Button>
                    <Button variant="ghost" type="button" className="text-xs" onClick={() => setFormula(PRACTICE_ONLY_FORMULA)}>
                      {tr("Лише практика", "Practice only")}
                    </Button>
                    <Button variant="ghost" type="button" className="text-xs" onClick={() => setFormula(QUIZ_ONLY_FORMULA)}>
                      {tr("Лише тест", "Quiz only")}
                    </Button>
                    <Button variant="ghost" type="button" className="text-xs" onClick={() => setFormula("")}>
                      {tr("Стандартна (порожнє поле)", "Default (empty field)")}
                    </Button>
                  </div>
                  <textarea value={formula} onChange={e => setFormula(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary min-h-[100px]" placeholder={tr("Наприклад: 0.35 * test + 0.65 * avg(practice)", "Example: 0.35 * test + 0.65 * avg(practice)")} />
                  <div className="text-xs text-text-secondary bg-bg-hover p-2 rounded">
                    <span className="font-semibold">{tr("Активна формула", "Active formula")}:</span> <code className="bg-bg-surface px-1 rounded">{formulaPreview}</code>
                  </div>
                  {formulaInputHasUnsupportedChars && <div className="text-xs text-accent-warn">
                      {tr("Формула містить нетипові символи. Дозволено: числа, + - * /, дужки, test, avg(practice).", "Formula contains unsupported symbols. Allowed: numbers, + - * /, parentheses, test, avg(practice).")}
                    </div>}
                  <div className="text-xs text-text-secondary space-y-1">
                    <p><strong>{tr("Змінні", "Variables")}:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><code className="bg-bg-hover px-1 rounded">test</code> - {tr("оцінка за тест", "quiz grade")} (theoryGrade)</li>
                      <li><code className="bg-bg-hover px-1 rounded">avg(practice)</code> - {tr("середнє за практичні завдання", "average for practice tasks")}</li>
                    </ul>
                    <p className="mt-2"><strong>{tr("Приклади", "Examples")}:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><code className="bg-bg-hover px-1 rounded">0.35 * test + 0.65 * avg(practice)</code> - {tr("рекомендовано: практика важить більше", "recommended: practice has higher weight")}</li>
                      <li><code className="bg-bg-hover px-1 rounded">0.5 * test + 0.5 * avg(practice)</code> - {tr("рівні ваги", "equal weights")}</li>
                      <li><code className="bg-bg-hover px-1 rounded">avg(practice)</code> - {tr("тільки практика", "practice only")}</li>
                      <li><code className="bg-bg-hover px-1 rounded">test</code> - {tr("тільки тест", "quiz only")}</li>
                    </ul>
                    <p className="mt-2 text-text-muted">{tr("Залиште порожнім для використання формули за замовчуванням.", "Leave empty to use the default formula.")}</p>
                  </div>
                  <Button onClick={handleSaveFormula} disabled={savingFormula} className="w-full">
                    {savingFormula ? tr("Збереження...", "Saving...") : tr("Зберегти формулу та перерахувати оцінки", "Save formula and recalculate grades")}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowQuizSettings(false);
              setFormula(controlWork?.formula || "");
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleSaveSettings}>{tr("Зберегти налаштування", "Save settings")}</Button>
              </div>
            </div>
          </Modal>}

        {}
        {showGenerateQuizModal && <Modal open={showGenerateQuizModal} onClose={() => setShowGenerateQuizModal(false)} title={tr("Згенерувати тест", "Generate quiz")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Тема для тесту", "Quiz topic")} *
                </label>
                <input type="text" value={quizTopicTitle} onChange={e => setQuizTopicTitle(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Масиви та цикли", "Example: Arrays and loops")} />
                <p className="text-xs text-text-secondary mt-1">
                  {tr("Введіть тему, на основі якої будуть згенеровані питання тесту", "Enter a topic that will be used to generate quiz questions")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Мова відповіді AI", "AI response language")}
                </label>
                <input type="text" value={aiResponseLanguage} onChange={e => setAiResponseLanguage(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Українська / English / Polski", "Example: English / Українська / Español")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Кількість питань", "Number of questions")} *
                </label>
                <input type="number" min="1" max="50" value={quizCount} onChange={e => setQuizCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder="12" />
                <p className="text-xs text-text-secondary mt-1">
                  {tr("Введіть кількість питань для тесту (від 1 до 50)", "Enter question count (1 to 50)")}
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowGenerateQuizModal(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleGenerateQuiz} disabled={generatingQuiz}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generatingQuiz ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                </Button>
              </div>
            </div>
          </Modal>}

        {}
        {showTestDataModal && testDataTaskId && <Modal open={showTestDataModal} onClose={() => {
        setShowTestDataModal(false);
        setTestDataTaskId(null);
        setTestDataList([]);
        setTestDataPageSize(20);
        setTestDataOffset(0);
        setTestDataTotal(0);
        setTestDataHasMore(false);
        setTestDataSourceFilter("ALL");
        setLoadingTestDataPage(false);
        setReplaceGeneratedOnGenerate(true);
        setClearingGeneratedTests(false);
        setEditingTestIndex(null);
        setEditingTest(null);
        setImportFiles([]);
        setImportPoints(1);
        setImportIsHidden(false);
        setImportSubtask("");
        setImportingFiles(false);
        setImportInputKey(k => k + 1);
      }} title={tr("Тестові дані для перевірки завдання", "Test data for task checking")}>
            <div className="space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleGenerateTestData} disabled={generatingTestData} className="text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {generatingTestData ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                  </Button>
                  <input type="number" min="1" max="20" value={newTestCount} onChange={e => setNewTestCount(parseInt(e.target.value) || 10)} className="w-20 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs" placeholder={tr("Кількість", "Count")} />
                  <span className="text-xs text-text-secondary">{tr("тестів", "tests")}</span>
                  <label className="flex items-center gap-2 text-xs font-mono text-text-secondary ml-1">
                    <input
                      type="checkbox"
                      checked={replaceGeneratedOnGenerate}
                      onChange={e => setReplaceGeneratedOnGenerate(e.target.checked)}
                      className="h-4 w-4"
                    />
                    {tr("Замінювати попередні AI-тести", "Replace previous AI tests")}
                  </label>
                  <Button
                    variant="ghost"
                    onClick={handleClearGeneratedTestData}
                    disabled={clearingGeneratedTests}
                    className="text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    {clearingGeneratedTests ? tr("Очищення...", "Clearing...") : tr("Очистити AI", "Clear AI")}
                  </Button>
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
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">{tr("Бали", "Points")}</label>
                    <input type="number" min="1" max="100" value={importPoints} onChange={e => setImportPoints(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">{tr("Сабтаск", "Subtask")}</label>
                    <input type="text" maxLength={64} value={importSubtask} onChange={e => setImportSubtask(e.target.value)} placeholder={tr("Напр. 1 або basics", "e.g. 1 or basics")} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-xs" />
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

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-mono text-text-secondary">
                  {testDataTotal > 0
                    ? tr(
                        `Показано ${Math.min(testDataOffset + 1, testDataTotal)}-${Math.min(testDataOffset + testDataList.length, testDataTotal)} з ${testDataTotal}`,
                        `Showing ${Math.min(testDataOffset + 1, testDataTotal)}-${Math.min(testDataOffset + testDataList.length, testDataTotal)} of ${testDataTotal}`
                      )
                    : ""}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-text-secondary">{tr("Джерело", "Source")}</span>
                  <select
                    value={testDataSourceFilter}
                    onChange={async (e) => {
                      if (!testDataTaskId) return;
                      const source = e.target.value as "ALL" | "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED";
                      await loadTestDataPage(testDataTaskId, {
                        offset: 0,
                        source
                      });
                    }}
                    className="px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs focus:outline-none"
                  >
                    <option value="ALL">{tr("Усі", "All")}</option>
                    <option value="MANUAL">{tr("Вручну", "Manual")}</option>
                    <option value="AI_GENERATED">{tr("AI", "AI")}</option>
                    <option value="LIBRARY_IMPORTED">{tr("З бібліотеки", "From library")}</option>
                  </select>
                  <span className="text-xs font-mono text-text-secondary">{tr("Розмір сторінки", "Page size")}</span>
                  <select
                    value={testDataPageSize}
                    onChange={async (e) => {
                      if (!testDataTaskId) return;
                      const pageSize = parsePageSize(e.target.value);
                      await loadTestDataPage(testDataTaskId, {
                        offset: 0,
                        pageSize
                      });
                    }}
                    className="px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs focus:outline-none"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    disabled={loadingTestDataPage || testDataOffset <= 0}
                    onClick={async () => {
                      if (!testDataTaskId) return;
                      await loadTestDataPage(testDataTaskId, {
                        offset: Math.max(0, testDataOffset - testDataPageSize)
                      });
                    }}
                  >
                    {tr("Назад", "Prev")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    disabled={loadingTestDataPage || !testDataHasMore}
                    onClick={async () => {
                      if (!testDataTaskId) return;
                      await loadTestDataPage(testDataTaskId, {
                        offset: testDataOffset + testDataPageSize
                      });
                    }}
                  >
                    {tr("Вперед", "Next")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {loadingTestDataPage ? <Skeleton className="h-10 w-full" /> : testDataList.length === 0 ? <p className="text-text-secondary text-sm text-center py-4">
                    {tr("Немає тестових даних. Згенеруйте або додайте вручну.", "No test data. Generate or add manually.")}
                  </p> : testDataList.map((test, index) => {
                    const displayIndex = testDataOffset + index + 1;
                    return <Card key={test.id} className="p-3">
                      {editingTestIndex === index ? <div className="space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-xs font-mono text-text-secondary">
                              {tr(`Тест #${displayIndex}`, `Test #${displayIndex}`)}
                            </span>
                            <div className="flex gap-1">
                              <Button variant="ghost" onClick={() => handleUpdateTestData(test.id)} className="h-10 w-10 p-0" title={t("save")} aria-label={t("save")}>
                                <Save className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" onClick={() => {
                      setEditingTestIndex(null);
                      setEditingTest(null);
                    }} className="h-10 w-10 p-0" title={t("cancel")} aria-label={t("cancel")}>
                                <X className="w-4 h-4" />
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
                          <div>
                            <label className="block text-xs font-mono text-text-secondary mb-1">
                              {tr("Сабтаск (необов'язково)", "Subtask (optional)")}
                            </label>
                            <input type="text" maxLength={64} value={editingTest?.subtask || ""} onChange={e => setEditingTest({
                    ...editingTest!,
                    subtask: e.target.value
                  })} placeholder={tr("Напр. 1 або easy", "e.g. 1 or easy")} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                          </div>
                              <div className="flex items-center gap-2">
                                <input id={`cw-test-hidden-${test.id}`} type="checkbox" checked={editingTest?.isHidden === true} onChange={e => setEditingTest({
                        ...editingTest!,
                        isHidden: e.target.checked
                      })} className="w-4 h-4" />
                                <label htmlFor={`cw-test-hidden-${test.id}`} className="text-xs font-mono text-text-secondary" title={tr("Прихований тест не показується учню, але впливає на оцінку.", "Hidden test is not shown to the student but affects scoring.")}>{tr("Прихований", "Hidden")}</label>
                              </div>
                        </div> : <div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-mono text-text-secondary">
                              {tr(`Тест #${displayIndex}`, `Test #${displayIndex}`)} • {test.points} {tr("балів", "points")}
                              {test.source === "AI_GENERATED" ? ` • ${tr("джерело: AI", "source: AI")}` : ""}
                              {test.source === "LIBRARY_IMPORTED" ? ` • ${tr("джерело: бібліотека", "source: library")}` : ""}
                              {test.source === "MANUAL" ? ` • ${tr("джерело: вручну", "source: manual")}` : ""}
                              {test.subtask ? ` • ${tr("сабтаск", "subtask")}: ${test.subtask}` : ""}
                              {test.isHidden ? ` • ${tr("прихований", "hidden")}` : ""}
                            </span>
                            <div className="flex gap-2">
                              <button onClick={() => {
                      handleStartEditTestData(index, test.id);
                    }} className="h-11 w-11 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-primary transition-fast" title={t("edit")} aria-label={t("edit")}>
                                <Edit2 className="w-4 h-4 text-primary" />
                              </button>
                              <button onClick={() => handleDeleteTestData(test.id)} className="h-11 w-11 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent-error transition-fast" title={t("delete")} aria-label={t("delete")}>
                                <Trash2 className="w-4 h-4 text-accent-error" />
                              </button>
                            </div>
                          </div>
                          <div className="text-xs font-mono">
                            <div className="text-text-secondary mb-1">
                              <strong>{tr("Вхід", "Input")}:</strong> {test.input || tr("(порожньо)", "(empty)")}
                              {test.isInputTruncated ? ` ${tr("… (скорочено)", "… (truncated)")}` : ""}
                            </div>
                            <div className="text-text-secondary">
                              <strong>{tr("Вивід", "Output")}:</strong> {test.expectedOutput || tr("(порожньо)", "(empty)")}
                              {test.isExpectedOutputTruncated ? ` ${tr("… (скорочено)", "… (truncated)")}` : ""}
                            </div>
                            {test.subtask ? <div className="text-text-secondary mt-1">
                                <strong>{tr("Сабтаск", "Subtask")}:</strong> {test.subtask}
                              </div> : null}
                          </div>
                        </div>}
                    </Card>;
                  })}
              </div>
            </div>
          </Modal>}

        {}
        {showAddQuestion && <Modal open={showAddQuestion} onClose={() => {
        setShowAddQuestion(false);
        setEditingQuestionIndex(null);
        setNewQuestion({
          question: "",
          options: {
            А: "",
            Б: "",
            В: "",
            Г: "",
            Д: ""
          },
          correct: "А"
        });
      }} title={editingQuestionIndex !== null ? tr("Редагувати питання", "Edit question") : tr("Додати питання", "Add question")}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Питання", "Question")} *
                </label>
                <textarea value={newQuestion.question} onChange={e => setNewQuestion({
              ...newQuestion,
              question: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Введіть питання", "Enter a question")} rows={3} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Варіанти відповіді", "Answer options")} *
                </label>
                {(["А", "Б", "В", "Г", "Д"] as const).map(key => <div key={key} className="mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-text-secondary w-6">{optionLabel(key)}:</span>
                      <input type="text" value={newQuestion.options[key]} onChange={e => setNewQuestion({
                  ...newQuestion,
                  options: {
                    ...newQuestion.options,
                    [key]: e.target.value
                  }
                })} className="flex-1 px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr(`Варіант ${key}`, `Option ${optionLabel(key)}`)} />
                      <input type="radio" name="correct" checked={newQuestion.correct === key} onChange={() => setNewQuestion({
                  ...newQuestion,
                  correct: key
                })} className="w-4 h-4" aria-label={tr(`Позначити варіант ${optionLabel(key)} як правильний`, `Mark option ${optionLabel(key)} as correct`)} />
                    </div>
                  </div>)}
                <p className="text-xs text-text-secondary mt-2">
                  {tr("Оберіть правильну відповідь радіо-кнопкою", "Select the correct answer using the radio button")}
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => {
              setShowAddQuestion(false);
              setEditingQuestionIndex(null);
              setNewQuestion({
                question: "",
                options: {
                  А: "",
                  Б: "",
                  В: "",
                  Г: "",
                  Д: ""
                },
                correct: "А"
              });
            }}>
                  {t("cancel")}
                </Button>
                <Button onClick={editingQuestionIndex !== null ? handleSaveEditedQuestion : handleSaveNewQuestion}>
                  <Save className="w-4 h-4 mr-2" />
                  {t("save")}
                </Button>
              </div>
            </div>
          </Modal>}
      </div>
    </div>;
};
