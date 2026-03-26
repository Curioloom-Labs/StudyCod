import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { getLesson, createTask, generateTestData, getTaskGrades, generateQuiz, saveQuiz, submitQuizAnswers, getTestData, updateTestData, deleteTestData, addTestData, updateTaskDetails, getTask, startLessonAttempt, getLessonAttemptStatus, getControlWorkStatus, type Lesson, type Task, type CreateTaskRequest, type TestData, type TestDataItem, type TaskWithGrade, type TaskGrade } from "../../lib/api/edu";
import { GlobalTimer } from "../../components/GlobalTimer";
import { Plus, ArrowLeft, FileText, Users, Sparkles, Play, Trash2, Edit2, X, Send, Settings, Save, Clock } from "lucide-react";
import { getMe } from "../../lib/api/profile";
import { MarkdownView } from "../../components/MarkdownView";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import type { User } from "../../types";
import { isDeadlineExpired } from "../../utils/timezone";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { useWorkspaceViewport } from "../../components/interface/WorkspaceViewport";
import { buildResumeState, loadResumeState, saveResumeState } from "../../lib/resumeState";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type QuizOptionKey = "А" | "Б" | "В" | "Г" | "Д";
type QuizQuestion = {
  question?: string;
  q?: string;
  options?: string[] | Record<string, string>;
  correct?: number | string;
};
type StudentQuizReview = NonNullable<NonNullable<Lesson["quizReview"]>>;
type ControlWorkListItem = NonNullable<Lesson["controlWorks"]>[number];

const getErrorMessage = (error: unknown, fallback: string): string =>
  getErrorMessageFromUnknown(error, fallback);

const getResponseStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const status = Reflect.get(response, "status");
  return typeof status === "number" ? status : null;
};

