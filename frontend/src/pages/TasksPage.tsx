import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listTasks, generateTask, saveDraft, submitTask, resetTopic, runTask } from "../lib/api/tasks";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { CodeEditor } from "../components/CodeEditor";
import type { Task, User } from "../types";
import { Play, CheckCircle2, ChevronLeft, ChevronRight, Plus, Save, PlayCircle, Code2 } from "lucide-react";
import { tr } from "../i18n";
import { useTheoryModal } from "../components/theory/TheoryModalProvider";
interface Props {
  user: User;
}
type BlockState = null | {
  mode: "low" | "weak";
  topicId: number;
  topicTitle: string;
  average: number;
  message: string;
};
type UIState = "idle" | "evaluating" | "success" | "error" | "logic-warning";
type LessonStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export const TasksPage: React.FC<Props> = ({
  user
}) => {
  const {
    i18n
  } = useTranslation();
  const locale = i18n.language === "uk" ? "uk-UA" : "en-US";
  const {
    openTheory,
    isOpen: isTheoryOpen
  } = useTheoryModal();
  const safeServerMessage = (value: unknown) => {
    return typeof value === "string" ? value : String(value ?? "");
  };
  const formatApiError = (err: any) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const msg = safeServerMessage(err?.message ?? data?.message ?? data ?? "");
    const statusText = status ? `HTTP ${status}` : "";
    if (msg && statusText) return `${statusText}: ${msg}`;
    return msg || statusText || tr("Невідома помилка", "Unknown error");
  };
  const splitLegacyDescription = (content: string): {
    theory: string | null;
    practice: string | null;
  } => {
    const trimmed = (content || "").trim();
    if (!trimmed) return {
      theory: null,
      practice: null
    };
    const practiceSeparator = /^###\s*(Практика|Practice)\b/im;
    const m = practiceSeparator.exec(trimmed);
    if (!m || typeof m.index !== "number") {
      return {
        theory: trimmed,
        practice: null
      };
    }
    const theory = trimmed.slice(0, m.index).trim();
    const after = trimmed.slice(m.index).trim();
    const practice = after.replace(/^###\s*(Практика|Practice)\b\s*/i, "").trim();
    return {
      theory: theory || null,
      practice: practice || null
    };
  };
  const getTheoryMarkdown = (t: Task | null): string => {
    if (!t) return "";
    const direct = (t.theoryMarkdown || "").trim();
    if (direct) return direct;
    return splitLegacyDescription(t.descriptionMarkdown || "").theory || "";
  };
  const getPracticeText = (t: Task | null): string => {
    if (!t) return "";
    const direct = (t.practiceText || "").trim();
    if (direct) return direct;
    return splitLegacyDescription(t.descriptionMarkdown || "").practice || "";
  };
  const computeHasTheory = (t: Task | null) => {
    return getTheoryMarkdown(t).trim().length > 0;
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Task | null>(null);
  const [code, setCode] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [stdin, setStdin] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editorOpen, setEditorOpen] = useState<boolean>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("studycod_tasks_editor_open") : null;
    if (saved === "1") return true;
    if (saved === "0") return false;
    return (user.userMode ?? "PERSONAL") !== "PERSONAL";
  });
  const [blockState, setBlockState] = useState<BlockState>(null);
  const [aiResult, setAiResult] = useState<{
    gradingMode?: "TESTS" | "AI";
    total: number;
    workScore: number;
    optimizationScore: number;
    integrityScore: number;
    aiFeedback: string;
    comparisonFeedback?: string | null;
    previousGrade?: number | null;
    testsPassed?: number;
    testsTotal?: number;
    testResults?: Array<{
      testId: number;
      input: string;
      expectedOutput: string;
      actualOutput: string;
      passed: boolean;
      error?: string | null;
    }>;
  } | null>(null);
  const [theoryAcknowledged, setTheoryAcknowledged] = useState(false);
  const [showTaskHistory, setShowTaskHistory] = useState(true);
  const [uiState, setUIState] = useState<UIState>("idle");
  const [milestone, setMilestone] = useState<{
    type: string;
    message: string;
    previousAverage?: number;
    currentAverage?: number;
  } | null>(null);
  const lessonStatus: LessonStatus = (() => {
    if (tasks.length === 0) return "NOT_STARTED";
    const hasUnfinished = tasks.some(t => t.status !== "GRADED");
    return hasUnfinished ? "IN_PROGRESS" : "COMPLETED";
  })();
  const canGenerateNew = lessonStatus === "COMPLETED";
  const canGenerateFirst = lessonStatus === "NOT_STARTED";
  const canGenerate = canGenerateFirst || canGenerateNew;
  const blockedReason = (() => {
    if (lessonStatus !== "IN_PROGRESS") return null;
    const unfinished = tasks.find(t => t.status !== "GRADED");
    if (!unfinished) return tr("Є незавершене завдання", "There is an unfinished task");
    const label = unfinished.status === "SUBMITTED" ? tr("на перевірці", "submitted") : tr("відкрите", "open");
    return tr(`Заверши поточне завдання (${label}), щоб згенерувати нове.`, `Finish the current task (${label}) to generate a new one.`);
  })();
  useEffect(() => {
    try {
      localStorage.setItem("studycod_tasks_editor_open", editorOpen ? "1" : "0");
    } catch {}
  }, [editorOpen]);
  const reloadTasks = useCallback(async (selectLast = false) => {
    const data = await listTasks();
    const filtered = data.filter(t => true);
    setTasks(filtered);
    const currentActiveId = active?.id;
    const currentAiResult = aiResult;
    if (selectLast && filtered.length) {
      const latest = filtered[0];
      setActive(latest);
      setCode(latest.starterCode);
      setAiResult(null);
      setConsoleOutput("");
      const content = latest.descriptionMarkdown || "";
      const hasTheory = computeHasTheory(content);
      setTheoryAcknowledged(!hasTheory);
    } else if (active) {
      const updated = filtered.find(t => t.id === active.id);
      if (updated) {
        setActive(updated);
        if (!currentAiResult || currentAiResult.total >= 6) {
          if (updated.status === "GRADED" && updated.finalCode) {
            setCode(updated.finalCode);
          } else if (updated.userCode && updated.userCode.trim()) {
            setCode(updated.userCode);
          } else {
            setCode(updated.starterCode);
          }
        }
      } else {
        setActive(null);
        setCode("");
        setAiResult(null);
      }
    }
  }, [active?.id, aiResult?.total]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await listTasks();
        if (mounted) {
          const filtered = data.filter(t => true);
          setTasks(filtered);
          if (filtered.length > 0 && !active) {
            const firstTask = filtered[0];
            setActive(firstTask);
            if (firstTask.status === "GRADED" && firstTask.finalCode) {
              setCode(firstTask.finalCode);
            } else if (firstTask.userCode && firstTask.userCode.trim()) {
              setCode(firstTask.userCode);
            } else {
              setCode(firstTask.starterCode);
            }
            const content = firstTask.descriptionMarkdown || "";
            const hasTheory = computeHasTheory(content);
            setTheoryAcknowledged(!hasTheory);
          }
        }
      } catch (err: any) {
        if (!mounted) return;
        const text = formatApiError(err);
        setConsoleOutput(`${tr("Помилка завантаження завдань:", "Failed to load tasks:")} ${text}\n` + tr("Якщо бачиш HTML замість JSON — перевір Nginx проксі для /api/* і чи працює backend.", "If you see HTML instead of JSON — check Nginx proxy for /api/* and that the backend is running."));
        setUIState("error");
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (tasks.length > 0 && !active) {
      const openTaskId = sessionStorage.getItem("openTaskId");
      let taskToOpen = tasks[0];
      if (openTaskId) {
        const taskId = parseInt(openTaskId, 10);
        const foundTask = tasks.find(t => t.id === taskId);
        if (foundTask) {
          taskToOpen = foundTask;
        }
        sessionStorage.removeItem("openTaskId");
      }
      setActive(taskToOpen);
      if (taskToOpen.status === "GRADED" && taskToOpen.finalCode) {
        setCode(taskToOpen.finalCode);
      } else if (taskToOpen.userCode && taskToOpen.userCode.trim()) {
        setCode(taskToOpen.userCode);
      } else {
        setCode(taskToOpen.starterCode);
      }
      const hasTheory = computeHasTheory(taskToOpen);
      setTheoryAcknowledged(!hasTheory);
    }
  }, [tasks.length, active]);
  useEffect(() => {
    if (active) {
      const hasTheory = computeHasTheory(active);
      setTheoryAcknowledged(!hasTheory);
    } else {
      setTheoryAcknowledged(false);
    }
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown]);
  useEffect(() => {
    if (!active) return;
    const theory = getTheoryMarkdown(active);
    if (!theory) return;
    if (theoryAcknowledged) return;
    if (isTheoryOpen) return;
    openTheory({
      title: tr("Теорія", "Theory"),
      markdown: theory,
      acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
      onAcknowledge: () => setTheoryAcknowledged(true)
    });
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown, theoryAcknowledged, isTheoryOpen, openTheory]);
  useEffect(() => {
    if (!active || !theoryAcknowledged || code.trim() === "") return;
    const isEditable = active.status !== "GRADED" || aiResult && aiResult.total < 6;
    if (!isEditable) return;
    const interval = setInterval(() => {
      if (active && code.trim() !== "" && (active.status !== "GRADED" || aiResult && aiResult.total < 6)) {
        saveDraft(active.id, code).catch(() => undefined);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [active, code, theoryAcknowledged, aiResult]);
  const handleGenerate = async () => {
    if (!canGenerate) {
      setConsoleOutput(blockedReason ?? tr("Спочатку заверши поточне завдання.", "Finish the current task first."));
      setUIState("logic-warning");
      return;
    }
    setLoading(true);
    setAiResult(null);
    setConsoleOutput("");
    setUIState("idle");
    try {
      const res = await generateTask();
      if (res.status === "ok" && res.task) {
        const newTask = res.task;
        const newTasks = await listTasks();
        setTasks(newTasks);
        setActive(newTask);
        setCode(newTask.starterCode);
        setAiResult(null);
        setConsoleOutput("");
        const hasTheory = computeHasTheory(newTask);
        setTheoryAcknowledged(!hasTheory);
        if (hasTheory) {
          const theory = getTheoryMarkdown(newTask);
          if (theory) {
            openTheory({
              title: tr("Теорія", "Theory"),
              markdown: theory,
              acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
              onAcknowledge: () => setTheoryAcknowledged(true)
            });
          }
        }
      } else if (res.status === "blocked" || res.status === "warn") {
        setBlockState({
          mode: res.status === "blocked" ? "low" : "weak",
          topicId: res.topicId,
          topicTitle: res.topicTitle,
          average: res.average,
          message: res.message
        });
        setUIState(res.status === "blocked" ? "logic-warning" : "logic-warning");
      }
    } catch (error: any) {
      const errorResponse = error?.response?.data;
      if (error?.response?.status === 401 || error?.message === "UNAUTHORIZED" || String(error?.message || "").toUpperCase().includes("UNAUTHORIZED")) {
        setConsoleOutput(`${tr("Помилка:", "Error:")} ${tr("Сесія недійсна або ви не увійшли.", "Session is invalid or you are not signed in.")}\n${tr("Будь ласка, увійдіть в систему.", "Please sign in.")}`);
        setUIState("error");
        return;
      }
      if (errorResponse?.status === "blocked") {
        setBlockState({
          mode: "low",
          topicId: errorResponse.topicId ?? errorResponse.taskId,
          topicTitle: errorResponse.topicTitle ?? tr("(невідома тема)", "(unknown topic)"),
          average: errorResponse.average,
          message: errorResponse.message
        });
        setUIState("logic-warning");
        return;
      }
      const text = formatApiError(error);
      setConsoleOutput(`${tr("Помилка генерації завдання:", "Task generation error:")} ${text}`);
      setUIState("error");
    } finally {
      setLoading(false);
    }
  };
  const handleSubmit = async () => {
    if (!active) return;
    setSubmitting(true);
    setUIState("evaluating");
    setConsoleOutput(tr("Оцінювання...", "Evaluating..."));
    try {
      const res = await submitTask(active.id, code);
      let result: {
        gradingMode?: "TESTS" | "AI";
        total: number;
        workScore: number;
        optimizationScore: number;
        integrityScore: number;
        aiFeedback: string;
        comparisonFeedback: string | null;
        previousGrade: number | null;
        testsPassed?: number;
        testsTotal?: number;
        testResults?: Array<{
          testId: number;
          input: string;
          expectedOutput: string;
          actualOutput: string;
          passed: boolean;
          error?: string | null;
        }>;
      } | null = null;
      if (res.grade) {
        const grade = res.grade;
        result = {
          gradingMode: grade.gradingMode,
          total: Number(grade.total ?? 0),
          workScore: Number(grade.workScore ?? 0),
          optimizationScore: Number(grade.optimizationScore ?? 0),
          integrityScore: Number(grade.integrityScore ?? 0),
          aiFeedback: grade.aiFeedback ?? "",
          comparisonFeedback: grade.comparisonFeedback ?? null,
          previousGrade: grade.previousGrade ?? null,
          testsPassed: grade.testsPassed ?? undefined,
          testsTotal: grade.testsTotal ?? undefined,
          testResults: grade.testResults ?? undefined
        };
        const outputText = result.gradingMode === "TESTS" ? tr(`Перевірка завершена: ${result.testsPassed ?? 0}/${result.testsTotal ?? 0}. Оцінка: ${result.total}`, `Check completed: ${result.testsPassed ?? 0}/${result.testsTotal ?? 0}. Grade: ${result.total}`) : tr(`Перевірка завершена. Оцінка: ${result.total}`, `Check completed. Grade: ${result.total}`);
        setConsoleOutput(outputText);
        setAiResult(result);
        setUIState(result.total >= 9 ? "success" : result.total >= 6 ? "idle" : "error");
        if (res.milestone) {
          setMilestone(res.milestone);
        }
      }
      const updatedTasks = await listTasks();
      setTasks(updatedTasks.filter(t => true));
      if (active) {
        const updated = updatedTasks.find(t => t.id === active.id);
        if (updated) {
          setActive(updated);
        }
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      const raw = safeServerMessage(err?.response?.data?.message ?? err?.message ?? String(err));
      setConsoleOutput(`${tr("Помилка відправлення:", "Submit error:")}${raw ? ` ${raw}` : ""}`);
      setUIState("error");
    } finally {
      setSubmitting(false);
    }
  };
  const canEdit = active && theoryAcknowledged && (active.status !== "GRADED" || aiResult && aiResult.total < 6);
  const handleSaveDraft = async () => {
    if (!active || !code.trim()) return;
    try {
      await saveDraft(active.id, code);
      setConsoleOutput(tr("Чернетку збережено", "Draft saved"));
    } catch (err: any) {
      const raw = safeServerMessage(err?.response?.data?.message ?? err?.message ?? String(err));
      setConsoleOutput(`${tr("Помилка збереження:", "Save error:")}${raw ? ` ${raw}` : ""}`);
    }
  };
  const handleRun = async () => {
    if (!active || !code.trim()) return;
    setUIState("evaluating");
    setConsoleOutput(tr("Запуск...", "Running..."));
    try {
      const res = await runTask(active.id, code, stdin || "");
      setConsoleOutput(res.output || res.stderr || tr("Вивід відсутній", "No output"));
      setUIState("idle");
    } catch (err: any) {
      const raw = safeServerMessage(err?.response?.data?.message ?? err?.message ?? String(err));
      setConsoleOutput(`${tr("Помилка запуску:", "Run error:")}${raw ? ` ${raw}` : ""}`);
      setUIState("error");
    }
  };
  return <div className="flex-1 min-h-0 flex flex-col bg-bg-base">

      {}
      <div className="flex-1 min-h-0 flex overflow-x-hidden">
        {}
        <div className={`bg-bg-surface border-r border-border transition-slow ease-in-out flex flex-col ${showTaskHistory ? "w-[280px]" : "w-12"}`}>
          <div className="flex items-center justify-between p-3 border-b border-border">
            {showTaskHistory && <h2 className="text-sm font-mono text-text-primary">{tr("Завдання", "Tasks")}</h2>}
            <button onClick={() => setShowTaskHistory(!showTaskHistory)} className="w-6 h-6 border border-border flex items-center justify-center hover:bg-bg-hover transition-fast ml-auto">
              {showTaskHistory ? <ChevronLeft className="w-3 h-3 text-text-secondary" /> : <ChevronRight className="w-3 h-3 text-text-secondary" />}
            </button>
          </div>
          {showTaskHistory && <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {tasks.length === 0 && <div className="space-y-3">
                    <div className="text-xs text-text-muted font-mono text-center py-4">
                      {tr("Немає завдань", "No tasks")}
                    </div>
                    <Button variant="primary" onClick={handleGenerate} disabled={loading || !canGenerate} className="w-full text-sm px-4 py-2 flex items-center justify-center gap-2" title={!canGenerate ? blockedReason ?? undefined : undefined}>
                      <Plus className="w-4 h-4" />
                      {tr("Згенерувати завдання", "Generate task")}
                    </Button>
                    {lessonStatus !== "NOT_STARTED" && <div className="text-[10px] font-mono text-text-muted text-center">
                        {tr(`Статус уроку: ${lessonStatus}`, `Lesson status: ${lessonStatus}`)}
                      </div>}
                  </div>}
        {tasks.length > 0 && tasks.map(t => <div key={t.id} className={`p-3 cursor-pointer border transition-fast bg-bg-surface ${active?.id === t.id ? "border-primary bg-bg-hover" : "border-border hover:border-primary/50"}`} onClick={() => {
              setActive(t);
              if (t.status === "GRADED" && t.finalCode) {
                setCode(t.finalCode);
              } else if (t.userCode && t.userCode.trim()) {
                setCode(t.userCode);
              } else {
                setCode(t.starterCode);
              }
              setAiResult(null);
              setConsoleOutput("");
              setUIState("idle");
              const hasTheory = computeHasTheory(t);
              setTheoryAcknowledged(!hasTheory);
            }}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-xs font-mono text-text-primary truncate flex-1">
                        {t.title}
                      </div>
              <Badge color={t.status === "GRADED" ? "success" : t.status === "SUBMITTED" ? "info" : "warn"}>
                        {t.status === "GRADED" ? "✓" : t.status === "SUBMITTED" ? "…" : "○"}
              </Badge>
            </div>
                    <div className="text-[10px] font-mono text-text-muted">
                      {new Date(t.createdAt).toLocaleDateString(locale)}
            </div>
          </div>)}
              </div>
              {}
              {active && <div className="p-3 border-t border-border">
                  <Button variant="primary" onClick={handleGenerate} disabled={loading || !canGenerateNew} className="w-full text-sm px-4 py-2 flex items-center justify-center gap-2" title={!canGenerateNew ? blockedReason ?? tr("Заборонено: урок ще не завершено", "Disabled: lesson is not completed") : undefined}>
                    <Plus className="w-4 h-4" />
                    {tr("Згенерувати нове", "Generate new")}
                  </Button>
                  <div className="mt-2 text-[10px] font-mono text-text-muted text-center">
                    {tr(`Статус уроку: ${lessonStatus}`, `Lesson status: ${lessonStatus}`)}
                    {blockedReason ? <div className="mt-1">{blockedReason}</div> : null}
                  </div>
                </div>}
            </div>}
      </div>

        {}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {active ? <>
              {}
              <div className="border-b border-border bg-bg-surface p-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                <div>
                    <h1 className="text-lg font-mono text-text-primary mb-1">{active.title}</h1>
                    <div className="text-xs font-mono text-text-muted">
                      {active.kind === "CONTROL" ? tr("Контроль знань", "Knowledge check") : tr("Тема", "Topic")}{" "}
                      · {tr("Difus:", "Difficulty:")} {user.difus}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                  const hasTheory = computeHasTheory(active);
                  if (!hasTheory) return null;
                  return <Button variant="ghost" onClick={() => {
                    setTheoryAcknowledged(false);
                    const theory = getTheoryMarkdown(active);
                    if (theory) {
                      openTheory({
                        title: tr("Теорія", "Theory"),
                        markdown: theory,
                        acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
                        onAcknowledge: () => setTheoryAcknowledged(true)
                      });
                    }
                  }} className="text-sm px-3 py-2">
                          {tr("Теорія", "Theory")}
                        </Button>;
                })()}

                    <Button variant="ghost" onClick={() => setEditorOpen(v => !v)} className="text-sm px-3 py-2" title={editorOpen ? tr("Сховати редактор", "Hide editor") : tr("Відкрити редактор", "Open editor")}>
                      <Code2 className="w-4 h-4 mr-2" />
                      {editorOpen ? tr("Редактор", "Editor") : tr("Відкрити", "Open")}
                    </Button>

                    {!aiResult ? <>
                        <Button variant="secondary" onClick={() => {
                    if (!editorOpen) {
                      setEditorOpen(true);
                      return;
                    }
                    handleSaveDraft();
                  }} disabled={!active || !code.trim() || !theoryAcknowledged} className="text-sm px-4 py-2">
                          <Save className="w-4 h-4 mr-2" /> {tr("Зберегти", "Save")}
                        </Button>
                        <Button variant="secondary" onClick={() => {
                    if (!editorOpen) {
                      setEditorOpen(true);
                      return;
                    }
                    handleRun();
                  }} disabled={!active || !code.trim() || !theoryAcknowledged} className="text-sm px-4 py-2">
                          <PlayCircle className="w-4 h-4 mr-2" /> {tr("Запустити", "Run")}
                        </Button>
                        <Button variant="primary" onClick={() => {
                    if (!editorOpen) {
                      setEditorOpen(true);
                      return;
                    }
                    handleSubmit();
                  }} disabled={!canEdit || submitting || !theoryAcknowledged || !code.trim()} className="text-sm px-6 py-2">
                          <CheckCircle2 className="w-4 h-4 mr-2" />{" "}
                          {tr("Перевірити", "Check")}
                        </Button>
                      </> : aiResult.total < 6 ? <>
                        <Button variant="secondary" onClick={handleSaveDraft} disabled={!active || !code.trim()} className="text-sm px-4 py-2">
                          <Save className="w-4 h-4 mr-2" /> {tr("Зберегти", "Save")}
                        </Button>
                        <Button variant="primary" onClick={() => {
                    setAiResult(null);
                    setConsoleOutput("");
                    setUIState("idle");
                  }} className="text-sm px-6 py-2">
                          {tr("Виправити помилку", "Fix the error")}
                        </Button>
                      </> : null}
                  </div>
                </div>

                {}
                {active && <div className="mt-3 border border-border bg-bg-code overflow-hidden flex flex-col" style={{
              maxHeight: "300px"
            }}>
                    <div className="p-3 border-b border-border flex-shrink-0">
                      <div className="text-xs font-mono text-text-secondary">
                        {tr("Практичне завдання", "Practical task")}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      <div className="text-sm text-text-primary">
                        {(() => {
                    const hasTheory = computeHasTheory(active);
                    const practice = getPracticeText(active);
                    if (hasTheory && !theoryAcknowledged) {
                      return <div className="text-xs font-mono text-text-secondary">
                                {tr("Спочатку прочитай теорію у модальному вікні.", "Read the theory in the modal first.")}
                              </div>;
                    }
                    return practice ? <div className="whitespace-pre-wrap">{practice}</div> : <div className="text-xs font-mono text-text-secondary">
                              {tr("Практика знаходиться у редакторі коду нижче (дивись TODO у шаблоні).", "Practice is in the code editor below (see TODO in the template).")}
                            </div>;
                  })()}
                      </div>
                    </div>
                  </div>}
                </div>

              {}
              <div className="flex-1 min-h-0 overflow-hidden bg-bg-base">
                {editorOpen ? <div className="h-full min-h-0 bg-bg-code border-t border-border">
                    <CodeEditor language={user.course} value={code} onChange={canEdit ? setCode : undefined} readOnly={!canEdit} />
                  </div> : <div className="h-full min-h-0 flex flex-col">
                    <div className="p-4 border-t border-border bg-bg-surface flex items-center justify-between">
                      <div className="text-sm font-mono text-text-secondary">
                        {tr("Редактор сховано — щоб прибрати порожній прямокутник.", "Editor is hidden to avoid an empty panel.")}
                      </div>
                      <Button variant="primary" onClick={() => setEditorOpen(true)}>
                        {tr("Відкрити редактор", "Open editor")}
                      </Button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <div className="text-sm text-text-primary">
                        <div className="text-xs font-mono text-text-secondary">
                          {tr("Відкрий редактор, щоб почати писати код (дивись TODO у шаблоні).", "Open the editor to start coding (see TODO in the template).")}
                        </div>
                      </div>
                    </div>
                  </div>}
              </div>
            </> : <div className="flex-1 flex flex-col items-center justify-center text-text-muted font-mono text-sm gap-4">
              <div>
                {tasks.length === 0 ? tr("Немає завдань", "No tasks") : tr("Виберіть завдання зі списку", "Select a task from the list")}
              </div>
              {tasks.length === 0 && <Button variant="primary" onClick={handleGenerate} disabled={loading || !!active} className="text-sm px-6 py-2 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {tr("Згенерувати завдання", "Generate task")}
                </Button>}
            </div>}
        </div>

        {}
        <div className="w-[400px] border-l border-border bg-bg-surface flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                    <Play className="w-4 h-4" /> {tr("Консоль", "Console")}
            </div>
                  {aiResult && <Badge color={aiResult.total >= 10 ? "success" : aiResult.total >= 7 ? "warn" : aiResult.total >= 4 ? "warn" : "error"}>
                {aiResult.total ?? "—"}
                    </Badge>}
                </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <div className="border border-border bg-bg-code p-2">
              <div className="text-[10px] font-mono text-text-secondary mb-1">
                {tr("Вхідні дані (stdin)", "Input (stdin)")}
              </div>
              <textarea value={stdin} onChange={e => setStdin(e.target.value)} placeholder={tr("Введіть дані для програми...", "Enter input for your program...")} className="w-full h-20 bg-transparent border border-border p-2 font-mono text-xs text-text-primary resize-none focus:outline-none focus:border-primary" spellCheck={false} />
            </div>
            <div className="font-mono text-xs text-text-primary whitespace-pre-wrap">
                  {consoleOutput || tr("Натисни «Перевірити», щоб отримати оцінку.", "Press “Check” to get a grade.")}
            </div>
                  {aiResult && <div className="mt-4 pt-4 border-t border-border space-y-2">
                {aiResult.gradingMode !== "TESTS" && aiResult.total !== null && aiResult.total !== undefined && <>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Оцінка:", "Grade:")} <span className={`font-semibold ${aiResult.total >= 10 ? "text-accent-success" : aiResult.total >= 7 ? "text-accent-warn" : aiResult.total >= 4 ? "text-yellow-500" : "text-accent-error"}`}>{aiResult.total}</span>
                      {aiResult.previousGrade !== null && aiResult.previousGrade !== undefined && <span className="text-text-muted ml-2">
                          ({tr(`було ${aiResult.previousGrade}`, `was ${aiResult.previousGrade}`)})
                        </span>}
                    </div>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Працездатність:", "Correctness:")}{" "}
                      <span className="text-text-primary">{aiResult.workScore ?? 0}</span> / 5
                    </div>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Оптимізація:", "Optimization:")}{" "}
                      <span className="text-text-primary">{aiResult.optimizationScore ?? 0}</span> / 4
                    </div>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Доброчесність:", "Integrity:")}{" "}
                      <span className="text-text-primary">{aiResult.integrityScore ?? 0}</span> / 3
                      </div>
                  </>}
                {aiResult.gradingMode === "TESTS" && <div className="text-xs font-mono text-text-secondary">
                    {tr("Тести:", "Tests:")}{" "}
                    <span className="text-text-primary">
                      {aiResult.testsPassed ?? 0}/{aiResult.testsTotal ?? 0}
                    </span>{" "}
                    · {tr("Оцінка:", "Grade:")}{" "}
                    <span className="text-text-primary">{aiResult.total ?? 0}</span>
                  </div>}
                {aiResult.comparisonFeedback && <div className="mt-3 p-2 border border-primary/30 bg-bg-code">
                    <div className="text-xs font-mono text-primary mb-1">
                      {tr("Порівняння з попередньою спробою:", "Comparison with previous attempt:")}
                    </div>
                    <div className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                      {aiResult.comparisonFeedback}
                      </div>
                      </div>}
                      {aiResult.aiFeedback && <div className="text-xs font-mono text-text-secondary mt-3 whitespace-pre-wrap">
                          {aiResult.aiFeedback}
                        </div>}
                    </div>}
            {}
            {uiState === "evaluating" && <div className="mt-4 text-xs font-mono text-secondary animate-pulse">
                {tr("Оцінювання...", "Evaluating...")}
              </div>}
            {uiState === "success" && <div className="mt-4 text-xs font-mono text-accent-success">
                {tr("✓ Успішно", "✓ Success")}
              </div>}
            {uiState === "error" && <div className="mt-4 text-xs font-mono text-accent-error">
                {tr("✗ Помилка", "✗ Error")}
                </div>}
            {uiState === "logic-warning" && <div className="mt-4 text-xs font-mono text-accent-logic-warning">
                {tr("⚠ Попередження", "⚠ Warning")}
            </div>}
          </div>
        </div>
      </div>

      {}
      <Modal open={!!blockState} title={blockState?.mode === "low" ? tr("Тему потрібно пройти повторно", "You need to retry this topic") : tr("Бажано повторити тему", "It’s recommended to review this topic")} description={blockState ? (() => {
      const hasAvg = Number.isFinite(blockState.average);
      const avgLineUk = hasAvg ? `\nСередній бал: ${blockState.average.toFixed(2)}` : "";
      const avgLineEn = hasAvg ? `\nAverage grade: ${blockState.average.toFixed(2)}` : "";
      return tr(`Тема: ${blockState.topicTitle}${avgLineUk}\n\nЩоб рухатись далі, необхідно перепройти тему.`, `Topic: ${blockState.topicTitle}${avgLineEn}\n\nTo continue, you need to retry the topic.`);
    })() : undefined} onClose={() => {
      setBlockState(null);
      setUIState("idle");
    }}>
        {blockState && <div className="flex justify-end mt-2">
            <Button variant="primary" onClick={async () => {
          try {
            await resetTopic(blockState.topicId);
            setBlockState(null);
            setUIState("idle");
            await reloadTasks(true);
          } catch (err) {
            console.error(err);
            setUIState("error");
          }
        }}>
              {tr("Перепройти тему", "Retry topic")}
            </Button>
          </div>}
      </Modal>

      {}
      <Modal open={!!milestone} title={tr("🎯 Ти покращився!", "🎯 You improved!")} description={milestone?.message} onClose={async () => {
      if (milestone) {
        try {
          const base = import.meta.env.VITE_API_URL || window.location.origin;
          await fetch(`${base}/profile/milestone-shown`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${localStorage.getItem("token")}`,
              "Content-Type": "application/json"
            }
          });
        } catch (err) {}
      }
      setMilestone(null);
    }}>
        {milestone && <div className="flex justify-end gap-2 mt-2">
            <Button variant="primary" onClick={async () => {
          try {
            const base = import.meta.env.VITE_API_URL || window.location.origin;
            await fetch(`${base}/profile/milestone-shown`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json"
              }
            });
          } catch (err) {}
          setMilestone(null);
        }}>
              {tr("Продовжити", "Continue")}
            </Button>
          </div>}
      </Modal>
    </div>;
};