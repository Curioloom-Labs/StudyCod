import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { CodeEditor } from "../components/CodeEditor";
import { MarkdownView } from "../components/MarkdownView";
import { getTask, submitCode, runCode, submitQuizAnswers, completeTask, getTestData, type TaskWithGrade, type TestResult } from "../lib/api/edu";
import { ArrowLeft, Play, Send, Save, Clock, FileText, Loader2, CheckCircle2, XCircle, Upload } from "lucide-react";
import { isDeadlineExpired } from "../utils/timezone";
import { getMe } from "../lib/api/profile";
import type { User } from "../types";
export const StudentTaskPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const {
    taskId
  } = useParams<{
    taskId: string;
  }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskWithGrade | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [lastScoring, setLastScoring] = useState<null | {
    score: number;
    maxScore: number;
    groupScores?: Array<{
      group: string;
      score: number;
      maxScore: number;
    }> | null;
  }>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [revealedHints, setRevealedHints] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [testProgress, setTestProgress] = useState<Record<number, 'pending' | 'running' | 'passed' | 'failed'>>({});
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [theoryAcknowledged, setTheoryAcknowledged] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [timeStarted, setTimeStarted] = useState<Date | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, "А" | "Б" | "В" | "Г" | "Д">>({});
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizGrade, setQuizGrade] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [deadlineRemaining, setDeadlineRemaining] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importSolutionKey, setImportSolutionKey] = useState(0);
  const tr = useCallback((uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk, [i18n.language]);
  const taskRef = useRef(task);
  const codeRef = useRef(code);
  const handleSubmitRef = useRef<() => Promise<void>>();
  useEffect(() => {
    taskRef.current = task;
    codeRef.current = code;
  }, [task, code]);
  useEffect(() => {
    const init = async () => {
      try {
        const u = await getMe();
        setUser(u);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    init();
  }, []);
  useEffect(() => {
    if (taskId) {
      loadTask();
    }
  }, [taskId]);
  useEffect(() => {
    if (!taskId || !code) return;
    const timeoutId = setTimeout(() => {
      localStorage.setItem(`task_draft_${taskId}`, code);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [code, taskId]);
  useEffect(() => {
    return () => {
      if (taskId && code) {
        localStorage.setItem(`task_draft_${taskId}`, code);
      }
    };
  }, [taskId, code]);

  const handleImportSolutionFile = async (file: File | null) => {
    if (!file) return;
    if (!canEdit) {
      alert(tr("Завдання закрите для редагування", "Task is read-only"));
      return;
    }

    const nameLower = file.name.toLowerCase();
    const expectedExt = task?.language === "JAVA" ? ".java" : ".py";
    const looksOk = nameLower.endsWith(expectedExt) || nameLower.endsWith(".txt");
    if (!looksOk) {
      const ok = confirm(tr(`Файл має інше розширення. Все одно імпортувати? (${file.name})`, `File extension looks different. Import anyway? (${file.name})`));
      if (!ok) return;
    }

    try {
      const text = (await file.text()).replace(/\r\n/g, "\n");
      const hasExisting = (code || "").trim().length > 0;
      const hasNew = text.trim().length > 0;
      if (hasExisting && hasNew && text !== code) {
        const ok = confirm(tr("Замінити поточний код на код з файлу?", "Replace current code with file contents?"));
        if (!ok) return;
      }
      setCode(text);
    } catch (e: any) {
      console.error("Failed to import solution file:", e);
      alert(tr("Не вдалося прочитати файл", "Failed to read file"));
    } finally {
      setImportSolutionKey(k => k + 1);
    }
  };
  useEffect(() => {
    if (!task?.deadline || task.isClosed) {
      setDeadlineRemaining(null);
      return;
    }
    const updateDeadline = () => {
      const deadlineUTC = new Date(task.deadline!).getTime();
      const nowUTC = new Date().getTime();
      const remaining = Math.max(0, Math.floor((deadlineUTC - nowUTC) / 1000));
      if (remaining > 0) {
        setDeadlineRemaining(remaining);
      } else {
        setDeadlineRemaining(0);
      }
    };
    updateDeadline();
    const interval = setInterval(updateDeadline, 1000);
    return () => clearInterval(interval);
  }, [task?.deadline, task?.isClosed]);
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;
    if (!timeStarted) return;
    if (taskRef.current?.lesson.type !== "CONTROL") return;
    if (taskRef.current?.hasGrade) return;
    const interval = setInterval(() => {
      const currentTask = taskRef.current;
      const currentCode = codeRef.current;
      if (!currentTask || !timeStarted) {
        clearInterval(interval);
        return;
      }
      const elapsed = Math.floor((Date.now() - timeStarted.getTime()) / 1000 / 60);
      const remaining = (currentTask.lesson.timeLimitMinutes || 0) - elapsed;
      if (remaining > 0) {
        setTimeRemaining(remaining);
      } else {
        setTimeRemaining(0);
        clearInterval(interval);
        alert(t("timeUpAutoSubmit"));
        if (currentTask && currentCode && handleSubmitRef.current) {
          handleSubmitRef.current();
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [timeStarted]);
  useEffect(() => {
    if (task) {
      const hasTheory = task.lesson.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0;
      setTheoryAcknowledged(!hasTheory);
    } else {
      setTheoryAcknowledged(false);
    }
  }, [task?.id]);
  const loadTask = async () => {
    if (!taskId) return;
    try {
      const data = await getTask(parseInt(taskId, 10));
      setTask(data);
      {
        const g: any = (data as any).grade;
        const score = typeof g?.score === "number" ? Number(g.score) : null;
        const maxScore = typeof g?.maxScore === "number" ? Number(g.maxScore) : null;
        const groupScores = Array.isArray(g?.groupScores) ? g.groupScores : null;
        if (score !== null && maxScore !== null && maxScore > 0) {
          setLastScoring({
            score,
            maxScore,
            groupScores
          });
        } else {
          setLastScoring(null);
        }
      }
      const submittedCode = data.grade?.submittedCode;
      const draftCode = localStorage.getItem(`task_draft_${taskId}`);
      const savedCode = (data as any).savedCode;
      setCode(submittedCode || draftCode || savedCode || data.template);
      if (data.grade && submittedCode) {
        if (data.grade.testResults && Array.isArray(data.grade.testResults) && data.grade.testResults.length > 0) {
          const testResults: TestResult[] = data.grade.testResults.map((result: any) => ({
            testId: typeof result.testId === "number" ? result.testId : undefined,
            input: result.input || "",
            actual: result.actual ?? result.actualOutput ?? "",
            stderr: result.stderr ?? result.error ?? undefined,
            passed: result.passed === true,
            verdict: result.verdict ?? null,
            errorKind: result.errorKind ?? result.error_kind ?? null
          }));
          setTestResults(testResults);
          setConsoleOutput(`${t("testResultsHeader", {
            passed: data.grade.testsPassed,
            total: data.grade.testsTotal
          })}\n` + tr("Натисніть «Переглянути результати» для деталей.", "Click “View results” for details."));
        } else {
          setConsoleOutput(t("gradeSummary", {
            passed: data.grade.testsPassed,
            total: data.grade.testsTotal,
            grade: data.grade.total
          }));
        }
      } else {
        setConsoleOutput("");
      }
      if (data.lesson.type === "CONTROL" && (data.lesson as any).quizJson) {
        try {
          const quiz = JSON.parse((data.lesson as any).quizJson);
          setQuizQuestions(quiz);
          const serverQuizSubmitted = (data.lesson as any).quizSubmitted === true;
          const serverQuizGrade = (data.lesson as any).quizGrade !== null && (data.lesson as any).quizGrade !== undefined ? Number((data.lesson as any).quizGrade) : null;
          if (serverQuizSubmitted) {
            setQuizSubmitted(true);
            setQuizGrade(serverQuizGrade);
            localStorage.removeItem(`quiz_submitted_${taskId}`);
            localStorage.removeItem(`quiz_answers_${taskId}`);
          } else {
            const savedAnswers = localStorage.getItem(`quiz_answers_${taskId}`);
            if (savedAnswers) {
              setQuizAnswers(JSON.parse(savedAnswers));
              localStorage.setItem(`quiz_answers_${taskId}_timestamp`, Date.now().toString());
            }
            setQuizSubmitted(false);
            setQuizGrade(null);
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error("Failed to parse quiz:", e);
          }
          setQuizQuestions([]);
        }
      } else {
        setQuizQuestions([]);
        setQuizSubmitted(false);
        setQuizGrade(null);
      }
      if (data.lesson.type === "CONTROL" && data.lesson.timeLimitMinutes && !data.hasGrade) {
        const startTime = localStorage.getItem(`task_${taskId}_start_time`);
        if (startTime) {
          const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000 / 60);
          const remaining = data.lesson.timeLimitMinutes - elapsed;
          if (remaining > 0) {
            setTimeRemaining(remaining);
            setTimeStarted(new Date(parseInt(startTime)));
          } else {
            setTimeRemaining(0);
          }
        } else {
          const now = Date.now();
          localStorage.setItem(`task_${taskId}_start_time`, now.toString());
          localStorage.setItem(`task_${taskId}_start_time_timestamp`, now.toString());
          setTimeRemaining(data.lesson.timeLimitMinutes);
          setTimeStarted(new Date(now));
        }
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Failed to load task:", error);
      }
      if (error.response?.status === 404 || error.response?.status === 403) {}
    } finally {
      setLoading(false);
    }
  };
  const handleRun = async () => {
    if (!taskId || !code.trim()) {
      setConsoleOutput(t("enterCodeToRun"));
      return;
    }
    setRunning(true);
    setConsoleOutput(t("runningCode"));
    try {
      const result = await runCode(parseInt(taskId, 10), code, testInput || undefined);
      let output = "";
      let filteredStderr = result.stderr || "";
      filteredStderr = filteredStderr.split('\n').filter(line => !line.includes('Picked up JAVA_TOOL_OPTIONS')).filter(line => !line.includes('Picked up _JAVA_OPTIONS')).join('\n').trim();
      output += result.output || filteredStderr || t("noOutput");
      if (filteredStderr && result.output) {
        output += `\n\n${t("errors")}:\n${filteredStderr}`;
      }
      setConsoleOutput(output);
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Failed to run:", error);
      }
      setConsoleOutput(error.response?.data?.message || t("runError"));
    } finally {
      setRunning(false);
    }
  };
  const handleSubmitQuiz = async () => {
    if (!taskId || !task) return;
    if (Object.keys(quizAnswers).length < quizQuestions.length) {
      alert(t("pleaseAnswerAllQuestions"));
      return;
    }
    try {
      const result = await submitQuizAnswers(parseInt(taskId, 10), quizAnswers);
      setQuizGrade(result.grade.theoryGrade);
      setQuizSubmitted(true);
      const now = Date.now().toString();
      localStorage.setItem(`quiz_submitted_${taskId}`, "true");
      localStorage.setItem(`quiz_submitted_${taskId}_timestamp`, now);
      localStorage.setItem(`quiz_grade_${taskId}`, result.grade.theoryGrade.toString());
      localStorage.setItem(`quiz_grade_${taskId}_timestamp`, now);
      alert(t("quizCompletedWithGrade", {
        grade: result.grade.theoryGrade,
        correct: result.grade.correctAnswers,
        total: result.grade.totalQuestions
      }));
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Failed to submit quiz:", error);
      }
      if (error.response?.status === 409 && error.response?.data?.message === "QUIZ_ALREADY_SUBMITTED") {
        alert(t("quizAlreadySubmitted"));
        await loadTask();
      } else {
        alert(error.response?.data?.message || t("failedToSubmitTest"));
      }
    }
  };
  const handleSubmit = useCallback(async () => {
    if (!taskId || !code.trim()) {
      alert(t("enterCode"));
      return;
    }
    if (task?.isClosed) {
      alert(t("taskClosedCannotSubmit"));
      return;
    }
    if (task?.deadline && isDeadlineExpired(task.deadline)) {
      alert(t("deadlinePassedCannotSubmit"));
      return;
    }
    if (task?.maxAttempts && task.attemptsUsed !== undefined && task.attemptsUsed >= task.maxAttempts) {
      alert(t("attemptsExhaustedCannotSubmit", {
        maxAttempts: task.maxAttempts
      }));
      return;
    }
    setSubmitting(true);
    setIsRunningTests(true);
    setTestResults([]);
    setConsoleOutput(t("checkingCode"));
    try {
      let visibleTests: Array<{
        id: number;
        input: string;
      }> = [];
      try {
        const {
          testData
        } = await getTestData(parseInt(taskId, 10));
        visibleTests = (testData || []).map((td: any) => ({
          id: td.id,
          input: td.input || ""
        }));
        const initialProgress: Record<number, 'pending' | 'running' | 'passed' | 'failed'> = {};
        visibleTests.forEach(t => {
          initialProgress[t.id] = 'pending';
        });
        setTestProgress(initialProgress);
      } catch {
        setTestProgress({});
      }
      const result = await submitCode(parseInt(taskId, 10), code);
      if (taskId) {
        localStorage.removeItem(`task_draft_${taskId}`);
      }
      const finalTestResults: TestResult[] = Array.isArray(result.testResults) ? result.testResults : [];
      setTestResults(finalTestResults);
      setHints(Array.isArray((result as any).hints) ? (result as any).hints : []);
      setLastScoring((result as any).scoring ?? null);
      setRevealedHints(0);
      const updatedProgress: Record<number, 'pending' | 'running' | 'passed' | 'failed'> = {};
      for (const r of finalTestResults as any[]) {
        const id = typeof r.testId === 'number' ? r.testId : undefined;
        if (typeof id === 'number') {
          updatedProgress[id] = r.passed ? 'passed' : 'failed';
          continue;
        }
        const byInput = visibleTests.find(t => t.input === (r.input || ""));
        if (byInput) {
          updatedProgress[byInput.id] = r.passed ? 'passed' : 'failed';
        }
      }
      if (Object.keys(updatedProgress).length > 0) {
        setTestProgress(prev => ({
          ...prev,
          ...updatedProgress
        }));
      }
      setShowResults(true);
      if (result.requiresManualReview) {
        setConsoleOutput(t('taskSubmittedForReview'));
        alert(t('taskSubmittedForReview'));
        await loadTask();
        setSubmitting(false);
        return;
      }
      if (result.grade.total !== null) {
        const scoring = (result as any).scoring as any;
        const scoreLine = scoring && typeof scoring.score === "number" && typeof scoring.maxScore === "number" && scoring.maxScore > 0 ? ` ${tr("Бал", "Score")}: ${scoring.score}/${scoring.maxScore}.` : "";
        setConsoleOutput(`${t('reviewCompleted')}: ${result.grade.testsPassed}/${result.grade.testsTotal}.${scoreLine} ${t('gradeOutOf')}: ${result.grade.total}/12`);
      } else {
        setConsoleOutput(t('taskSubmittedForReview'));
      }
      await loadTask();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Failed to submit:", error);
      }
      const errorMessage = error.response?.data?.message || t('failedToSubmit');
      setConsoleOutput(errorMessage);
      alert(errorMessage);
    } finally {
      setSubmitting(false);
      setIsRunningTests(false);
    }
  }, [taskId, code, task?.isClosed, task?.deadline, task?.maxAttempts, task?.attemptsUsed, loadTask, t]);
  const handleComplete = useCallback(async () => {
    if (!taskId || !code.trim()) {
      alert(t("enterCode"));
      return;
    }
    if (task?.isClosed) {
      alert(t("taskClosedCannotComplete"));
      return;
    }
    if (task?.deadline && isDeadlineExpired(task.deadline)) {
      alert(t("deadlinePassedCannotComplete"));
      return;
    }
    if (task?.grade?.isManuallyGraded) {
      alert(t("taskLockedManualGrade"));
      return;
    }
    if (task?.grade?.isCompleted) {
      alert(t("taskLockedManualGrade"));
      return;
    }
    if (!confirm(t("confirmCompleteEarly"))) {
      return;
    }
    setSubmitting(true);
    setIsRunningTests(true);
    setTestResults([]);
    setConsoleOutput(t("completingTaskRunningFinalTest"));
    try {
      let visibleTests: Array<{
        id: number;
        input: string;
      }> = [];
      try {
        const {
          testData
        } = await getTestData(parseInt(taskId, 10));
        visibleTests = (testData || []).map((td: any) => ({
          id: td.id,
          input: td.input || ""
        }));
        const initialProgress: Record<number, 'pending' | 'running' | 'passed' | 'failed'> = {};
        visibleTests.forEach(t => {
          initialProgress[t.id] = 'pending';
        });
        setTestProgress(initialProgress);
      } catch {
        setTestProgress({});
      }
      const result = await completeTask(parseInt(taskId, 10), code);
      if (taskId) {
        localStorage.removeItem(`task_draft_${taskId}`);
      }
      const finalTestResults: TestResult[] = Array.isArray((result as any).testResults) ? (result as any).testResults : [];
      setTestResults(finalTestResults);
      setHints(Array.isArray((result as any).hints) ? (result as any).hints : []);
      setLastScoring((result as any).scoring ?? null);
      setRevealedHints(0);
      const updatedProgress: Record<number, 'pending' | 'running' | 'passed' | 'failed'> = {};
      for (const r of finalTestResults as any[]) {
        const id = typeof r.testId === 'number' ? r.testId : undefined;
        if (typeof id === 'number') {
          updatedProgress[id] = r.passed ? 'passed' : 'failed';
          continue;
        }
        const byInput = visibleTests.find(t => t.input === (r.input || ""));
        if (byInput) {
          updatedProgress[byInput.id] = r.passed ? 'passed' : 'failed';
        }
      }
      if (Object.keys(updatedProgress).length > 0) {
        setTestProgress(prev => ({
          ...prev,
          ...updatedProgress
        }));
      }
      setShowResults(true);
      if (result.requiresManualReview) {
        setConsoleOutput(t("taskCompletedEarlySent"));
        alert(t("taskCompletedEarlySent"));
      } else if (result.grade.total !== null) {
        const scoring = (result as any).scoring as any;
        const scoreLine = scoring && typeof scoring.score === "number" && typeof scoring.maxScore === "number" && scoring.maxScore > 0 ? ` ${tr("Бал", "Score")}: ${scoring.score}/${scoring.maxScore}.` : "";
        setConsoleOutput(t("taskCompletedEarlyDetailed", {
          passed: result.grade.testsPassed,
          total: result.grade.testsTotal,
          grade: result.grade.total
        }) + scoreLine);
        alert(t("taskCompletedEarlyWithGrade", {
          grade: result.grade.total
        }));
      } else {
        setConsoleOutput(t("taskCompletedEarly"));
        alert(t("taskCompletedEarly"));
      }
      await loadTask();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Failed to complete task:", error);
      }
      const errorMessage = error.response?.data?.message || t("failedToCompleteTask");
      setConsoleOutput(errorMessage);
      alert(errorMessage);
    } finally {
      setSubmitting(false);
      setIsRunningTests(false);
    }
  }, [taskId, code, task?.isClosed, task?.deadline, task?.grade?.isManuallyGraded, task?.grade?.isCompleted, loadTask, t]);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);
  const getPracticeText = () => {
    if (!task) return null;
    const content = task.description || "";
    if (content.trim().startsWith("### Практичне завдання")) {
      return content.replace(/^###\s*Практичне завдання\s*/i, "").trim();
    }
    const practiceMatch = content.match(/(?:###\s*)?Практика[\s\S]*$/i);
    if (practiceMatch) {
      return practiceMatch[0].replace(/^###\s*Практика\s*/i, "").trim();
    }
    return content.trim() || null;
  };
  const canEdit = useMemo(() => {
    if (!task) return false;
    if (task.grade?.isCompleted) return false;
    if (task.grade?.isManuallyGraded) return false;
    if (task.isClosed) return false;
    if (task.deadline && isDeadlineExpired(task.deadline)) return false;
    if (task.maxAttempts && task.attemptsUsed !== undefined && task.attemptsUsed >= task.maxAttempts) return false;
    return true;
  }, [task?.grade, task?.isClosed, task?.deadline, task?.maxAttempts, task?.attemptsUsed, task]);

  const canComplete = useMemo(() => {
    if (!task) return false;
    if (task.grade?.isCompleted) return false;
    if (task.grade?.isManuallyGraded) return false;
    if (task.isClosed) return false;
    if (task.deadline && isDeadlineExpired(task.deadline)) return false;
    return true;
  }, [task?.grade, task?.isClosed, task?.deadline, task]);
  const attemptsRemaining = useMemo(() => {
    if (!task) return null;
    if (task.maxAttempts === undefined || task.attemptsUsed === undefined) return null;
    return Math.max(0, task.maxAttempts - task.attemptsUsed);
  }, [task?.maxAttempts, task?.attemptsUsed, task]);
  const canSubmit = useMemo(() => {
    if (!task) return false;
    if (task.grade?.isCompleted) return false;
    if (task.grade?.isManuallyGraded) return false;
    if (task.isClosed) return false;
    if (task.deadline && isDeadlineExpired(task.deadline)) return false;
    if (task.maxAttempts && task.attemptsUsed !== undefined && task.attemptsUsed >= task.maxAttempts) return false;
    return true;
  }, [task?.grade, task?.isClosed, task?.deadline, task?.maxAttempts, task?.attemptsUsed, task]);
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("loading")}
      </div>;
  }
  if (!task) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("taskNotFound")}
      </div>;
  }
  const hasTheory = task.lesson.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0;
  const showTheory = !theoryAcknowledged && hasTheory;
  const scoringPct = lastScoring && lastScoring.maxScore > 0 ? Math.max(0, Math.min(100, Math.round(lastScoring.score / lastScoring.maxScore * 100))) : null;
  const scoringSegments = (() => {
    if (!lastScoring || !(lastScoring.maxScore > 0)) return null;
    const groups = Array.isArray(lastScoring.groupScores) ? lastScoring.groupScores : null;
    if (!groups || groups.length === 0) {
      return [{
        key: "total",
        label: "total",
        pct: typeof scoringPct === "number" ? scoringPct : 0,
        className: "bg-primary",
        title: tr("Бал", "Score") + `: ${lastScoring.score}/${lastScoring.maxScore}`
      }];
    }
    const totalMax = lastScoring.maxScore;
    const normalized = groups.map(g => ({
      group: String((g as any)?.group ?? ""),
      score: Number((g as any)?.score ?? 0),
      maxScore: Number((g as any)?.maxScore ?? 0)
    })).filter(g => Number.isFinite(g.score) && g.score > 0);
    const order = ["public", "hidden"];
    normalized.sort((a, b) => {
      const ia = order.indexOf(a.group);
      const ib = order.indexOf(b.group);
      if (ia === -1 && ib === -1) return a.group.localeCompare(b.group);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return normalized.map(g => {
      const raw = totalMax > 0 ? g.score / totalMax * 100 : 0;
      const pct = Math.max(0, Math.min(100, raw));
      const className = g.group === "public" ? "bg-primary" : g.group === "hidden" ? "bg-violet-500" : "bg-slate-500";
      const label = g.group === "public" ? tr("публічні", "public") : g.group === "hidden" ? tr("приховані", "hidden") : g.group;
      return {
        key: g.group,
        label,
        pct,
        className,
        title: `${label}: ${g.score}/${g.maxScore}`
      };
    });
  })();
  const showScoringLegend = Array.isArray(scoringSegments) && scoringSegments.some(s => s.key === "public" || s.key === "hidden");
  return <div className="h-full min-h-0 flex flex-col bg-bg-base">
      {}
      {!showTheory && <div className="border-b border-border bg-bg-surface p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => {
            const hasTheory = task.lesson.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0;
            if (theoryAcknowledged && hasTheory) {
              setTheoryAcknowledged(false);
            } else {
              navigate(-1);
            }
          }}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("back")}
              </Button>
              <div>
                <h1 className="text-lg font-mono text-text-primary mb-1">{task.title}</h1>
                <div className="text-xs font-mono text-text-muted flex items-center gap-2">
                  <span>
                    {task.lesson.type === "LESSON" ? t("lesson") : task.lesson.type === "TOPIC" ? t("topic") : t("controlWork")}{" "}
                    · {task.language}
                  </span>
                  {task.testDataCount !== undefined && <span className="text-text-secondary">· {t("tests")}: {task.testDataCount}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {}
              {timeRemaining !== null && task.lesson.type === "CONTROL" && !task.hasGrade && <div className={`text-sm font-mono mr-4 flex items-center ${timeRemaining <= 5 ? "text-accent-error" : timeRemaining <= 10 ? "text-yellow-500" : "text-text-primary"}`}>
                  <Clock className="w-4 h-4 mr-1" />
                  {Math.floor(timeRemaining)} хв
                </div>}
              {}
              {deadlineRemaining !== null && !task.isClosed && <div className={`text-sm font-mono mr-4 flex items-center ${deadlineRemaining <= 300 ? "text-accent-error" : deadlineRemaining <= 600 ? "text-yellow-500" : "text-text-primary"}`}>
                  <Clock className="w-4 h-4 mr-1" />
                  {deadlineRemaining > 3600 ? t("timeHhMm", {
              h: Math.floor(deadlineRemaining / 3600),
              m: Math.floor(deadlineRemaining % 3600 / 60)
            }) : deadlineRemaining > 60 ? t("timeMm", {
              m: Math.floor(deadlineRemaining / 60)
            }) : t("timeSs", {
              s: deadlineRemaining
            })}
                </div>}
              {}
              {task.maxAttempts !== undefined && task.attemptsUsed !== undefined && <div className="text-xs font-mono text-text-secondary mr-4">
                  {t("attempts")}: {task.attemptsUsed}/{task.maxAttempts}
                  {attemptsRemaining !== null && <>
                      {" "}· {tr("Залишилось", "Remaining")}: {attemptsRemaining}
                    </>}
                </div>}
              {}
              {task.isClosed && <div className="text-xs font-mono text-accent-error mr-4">
                  {t("taskClosed")}
                </div>}
              {task.grade && <div className={`text-sm font-mono font-bold mr-4 flex items-center ${task.grade.total >= 10 ? "text-accent-success" : task.grade.total >= 7 ? "text-accent-warn" : task.grade.total >= 4 ? "text-yellow-500" : "text-accent-error"}`}>
                  {t("grade")}: {task.grade.total}/12
                </div>}
              {lastScoring && typeof scoringPct === "number" && <div className="min-w-[180px] mr-3">
                  <div className="h-2 w-full bg-border rounded overflow-hidden">
                    {Array.isArray(scoringSegments) && scoringSegments.length > 0 ? <div className="h-2 w-full flex">
                        {scoringSegments.map(seg => <div key={seg.key} className={`h-2 ${seg.className}`} title={seg.title} style={{
                        width: `${seg.pct}%`
                      }} />)}
                      </div> : <div className="h-2 bg-primary" style={{
                        width: `${scoringPct}%`
                      }} />}
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-text-muted flex items-center justify-between">
                    <span>{tr("Бал", "Score")}: <span className="text-text-secondary">{lastScoring.score}/{lastScoring.maxScore}</span></span>
                    <span>{scoringPct}%</span>
                  </div>
                  {showScoringLegend && <div className="mt-1 text-[10px] font-mono text-text-muted flex items-center gap-3">
                      <span className="inline-flex items-center gap-1" title={tr("Публічні тести", "Public tests")}> 
                        <span className="inline-block w-2 h-2 rounded-sm bg-primary" />
                        <span>{tr("публічні", "public")}</span>
                      </span>
                      <span className="inline-flex items-center gap-1" title={tr("Приховані тести", "Hidden tests")}>
                        <span className="inline-block w-2 h-2 rounded-sm bg-violet-500" />
                        <span>{tr("приховані", "hidden")}</span>
                      </span>
                    </div>}
                </div>}
              {theoryAcknowledged && <>
                  <Button variant="ghost" onClick={() => {
              setTheoryAcknowledged(false);
            }} className="text-xs">
                  <FileText className="w-3 h-3 mr-1" /> {t("theory")}
                  </Button>
                  <Button variant="ghost" onClick={() => importInputRef.current?.click()} disabled={!canEdit} className="text-xs" title={tr("Імпорт коду з файлу", "Import code from file")}>
                    <Upload className="w-3 h-3 mr-1" /> {tr("Імпорт", "Import")}
                  </Button>
                  <Button variant="ghost" onClick={handleRun} disabled={!canEdit || running} className="text-xs">
                  <Play className="w-3 h-3 mr-1" /> {tr("Запустити", "Run")}
                  </Button>

                  {testResults.length > 0 && <Button variant="ghost" onClick={() => setShowResults(true)} className="text-xs" title={tr("Переглянути результати тестування", "View test results")}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> {tr("Результати", "Results")}
                    </Button>}

                  <Button variant="primary" onClick={handleSubmit} disabled={submitting || !canSubmit} className="text-xs">
                    <Send className="w-3 h-3 mr-1" />
                  {submitting ? tr("Перевірка...", "Checking...") : tr("Відправити", "Submit")}
                  </Button>
                  {canComplete && <Button variant="ghost" onClick={handleComplete} disabled={submitting} className="text-xs border border-accent-warn text-accent-warn hover:bg-accent-warn/10" title={tr("Завершити завдання достроково (закриє можливість редагування)", "Complete the task early (will disable editing)")}>
                    {tr("✓ Завершити", "✓ Complete")}
                    </Button>}
                </>}
            </div>
          </div>

          <input key={importSolutionKey} ref={importInputRef} type="file" accept={task.language === "JAVA" ? ".java,.txt,text/plain" : ".py,.txt,text/plain"} onChange={e => handleImportSolutionFile(e.target.files?.[0] || null)} className="hidden" />
        </div>}

      {}
      {showTheory ? <div className="flex-1 flex flex-col overflow-hidden bg-bg-base">
          {}
          <div className="border-b border-border bg-bg-surface p-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("back")}
              </Button>
              <h1 className="text-lg font-mono text-text-primary">{task.title}</h1>
            </div>
          </div>
              <div className="flex-1 overflow-y-auto p-8 pb-24">
                <div className="max-w-4xl mx-auto">
                  <h2 className="text-2xl font-mono text-text-primary mb-6">{t("theory")}</h2>
                  <div className="prose prose-invert max-w-none text-text-secondary font-mono">
                    <MarkdownView content={task.lesson.theory || ""} />
                  </div>
                </div>
              </div>
              <div className="bg-bg-surface p-4 flex-shrink-0 fixed bottom-0 left-0 right-0 z-30 shadow-lg">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
                  <p className="text-xs font-mono text-text-secondary flex-1">
                    {tr("Після прочитання теорії ви зможете перейти до практичного завдання", "After reading theory you can proceed to the practice task")}
                  </p>
                  <Button variant="primary" onClick={() => {
            console.log("Theory acknowledged");
            setTheoryAcknowledged(true);
          }} className="text-base px-8 py-3 font-semibold whitespace-nowrap shadow-md hover:shadow-lg transition-all">
                    {tr("✓ Я прочитав теорію", "✓ I have read the theory")}
                  </Button>
                </div>
              </div>
            </div> : <Group className="flex-1 overflow-hidden">
            {}
            <Panel defaultSize={25} minSize={15} maxSize={60} className="flex flex-col overflow-hidden bg-bg-base border-r border-border">
              <div className="p-3 border-b border-border bg-bg-surface flex items-center justify-between flex-shrink-0">
                <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {task.lesson.type === "CONTROL" && quizQuestions.length > 0 ? tr("Теоретична частина", "Theory part") : t("task")}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-bg-base">
                {task.lesson.type === "CONTROL" && quizQuestions.length > 0 ? <div className="space-y-4">
                    <div className="mb-4 pb-3 border-b border-border">
                      <h3 className="text-lg font-mono text-text-primary mb-1">{tr("Теоретична частина", "Theory part")}</h3>
                      <p className="text-xs text-text-secondary">
                        {tr("Відповідьте на всі питання. Після відправки змінити відповіді буде неможливо.", "Answer all questions. After submitting, you will not be able to change your answers.")}
                      </p>
                      <div className="mt-2 text-xs text-text-muted">
                        {tr("Progress", "Progress")}: {Object.keys(quizAnswers).length} / {quizQuestions.length}{" "}
                        {tr("питань", "questions")}
                      </div>
                    </div>
                    {quizQuestions.map((q: any, index: number) => <Card key={index} className={`p-4 transition-all ${quizAnswers[index] ? "border-primary/50 bg-bg-code/50" : "border-border"} ${quizSubmitted && quizAnswers[index] === q.correct ? "border-accent-success bg-accent-success/10" : quizSubmitted && quizAnswers[index] && quizAnswers[index] !== q.correct ? "border-accent-error bg-accent-error/10" : ""}`}>
                        <div className="mb-4">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-xs font-mono text-text-secondary bg-bg-surface px-2 py-1 rounded">
                              {index + 1} / {quizQuestions.length}
                            </span>
                            {quizAnswers[index] && !quizSubmitted && <span className="text-xs text-primary">{tr("✓ Відповідь вибрано", "✓ Answer selected")}</span>}
                          </div>
                          <div className="text-sm font-mono text-text-primary">
                            <MarkdownView content={q.question} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(["А", "Б", "В", "Г", "Д"] as const).map(option => {
                  const isSelected = quizAnswers[index] === option;
                  const isCorrect = q.correct === option;
                  const isWrong = isSelected && !isCorrect && quizSubmitted;
                  return <label key={option} className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all ${isSelected && !quizSubmitted ? "border-primary bg-primary/10 shadow-md" : quizSubmitted && isCorrect ? "border-accent-success bg-accent-success/20" : quizSubmitted && isWrong ? "border-accent-error bg-accent-error/20" : "border-border hover:border-primary/50 hover:bg-bg-hover"} ${quizSubmitted ? "cursor-default" : ""}`}>
                                <input type="radio" name={`question-${index}`} value={option} checked={isSelected} onChange={() => {
                      if (!quizSubmitted) {
                        const newAnswers = {
                          ...quizAnswers,
                          [index]: option
                        };
                        setQuizAnswers(newAnswers);
                        localStorage.setItem(`quiz_answers_${taskId}`, JSON.stringify(newAnswers));
                      }
                    }} disabled={quizSubmitted} className="mt-1 mr-3 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="font-semibold text-text-primary mr-2">{option})</span>
                                  <span className="text-sm font-mono text-text-primary">
                                    <MarkdownView content={q.options[option]} />
                                  </span>
                                </div>
                                {quizSubmitted && isCorrect && <span className="ml-2 text-accent-success flex-shrink-0">✓</span>}
                                {quizSubmitted && isWrong && <span className="ml-2 text-accent-error flex-shrink-0">✗</span>}
                              </label>;
                })}
                        </div>
                      </Card>)}
                    {!quizSubmitted && <div className="sticky bottom-0 bg-bg-surface border-t border-border p-4 -mx-4 -mb-4 mt-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-text-secondary">
                            {Object.keys(quizAnswers).length < quizQuestions.length ? <span className="text-accent-warn">
                                {tr("Залишилось відповісти на", "Remaining")}{" "}
                                {quizQuestions.length - Object.keys(quizAnswers).length}{" "}
                                {tr("питань", "questions")}
                              </span> : <span className="text-accent-success">{tr("Всі питання відповідені", "All questions answered")}</span>}
                          </div>
                          <Button variant="primary" onClick={handleSubmitQuiz} disabled={Object.keys(quizAnswers).length < quizQuestions.length} className="text-sm px-6 py-2 font-semibold">
                            <Send className="w-4 h-4 mr-2" />
                            {tr("Відправити тест", "Submit quiz")}
                          </Button>
                        </div>
                      </div>}
                    {quizSubmitted && quizGrade !== null && <Card className="p-6 bg-gradient-to-br from-primary/20 to-secondary/20 border-primary">
                        <div className="text-center">
                          <div className={`text-3xl font-mono mb-2 font-bold ${quizGrade >= 10 ? "text-accent-success" : quizGrade >= 7 ? "text-accent-warn" : quizGrade >= 4 ? "text-yellow-500" : "text-accent-error"}`}>
                            {quizGrade}/12
                          </div>
                          <div className="text-sm text-text-secondary mb-4">
                            {tr("Оцінка за теоретичну частину", "Theory part grade")}
                          </div>
                          <div className="text-xs text-text-muted">
                            {tr("Correct answers", "Correct answers")}:{" "}
                            {Object.keys(quizAnswers).filter(i => quizQuestions[parseInt(i)]?.correct === quizAnswers[parseInt(i)]).length}{" "}
                            {tr("з", "of")} {quizQuestions.length}
                          </div>
                        </div>
                      </Card>}
                  </div> : <div className="bg-bg-surface border border-border rounded-lg p-4">
                    <div className="prose prose-invert max-w-none text-text-secondary font-mono text-sm">
                      <MarkdownView content={getPracticeText() || task.description || ""} />
                    </div>
                  </div>}
              </div>
            </Panel>

            <Separator className="w-2 bg-border hover:bg-primary transition-colors cursor-col-resize flex-shrink-0 relative group">
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-0.5 h-8 bg-primary rounded-full" />
              </div>
            </Separator>

            {}
            <Panel defaultSize={50} minSize={20} maxSize={70} className="flex flex-col overflow-hidden bg-bg-code">
              <CodeEditor value={code} onChange={canEdit ? setCode : undefined} language={task.language} readOnly={!canEdit} />
            </Panel>

            <Separator className="w-2 bg-border hover:bg-primary transition-colors cursor-col-resize flex-shrink-0 relative group">
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-0.5 h-8 bg-primary rounded-full" />
              </div>
            </Separator>

            {}
            <Panel defaultSize={25} minSize={10} maxSize={50} className="flex flex-col overflow-hidden bg-bg-surface border-l border-border">
              <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                  <Play className="w-4 h-4" /> {tr("Консоль", "Console")}
                </div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                {}
                <div className="border-b border-border p-3 flex-shrink-0">
                  <div className="text-xs font-mono text-text-secondary mb-2">{tr("Вхідні дані:", "Input:")}</div>
                  <textarea value={testInput} onChange={e => setTestInput(e.target.value)} placeholder={tr("Введіть тестові дані...", "Enter test input...")} className="w-full h-24 bg-bg-code border border-border rounded p-2 font-mono text-xs text-text-primary resize-none focus:outline-none focus:border-primary" spellCheck={false} />
                </div>
                {}
                <div className="flex-1 overflow-y-auto p-4">
                  {}
                  {isRunningTests && Object.keys(testProgress).length > 0 ? <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-text-primary mb-3">
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        <span>{tr("Перевіряємо код...", "Checking code...")}</span>
                      </div>
                      {Object.entries(testProgress).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([testId, status], index) => <div key={testId} className="flex items-center gap-2 text-xs font-mono">
                            {status === 'pending' && <span className="text-text-muted">• {tr("Тест", "Test")} {index + 1}</span>}
                            {status === 'running' && <>
                                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                <span className="text-text-primary">{tr("Тест", "Test")} {index + 1}</span>
                              </>}
                            {status === 'passed' && <>
                                <CheckCircle2 className="w-3 h-3 text-accent-success" />
                                <span className="text-accent-success">{tr("Тест", "Test")} {index + 1}</span>
                              </>}
                            {status === 'failed' && <>
                                <XCircle className="w-3 h-3 text-accent-error" />
                                <span className="text-accent-error">{tr("Тест", "Test")} {index + 1}</span>
                              </>}
                          </div>)}
                    </div> : consoleOutput ? <pre className="text-xs text-text-secondary whitespace-pre-wrap m-0" style={{
              fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "Courier New", monospace'
            }}>
                      {consoleOutput}
                    </pre> : <span className="text-text-muted italic">
                      {tr("// Результат виконання з'явиться тут...", "// Program output will appear here...")}
                    </span>}
                </div>
              </div>
            </Panel>
          </Group>}

      {}
      {showResults && <Modal open={showResults} onClose={() => setShowResults(false)} title={tr("Результати тестування", "Test results")} showCloseButton={false}>
          <div className="p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{tr("Результати тестування", "Test results")}</h2>

            {lastScoring && lastScoring.maxScore > 0 && <div className="mb-4 p-3 border border-border bg-bg-code">
                <div className="text-[10px] font-mono text-text-secondary mb-2">{tr("Прогрес", "Progress")}</div>
                <div className="h-2 w-full bg-border rounded overflow-hidden">
                  {Array.isArray(scoringSegments) && scoringSegments.length > 0 ? <div className="h-2 w-full flex">
                      {scoringSegments.map(seg => <div key={seg.key} className={`h-2 ${seg.className}`} title={seg.title} style={{
                      width: `${seg.pct}%`
                    }} />)}
                    </div> : <div className="h-2 bg-primary" style={{
                      width: `${Math.max(0, Math.min(100, Math.round(lastScoring.score / lastScoring.maxScore * 100)))}%`
                    }} />}
                </div>
                <div className="mt-1 text-[10px] font-mono text-text-muted flex items-center justify-between">
                  <span>{tr("Бал", "Score")}: <span className="text-text-secondary">{lastScoring.score}/{lastScoring.maxScore}</span></span>
                  <span>{Math.max(0, Math.min(100, Math.round(lastScoring.score / lastScoring.maxScore * 100)))}%</span>
                </div>
                {showScoringLegend && <div className="mt-1 text-[10px] font-mono text-text-muted flex items-center gap-3">
                    <span className="inline-flex items-center gap-1" title={tr("Публічні тести", "Public tests")}>
                      <span className="inline-block w-2 h-2 rounded-sm bg-primary" />
                      <span>{tr("публічні", "public")}</span>
                    </span>
                    <span className="inline-flex items-center gap-1" title={tr("Приховані тести", "Hidden tests")}>
                      <span className="inline-block w-2 h-2 rounded-sm bg-violet-500" />
                      <span>{tr("приховані", "hidden")}</span>
                    </span>
                  </div>}
                {Array.isArray(lastScoring.groupScores) && lastScoring.groupScores.length > 0 && <div className="mt-2 space-y-1">
                    {lastScoring.groupScores.map((g, idx) => {
                  const gpct = g.maxScore > 0 ? Math.round(g.score / g.maxScore * 100) : 0;
                  const label = g.group === "public" ? tr("публічні", "public") : g.group === "hidden" ? tr("приховані", "hidden") : g.group;
                  return <div key={`${g.group}-${idx}`} className="text-[10px] font-mono text-text-muted flex items-center justify-between">
                          <span>{label}</span>
                          <span className="text-text-secondary">{g.score}/{g.maxScore} ({gpct}%)</span>
                        </div>;
                })}
                  </div>}
              </div>}

            {hints.length > 0 && <div className="mb-4 p-3 border border-primary/30 bg-bg-code">
                <div className="text-xs font-mono text-primary mb-2">{tr("Підказки (крок за кроком)", "Hints (step-by-step)")}</div>
                <div className="space-y-2">
                  {hints.slice(0, revealedHints).map((h, i) => <div key={i} className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                        {i + 1}. {h}
                      </div>)}
                  <div className="flex gap-2">
                    {revealedHints < hints.length && <Button variant="ghost" onClick={() => setRevealedHints(v => Math.min(hints.length, v + 1))} className="text-xs">
                        {tr("Показати підказку", "Show hint")}
                      </Button>}
                    {revealedHints < hints.length && hints.length > 1 && <Button variant="ghost" onClick={() => setRevealedHints(hints.length)} className="text-xs">
                        {tr("Показати всі", "Show all")}
                      </Button>}
                    {revealedHints > 0 && <Button variant="ghost" onClick={() => setRevealedHints(0)} className="text-xs">
                        {tr("Сховати", "Hide")}
                      </Button>}
                  </div>
                </div>
              </div>}

            <div className="space-y-3">
              {testResults.map((result, index) => <Card key={index} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-text-primary">{tr("Тест", "Test")} {index + 1}</span>
                    {result.passed ? <span className="text-xs text-accent-success">{tr("✓ Пройдено", "✓ Passed")}</span> : <span className="text-xs text-accent-error">{tr("✗ Не пройдено", "✗ Failed")}</span>}
                  </div>
                  <div className="text-xs text-text-secondary space-y-1">
                    <div>
                      <strong>{tr("Вхід", "Input")}:</strong> {result.input}
                    </div>
                    <div>
                      <strong>{tr("Отримано", "Actual")}:</strong> {result.actual}
                    </div>
                    {!result.passed && (result.verdict || result.errorKind) && <div className="text-text-muted">
                        <strong>{tr("Тип", "Type")}:</strong> {[result.verdict, result.errorKind].filter(Boolean).join(" · ")}
                      </div>}
                    {result.stderr && <div className="text-accent-error">
                        <strong>{tr("Помилка", "Error")}:</strong> {result.stderr}
                      </div>}
                  </div>
                </Card>)}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowResults(false)}>{tr("Закрити", "Close")}</Button>
            </div>
          </div>
        </Modal>}
    </div>;
};