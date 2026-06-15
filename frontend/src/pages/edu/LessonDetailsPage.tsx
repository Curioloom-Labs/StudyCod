import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { getLesson, createTask, generateTestData, getTaskGrades, generateQuiz, saveQuiz, submitQuizAnswers, getTestData, getTestDataItem, updateTestData, deleteTestData, deleteGeneratedTestData, addTestData, updateTaskDetails, getTask, startLessonAttempt, getLessonAttemptStatus, getControlWorkStatus, type Lesson, type Task, type CreateTaskRequest, type TestData, type TestDataItem, type TaskWithGrade, type TaskGrade } from "../../lib/api/edu";
import { GlobalTimer } from "../../components/GlobalTimer";
import { Plus, ArrowLeft, FileText, Users, Sparkles, Play, Trash2, Edit2, X, Send, Settings, Save, Clock, BookOpen, ShieldCheck, CheckCircle2, ArrowRight, Lock } from "lucide-react";
import { PageSkeleton, Skeleton } from "../../components/ui/Skeleton";
import { getMe } from "../../lib/api/profile";
import { MarkdownView } from "../../components/MarkdownView";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import type { User } from "../../types";
import { formatDeadlineForDisplay, isDeadlineExpired } from "../../utils/timezone";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { useWorkspaceViewport } from "../../components/interface/WorkspaceViewport";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { buildResumeState, clearResumeState, loadResumeState, saveResumeState } from "../../lib/resumeState";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { activateControlExamSession, clearControlExamSession } from "../../lib/controlExamSession";

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
const parsePageSize = (value: string): 20 | 50 | 100 => {
  const parsed = Number.parseInt(value, 10);
  if (parsed === 20 || parsed === 50 || parsed === 100) return parsed;
  return 20;
};
export const LessonDetailsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isAurora = useUIMode().mode === "aurora";
  const reduce = useReducedMotion();
  const {
    lessonId
  } = useParams<{
    lessonId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { element: viewportEl } = useWorkspaceViewport();
  const [searchParams] = useSearchParams();
  const requestedType = React.useMemo(() => {
    const raw = searchParams.get("type");
    return raw === "TOPIC" || raw === "CONTROL" || raw === "LESSON" ? raw : undefined;
  }, [searchParams]);
  const currentLessonPath = `${location.pathname}${location.search}`;
  const handleBackNavigation = React.useCallback(() => {
    const fromRaw = (location.state as {
      from?: unknown;
    } | null)?.from;
    const from = typeof fromRaw === "string" ? fromRaw : null;
    if (from && from.startsWith("/edu/")) {
      navigate(from);
      return;
    }
    navigate("/edu/lessons");
  }, [location.state, navigate]);
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
  const [testDataPageSize, setTestDataPageSize] = useState<20 | 50 | 100>(20);
  const [testDataOffset, setTestDataOffset] = useState(0);
  const [testDataTotal, setTestDataTotal] = useState(0);
  const [testDataHasMore, setTestDataHasMore] = useState(false);
  const [testDataSourceFilter, setTestDataSourceFilter] = useState<"ALL" | "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED">("ALL");
  const [replaceGeneratedOnGenerate, setReplaceGeneratedOnGenerate] = useState(true);
  const [clearingGeneratedTests, setClearingGeneratedTests] = useState(false);
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
  const [showControlStartWarning, setShowControlStartWarning] = useState(false);
  const [reportRedirectSeconds, setReportRedirectSeconds] = useState<number | null>(null);
  const createDescriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const TEST_DATA_PREVIEW_CHARS = 600;

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
      if (!lesson || lesson.id !== lessonIdNum) return;
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
    [user?.id, lesson?.id, lessonIdNum, resumeStep]
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
    let cancelled = false;
    const initialize = async () => {
      setLoading(true);
      const loadedUser = await loadUser();
      if (cancelled) return;
      if (lessonId) {
        await loadLesson(loadedUser);
        if (!cancelled) setHasAutoRedirected(false);
      }
    };
    initialize();
    return () => {
      cancelled = true;
    };
  }, [lessonId, requestedType]);
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
    if (!(lesson && lesson.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId && lessonId)) {
      return;
    }

    const initializeControlState = async () => {
      try {
        const statusData = await getControlWorkStatus(parseInt(lessonId, 10));
        setControlWorkStatus(statusData.status);

        if (statusData.status === "COMPLETED") {
          setRemainingSeconds(null);
          return;
        }

        if (lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null) {
          const status = await getLessonAttemptStatus(parseInt(lessonId, 10));
          if (status.hasActiveAttempt && status.remainingSeconds > 0) {
            setRemainingSeconds(status.remainingSeconds);
            setControlWorkStatus("IN_PROGRESS");
          } else {
            setRemainingSeconds(null);
          }
        } else {
          setRemainingSeconds(null);
        }
      } catch (error: unknown) {
        console.error("Failed to initialize control state:", error);
        const status = getResponseStatus(error);
        const message = getResponseMessage(error);
        if (status !== 500 || message !== "DATABASE_TABLE_NOT_CREATED") {
          if (lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null) {
            setRemainingSeconds(lesson.timeLimitMinutes * 60);
          }
        }
      }
    };

    initializeControlState();
  }, [lesson, user, lessonId]);

  useEffect(() => {
    if (!(lesson?.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId)) {
      setShowControlStartWarning(false);
      return;
    }

    const reportOnlyByDeadline = lesson.reportOnly === true && lesson.reportReason === "DEADLINE_EXPIRED";
    const reportOnlyByCompletion = lesson.reportOnly === true && lesson.reportReason === "COMPLETED" && controlWorkStatus !== "NOT_STARTED";

    if (reportOnlyByDeadline || reportOnlyByCompletion) {
      setShowControlStartWarning(false);
      return;
    }

    setShowControlStartWarning(controlWorkStatus === "NOT_STARTED");
  }, [lesson?.id, lesson?.type, lesson?.reportOnly, lesson?.reportReason, user?.id, user?.studentId, controlWorkStatus]);

  useEffect(() => {
    if (!(lesson?.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId)) {
      return;
    }

    const reportOnlyByDeadline = lesson.reportOnly === true && lesson.reportReason === "DEADLINE_EXPIRED";
    const reportOnlyByCompletion = lesson.reportOnly === true && lesson.reportReason === "COMPLETED" && controlWorkStatus !== "NOT_STARTED";
    const reportOnlyControl = reportOnlyByDeadline || reportOnlyByCompletion;

    if (controlWorkStatus === "IN_PROGRESS" && !reportOnlyControl) {
      activateControlExamSession(lesson.id);
      return;
    }

    if (controlWorkStatus === "COMPLETED" || reportOnlyControl) {
      clearControlExamSession();
    }
  }, [lesson?.id, lesson?.type, lesson?.reportOnly, lesson?.reportReason, controlWorkStatus, user?.id, user?.studentId]);

  useEffect(() => {
    if (!(lesson?.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId)) {
      setReportRedirectSeconds(null);
      return;
    }

    const reportOnlyByDeadline = lesson.reportOnly === true && lesson.reportReason === "DEADLINE_EXPIRED";
    const reportOnlyByCompletion = lesson.reportOnly === true && lesson.reportReason === "COMPLETED" && controlWorkStatus !== "NOT_STARTED";
    const shouldShowReport = controlWorkStatus === "COMPLETED" || reportOnlyByDeadline || reportOnlyByCompletion;

    setReportRedirectSeconds(shouldShowReport ? 12 : null);
  }, [lesson?.id, lesson?.type, lesson?.reportOnly, lesson?.reportReason, controlWorkStatus, user?.id, user?.studentId]);

  useEffect(() => {
    if (reportRedirectSeconds === null) return;

    if (reportRedirectSeconds <= 0) {
      clearControlExamSession();
      navigate("/edu/lessons", {
        replace: true
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReportRedirectSeconds(prev => prev === null ? null : prev - 1);
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [reportRedirectSeconds, navigate]);

  const loadUser = async (): Promise<User | null> => {
    try {
      const u = await getMe();
      setUser(u);
      return u;
    } catch (error) {
      console.error("Failed to load user:", error);
      return null;
    }
  };
  const loadLesson = async (userContext: User | null = user) => {
    if (!lessonId) return;
    try {
      const data = await getLesson(parseInt(lessonId, 10), requestedType);
      setLesson(data);
      if (data.quizJson) {
        try {
          const quiz = JSON.parse(data.quizJson);
          setQuizQuestions(quiz);
          if (userContext?.userMode === "EDUCATIONAL" && userContext?.studentId) {
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
        showToast({ type: "error", message: getErrorMessage(error, tr("Урок не знайдено. Повертаємо до списку уроків.", "Lesson not found. Redirecting to lessons.")) });

        const parsedLessonId = lessonId ? Number.parseInt(lessonId, 10) : null;
        if (userContext?.id && parsedLessonId !== null) {
          const state = loadResumeState(userContext.id);
          if (state?.kind === "edu_lesson" && state.lessonId === parsedLessonId) {
            clearResumeState(userContext.id);
          }
        }

        clearControlExamSession();
        setLesson(null);
        navigate(userContext?.studentId ? "/edu/lessons" : "/edu", {
          replace: true
        });
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
      const result = await generateTestData(taskId, count, {
        replaceGenerated: replaceGeneratedOnGenerate
      });
      const extras: string[] = [];
      if ((result.replacedGeneratedCount || 0) > 0) {
        extras.push(tr(`замінено AI: ${result.replacedGeneratedCount}`, `replaced AI: ${result.replacedGeneratedCount}`));
      }
      if ((result.skippedDuplicates || 0) > 0) {
        extras.push(tr(`дублі пропущено: ${result.skippedDuplicates}`, `duplicates skipped: ${result.skippedDuplicates}`));
      }
      showToast({
        type: "success",
        message: extras.length > 0
          ? `${tr(`Згенеровано ${result.count} тестових даних`, `Generated ${result.count} test cases`)} (${extras.join(", ")})`
          : tr(`Згенеровано ${result.count} тестових даних`, `Generated ${result.count} test cases`)
      });
      await loadLesson();
      if (showTestDataModal && testDataTaskId === taskId) {
        await loadTestData(taskId, {
          offset: 0
        });
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
      await loadTestData(testDataTaskId, {
        offset: testDataOffset
      });
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
  const loadTestData = async (
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
    setLoadingTestData(true);
    try {
      const data = await getTestData(taskId, {
        preview: true,
        previewChars: TEST_DATA_PREVIEW_CHARS,
        limit: nextPageSize,
        offset: nextOffset,
        source: nextSource
      });
      setTestDataList(data.testData);
      setTestDataOffset(nextOffset);
      setTestDataPageSize(nextPageSize);
      setTestDataSourceFilter(nextSource);
      if (data.pagination) {
        setTestDataTotal(data.pagination.total);
        setTestDataHasMore(data.pagination.hasMore);
      } else {
        setTestDataTotal((data.testData || []).length);
        setTestDataHasMore(false);
      }
    } catch (error: unknown) {
      console.error("Failed to load test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося завантажити тести", "Failed to load tests")) });
      setTestDataList([]);
      setTestDataTotal(0);
      setTestDataHasMore(false);
    } finally {
      setLoadingTestData(false);
    }
  };
  const handleStartEditTest = async (index: number, testDataId: number) => {
    if (!testDataTaskId) return;
    try {
      const data = await getTestDataItem(testDataTaskId, testDataId);
      const test = data.testData;
      setEditingTestIndex(index);
      setEditingTest({
        input: test.input,
        expectedOutput: test.expectedOutput || "",
        points: test.points,
        isHidden: test.isHidden === true
      });
    } catch (error: unknown) {
      console.error("Failed to load full test data:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося завантажити повний тест", "Failed to load full test")) });
    }
  };
  const handleOpenTestDataModal = async (taskId: number) => {
    setTestDataTaskId(taskId);
    setShowTestDataModal(true);
    setTestDataPageSize(20);
    setTestDataOffset(0);
    setTestDataTotal(0);
    setTestDataHasMore(false);
    setTestDataSourceFilter("ALL");
    setReplaceGeneratedOnGenerate(true);
    setClearingGeneratedTests(false);
    await loadTestData(taskId, {
      offset: 0,
      pageSize: 20,
      source: "ALL"
    });
  };
  const handleSaveTest = async (testDataId: number, index: number) => {
    if (!testDataTaskId || !editingTest) return;
    try {
      await updateTestData(testDataTaskId, testDataId, editingTest);
      await loadTestData(testDataTaskId, {
        offset: testDataOffset
      });
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
      const nextOffset = testDataOffset > 0 && testDataList.length <= 1
        ? Math.max(0, testDataOffset - testDataPageSize)
        : testDataOffset;
      await loadTestData(testDataTaskId, {
        offset: nextOffset
      });
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
      await loadTestData(testDataTaskId, {
        offset: testDataOffset
      });
      setEditingTestIndex(null);
      setEditingTest(null);
    } catch (error: unknown) {
      console.error("Failed to add test:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося додати тест", "Failed to add test")) });
    }
  };
  const handleClearGeneratedTests = async () => {
    if (!testDataTaskId) return;
    if (!confirm(tr("Видалити всі AI-згенеровані тести для цього завдання?", "Delete all AI-generated tests for this task?"))) {
      return;
    }
    setClearingGeneratedTests(true);
    try {
      const result = await deleteGeneratedTestData(testDataTaskId);
      await loadTestData(testDataTaskId, {
        offset: 0
      });
      await loadLesson();
      showToast({
        type: "success",
        message: tr(`Видалено AI-тестів: ${result.deleted}`, `Deleted AI tests: ${result.deleted}`)
      });
    } catch (error: unknown) {
      console.error("Failed to clear generated tests:", error);
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося очистити AI-тести", "Failed to clear AI tests")) });
    } finally {
      setClearingGeneratedTests(false);
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
    return <PageSkeleton variant="default" />;
  }
  if (!lesson) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Урок не знайдено", "Lesson not found")}
      </div>;
  }

  const isStudentControlWork = lesson.type === "CONTROL" && !!user?.studentId;
  const isStudentTimedControlWork = isStudentControlWork && lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null;
  const controlWorkAttemptStarted = !isStudentControlWork || controlWorkStatus === "IN_PROGRESS" || controlWorkStatus === "COMPLETED";
  const reportOnlyByDeadline = lesson.reportOnly === true && lesson.reportReason === "DEADLINE_EXPIRED";
  const reportOnlyByCompletion = lesson.reportOnly === true && lesson.reportReason === "COMPLETED" && controlWorkStatus !== "NOT_STARTED";
  const isReportOnlyControl = isStudentControlWork && (reportOnlyByDeadline || reportOnlyByCompletion);
  const isActiveControlExam = isStudentControlWork && controlWorkStatus === "IN_PROGRESS" && !isReportOnlyControl;
  const shouldShowStudentTheoryBlock = isStudentControlWork && !!lesson.controlHasTheory && controlWorkAttemptStarted && !isReportOnlyControl && controlWorkStatus !== "COMPLETED" && (!lesson.controlHasPractice || !studentQuizSubmitted);

  return <>
      <div className="max-w-6xl mx-auto p-3 sm:p-4 md:p-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.3 }}
          className="mb-6"
        >
          {!isActiveControlExam && <Button variant="ghost" onClick={handleBackNavigation} className="mb-3 -ml-1">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("back")}
            </Button>}
          <span className={`font-mono ${isAurora ? "text-[11px] uppercase tracking-[0.2em]" : "text-xs"} ${lesson.type === "CONTROL" ? "text-accent-warn/80" : isAurora ? "text-text-muted" : "text-primary/70"}`}>
            {isAurora
              ? (lesson.type === "CONTROL" ? tr("Контрольна", "Control work") : lesson.type === "TOPIC" ? t("topic") : t("lesson"))
              : (lesson.type === "CONTROL" ? "// control work" : lesson.type === "TOPIC" ? "// topic" : "// lesson")}
          </span>
          <div className="mt-2 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                {lesson.type === "CONTROL"
                  ? <ShieldCheck className="w-5 h-5 text-accent-warn shrink-0" />
                  : <BookOpen className="w-5 h-5 text-primary shrink-0" />}
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{lesson.title}</h1>
                <span className={`text-[10px] font-mono uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border ${lesson.type === "CONTROL" ? "border-accent-warn/40 text-accent-warn" : "border-border text-text-muted"}`}>
                  {lesson.type === "TOPIC" ? t("topic") : lesson.type === "CONTROL" ? tr("Контрольна", "Control work") : t("lesson")}
                </span>
              </div>
            </div>
            {lesson.type === "CONTROL" && lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null && remainingSeconds !== null && user?.userMode === "EDUCATIONAL" && user?.studentId && <div className="shrink-0 font-mono"><GlobalTimer remainingSeconds={remainingSeconds} onExpired={() => {
            setTimeExpired(true);
            showToast({ type: "error", message: tr("Час вийшов! Ви не можете більше відправляти відповіді.", "Time is up! You can no longer submit answers.") });
          }} /></div>}
          </div>
        </motion.div>

        <div className={`h-px mb-6 bg-gradient-to-r ${lesson.type === "CONTROL" ? "from-accent-warn/40" : "from-primary/40"} via-border to-transparent`} />

        {lesson.hasTheory && lesson.theory && <Card className="p-5 mb-6">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-3 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              {t("theory")}
            </h2>
            <div className="prose prose-invert max-w-none text-text-secondary font-mono text-sm">
              <MarkdownView content={lesson.theory} />
            </div>
          </Card>}

        {}
          {lesson.type === "TOPIC" && Array.isArray(lesson.controlWorks) && lesson.controlWorks.length > 0 && <section className="mb-6">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-3 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-accent-warn" />
              {tr("Контрольні роботи", "Control works")}
            </h2>
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
            {lesson.controlWorks!.map((cw: ControlWorkListItem) => <motion.div key={cw.id} variants={fadeUpItem} className="rounded-xl border border-accent-warn/40 bg-accent-warn/5 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-fast hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-accent-warn px-2 py-0.5 rounded-full border border-accent-warn/40">{tr("Контрольна", "Control work")}</span>
                      <div className="text-sm font-mono text-text-primary">{cw.title}</div>
                    </div>
                    <div className="mt-2 text-xs text-text-muted font-mono flex flex-wrap gap-x-4 gap-y-1">
                      <span>{tr("Завдань", "Tasks")}: {cw.tasksCount}</span>
                      {cw.timeLimitMinutes ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tr("Обмеження", "Limit")}: {cw.timeLimitMinutes} {t("min")}</span> : null}
                      {cw.deadline ? <span>
                          {tr("Дедлайн", "Deadline")}:{" "}
                          {formatDeadlineForDisplay(cw.deadline, cw.deadlineTimezone || lesson.deadlineTimezone || undefined, {
                    dateStyle: "short",
                    timeStyle: "short"
                  })}
                        </span> : null}
                        {cw.studentGrade !== null && cw.studentGrade !== undefined && <span className="text-text-primary">
                          {t("grade")}: <span className="font-bold">{cw.studentGrade}</span>/100
                        </span>}
                    </div>
                  </div>
                  <Button variant="ghost" className="shrink-0" onClick={() => navigate(`/edu/lessons/${cw.id}?type=CONTROL`, {
                  state: {
                    from: currentLessonPath
                  }
                })}>
                    {cw.studentStatus === "COMPLETED" ? tr("Рапорт", "Report") : t("open")}
                  </Button>
                </motion.div>)}
            </motion.div>
          </section>}

        {}
        {}
        {lesson.type === "CONTROL" && lesson.controlHasTheory && controlWorkAttemptStarted && (!isStudentControlWork || shouldShowStudentTheoryBlock) && <Card className="p-4 mb-6">
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
                showToast({ type: "success", message: tr("Тест відправлено. Відкриваємо практичний блок.", "Quiz submitted. Opening the practice block.") });
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
        {lesson.type === "CONTROL" && (controlWorkStatus === "COMPLETED" || isReportOnlyControl) && <Card className="p-4 mb-6 border-accent-success">
            <div className="text-lg font-mono text-accent-success mb-3">
              {tr("Рапорт за контрольну роботу", "Control work report")}
            </div>

            {isReportOnlyControl && lesson.reportReason === "DEADLINE_EXPIRED" && <div className="mb-4 p-3 border border-accent-warning/40 bg-accent-warning/10 text-sm text-text-secondary">
                {tr("Дедлайн минув. Контрольну повторно відкрити не можна — доступний лише рапорт.", "Deadline has passed. Reopening the control work is not allowed — report only.")}
              </div>}

            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              {lesson.controlHasTheory && <div className="p-3 border border-border bg-bg-base">
                  <div className="text-xs text-text-muted mb-1">{tr("Блок 1 (тест)", "Block 1 (quiz)")}</div>
                  <div className="text-2xl font-mono text-text-primary">{lesson.controlReport?.theoryGrade ?? "—"}</div>
                </div>}
              {lesson.controlHasPractice && <div className="p-3 border border-border bg-bg-base">
                  <div className="text-xs text-text-muted mb-1">{tr("Блок 2 (практика)", "Block 2 (practice)")}</div>
                  <div className="text-2xl font-mono text-text-primary">{lesson.controlReport?.practiceGrade ?? "—"}</div>
                </div>}
              <div className="p-3 border border-primary/40 bg-primary/10">
                <div className="text-xs text-text-muted mb-1">{tr("Підсумкова оцінка", "Final grade")}</div>
                <div className="text-2xl font-mono text-text-primary">{lesson.controlReport?.finalGrade ?? "—"}</div>
              </div>
            </div>

            {lesson.controlReport?.formulaSnapshot && <div className="mb-4 text-xs text-text-secondary">
                {tr("Формула", "Formula")}: <code className="bg-bg-hover px-1 rounded">{lesson.controlReport.formulaSnapshot}</code>
              </div>}

            <div className="text-xs text-text-muted mb-4">
              {tr("У рапорті не показуються розв’язки, відповіді тесту та деталі запусків — лише оцінки блоків і підсумок.", "The report hides solutions, quiz answers, and run details — it shows only block grades and final score.")}
            </div>

            {reportRedirectSeconds !== null && <div className="text-xs text-text-secondary mb-4">
                {tr(
                  `Автоматичний перехід на головний екран через ${Math.max(0, reportRedirectSeconds)} с.`,
                  `Automatic redirect to the home screen in ${Math.max(0, reportRedirectSeconds)}s.`
                )}
              </div>}

            <div className="flex justify-end">
              <Button onClick={() => {
            clearControlExamSession();
            navigate("/edu/lessons", {
              replace: true
            });
          }}>
                {tr("На головний екран", "Go to home screen")}
              </Button>
            </div>
          </Card>}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" />
            {lesson.type === "CONTROL" ? tr("Блок 2: Практика", "Block 2: Practice") : t("tasks")}
            <span className="text-text-muted/70">· {lesson.tasks.length}</span>
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
          {lesson.tasks.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <p className="text-text-secondary">{t("noTasks")}</p>
            </div> : (() => {
          const isStudentControlFlow = lesson.type === "CONTROL" && !!user?.studentId;
          const quizGatePassed = !lesson.controlHasTheory || studentQuizSubmitted || controlWorkStatus === "COMPLETED" || isReportOnlyControl;
          const currentTaskId = lesson.studentControlProgress?.currentTaskId ?? null;
          const completedTaskIds = new Set<number>(Array.isArray(lesson.studentControlProgress?.completedTaskIds) ? lesson.studentControlProgress!.completedTaskIds : []);

          if (isStudentControlFlow && !controlWorkAttemptStarted) {
            return <div className="rounded-xl border border-dashed border-accent-warn/40 bg-accent-warn/5 p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-accent-warn/10 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-6 h-6 text-accent-warn" />
                </div>
                <p className="text-text-secondary">{tr("Натисніть «Почати контрольну», щоб відкрити тест і задачі.", "Click “Start control work” to unlock the quiz and tasks.")}</p>
              </div>;
          }

          if (isStudentControlFlow && (controlWorkStatus === "COMPLETED" || isReportOnlyControl)) {
            return <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <p className="text-text-secondary">{tr("Практичний блок закрито. Доступний лише рапорт за контрольну.", "Practice block is closed. Only the control-work report is available.")}</p>
              </div>;
          }

          if (isStudentControlFlow && !quizGatePassed) {
            return <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <p className="text-text-secondary">{tr("Спершу відправте тест, щоб відкрити першу задачу.", "Submit the quiz first to unlock the first task.")}</p>
              </div>;
          }

          return <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">{lesson.tasks.map(task => {
          const isExpired = task.deadline && isDeadlineExpired(task.deadline);
          const hasGrade = task.hasGrade || false;
          const showOverdue = isExpired && !hasGrade;
          const showViewButton = hasGrade || showOverdue;
          const showTaskGrade = lesson.type !== "CONTROL" || controlWorkStatus === "COMPLETED" || isReportOnlyControl;
          const attemptsUsed = typeof task.attemptsUsed === "number" ? task.attemptsUsed : null;
          const maxAttempts = typeof task.maxAttempts === "number" ? task.maxAttempts : null;
          const attemptsExhausted = attemptsUsed !== null && maxAttempts !== null && attemptsUsed >= maxAttempts;
          const progressCompleted = (task.progressCompleted === true) || completedTaskIds.has(task.id) || attemptsExhausted || task.grade?.isCompleted === true;
          const isActiveControlTask = isStudentControlFlow ? !progressCompleted && currentTaskId === task.id : false;
          const isLockedControlTask = isStudentControlFlow ? !progressCompleted && !isActiveControlTask : false;
          const cardAccent = showOverdue
            ? "border-accent-error/50 bg-accent-error/5"
            : isActiveControlTask
              ? "border-primary/40"
              : progressCompleted
                ? "border-accent-success/30"
                : isLockedControlTask
                  ? "border-border opacity-80"
                  : "border-border";
          return <motion.div key={task.id} variants={fadeUpItem} className={`group rounded-xl border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] ${cardAccent} ${isLockedControlTask ? "" : "hover:border-primary/40"}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {progressCompleted
                        ? <CheckCircle2 className="w-4 h-4 text-accent-success shrink-0" />
                        : isLockedControlTask
                          ? <Lock className="w-4 h-4 text-text-muted shrink-0" />
                          : <FileText className="w-4 h-4 text-primary shrink-0" />}
                      <h3 className="text-lg font-mono text-text-primary">{task.title}</h3>
                      {showOverdue && <span className="text-xs px-2 py-1 bg-accent-error/20 text-accent-error border border-accent-error/30 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t("expired")}
                        </span>}
                      {task.deadline && !isExpired && <span className="text-xs px-2 py-1 bg-bg-hover text-text-secondary border border-border rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t("until")}{" "}
                          {formatDeadlineForDisplay(task.deadline, task.deadlineTimezone || lesson.deadlineTimezone || undefined, {
                  dateStyle: "short",
                  timeStyle: "short"
                })}
                        </span>}
                        {showTaskGrade && hasGrade && task.grade && <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${task.grade.total >= 85 ? 'bg-accent-success/20 text-accent-success border border-accent-success/30' : task.grade.total >= 65 ? 'bg-accent-warn/20 text-accent-warn border border-accent-warn/30' : task.grade.total >= 40 ? 'bg-accent-warning/20 text-accent-warning border border-accent-warning/30' : 'bg-accent-error/20 text-accent-error border border-accent-error/30'}`}>
                          {t("grade")}: {task.grade.total}/100
                        </span>}
                        {isStudentControlFlow && isActiveControlTask && <span className="text-xs px-2 py-1 border border-primary/40 text-primary rounded">
                          {tr("Активне", "Active")}
                        </span>}
                        {isStudentControlFlow && progressCompleted && <span className="text-xs px-2 py-1 border border-accent-success/40 text-accent-success rounded">
                          {attemptsExhausted ? tr("Спроби вичерпано", "Attempts exhausted") : tr("Завершено", "Completed")}
                        </span>}
                        {isStudentControlFlow && isLockedControlTask && <span className="text-xs px-2 py-1 border border-border text-text-muted rounded">
                          {tr("Очікує черги", "Waiting")}
                        </span>}
                    </div>
                    <div className="text-sm text-text-secondary mb-2 line-clamp-2">
                      {task.description}
                    </div>
                    <div className="text-xs text-text-muted space-y-1">
                      <div>{t("tests")}: {task.testDataCount || 0}</div>
                      {isStudentControlFlow && maxAttempts !== null && attemptsUsed !== null && <div>
                          {tr("Спроби", "Attempts")}: {attemptsUsed}/{maxAttempts}
                        </div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                      </> : isStudentControlFlow ? <Button
                        variant={isActiveControlTask ? "primary" : "ghost"}
                        disabled={!isActiveControlTask}
                        onClick={() => {
                          if (!isActiveControlTask) return;
                          navigate(`/edu/tasks/${task.id}`, {
                            state: {
                              from: currentLessonPath
                            }
                          });
                        }}
                        className="text-xs"
                      >
                        {isActiveControlTask ? <>
                            <Play className="w-4 h-4 mr-1" />
                            {tr("Відкрити", "Open")}
                          </> : progressCompleted ? <>
                            <FileText className="w-4 h-4 mr-1" />
                            {tr("Завершено", "Completed")}
                          </> : <>
                            <FileText className="w-4 h-4 mr-1" />
                            {tr("Заблоковано", "Locked")}
                          </>}
                      </Button> : <Button variant={showViewButton ? "ghost" : "primary"} onClick={() => {
                  navigate(`/edu/tasks/${task.id}`, {
                    state: {
                      from: currentLessonPath
                    }
                  });
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
              </motion.div>;
        })}</motion.div>;
        })()}
        </div>
      </div>

      {lesson.type === "CONTROL" && user?.userMode === "EDUCATIONAL" && user?.studentId && showControlStartWarning && !isReportOnlyControl && <Modal open={showControlStartWarning} onClose={() => {
      handleBackNavigation();
    }} closable={false} title={tr("Початок контрольної роботи", "Start control work")} showCloseButton={false} overlayClassName="!p-0 !items-stretch !justify-stretch !bg-bg-base/95" panelClassName="!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-0 !bg-bg-base" bodyClassName="!px-0 !py-0 !h-full">
          <div className="h-full w-full flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-3xl border border-border bg-bg-surface p-6 sm:p-8">
              <p className="text-text-primary font-mono text-base sm:text-lg leading-relaxed">
                {tr("Ви починаєте контрольну роботу. Після початку ви не зможете повернутись назад або змінити відповіді в попередніх блоках.", "You are starting a control work. After start, you won't be able to go back or change answers in previous blocks.")}
              </p>

              {lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null && <div className="mt-4 text-sm text-text-secondary font-mono">
                  {tr(`Ліміт часу: ${lesson.timeLimitMinutes} хв.`, `Time limit: ${lesson.timeLimitMinutes} min.`)}
                </div>}

              <div className="flex flex-wrap gap-2 justify-end mt-8">
                <Button variant="ghost" onClick={handleBackNavigation}>
                  {tr("Скасувати", "Cancel")}
                </Button>
                <Button onClick={async () => {
              if (!lessonId) return;
              try {
                const parsedLessonId = parseInt(lessonId, 10);
                const attempt = await startLessonAttempt(parsedLessonId);
                if (lesson.timeLimitMinutes !== undefined && lesson.timeLimitMinutes !== null) {
                  setRemainingSeconds(attempt.remainingSeconds);
                } else {
                  setRemainingSeconds(null);
                }
                activateControlExamSession(parsedLessonId);
                setControlWorkStatus("IN_PROGRESS");
                setShowControlStartWarning(false);
              } catch (error: unknown) {
                console.error("Failed to start attempt:", error);
                const status = getResponseStatus(error);
                const message = getResponseMessage(error);
                if (status === 409 && message === "CONTROL_WORK_COMPLETED") {
                  setControlWorkStatus("COMPLETED");
                  setShowControlStartWarning(false);
                  await loadLesson();
                } else if (status === 403 && message === "CONTROL_WORK_DEADLINE_PASSED") {
                  setShowControlStartWarning(false);
                  showToast({ type: "info", message: tr("Дедлайн контрольної вже минув. Доступний лише рапорт.", "The control-work deadline has already passed. Report only is available.") });
                  await loadLesson();
                } else {
                  showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося почати контрольну", "Failed to start control work")) });
                }
              }
            }}>
                  {tr("Почати", "Start")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>}

      {}
      {showCreateTask && <Modal open={showCreateTask} onClose={() => setShowCreateTask(false)} title={tr("Створити завдання", "Create task")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-3xl max-h-[80vh] overflow-y-auto">
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
              <div className="flex flex-wrap gap-2 justify-end">
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
          <div className="p-4 sm:p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
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
                    {Object.entries(newQuestion.options).map(([key, value]) => <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2">
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
            <div className="flex flex-wrap gap-2 justify-end mt-6">
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
          <div className="p-4 sm:p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{tr("Оцінки учнів", "Student grades")}</h2>
            <div className="space-y-2">
              {grades.map((item, index) => <div key={index} className="p-3 border border-border bg-bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-mono text-text-primary">
                      {item.student.lastName} {item.student.firstName} {item.student.middleName || ""}
                    </div>
                    <div className="text-xs text-text-secondary">{item.student.email}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    {item.grade ? <>
                        <div className="text-right">
                          <div className={`text-lg font-mono font-bold ${item.grade.total >= 85 ? "text-accent-success" : item.grade.total >= 65 ? "text-accent-warn" : item.grade.total >= 40 ? "text-accent-warning" : "text-accent-error"}`}>
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
      setTestDataPageSize(20);
      setTestDataOffset(0);
      setTestDataTotal(0);
      setTestDataHasMore(false);
      setTestDataSourceFilter("ALL");
      setReplaceGeneratedOnGenerate(true);
      setClearingGeneratedTests(false);
      setEditingTestIndex(null);
      setEditingTest(null);
      setImportFiles([]);
      setImportPoints(1);
      setImportIsHidden(false);
      setImportingFiles(false);
      setImportInputKey(k => k + 1);
    }} title={tr("Управління тестами", "Test management")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xl font-mono text-text-primary">{tr("Тестові дані", "Test data")}</h2>
              <div className="flex flex-wrap gap-2">
                <input type="number" min="1" max="50" value={newTestCount} onChange={e => setNewTestCount(parseInt(e.target.value) || 10)} className="w-20 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                <Button variant="ghost" onClick={() => handleGenerateTests(testDataTaskId, newTestCount)} className="text-xs">
                  <Sparkles className="w-4 h-4 mr-1" />
                  {tr("Згенерувати", "Generate")} {newTestCount}
                </Button>
                <label className="flex items-center gap-2 text-xs font-mono text-text-secondary px-2">
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
                  onClick={handleClearGeneratedTests}
                  disabled={clearingGeneratedTests}
                  className="text-xs"
                >
                  <X className="w-4 h-4 mr-1" />
                  {clearingGeneratedTests ? tr("Очищення...", "Clearing...") : tr("Очистити AI", "Clear AI")}
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

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
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
                    await loadTestData(testDataTaskId, {
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
                    await loadTestData(testDataTaskId, {
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
                  disabled={loadingTestData || testDataOffset <= 0}
                  onClick={async () => {
                    if (!testDataTaskId) return;
                    await loadTestData(testDataTaskId, {
                      offset: Math.max(0, testDataOffset - testDataPageSize)
                    });
                  }}
                >
                  {tr("Назад", "Prev")}
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs"
                  disabled={loadingTestData || !testDataHasMore}
                  onClick={async () => {
                    if (!testDataTaskId) return;
                    await loadTestData(testDataTaskId, {
                      offset: testDataOffset + testDataPageSize
                    });
                  }}
                >
                  {tr("Вперед", "Next")}
                </Button>
              </div>
            </div>

            {loadingTestData ? <Skeleton className="h-24 w-full" /> : <div className="space-y-3">
                {}
                {editingTestIndex === -1 && <Card className="p-4 border-2 border-primary">
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
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
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
                  </Card> : testDataList.map((test, index) => {
                    const displayIndex = testDataOffset + index + 1;
                    return <Card key={test.id} className="p-4">
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
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
                        </div> : <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="text-xs font-mono text-text-secondary">
                              {tr("Тест", "Test")} #{displayIndex}
                            </div>
                            <div>
                              <span className="text-xs font-mono text-text-muted">{tr("Вхід", "Input")}:</span>
                              <pre className="text-xs font-mono text-text-secondary bg-bg-code p-2 rounded mt-1 whitespace-pre-wrap">
                                {test.input}
                              </pre>
                              {test.isInputTruncated ? <div className="text-[11px] text-text-muted mt-1">{tr("Показано скорочений превʼю-текст", "Showing truncated preview text")}</div> : null}
                            </div>
                            <div>
                              <span className="text-xs font-mono text-text-muted">{tr("Очікуваний вивід", "Expected output")}:</span>
                              <pre className="text-xs font-mono text-text-secondary bg-bg-code p-2 rounded mt-1 whitespace-pre-wrap">
                                {test.expectedOutput}
                              </pre>
                              {test.isExpectedOutputTruncated ? <div className="text-[11px] text-text-muted mt-1">{tr("Показано скорочений превʼю-текст", "Showing truncated preview text")}</div> : null}
                            </div>
                            <div className="text-xs font-mono text-text-muted">
                              {tr("Бали", "Points")}: <span className="text-text-primary">{test.points}</span>
                              {test.source === "AI_GENERATED" ? <span className="ml-2">• {tr("джерело: AI", "source: AI")}</span> : null}
                              {test.source === "LIBRARY_IMPORTED" ? <span className="ml-2">• {tr("джерело: бібліотека", "source: library")}</span> : null}
                              {test.source === "MANUAL" ? <span className="ml-2">• {tr("джерело: вручну", "source: manual")}</span> : null}
                              {test.isHidden ? <span className="ml-2 text-violet-400">• {tr("прихований", "hidden")}</span> : null}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => {
                  handleStartEditTest(index, test.id);
                }} className="h-11 w-11 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-primary transition-fast" title={t("edit")} aria-label={t("edit")}>
                              <Edit2 className="w-4 h-4 text-primary" />
                            </button>
                            <button onClick={() => handleDeleteTest(test.id)} className="h-11 w-11 flex items-center justify-center border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent-error transition-fast" title={t("delete")} aria-label={t("delete")}>
                              <Trash2 className="w-4 h-4 text-accent-error" />
                            </button>
                          </div>
                        </div>}
                    </Card>;
                  })}
              </div>}
          </div>
        </Modal>}

      {}
      {showTaskSettings && settingsTask && <Modal open={showTaskSettings} onClose={() => {
      setShowTaskSettings(false);
      setSettingsTask(null);
    }} title={tr("Налаштування завдання", "Task settings")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-2xl">
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

              <div className="flex flex-wrap gap-2 justify-end mt-6">
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