const getResponseMessage = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const data = Reflect.get(response, "data");
  if (!data || typeof data !== "object") return null;
  const message = Reflect.get(data, "message");
  return typeof message === "string" ? message : null;
};
export const LessonDetailsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const {
    lessonId
  } = useParams<{
    lessonId: string;
  }>();
  const navigate = useNavigate();
  const { element: viewportEl } = useWorkspaceViewport();
  const [searchParams] = useSearchParams();
  const [lesson, setLesson] = useState<Lesson & {
    tasks: NonNullable<Lesson["tasks"]>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTask, setNewTask] = useState<CreateTaskRequest>({
    title: "",
    description: "",
    template: ""
  });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showGrades, setShowGrades] = useState(false);
  const [grades, setGrades] = useState<TaskGrade[]>([]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizTopicTitle, setQuizTopicTitle] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizCount, setQuizCount] = useState(12);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
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
  const [loadingTestData, setLoadingTestData] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importPoints, setImportPoints] = useState(1);
  const [importIsHidden, setImportIsHidden] = useState(false);
  const [importingFiles, setImportingFiles] = useState(false);
  const [importInputKey, setImportInputKey] = useState(0);
  const [showTaskSettings, setShowTaskSettings] = useState(false);
  const [settingsTask, setSettingsTask] = useState<TaskWithGrade | null>(null);
  const [taskMaxAttempts, setTaskMaxAttempts] = useState<number>(1);
  const [taskDeadline, setTaskDeadline] = useState<string>("");
  const [taskIsClosed, setTaskIsClosed] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const [studentQuizAnswers, setStudentQuizAnswers] = useState<Record<number, QuizOptionKey>>({});
  const [studentQuizSubmitted, setStudentQuizSubmitted] = useState(false);
  const [studentQuizGrade, setStudentQuizGrade] = useState<number | null>(null);
  const [studentQuizReview, setStudentQuizReview] = useState<StudentQuizReview | null>(null);
  const [hasAutoRedirected, setHasAutoRedirected] = useState(false);
  const [controlWorkStatus, setControlWorkStatus] = useState<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | null>(null);
  const createDescriptionRef = React.useRef<HTMLTextAreaElement | null>(null);

  const lessonIdNum = React.useMemo(() => {
    const n = Number(lessonId);
    return Number.isFinite(n) ? n : null;
  }, [lessonId]);

  const resumeStep = React.useMemo(() => {
    if (selectedTaskId != null) return "task";
    if (showGrades) return "grades";
    if (showCreateTask) return "create";
    return "overview";
  }, [selectedTaskId, showGrades, showCreateTask]);

  const restoredRef = React.useRef(false);

  const saveResume = React.useCallback(
    (scrollTop?: number) => {
      if (!user) return;
      if (lessonIdNum == null) return;
      saveResumeState(
        buildResumeState({
          userId: user.id,
          kind: "edu_lesson",
          lessonId: lessonIdNum,
          step: resumeStep,
          scrollTop
        })
      );
    },
    [user?.id, lessonIdNum, resumeStep]
  );

  useEffect(() => {
    if (!user) return;
    if (lessonIdNum == null) return;
    if (!viewportEl) return;
    if (restoredRef.current) return;
    const state = loadResumeState(user.id);
    if (!state || state.kind !== "edu_lesson" || state.lessonId !== lessonIdNum) return;
    restoredRef.current = true;
    if (typeof state.scrollTop === "number") {
      requestAnimationFrame(() => {
        try {
          viewportEl.scrollTop = state.scrollTop ?? 0;
        } catch {
          // ignore
        }
      });
    }
  }, [user?.id, lessonIdNum, viewportEl]);

  useEffect(() => {
    if (!user) return;
    if (lessonIdNum == null) return;
    if (!viewportEl) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => saveResume(viewportEl.scrollTop));
    };
    viewportEl.addEventListener("scroll", onScroll, { passive: true });
    saveResume(viewportEl.scrollTop);
    return () => {
      viewportEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      saveResume(viewportEl.scrollTop);
    };
  }, [user?.id, lessonIdNum, viewportEl, saveResume]);

  useEffect(() => {
    saveResume(viewportEl?.scrollTop);
  }, [user?.id, lessonIdNum, resumeStep]);
  useEffect(() => {
    const initialize = async () => {
      await loadUser();
      if (lessonId) {
        await loadLesson();
        setHasAutoRedirected(false);
      }
    };
    initialize();
  }, [lessonId, searchParams]);
  useEffect(() => {
    if (user && lessonId && lesson && user.userMode === "EDUCATIONAL" && user.studentId) {
      loadLesson();
    }
  }, [user?.id, user?.studentId]);
  useEffect(() => {
    if (lesson && user?.userMode === "EDUCATIONAL" && user?.studentId && !hasAutoRedirected) {
      if (lesson.type === "LESSON" && lesson.tasks.length === 1) {
        const task = lesson.tasks[0];
        setHasAutoRedirected(true);
        navigate(`/edu/tasks/${task.id}`, {
          replace: true
        });
      }
    }
  }, [lesson, user, hasAutoRedirected, navigate]);
  useEffect(() => {
    if (lesson && lesson.type === "CONTROL" && lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null && user?.userMode === "EDUCATIONAL" && user?.studentId && controlWorkStatus !== "COMPLETED") {
      const initializeTimer = async () => {
        try {
          const statusData = await getControlWorkStatus(parseInt(lessonId!, 10));
          setControlWorkStatus(statusData.status);
          if (statusData.status === "COMPLETED") {
            return;
          }
          const status = await getLessonAttemptStatus(parseInt(lessonId!, 10));
          if (status.hasActiveAttempt && status.remainingSeconds > 0) {
            setRemainingSeconds(status.remainingSeconds);
            setControlWorkStatus("IN_PROGRESS");
          } else {
            setRemainingSeconds(null);
          }
        } catch (error: unknown) {
          console.error("Failed to initialize timer:", error);
          const status = getResponseStatus(error);
          const message = getResponseMessage(error);
          if (status !== 500 || message !== "DATABASE_TABLE_NOT_CREATED") {
            if (lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null) {
              setRemainingSeconds(lesson.timeLimitMinutes * 60);
            }
          }
        }
      };
      initializeTimer();
    }
  }, [lesson, user, lessonId]);
  const loadUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };
  const loadLesson = async () => {
    if (!lessonId) return;
    try {
      const requestedType = (searchParams.get("type") || undefined) as "TOPIC" | "CONTROL" | "LESSON" | undefined;
      const data = await getLesson(parseInt(lessonId, 10), requestedType);
      console.log(`[LessonDetailsPage] Loaded lesson:`, {
        id: data.id,
        type: data.type,
        title: data.title,
        tasksCount: data.tasks?.length,
        tasks: data.tasks?.map(t => ({
          id: t.id,
          title: t.title,
        }))
      });
      setLesson(data);
      if (data.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId) {
        try {
          const statusData = await getControlWorkStatus(parseInt(lessonId, 10));
          setControlWorkStatus(statusData.status);
        } catch (error: unknown) {
          console.error("Failed to load control work status:", error);
        }
      }
      if (data.quizJson) {
        try {
          const quiz = JSON.parse(data.quizJson);
          setQuizQuestions(quiz);
          if (user?.userMode === "EDUCATIONAL" && user?.studentId) {
            const isQuizSubmitted = data.quizSubmitted === true;
            if (isQuizSubmitted) {
              setStudentQuizSubmitted(true);
              if (data.quizGrade !== null && data.quizGrade !== undefined && typeof data.quizGrade === 'number') {
                const gradeValue = Number(data.quizGrade);
                if (!isNaN(gradeValue) && gradeValue >= 0 && gradeValue <= 12) {
                  setStudentQuizGrade(gradeValue);
                }
              }
              if (data.quizReview) {
                setStudentQuizReview(data.quizReview);
              } else {
                setStudentQuizReview(null);
              }
              localStorage.removeItem(`quiz_answers_lesson_${lessonId}`);
              localStorage.removeItem(`quiz_submitted_lesson_${lessonId}`);
              localStorage.removeItem(`quiz_grade_lesson_${lessonId}`);
            } else {
              try {
                const savedAnswers = localStorage.getItem(`quiz_answers_lesson_${lessonId}`);
                if (savedAnswers) {
                  const parsed = JSON.parse(savedAnswers);
                  if (parsed && typeof parsed === 'object') {
                    setStudentQuizAnswers(parsed);
                  }
                }
              } catch (e) {
                localStorage.removeItem(`quiz_answers_lesson_${lessonId}`);
              }
              setStudentQuizSubmitted(false);
              setStudentQuizGrade(null);
              setStudentQuizReview(null);
            }
          }
        } catch (e) {
          console.error("Failed to parse quiz:", e);
        }
      } else {
        setQuizQuestions([]);
      }
    } catch (error: unknown) {
      console.error("Failed to load lesson:", error);
      const status = getResponseStatus(error);
      if (status === 404 || status === 403) {
        showToast({ type: "error", message: getErrorMessage(error, tr("Урок не знайдено", "Lesson not found")) });
      }
    } finally {
      setLoading(false);
    }
  };
  const handleCreateTask = async () => {
    if (!lessonId || !newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      showToast({ type: "error", message: tr("Заповніть всі поля", "Fill all fields") });
      return;
    }
    try {
      await createTask(parseInt(lessonId, 10), newTask);
      setNewTask({
        title: "",
        description: "",
        template: ""
      });
      setShowCreateTask(false);
      await loadLesson();
    } catch (error: unknown) {
      console.error("Failed to create task:", error);
      const errorMessage = getErrorMessage(error, tr("Не вдалося створити завдання", "Failed to create task"));
      showToast({ type: "error", message: errorMessage });
    }
  };
  const handleGenerateTests = async (taskId: number, count: number) => {
    try {
      await generateTestData(taskId, count);
      showToast({ type: "success", message: tr(`Згенеровано ${count} тестових даних`, `Generated ${count} test cases`) });
      await loadLesson();
      if (showTestDataModal && testDataTaskId === taskId) {
        await loadTestData(taskId);
      }
    } catch (error: unknown) {
      console.error("Failed to generate tests:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося згенерувати тести", "Failed to generate tests")) });
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

      const payload: TestDataItem[] = tests.map(t => ({
        input: t.input,
        expectedOutput: t.expectedOutput,
        points: importPoints,
        isHidden: importIsHidden
      }));
      await addTestData(testDataTaskId, payload);
      await loadTestData(testDataTaskId);
      await loadLesson();
      setImportFiles([]);
      setImportInputKey(k => k + 1);
    } catch (error: unknown) {
      console.error("Failed to import tests:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося імпортувати тести", "Failed to import tests")) });
    } finally {
      setImportingFiles(false);
    }
  };
  const loadTestData = async (taskId: number) => {
    setLoadingTestData(true);
    try {
      const data = await getTestData(taskId);
      setTestDataList(data.testData);
    } catch (error: unknown) {
      console.error("Failed to load test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося завантажити тести", "Failed to load tests")) });
    } finally {
      setLoadingTestData(false);
    }
  };
  const handleOpenTestDataModal = async (taskId: number) => {
    setTestDataTaskId(taskId);
    setShowTestDataModal(true);
    await loadTestData(taskId);
  };
  const handleSaveTest = async (testDataId: number, index: number) => {
    if (!testDataTaskId || !editingTest) return;
    try {
      await updateTestData(testDataTaskId, testDataId, editingTest);
      await loadTestData(testDataTaskId);
      setEditingTestIndex(null);
      setEditingTest(null);
    } catch (error: unknown) {
      console.error("Failed to update test:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося оновити тест", "Failed to update test")) });
    }
  };
  const handleDeleteTest = async (testDataId: number) => {
    if (!testDataTaskId) return;
    if (!confirm(tr("Видалити цей тест?", "Delete this test?"))) return;
    try {
      await deleteTestData(testDataTaskId, testDataId);
      await loadTestData(testDataTaskId);
      await loadLesson();
    } catch (error: unknown) {
      console.error("Failed to delete test:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити тест", "Failed to delete test")) });
    }
  };
  const handleAddNewTest = async () => {
    if (!testDataTaskId || !editingTest) return;
    try {
      await addTestData(testDataTaskId, [editingTest]);
      await loadTestData(testDataTaskId);
      setEditingTestIndex(null);
      setEditingTest(null);
    } catch (error: unknown) {
      console.error("Failed to add test:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося додати тест", "Failed to add test")) });
    }
  };
  const handleOpenTaskSettings = async (taskId: number) => {
    try {
      const task = await getTask(taskId);
      setSettingsTask(task);
      setTaskMaxAttempts(task.maxAttempts || 1);
      setTaskDeadline(task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "");
      setTaskIsClosed(task.isClosed || false);
      setShowTaskSettings(true);
    } catch (error: unknown) {
      console.error("Failed to load task:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося завантажити завдання", "Failed to load task")) });
    }
  };
  const handleSaveTaskSettings = async () => {
    if (!settingsTask) return;
    try {
      await updateTaskDetails(settingsTask.id, {
        maxAttempts: taskMaxAttempts,
        deadline: taskDeadline || null,
        isClosed: taskIsClosed
      });
      await loadLesson();
      setShowTaskSettings(false);
      setSettingsTask(null);
    } catch (error: unknown) {
      console.error("Failed to update task settings:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося оновити налаштування", "Failed to update settings")) });
    }
  };
  const handleViewGrades = async (taskId: number) => {
    try {
      const data = await getTaskGrades(taskId);
      setGrades(data);
      setSelectedTaskId(taskId);
      setShowGrades(true);
    } catch (error) {
      console.error("Failed to load grades:", error);
      showToast({ type: "error", message: tr("Не вдалося завантажити оцінки", "Failed to load grades") });
    }
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("loading")}
      </div>;
  }
  if (!lesson) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Урок не знайдено", "Lesson not found")}
      </div>;
  }
  return <>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
          <h1 className="text-2xl font-mono text-text-primary">{lesson.title}</h1>
          <span className="text-xs text-text-muted px-2 py-1 border border-border">
            {lesson.type === "TOPIC" ? t("topic") : lesson.type === "CONTROL" ? tr("Контрольна", "Control work") : t("lesson")}
          </span>
          </div>
          {lesson.type === "CONTROL" && lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null && remainingSeconds !== null && user?.userMode === "EDUCATIONAL" && user?.studentId && <GlobalTimer remainingSeconds={remainingSeconds} onExpired={() => {
          setTimeExpired(true);
          showToast({ type: "error", message: tr("Час вийшов! Ви не можете більше відправляти відповіді.", "Time is up! You can no longer submit answers.") });
        }} />}
        </div>

        {lesson.hasTheory && lesson.theory && <Card className="p-4 mb-6">
            <h2 className="text-lg font-mono text-text-primary mb-3">{t("theory")}</h2>
            <div className="prose prose-invert max-w-none text-text-secondary font-mono text-sm">
              <MarkdownView content={lesson.theory} />
            </div>
          </Card>}

        {}
          {lesson.type === "TOPIC" && Array.isArray(lesson.controlWorks) && lesson.controlWorks.length > 0 && <Card className="p-4 mb-6">
            <h2 className="text-lg font-mono text-text-primary mb-3">{tr("Контрольні роботи", "Control works")}</h2>
            <div className="space-y-3">
            {lesson.controlWorks!.map((cw: ControlWorkListItem) => <div key={cw.id} className="p-3 border border-border bg-bg-base flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted px-2 py-1 border border-border">{tr("Контрольна", "Control work")}</span>
                      <div className="text-sm font-mono text-text-primary">{cw.title}</div>
                    </div>
                    <div className="mt-2 text-xs text-text-muted flex flex-wrap gap-3">
                      <span>{tr("Завдань", "Tasks")}: {cw.tasksCount}</span>
                      {cw.timeLimitMinutes ? <span>{tr("Обмеження", "Limit")}: {cw.timeLimitMinutes} {t("min")}</span> : null}
                      {cw.deadline ? <span>
                          {tr("Дедлайн", "Deadline")}:{" "}
                          {new Date(cw.deadline).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                        </span> : null}
                        {cw.studentGrade !== null && cw.studentGrade !== undefined && <span className="text-text-primary">
                          {t("grade")}: <span className="font-bold">{cw.studentGrade}</span>/100
                        </span>}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => navigate(`/edu/lessons/${cw.id}?type=CONTROL`)}>
                    {t("open")}
                  </Button>
                </div>)}
            </div>
          </Card>}

        {}
        {}
        {lesson.type === "CONTROL" && lesson.controlHasTheory && (controlWorkStatus !== "COMPLETED" || studentQuizSubmitted) && <Card className="p-4 mb-6">
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <h2 className="text-lg font-mono text-text-primary mb-3">{tr("Теоретична частина (Питання)", "Theory part (Questions)")}</h2>}
            
            {}
            {lesson.quizJson && !user?.studentId && (() => {
          try {
            const quiz = JSON.parse(lesson.quizJson);
            return <div className="mb-4 space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {quiz.map((q: QuizQuestion, index: number) => <div key={index} className="p-3 border border-border bg-bg-base relative">
                        {user?.userMode === "EDUCATIONAL" && !user?.studentId && <div className="absolute top-2 right-2 flex gap-1">
                            <button onClick={() => {
                    const questionText = q.question || q.q || "";
                    const optionsObj: {
                      А: string;
                      Б: string;
                      В: string;
                      Г: string;
                      Д: string;
                    } = Array.isArray(q.options) ? {
                      А: q.options[0] || "",
                      Б: q.options[1] || "",
                      В: q.options[2] || "",
                      Г: q.options[3] || "",
                      Д: q.options[4] || ""
                    } : {
                      А: String((q.options as Record<string, string> | undefined)?.А || ""),
                      Б: String((q.options as Record<string, string> | undefined)?.Б || ""),
                      В: String((q.options as Record<string, string> | undefined)?.В || ""),
                      Г: String((q.options as Record<string, string> | undefined)?.Г || ""),
                      Д: String((q.options as Record<string, string> | undefined)?.Д || "")
                    };
                    const correctKey = typeof q.correct === 'number' ? ['А', 'Б', 'В', 'Г', 'Д'][q.correct] || 'А' : q.correct || 'А';
                    setNewQuestion({
                      question: questionText,
                      options: optionsObj,
                      correct: correctKey as "А" | "Б" | "В" | "Г" | "Д"
                    });
                    setEditingQuestionIndex(index);
                    setShowAddQuestion(true);
                  }} className="text-xs p-1 h-6 w-6 border border-border hover:bg-bg-hover flex items-center justify-center" title={t("edit")}>
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={async () => {
                    if (!confirm(tr("Видалити це питання?", "Delete this question?"))) return;
                    try {
                      const updatedQuiz = [...quiz];
                      updatedQuiz.splice(index, 1);
                      await saveQuiz(parseInt(lessonId!, 10), updatedQuiz);
                      await loadLesson();
                    } catch (error: unknown) {
                      console.error("Failed to delete question:", error);
                      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося видалити питання", "Failed to delete question")) });
                    }
                  }} className="text-xs p-1 h-6 w-6 border border-border hover:bg-bg-hover flex items-center justify-center text-accent-error" title={t("delete")}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>}
                        <div className="text-sm font-mono text-text-primary mb-2 pr-16">
                          {index + 1}. {q.question || q.q || tr("Питання без тексту", "Question without text")}
                        </div>
                        <div className="space-y-1 text-xs text-text-secondary">
                          {(Array.isArray(q.options) ? q.options.map((opt: string, idx: number) => [['А', 'Б', 'В', 'Г', 'Д'][idx], opt] as const) : Object.entries((q.options || {}) as Record<string, string>)).map(([key, value], optIndex: number) => {
                    const isCorrect = typeof q.correct === 'number' ? optIndex === q.correct : key === q.correct;
                    return <div key={key} className="flex items-center gap-2">
                              <span className="font-mono">{key})</span>
                              <span>{value}</span>
                                {isCorrect && user?.userMode === "EDUCATIONAL" && !user?.studentId && <span className="text-accent-success ml-2">{tr("✓ Правильна відповідь", "✓ Correct answer")}</span>}
                            </div>;
                  })}
                        </div>
                      </div>)}
                  </div>;
          } catch (e) {
            console.error("Failed to parse quiz:", e);
            return null;
          }
        })()}

            {}
            {user?.userMode === "EDUCATIONAL" && user?.studentId && lesson.quizJson && !studentQuizSubmitted && controlWorkStatus !== "COMPLETED" && <div className="mb-4 space-y-4">
                {(() => {
            try {
              const quiz = JSON.parse(lesson.quizJson);
              return quiz.map((q: QuizQuestion, index: number) => <div key={index} className="p-4 border border-border bg-bg-base">
                        <div className="text-sm font-mono text-text-primary mb-3">
                          {index + 1}. {q.question || q.q || tr("Питання без тексту", "Question without text")}
                        </div>
                        <div className="space-y-2">
                          {(Array.isArray(q.options) ? q.options.map((opt: string, idx: number) => [['А', 'Б', 'В', 'Г', 'Д'][idx], opt] as const) : Object.entries((q.options || {}) as Record<string, string>)).map(([key, value]) => <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-bg-hover p-2 rounded">
                              <input type="radio" name={`quiz_question_${index}`} value={key} checked={studentQuizAnswers[index] === key} onChange={e => {
                      const newAnswers = {
                        ...studentQuizAnswers,
                        [index]: key as QuizOptionKey
                      };
                      setStudentQuizAnswers(newAnswers);
                      try {
                        localStorage.setItem(`quiz_answers_lesson_${lessonId}`, JSON.stringify(newAnswers));
                      } catch (e) {
                        console.error("Failed to save quiz answers to localStorage:", e);
                      }
                    }} className="w-4 h-4" />
                              <span className="font-mono text-text-secondary">{key})</span>
                              <span className="text-text-secondary">{value}</span>
                            </label>)}
                        </div>
                      </div>);
            } catch (e) {
              return null;
            }
          })()}
                <div className="flex justify-end">
                  <Button onClick={async () => {
              if (Object.keys(studentQuizAnswers).length < quizQuestions.length) {
                showToast({ type: "error", message: tr("Будь ласка, відповідьте на всі питання", "Please answer all questions") });
                return;
              }
              try {
                const result = await submitQuizAnswers(parseInt(lessonId!, 10), studentQuizAnswers, true);
                setStudentQuizSubmitted(true);
                setStudentQuizGrade(null);
                setStudentQuizReview(null);
                localStorage.setItem(`quiz_submitted_lesson_${lessonId}`, "true");
                localStorage.removeItem(`quiz_grade_lesson_${lessonId}`);
                try {
                  const statusData = await getControlWorkStatus(parseInt(lessonId!, 10));
                  if (statusData.status === "COMPLETED") {
                    setControlWorkStatus("COMPLETED");
                    showToast({ type: "success", message: tr("Контрольну завершено. Відкриваємо підсумковий огляд.", "Control work completed. Opening final review.") });
                    await loadLesson();
                    return;
                  }
                } catch (e) {
                  console.error("Failed to check control work status:", e);
                }
                showToast({ type: "success", message: tr("Тест відправлено. Результати будуть доступні у фінальному огляді контрольної.", "Quiz submitted. Results will be available in the final control-work review.") });
                await loadLesson();
              } catch (error: unknown) {
                console.error("Failed to submit quiz:", error);
                const status = getResponseStatus(error);
                const message = getResponseMessage(error);
                if (status === 409 && message === "CONTROL_WORK_COMPLETED") {
                  setControlWorkStatus("COMPLETED");
                  showToast({ type: "info", message: tr("Контрольна робота вже завершена", "Control work is already completed") });
                  await loadLesson();
                } else if (status === 409 && message === "QUIZ_ALREADY_SUBMITTED") {
                  showToast({ type: "info", message: tr("Тест уже відправлено. Повторна здача неможлива.", "Quiz has already been submitted. Retake is not allowed.") });
                  await loadLesson();
                } else {
                  showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося відправити тест", "Failed to submit quiz")) });
                }
              }
            }} disabled={studentQuizSubmitted}>
                    <Send className="w-4 h-4 mr-2" />
                    {t("submitTest")}
                  </Button>
                </div>
              </div>}

            {}
            {user?.userMode === "EDUCATIONAL" && user?.studentId && studentQuizSubmitted && <div className="mb-4 space-y-3">
                {controlWorkStatus !== "COMPLETED" && <div className="p-4 border border-primary/40 bg-primary/5 rounded">
                    <div className="text-sm font-mono text-text-primary">
                      {tr("Тест відправлено. Переходьте до задач — детальні результати будуть у фінальному рев’ю.", "Quiz submitted. Proceed to tasks — detailed results will be shown in the final review.")}
                    </div>
                  </div>}
              </div>}

            {}
            {user?.userMode === "EDUCATIONAL" && !user?.studentId && <>
                {}
                {lesson.quizJson && <div className="mb-3">
                    <Button variant="ghost" onClick={() => {
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
              setEditingQuestionIndex(null);
              setShowAddQuestion(true);
            }} className="text-xs">
                      <Plus className="w-4 h-4 mr-1" />
                      {tr("Додати питання", "Add question")}
                    </Button>
                  </div>}
                {!lesson.quizJson && <>
                    <div className="flex gap-2 mb-2">
                      <input type="text" value={quizTopicTitle} onChange={e => setQuizTopicTitle(e.target.value)} placeholder={tr("Назва теми для генерації питань", "Topic for generating questions")} className="flex-1 px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                      <input type="number" min="1" max="50" value={quizCount} onChange={e => setQuizCount(parseInt(e.target.value) || 12)} placeholder={tr("Кількість", "Count")} className="w-24 px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                      <Button variant="ghost" onClick={async () => {
                if (!lessonId || !quizTopicTitle.trim()) {
                  showToast({ type: "error", message: tr("Введіть назву теми", "Enter a topic") });
                  return;
                }
                setGeneratingQuiz(true);
                try {
                  const result = await generateQuiz(parseInt(lessonId, 10), quizCount, quizTopicTitle);
                  showToast({ type: "success", message: tr(`Згенеровано ${result.count} питань`, `Generated ${result.count} questions`) });
                  setQuizTopicTitle("");
                  await loadLesson();
                } catch (error: unknown) {
                  console.error("Failed to generate quiz:", error);
                  showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося згенерувати питання", "Failed to generate questions")) });
                } finally {
                  setGeneratingQuiz(false);
                }
              }} disabled={generatingQuiz} className="text-xs">
                        <Sparkles className="w-4 h-4 mr-1" />
                        {generatingQuiz ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                      </Button>
                    </div>
                    <p className="text-xs text-text-muted">
                      {tr("Згенеруйте питання для теоретичної частини контрольної роботи", "Generate questions for the theory part of the control work")}
                    </p>
                  </>}
              </>}
          </Card>}

        {}
        {lesson.type === "CONTROL" && controlWorkStatus === "COMPLETED" && <Card className="p-4 mb-6 border-accent-success">
            <div className="text-lg font-mono text-accent-success mb-3">
              {tr("Контрольна робота завершена — фінальний огляд", "Control work completed — final review")}
            </div>

            <div className="space-y-4">
              <div className="p-3 border border-border bg-bg-base">
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Огляд тесту", "Quiz review")}</div>
                {studentQuizReview?.questions && Array.isArray(studentQuizReview.questions) ? <>
                    <div className="text-xs text-text-secondary mb-3">
                      {tr("Результат", "Result")}: {studentQuizReview.correctAnswers}/{studentQuizReview.totalQuestions}
                    </div>
                    <div className="space-y-3">
                      {studentQuizReview.questions.map(q => <div key={q.index} className="p-3 border border-border bg-bg-surface/40">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-mono text-text-primary">
                              {q.index + 1}. {q.question || tr("Питання", "Question")}
                            </div>
                            <div className={`text-xs font-mono px-2 py-1 border ${q.isCorrect ? "border-accent-success text-accent-success" : "border-accent-error text-accent-error"}`}>
                              {q.isCorrect ? tr("✓ Правильно", "✓ Correct") : tr("✗ Неправильно", "✗ Incorrect")}
                            </div>
                          </div>
                          <div className="mt-2 space-y-1 text-xs">
                            {Object.entries(q.options || {}).map(([key, value]) => {
                    const k = String(key).toUpperCase();
                    const correct = String(q.correct || "").toUpperCase();
                    const student = q.student ? String(q.student).toUpperCase() : null;
                    const isCorrect = k === correct;
                    const isStudent = student ? k === student : false;
                    const cls = isCorrect ? "text-accent-success" : isStudent ? "text-accent-error" : "text-text-secondary";
                    return <div key={key} className={`flex items-center gap-2 ${cls}`}>
                                  <span className="font-mono">{key})</span>
                                  <span>{String(value)}</span>
                                  {isCorrect && <span className="ml-2">✓</span>}
                                  {isStudent && !isCorrect && <span className="ml-2">{tr("• ваш вибір", "• your choice")}</span>}
                                </div>;
                  })}
                          </div>
                        </div>)}
                    </div>
                  </> : <div className="text-xs text-text-secondary">
                    {tr("Тестових відповідей не знайдено.", "No quiz answers found.")}
                  </div>}
              </div>

              <div className="p-3 border border-border bg-bg-base">
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Огляд задач", "Task review")}</div>
                <div className="space-y-2">
                  {lesson.tasks.map(task => {
                const grade = task.grade;
                return <div key={task.id} className="p-3 border border-border bg-bg-surface/40 flex items-center justify-between gap-3">
                        <div className="text-sm font-mono text-text-primary">{task.title}</div>
                        {grade ? <div className="text-xs font-mono text-text-secondary text-right">
                          <div>{t("grade")}: <span className="text-text-primary font-bold">{grade.total}</span>/100</div>
                            <div>{tr("Тести", "Tests")}: {grade.testsPassed}/{grade.testsTotal}</div>
                          </div> : <div className="text-xs text-text-muted">{tr("Немає оцінки", "No grade")}</div>}
                      </div>;
              })}
                </div>
              </div>
            </div>
          </Card>}

        {}
        {lesson.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId && controlWorkStatus === "NOT_STARTED" && lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null && <Card className="p-4 mb-6 border-primary/40">
              <div className="text-lg font-mono text-text-primary mb-2">{tr("Контрольна ще не розпочата", "Control work not started")}</div>
              <div className="text-text-secondary mb-3">
                {tr("Натисніть «Почати контрольну», щоб запустити таймер. Після старту час піде одразу.", "Click “Start control work” to start the timer. Time starts immediately after you start.")}
              </div>
              <Button onClick={async () => {
          try {
            const attempt = await startLessonAttempt(parseInt(lessonId!, 10));
            setRemainingSeconds(attempt.remainingSeconds);
            setControlWorkStatus("IN_PROGRESS");
          } catch (error: unknown) {
            console.error("Failed to start attempt:", error);
            const status = getResponseStatus(error);
            const message = getResponseMessage(error);
            if (status === 409 && message === "CONTROL_WORK_COMPLETED") {
              setControlWorkStatus("COMPLETED");
            } else {
              showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося почати контрольну", "Failed to start control work")) });
            }
          }
        }}>
                {tr("Почати контрольну", "Start control work")}
              </Button>
            </Card>}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono text-text-primary">
            {t("tasks")} ({lesson.tasks.length})
          </h2>
          {user?.userMode === "EDUCATIONAL" && !user?.studentId && <Button onClick={() => {
          if (lesson.type === "LESSON" && lesson.tasks.length > 0) {
            showToast({ type: "error", message: tr("Звичайний урок може мати тільки одне завдання. Видаліть існуюче завдання або створіть контрольну роботу для множинних завдань.", "A regular lesson can have only one task. Delete the existing task or create a control work for multiple tasks.") });
            return;
          }
          setShowCreateTask(true);
        }}>
              <Plus className="w-4 h-4 mr-2" />
              {t("addTask")}
            </Button>}
        </div>

        <div className="space-y-3">
          {lesson.tasks.length === 0 ? <Card className="p-8 text-center">
              <p className="text-text-secondary">{t("noTasks")}</p>
            </Card> : (() => {
          const isStudentControlFlow = lesson.type === "CONTROL" && !!user?.studentId;
          const quizGatePassed = !lesson.controlHasTheory || studentQuizSubmitted || controlWorkStatus === "COMPLETED";
          const unlockedTaskIds = Array.isArray(lesson.studentControlProgress?.unlockedTaskIds) ? lesson.studentControlProgress!.unlockedTaskIds : [];

          let visibleTasks = [...lesson.tasks] as Array<(typeof lesson.tasks)[number]>;
          if (isStudentControlFlow && controlWorkStatus !== "COMPLETED") {
            if (!quizGatePassed) {
              visibleTasks = [];
            } else if (unlockedTaskIds.length > 0) {
              visibleTasks = lesson.tasks.filter(t => unlockedTaskIds.includes(t.id));
            } else {
              const firstIncomplete = lesson.tasks.find(t => !t.hasGrade);
              visibleTasks = firstIncomplete ? [firstIncomplete] : [];
            }
          }

          if (isStudentControlFlow && controlWorkStatus !== "COMPLETED" && !quizGatePassed) {
            return <Card className="p-8 text-center">
                <p className="text-text-secondary">{tr("Спершу відправте тест, щоб відкрити першу задачу.", "Submit the quiz first to unlock the first task.")}</p>
              </Card>;
          }

          return visibleTasks.map(task => {
          const isExpired = task.deadline && isDeadlineExpired(task.deadline);
          const hasGrade = task.hasGrade || false;
          const showOverdue = isExpired && !hasGrade;
          const showViewButton = hasGrade || showOverdue;
          const showTaskGrade = lesson.type !== "CONTROL" || controlWorkStatus === "COMPLETED";
          return <Card key={task.id} className={`p-4 ${showOverdue ? 'border-accent-error/50 bg-accent-error/5' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-mono text-text-primary">{task.title}</h3>
                      {showOverdue && <span className="text-xs px-2 py-1 bg-accent-error/20 text-accent-error border border-accent-error/30 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t("expired")}
                        </span>}
                      {task.deadline && !isExpired && <span className="text-xs px-2 py-1 bg-bg-hover text-text-secondary border border-border rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t("until")}{" "}
                          {new Date(task.deadline).toLocaleDateString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                        </span>}
                        {showTaskGrade && hasGrade && task.grade && <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${task.grade.total >= 85 ? 'bg-accent-success/20 text-accent-success border border-accent-success/30' : task.grade.total >= 65 ? 'bg-accent-warn/20 text-accent-warn border border-accent-warn/30' : task.grade.total >= 40 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-accent-error/20 text-accent-error border border-accent-error/30'}`}>
                          {t("grade")}: {task.grade.total}/100
                        </span>}
                    </div>
                    <div className="text-sm text-text-secondary mb-2 line-clamp-2">
                      {task.description}
                    </div>
                    <div className="text-xs text-text-muted">
                      {t("tests")}: {task.testDataCount || 0}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {user?.userMode === "EDUCATIONAL" && !user?.studentId ? <>
                        <Button variant="ghost" onClick={() => handleViewGrades(task.id)} className="text-xs">
                          <Users className="w-4 h-4 mr-1" />
                          {t("grades")}
                        </Button>
                        <Button variant="ghost" onClick={() => handleOpenTestDataModal(task.id)} className="text-xs">
                          <FileText className="w-4 h-4 mr-1" />
                          {t("tests")} ({task.testDataCount || 0})
                        </Button>
                        <Button variant="ghost" onClick={() => handleOpenTaskSettings(task.id)} className="text-xs">
                          <Settings className="w-4 h-4 mr-1" />
                          {t("settings")}
                        </Button>
                      </> : <Button variant={showViewButton ? "ghost" : "primary"} onClick={() => {
                  navigate(`/edu/tasks/${task.id}`);
                }} className="text-xs">
                        {showViewButton ? <>
                            <FileText className="w-4 h-4 mr-1" />
                            {tr("Переглянути", "View")}
                          </> : <>
                            <Play className="w-4 h-4 mr-1" />
                            {t("execute")}
                          </>}
                      </Button>}
                  </div>
                </div>
              </Card>;
        });
        })()}
        </div>
      </div>

      {}
      {showCreateTask && <Modal open={showCreateTask} onClose={() => setShowCreateTask(false)} title={tr("Створити завдання", "Create task")} showCloseButton={false}>
          <div className="p-6 max-w-3xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{tr("Створити завдання", "Create task")}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Назва завдання", "Task title")} *
                </label>
                <input type="text" value={newTask.title} onChange={e => setNewTask({
              ...newTask,
              title: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Опис завдання (Markdown)", "Task description (Markdown)")} *
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
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[150px]" />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Шаблон коду", "Code template")} *
                </label>
                <textarea value={newTask.template} onChange={e => setNewTask({
              ...newTask,
              template: e.target.value
            })} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[200px] font-mono text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowCreateTask(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleCreateTask}>{t("create")}</Button>
              </div>
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
    }} title={editingQuestionIndex !== null ? tr("Редагувати питання", "Edit question") : tr("Додати питання", "Add question")} showCloseButton={false}>
          <div className="p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Питання", "Question")} *
                </label>
                <textarea value={newQuestion.question} onChange={e => setNewQuestion({
              ...newQuestion,
              question: e.target.value
            })} placeholder={tr("Введіть текст питання", "Enter question text")} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary resize-none" rows={3} />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Варіанти відповідей", "Answer options")} *
                </label>
                <div className="space-y-2">
                  {Object.entries(newQuestion.options).map(([key, value]) => <div key={key} className="flex items-center gap-2">
                      <span className="font-mono w-6 text-text-secondary">{key})</span>
                      <input type="text" value={value} onChange={e => setNewQuestion({
                  ...newQuestion,
                  options: {
                    ...newQuestion.options,
                    [key]: e.target.value
                  }
                })} placeholder={tr(`Варіант ${key}`, `Option ${key}`)} className="flex-1 px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                      <input type="radio" name="correct" checked={newQuestion.correct === key} onChange={() => setNewQuestion({
                  ...newQuestion,
                  correct: key as "А" | "Б" | "В" | "Г" | "Д"
                })} className="w-4 h-4" />
                      <span className="text-xs text-text-muted">{tr("Правильна", "Correct")}</span>
                    </div>)}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
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
              <Button onClick={async () => {
            if (!newQuestion.question.trim()) {
              showToast({ type: "error", message: tr("Введіть текст питання", "Enter question text") });
              return;
            }
            if (Object.values(newQuestion.options).some(v => !v.trim())) {
              showToast({ type: "error", message: tr("Заповніть всі варіанти відповідей", "Fill all answer options") });
              return;
            }
            try {
              const currentQuiz = lesson?.quizJson ? JSON.parse(lesson.quizJson) : [];
              const updatedQuiz = [...currentQuiz];
              const optionKeys: ("А" | "Б" | "В" | "Г" | "Д")[] = ['А', 'Б', 'В', 'Г', 'Д'];
              const normalizedQuestion = {
                q: newQuestion.question.trim(),
                options: optionKeys.map(key => newQuestion.options[key] || ''),
                correct: optionKeys.indexOf(newQuestion.correct)
              };
              if (editingQuestionIndex !== null) {
                updatedQuiz[editingQuestionIndex] = normalizedQuestion;
              } else {
                updatedQuiz.push(normalizedQuestion);
              }
              await saveQuiz(parseInt(lessonId!, 10), updatedQuiz);
              await loadLesson();
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
            } catch (error: unknown) {
              console.error("Failed to save question:", error);
              showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося зберегти питання", "Failed to save question")) });
            }
          }}>
                {editingQuestionIndex !== null ? tr("Зберегти зміни", "Save changes") : tr("Додати питання", "Add question")}
              </Button>
            </div>
          </div>
        </Modal>}

      {}
      {showGrades && <Modal open={showGrades} onClose={() => setShowGrades(false)} title={tr("Оцінки учнів", "Student grades")} showCloseButton={false}>
          <div className="p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{tr("Оцінки учнів", "Student grades")}</h2>
            <div className="space-y-2">
              {grades.map((item, index) => <div key={index} className="p-3 border border-border bg-bg-surface flex items-center justify-between">
                  <div>
                    <div className="text-sm font-mono text-text-primary">
                      {item.student.lastName} {item.student.firstName} {item.student.middleName || ""}
                    </div>
                    <div className="text-xs text-text-secondary">{item.student.email}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    {item.grade ? <>
                        <div className="text-right">
                          <div className={`text-lg font-mono font-bold ${item.grade.total >= 85 ? "text-accent-success" : item.grade.total >= 65 ? "text-accent-warn" : item.grade.total >= 40 ? "text-yellow-500" : "text-accent-error"}`}>
                            {item.grade.total}
                          </div>
                          <div className="text-xs text-text-muted">{t("outOf")} 12</div>
                        </div>
                      <Button variant="ghost" onClick={() => navigate(`/edu/grades/${item.grade!.id}`)} className="text-xs">
                        {tr("Деталі", "Details")}
                      </Button>
                      </> : <span className="text-xs text-text-muted">{tr("Немає оцінки", "No grade")}</span>}
                  </div>
                </div>)}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowGrades(false)}>{t("close")}</Button>
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
    }} title={tr("Управління тестами", "Test management")} showCloseButton={false}>
          <div className="p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-mono text-text-primary">{tr("Тестові дані", "Test data")}</h2>
              <div className="flex gap-2">
                <input type="number" min="1" max="50" value={newTestCount} onChange={e => setNewTestCount(parseInt(e.target.value) || 10)} className="w-20 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                <Button variant="ghost" onClick={() => handleGenerateTests(testDataTaskId, newTestCount)} className="text-xs">
                  <Sparkles className="w-4 h-4 mr-1" />
                  {tr("Згенерувати", "Generate")} {newTestCount}
                </Button>
                <Button variant="ghost" onClick={() => {
              setEditingTestIndex(-1);
              setEditingTest({
                input: "",
                expectedOutput: "",
                points: 1,
                isHidden: false
              });
            }} className="text-xs">
                  <Plus className="w-4 h-4 mr-1" />
                  {tr("Додати вручну", "Add manually")}
                </Button>
              </div>
            </div>

            <Card className="p-4 mb-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {tr("Імпорт тестів з файлів (.in/.out)", "Import tests from files (.in/.out)")}
              </div>
              <input key={importInputKey} type="file" multiple accept=".in,.out,text/plain" onChange={e => setImportFiles(Array.from(e.target.files || []))} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-xs" />
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-xs font-mono text-text-secondary mb-1">{tr("Бали", "Points")}</label>
                  <input type="number" min="1" max="12" value={importPoints} onChange={e => setImportPoints(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-xs" />
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

            {loadingTestData ? <div className="text-center py-8 text-text-secondary font-mono">
                {t("loading")}
              </div> : <div className="space-y-3">
                {}
                {editingTestIndex === -1 && <Card className="p-4 border-2 border-primary">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-mono text-text-primary">{tr("Новий тест", "New test")}</h3>
                        <Button variant="ghost" onClick={() => {
                  setEditingTestIndex(null);
                  setEditingTest(null);
                }} className="text-xs p-1 h-6 w-6">
                          <X className="w-3 h-3" />
                        </Button>
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
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-mono text-text-secondary mb-1">
                            {tr("Бали", "Points")} (1-100)
                          </label>
                          <input type="number" min="1" max="100" value={editingTest?.points || 1} onChange={e => setEditingTest({
                    ...editingTest!,
                    points: parseInt(e.target.value) || 1
                  })} className="w-full px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                          <input id="new-test-hidden" type="checkbox" checked={editingTest?.isHidden === true} onChange={e => setEditingTest({
                    ...editingTest!,
                    isHidden: e.target.checked
                  })} className="w-4 h-4" />
                          <label htmlFor="new-test-hidden" className="text-xs font-mono text-text-secondary" title={tr("Прихований тест не показується учню, але впливає на оцінку.", "Hidden test is not shown to the student but affects scoring.")}>{tr("Прихований", "Hidden")}</label>
                        </div>
                        <Button variant="primary" onClick={handleAddNewTest} className="text-xs">
                          <Plus className="w-4 h-4 mr-1" />
                          {t("add")}
                        </Button>
                      </div>
                    </div>
                  </Card>}

                {}
                {testDataList.length === 0 ? <Card className="p-8 text-center">
                    <p className="text-text-secondary mb-4">{tr("Немає тестових даних", "No test data")}</p>
                    <p className="text-xs text-text-muted">
                      {tr("Згенеруйте тести автоматично або додайте їх вручну", "Generate tests automatically or add them manually")}
                    </p>
                  </Card> : testDataList.map((test, index) => <Card key={test.id} className="p-4">
                      {editingTestIndex === index ? <div className="space-y-3">
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
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-mono text-text-secondary mb-1">
                                {tr("Бали", "Points")} (1-100)
                              </label>
                              <input type="number" min="1" max="100" value={editingTest?.points || 1} onChange={e => setEditingTest({
                    ...editingTest!,
                    points: parseInt(e.target.value) || 1
                  })} className="w-full px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                            </div>
                            <div className="flex items-center gap-2">
                              <input id={`edit-test-hidden-${test.id}`} type="checkbox" checked={editingTest?.isHidden === true} onChange={e => setEditingTest({
                    ...editingTest!,
                    isHidden: e.target.checked
                  })} className="w-4 h-4" />
                              <label htmlFor={`edit-test-hidden-${test.id}`} className="text-xs font-mono text-text-secondary" title={tr("Прихований тест не показується учню, але впливає на оцінку.", "Hidden test is not shown to the student but affects scoring.")}>{tr("Прихований", "Hidden")}</label>
                            </div>
                            <Button variant="ghost" onClick={() => {
                  setEditingTestIndex(null);
                  setEditingTest(null);
                }} className="text-xs">
                              <X className="w-4 h-4" />
                            </Button>
                            <Button variant="primary" onClick={() => handleSaveTest(test.id, index)} className="text-xs">
                              <Save className="w-4 h-4 mr-1" />
                              {t("save")}
                            </Button>
                          </div>
                        </div> : <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div>
                              <span className="text-xs font-mono text-text-muted">{tr("Вхід", "Input")}:</span>
                              <pre className="text-xs font-mono text-text-secondary bg-bg-code p-2 rounded mt-1 whitespace-pre-wrap">
                                {test.input}
                              </pre>
                            </div>
                            <div>
                              <span className="text-xs font-mono text-text-muted">{tr("Очікуваний вивід", "Expected output")}:</span>
                              <pre className="text-xs font-mono text-text-secondary bg-bg-code p-2 rounded mt-1 whitespace-pre-wrap">
                                {test.expectedOutput}
                              </pre>
                            </div>
                            <div className="text-xs font-mono text-text-muted">
                              {tr("Бали", "Points")}: <span className="text-text-primary">{test.points}</span>
                              {test.isHidden ? <span className="ml-2 text-violet-400">• {tr("прихований", "hidden")}</span> : null}
                            </div>
                          </div>
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
                            <button onClick={() => handleDeleteTest(test.id)} className="p-2 h-8 w-8 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent-error transition-fast" title={t("delete")}>
                              <Trash2 className="w-4 h-4 text-accent-error" />
                            </button>
                          </div>
                        </div>}
                    </Card>)}
              </div>}
          </div>
        </Modal>}

      {}
      {showTaskSettings && settingsTask && <Modal open={showTaskSettings} onClose={() => {
      setShowTaskSettings(false);
      setSettingsTask(null);
    }} title={tr("Налаштування завдання", "Task settings")} showCloseButton={false}>
          <div className="p-6 max-w-2xl">
            <h2 className="text-xl font-mono text-text-primary mb-4">{settingsTask.title}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Кількість спроб (мінімум 1)", "Attempts (min 1)")}
                </label>
                <input type="number" min="1" value={taskMaxAttempts} onChange={e => setTaskMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
                <p className="text-xs text-text-muted mt-1">
                  {tr("Скільки разів учень може відправити код на перевірку", "How many times a student can submit code for checking")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Дедлайн (необов'язково)", "Deadline (optional)")}
                </label>
                <input type="datetime-local" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
                <p className="text-xs text-text-muted mt-1">
                  {tr("Після цієї дати учень не зможе відправити код", "After this date, the student cannot submit code")}
                </p>
                {taskDeadline && <Button variant="ghost" onClick={() => setTaskDeadline("")} className="text-xs mt-2">
                    <X className="w-3 h-3 mr-1" />
                    {tr("Прибрати дедлайн", "Remove deadline")}
                  </Button>}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-mono text-text-secondary">
                  <input type="checkbox" checked={taskIsClosed} onChange={e => setTaskIsClosed(e.target.checked)} className="w-4 h-4" />
                  {tr("Завдання закрите для відправок", "Task is closed for submissions")}
                </label>
                <p className="text-xs text-text-muted mt-1">
                  {tr("Якщо увімкнено, учень не зможе відправити код, навіть якщо є спроби та дедлайн не пройшов", "If enabled, the student cannot submit code even if attempts remain and the deadline hasn’t passed")}
                </p>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button variant="ghost" onClick={() => {
              setShowTaskSettings(false);
              setSettingsTask(null);
            }}>
                  {t("cancel")}
                </Button>
                <Button variant="primary" onClick={handleSaveTaskSettings}>
                  {t("save")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>}
    </>;
};
export default LessonDetailsPage;