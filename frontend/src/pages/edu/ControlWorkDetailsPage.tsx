import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { ArrowLeft, Plus, Trash2, Edit2, Sparkles, Settings, Save, X, FileText } from "lucide-react";
import { api } from "../../lib/api/client";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { MarkdownView } from "../../components/MarkdownView";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import { generateTestData, getTestData, addTestData, updateTestData, deleteTestData, type TestData, updateControlWorkFormula } from "../../lib/api/edu";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { showToast } from "../../lib/toast";
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
  const [controlWorkTitle, setControlWorkTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [formula, setFormula] = useState<string>("");
  const [savingFormula, setSavingFormula] = useState(false);
  const createDescriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const editDescriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
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
    const init = async () => {
      await loadUser();
    };
    init();
  }, []);
  useEffect(() => {
    if (user && controlWorkId) {
      console.log("Loading control work:", controlWorkId);
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
      console.log("Fetching control work:", `/topics/control-works/${controlWorkId}`);
      const res = await api.get(`/topics/control-works/${controlWorkId}`);
      console.log("Control work response:", res.data);
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
      showToast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  const handleCreateTask = async () => {
    if (!controlWorkId || !newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      showToast.error(tr("Заповніть всі обов'язкові поля", "Fill all required fields"));
      return;
    }
    if (!controlWork) {
      showToast.error(tr("Контрольна робота не завантажена", "Control work not loaded"));
      return;
    }
    try {
      const topicId = controlWork.topic?.id;
      if (!topicId) {
        showToast.error(tr("Не вдалося визначити тему", "Failed to determine topic"));
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
        showToast.error(tr("У контрольній може бути максимум 3 практичні задачі.", "A control work can contain at most 3 practice tasks."));
      } else {
        showToast.error(msg);
      }
    }
  };
  const handleUpdateTask = async () => {
    if (!controlWork || !controlWork.topic?.id || !editingTask) return;
    if (!newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      showToast.error(tr("Заповніть всі обов'язкові поля", "Fill all required fields"));
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
      showToast.error(getErrorMessage(error, tr("Не вдалося оновити завдання", "Failed to update task")));
    }
  };
  const handleGenerateCondition = async () => {
    if (!controlWork) return;
    if (!newTask.title.trim()) {
      showToast.error(tr("Спочатку введіть назву завдання", "Enter task title first"));
      return;
    }
    setGeneratingCondition(true);
    try {
      const topicId = controlWork.topic?.id;
      if (!topicId) {
        showToast.error(tr("Не вдалося визначити тему", "Failed to determine topic"));
        return;
      }
      const userLanguage = i18n.language === 'en' ? 'en' : 'uk';
      const res = await api.post(`/topics/${topicId}/tasks/generate-condition`, {
        taskTitle: newTask.title.trim(),
        taskType: "CONTROL",
        difficulty: taskDifficulty,
        language: userLanguage
      });
      setNewTask({
        ...newTask,
        description: res.data.description
      });
    } catch (error: unknown) {
      console.error("Failed to generate condition:", error);
      showToast.error(getErrorMessage(error, tr("Не вдалося згенерувати умову", "Failed to generate condition")));
    } finally {
      setGeneratingCondition(false);
    }
  };
  const handleGenerateTemplate = async () => {
    if (!controlWork) return;
    if (!newTask.title.trim()) {
      showToast.error(tr("Спочатку введіть назву завдання", "Enter task title first"));
      return;
    }
    setGeneratingTemplate(true);
    try {
      const topicId = controlWork.topicId || controlWork.topic?.id;
      if (!topicId) {
        showToast.error(tr("Не вдалося визначити тему", "Failed to determine topic"));
        return;
      }
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
      showToast.error(getErrorMessage(error, tr("Не вдалося згенерувати шаблон", "Failed to generate template")));
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
      showToast.error(getErrorMessage(error, tr("Не вдалося зберегти назву", "Failed to save title")));
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
      showToast.error(getErrorMessage(error, tr("Не вдалося зберегти налаштування", "Failed to save settings")));
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
      showToast.error(getErrorMessage(error, tr("Не вдалося зберегти тест", "Failed to save quiz")));
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
      showToast.error(tr("Введіть питання", "Enter a question"));
      return;
    }
    if (!newQuestion.options.А.trim() || !newQuestion.options.Б.trim() || !newQuestion.options.В.trim() || !newQuestion.options.Г.trim() || !newQuestion.options.Д.trim()) {
      showToast.error(tr("Заповніть всі варіанти відповіді", "Fill all answer options"));
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
      showToast.error(tr("Введіть питання", "Enter a question"));
      return;
    }
    if (!newQuestion.options.А.trim() || !newQuestion.options.Б.trim() || !newQuestion.options.В.trim() || !newQuestion.options.Г.trim() || !newQuestion.options.Д.trim()) {
      showToast.error(tr("Заповніть всі варіанти відповіді", "Fill all answer options"));
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
      showToast.success(tr("Формулу оновлено. Всі оцінки перераховано.", "Formula updated. All grades recalculated."));
      await loadControlWork();
    } catch (error: unknown) {
      console.error("Failed to save formula:", error);
      showToast.error(getErrorMessage(error, tr("Не вдалося зберегти формулу", "Failed to save formula")));
    } finally {
      setSavingFormula(false);
    }
  };
  const handleGenerateQuiz = async () => {
    if (!controlWork || !controlWorkId) return;
    if (!quizTopicTitle.trim()) {
      showToast.error(tr("Введіть тему для тесту", "Enter quiz topic"));
      return;
    }
    if (generatingQuiz) return;
    setGeneratingQuiz(true);
    try {
      const res = await api.post(`/topics/control-works/${controlWorkId}/generate-quiz`, {
        topicTitle: quizTopicTitle.trim(),
        count: quizCount
      });
      console.log("Full response:", res.data);
      console.log("Response status:", res.status);
      let questions = res.data?.questions;
      if (!questions) {
        console.error("No questions field in response:", res.data);
        showToast.error(tr("Не вдалося згенерувати питання. Спробуйте ще раз.", "Failed to generate questions. Please try again."));
        setGeneratingQuiz(false);
        return;
      }
      if (!Array.isArray(questions)) {
        console.error("Questions is not an array:", questions);
        try {
          questions = JSON.parse(questions);
        } catch (e) {
          console.error("Failed to parse questions as JSON:", e);
          showToast.error(tr("Не вдалося згенерувати питання. Спробуйте ще раз.", "Failed to generate questions. Please try again."));
          setGeneratingQuiz(false);
          return;
        }
      }
      if (questions.length === 0) {
        console.error("Empty questions array");
        showToast.error(tr("Не вдалося згенерувати питання. Спробуйте ще раз.", "Failed to generate questions. Please try again."));
        setGeneratingQuiz(false);
        return;
      }
      console.log("Successfully extracted questions:", questions.length, "questions");
      console.log("Generated questions:", questions);
      setQuizQuestions(questions);
      setHasTheory(true);
      setShowGenerateQuizModal(false);
      await loadControlWork();
    } catch (error: unknown) {
      console.error("Failed to generate quiz:", error);
      showToast.error(getErrorMessage(error, tr("Не вдалося згенерувати тест", "Failed to generate quiz")));
    } finally {
      setGeneratingQuiz(false);
    }
  };
  const handleOpenTestData = async (taskId: number) => {
    setTestDataTaskId(taskId);
    setShowTestDataModal(true);
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
      showToast.success(tr(`Згенеровано ${result.count} тестів`, `Generated ${result.count} tests`));
    } catch (error: unknown) {
      console.error("Failed to generate test data:", error);
      showToast.error(getErrorMessage(error, tr("Не вдалося згенерувати тести", "Failed to generate tests")));
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
      showToast.error(getErrorMessage(error, tr("Не вдалося додати тест", "Failed to add test")));
    }
  };

  const handleImportTestFiles = async () => {
    if (!testDataTaskId) return;
    if (importingFiles) return;
    if (importFiles.length === 0) {
      showToast.error(tr("Оберіть файли .in та .out", "Choose .in and .out files"));
      return;
    }
    setImportingFiles(true);
    try {
      const { tests, errors } = await importTestsFromInOutFiles(importFiles);
      if (errors.length > 0) {
        showToast.info(`${tr("Знайдено проблеми з файлами:", "Found issues with selected files:")}\n\n${errors.slice(0, 12).join("\n")}${errors.length > 12 ? `\n... (+${errors.length - 12})` : ""}`, { durationMs: 7000 });
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
      showToast.error(getErrorMessage(error, tr("Не вдалося імпортувати тести", "Failed to import tests")));
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
      showToast.error(getErrorMessage(error, tr("Не вдалося оновити тест", "Failed to update test")));
    }
  };
  const handleDeleteTestData = async (testDataId: number) => {
    if (!testDataTaskId) return;
    if (!confirm(tr("Видалити цей тест?", "Delete this test?"))) return;
    try {
      await deleteTestData(testDataTaskId, testDataId);
      const data = await getTestData(testDataTaskId);
      setTestDataList(data.testData || []);
    } catch (error: unknown) {
      console.error("Failed to delete test data:", error);
      showToast.error(getErrorMessage(error, tr("Не вдалося видалити тест", "Failed to delete test")));
    }
  };
  if (loading) {
    return <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-text-primary font-mono">{tr("Завантаження...", "Loading...")}</div>
      </div>;
  }
  if (!controlWork) {
    return <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-text-primary font-mono">
          {tr("Контрольна робота не знайдена", "Control work not found")}
        </div>
      </div>;
  }
  return <div className="flex-1 min-h-0 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
          <div className="flex items-center gap-2">
            {editingTitle ? <div className="flex items-center gap-2 flex-1">
                <input type="text" value={controlWorkTitle} onChange={e => setControlWorkTitle(e.target.value)} className="px-3 py-1 bg-bg-surface border border-border text-text-primary font-mono text-2xl focus:outline-none focus:border-primary" placeholder={tr("Назва контрольної роботи", "Control work title")} autoFocus onKeyDown={async e => {
              if (e.key === "Enter") {
                await handleSaveTitle();
              } else if (e.key === "Escape") {
                setControlWorkTitle(controlWork.title || "");
                setEditingTitle(false);
              }
            }} />
                <Button variant="ghost" size="sm" onClick={handleSaveTitle}>
                  <Save className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
              setControlWorkTitle(controlWork.title || "");
              setEditingTitle(false);
            }}>
                  <X className="w-4 h-4" />
                </Button>
              </div> : <div className="flex items-center gap-2">
                <h1 className="text-2xl font-mono text-text-primary">
                  {controlWork.title || tr(`Контрольна робота #${controlWork.id}`, `Control work #${controlWork.id}`)}
                </h1>
                {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button variant="ghost" size="sm" onClick={() => setEditingTitle(true)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>}
              </div>}
          </div>
        </div>

        {}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-mono text-text-primary">{tr("Налаштування", "Settings")}</h2>
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button variant="ghost" onClick={() => setShowQuizSettings(true)}>
                <Settings className="w-4 h-4 mr-2" />
                {tr("Налаштувати", "Configure")}
              </Button>}
          </div>
          <div className="space-y-2 text-sm text-text-secondary">
            <div>
              {tr("Обмеження часу", "Time limit")}:{" "}
              {timeLimitMinutes ? `${timeLimitMinutes} ${t("min")}` : tr("Не встановлено", "Not set")}
            </div>
            <div>
              {tr("Теоретична частина", "Theory part")}:{" "}
              {hasTheory ? tr("✓ Увімкнено", "✓ Enabled") : tr("✗ Вимкнено", "✗ Disabled")}
            </div>
            <div>
              {tr("Практична частина", "Practice part")}:{" "}
              {hasPractice ? tr("✓ Увімкнено", "✓ Enabled") : tr("✗ Вимкнено", "✗ Disabled")}
            </div>
            {hasTheory && quizQuestions.length > 0 && <div>
                {tr("Питання тесту", "Quiz questions")}: {quizQuestions.length}
              </div>}
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-xs font-mono text-text-primary mb-1">{tr("Формула оцінки", "Grading formula")}:</div>
              <div className="text-xs font-mono text-text-secondary bg-bg-hover p-2 rounded">
                {controlWork.formula || tr("(за замовчуванням)", "(default)")}
              </div>
            </div>
          </div>
        </Card>

        {}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-mono text-text-primary">
              {tr("Теоретична частина", "Theory part")} ({quizQuestions.length} {tr("питань", "questions")})
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
              {quizQuestions.map((q, idx) => <div key={idx} className="p-3 border border-border">
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
                        <Button variant="ghost" size="sm" onClick={() => handleEditQuestion(idx)}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteQuestion(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>}
                  </div>
                </div>)}
            </div>}
        </Card>

        {}
        {hasPractice && <Card className="p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-mono text-text-primary">
                {tr("Практична частина", "Practice part")} ({controlWork.tasks?.length || 0} {tr("завдань", "tasks")})
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

            <div className="space-y-2">
              {!controlWork.tasks || controlWork.tasks.length === 0 ? <p className="text-text-secondary text-sm">{tr("Немає завдань", "No tasks")}</p> : controlWork.tasks.map(task => <div key={task.id} className="p-3 border border-border hover:bg-bg-hover transition-fast">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
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
                  </div>)}
            </div>
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
                  <textarea value={formula} onChange={e => setFormula(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary min-h-[100px]" placeholder={tr("Наприклад: 0.35 * test + 0.65 * avg(practice)", "Example: 0.35 * test + 0.65 * avg(practice)")} />
                  <div className="text-xs text-text-secondary space-y-1">
                    <p><strong>{tr("Змінні", "Variables")}:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><code className="bg-bg-hover px-1 rounded">test</code> - {tr("оцінка за тест", "quiz grade")} (theoryGrade)</li>
                      <li><code className="bg-bg-hover px-1 rounded">avg(practice)</code> - {tr("середнє за практичні завдання", "average for practice tasks")}</li>
                    </ul>
                    <p className="mt-2"><strong>{tr("Приклади", "Examples")}:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><code className="bg-bg-hover px-1 rounded">0.35 * test + 0.65 * avg(practice)</code> - {tr("рекомендовано: практика важить більше", "recommended: practice has higher weight")}</li>
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
        setEditingTestIndex(null);
        setEditingTest(null);
        setImportFiles([]);
        setImportPoints(1);
        setImportIsHidden(false);
        setImportingFiles(false);
        setImportInputKey(k => k + 1);
      }} title={tr("Тестові дані для перевірки завдання", "Test data for task checking")}>
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

              <div className="space-y-2">
                {testDataList.length === 0 ? <p className="text-text-secondary text-sm text-center py-4">
                    {tr("Немає тестових даних. Згенеруйте або додайте вручну.", "No test data. Generate or add manually.")}
                  </p> : testDataList.map((test, index) => <Card key={test.id} className="p-3">
                      {editingTestIndex === index ? <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-text-secondary">
                              {tr(`Тест #${index + 1}`, `Test #${index + 1}`)}
                            </span>
                            <div className="flex gap-1">
                              <Button variant="ghost" onClick={() => handleUpdateTestData(test.id)} className="text-xs p-1 h-6 w-6" title={t("save")}>
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" onClick={() => {
                      setEditingTestIndex(null);
                      setEditingTest(null);
                    }} className="text-xs p-1 h-6 w-6" title={t("cancel")}>
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
                                <input id={`cw-test-hidden-${test.id}`} type="checkbox" checked={editingTest?.isHidden === true} onChange={e => setEditingTest({
                        ...editingTest!,
                        isHidden: e.target.checked
                      })} className="w-4 h-4" />
                                <label htmlFor={`cw-test-hidden-${test.id}`} className="text-xs font-mono text-text-secondary" title={tr("Прихований тест не показується учню, але впливає на оцінку.", "Hidden test is not shown to the student but affects scoring.")}>{tr("Прихований", "Hidden")}</label>
                              </div>
                        </div> : <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono text-text-secondary">
                                  {tr(`Тест #${index + 1}`, `Test #${index + 1}`)} • {test.points} {tr("балів", "points")}{test.isHidden ? ` • ${tr("прихований", "hidden")}` : ""}
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
                    }} className="p-2 h-8 w-8 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-primary transition-fast" title={t("edit")}>
                                <Edit2 className="w-4 h-4 text-primary" />
                              </button>
                              <button onClick={() => handleDeleteTestData(test.id)} className="p-2 h-8 w-8 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent-error transition-fast" title={t("delete")}>
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
                })} className="w-4 h-4" />
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