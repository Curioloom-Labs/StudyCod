import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, Clock3, FileCheck2, FlaskConical, Pencil, Plus, Save, Sparkles, Upload, Wand2, Trash2 } from "lucide-react";
import { api } from "../../lib/api/client";
import { addTestData, deleteGeneratedTestData, deleteTestData, generateTestData, getTestData, updateControlWorkFormula, type TestData } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { showToast } from "../../lib/toast";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { ClassWorkspaceFrame } from "./ClassWorkspaceNavigation";
import { withDevPreview } from "../../lib/devPreview";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { TaskAuthoringFields, type TaskAuthoringDraft, type TaskAuthoringTab } from "./TaskAuthoringFields";
import { buildTaskGenerationGuidance, defaultTaskGenerationProfile, type TaskGenerationProfile } from "./taskGenerationSettings";
import { TestImageAttachments } from "../../components/TestImageAttachments";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";

type ControlTask = { id: number; title: string; description?: string; template?: string; maxAttempts?: number; theory?: { content: string } | null; projectSpec?: unknown; isAssigned?: boolean; assignedStudentIds?: number[] | null };
type QuizItem = { question?: string; options?: Record<string, string>; correct?: string };
type QuizQuestionStyle = "MIXED" | "CONCEPTS" | "CODE_READING" | "DEBUGGING";
type QuizCodeLength = "SHORT" | "MEDIUM" | "LONG";
type ManualTestDraft = { input: string; expectedOutput: string; points: number; isHidden: boolean; imageUrls: string[] };
type Control = {
  id: number;
  title?: string | null;
  topic?: { id: number; title: string };
  topicId?: number;
  timeLimitMinutes?: number | null;
  isAssigned?: boolean;
  assignedStudentIds?: number[] | null;
  quizJson?: string | null;
  hasTheory?: boolean;
  hasPractice?: boolean;
  formula?: string | null;
  tasks?: ControlTask[];
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-control-workspace";
const emptyTaskDraft = (): TaskAuthoringDraft & { generationInstructions: string } => ({ title: "", description: "", template: "", maxAttempts: "3", theory: "", projectSpecJson: "", generationInstructions: "" });

const demoQuiz: QuizItem[] = [
  { question: "Яка складність проходу по масиву з n елементів?", options: { A: "O(1)", B: "O(log n)", C: "O(n)" }, correct: "C" },
  { question: "Що поверне range(3) у Python?", options: { A: "0, 1, 2", B: "1, 2, 3", C: "3" }, correct: "A" },
];

const demo: Control = {
  id: 12,
  title: "Контрольна · Колекції",
  topic: { id: 31, title: "Колекції та зрізи" },
  timeLimitMinutes: 45,
  hasTheory: true,
  hasPractice: true,
  formula: "0.35 * test + 0.65 * avg(practice)",
  quizJson: JSON.stringify(demoQuiz, null, 2),
  tasks: [
    { id: 11, title: "Частоти в тексті", description: "Знайдіть кількість кожного слова." },
    { id: 12, title: "Таблиця замовлень", description: "Згрупуйте значення та порахуйте суму." },
  ],
};

function parseQuiz(raw?: string | null): QuizItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const questions = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    const labels = ["А", "Б", "В", "Г", "Д"];
    const latinLabels = ["A", "B", "C", "D", "E"];
    return questions.filter((item: unknown) => item && typeof item === "object").map((item: Record<string, unknown>) => {
      const rawOptions = item.options;
      const options = Object.fromEntries(labels.map((label, index) => {
        const value = Array.isArray(rawOptions)
          ? rawOptions[index]
          : rawOptions && typeof rawOptions === "object"
            ? (rawOptions as Record<string, unknown>)[label] ?? (rawOptions as Record<string, unknown>)[latinLabels[index]] ?? (rawOptions as Record<string, unknown>)[String(index)]
            : "";
        return [label, String(value ?? "")];
      }));
      const rawCorrect = item.correct;
      const correctIndex = typeof rawCorrect === "number"
        ? rawCorrect
        : latinLabels.indexOf(String(rawCorrect ?? "").toUpperCase());
      const correct = typeof rawCorrect === "number"
        ? labels[rawCorrect] ?? labels[0]
        : correctIndex >= 0
          ? labels[correctIndex]
          : labels.includes(String(rawCorrect))
            ? String(rawCorrect)
            : labels[0];
      return { question: String(item.question ?? item.q ?? ""), options, correct };
    });
  } catch {
    return [];
  }
}

export const ControlStudioPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const { controlWorkId } = useParams<{ controlWorkId: string }>();
  const id = Number(controlWorkId);
  const navigate = useNavigate();
  const [control, setControl] = React.useState<Control | null>(null);
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState("45");
  const [formula, setFormula] = React.useState("");
  const [quizText, setQuizText] = React.useState("");
  const [quizGenerationSettings, setQuizGenerationSettings] = React.useState({ count: "10", difficulty: "3", questionStyle: "MIXED" as QuizQuestionStyle, codeLength: "MEDIUM" as QuizCodeLength, guidance: "" });
  const quizQuestionRefs = React.useRef<Record<number, HTMLTextAreaElement | null>>({});
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = React.useState(false);
  const [newTask, setNewTask] = React.useState<TaskAuthoringDraft & { generationInstructions: string }>(emptyTaskDraft);
  const [taskGenerationProfile, setTaskGenerationProfile] = React.useState<TaskGenerationProfile>(defaultTaskGenerationProfile);
  const [taskEditorTab, setTaskEditorTab] = React.useState<TaskAuthoringTab>("statement");
  const [editingTaskId, setEditingTaskId] = React.useState<number | null>(null);
  const [taskAiBusy, setTaskAiBusy] = React.useState<"condition" | "template" | "theory" | null>(null);
  const [testSettings, setTestSettings] = React.useState({ count: "5", requiredCases: "", replaceGenerated: true });
  const [testCounts, setTestCounts] = React.useState<Record<number, number>>({});
  const [generatingTestsFor, setGeneratingTestsFor] = React.useState<number | null>(null);
  const [testEditorTask, setTestEditorTask] = React.useState<ControlTask | null>(null);
  const [taskTests, setTaskTests] = React.useState<TestData[]>([]);
  const [testNotice, setTestNotice] = React.useState<string | null>(null);
  const [testEditorBusy, setTestEditorBusy] = React.useState(false);
  const [manualTest, setManualTest] = React.useState({ input: "", expectedOutput: "", points: "1", isHidden: true, imageUrls: [] as string[] });
  const [draftManualTests, setDraftManualTests] = React.useState<ManualTestDraft[]>([]);
  const [importTestSettings, setImportTestSettings] = React.useState({ points: "1", isHidden: true });
  const [importFiles, setImportFiles] = React.useState<File[]>([]);
  const [importInputKey, setImportInputKey] = React.useState(0);
  const [parentClass, setParentClass] = React.useState<{ id: number; name: string } | null>(null);

  React.useEffect(() => {
    if (preview()) { setParentClass({ id: 31, name: "11-А" }); return; }
    const topicId = control?.topic?.id || control?.topicId;
    if (!topicId) return;
    let alive = true;
    setParentClass(null);
    void api.get(`/topics/${topicId}`).then(response => {
      const topic = response.data.topic ?? response.data;
      if (alive && topic.class?.id) setParentClass({ id: topic.class.id, name: topic.class.name || tr("Клас", "Class") });
    }).catch(() => {});
    return () => { alive = false; };
  }, [control?.topic?.id, control?.topicId]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (preview()) {
        setControl(demo);
        setTestCounts({ 11: 4, 12: 3 });
        setTitle(demo.title || "");
        setMinutes(String(demo.timeLimitMinutes || 45));
        setFormula(demo.formula || "");
        setQuizText(demo.quizJson || "");
        setError(null);
        return;
      }
      const response = await api.get(`/topics/control-works/${id}`);
      const value = response.data.controlWork || response.data;
      setControl(value);
      const loadedTasks = Array.isArray(value.tasks) ? value.tasks as ControlTask[] : [];
      const counts = await Promise.all(loadedTasks.map(async task => {
        try {
          const result = await getTestData(task.id, { limit: 1, offset: 0 });
          return [task.id, result.pagination?.total ?? result.testData.length] as const;
        } catch {
          return [task.id, 0] as const;
        }
      }));
      setTestCounts(Object.fromEntries(counts));
      setTitle(value.title || "");
      setMinutes(String(value.timeLimitMinutes || 45));
      setFormula(value.formula || "0.35 * test + 0.65 * avg(practice)");
      setQuizText(value.quizJson || "");
      setError(null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося відкрити контрольну.", "Could not open the assessment.")));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (quizText.trim()) JSON.parse(quizText);
      if (!preview()) {
        await api.put(`/topics/control-works/${id}`, {
          title: title.trim(),
          timeLimitMinutes: Number(minutes) || null,
          quizJson: quizText.trim() || null,
        });
        await updateControlWorkFormula(id, formula.trim() || null);
        await load();
      } else {
        setControl(old => old ? { ...old, title: title.trim(), timeLimitMinutes: Number(minutes) || null, quizJson: quizText.trim() || null, formula: formula.trim() || null } : old);
      }
      showToast({ type: "success", message: tr("Контрольну збережено.", "Assessment saved.") });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти зміни. Перевірте запитання та спробуйте ще раз.", "Could not save changes. Check the questions and try again.")));
    } finally {
      setBusy(false);
    }
  };

  const generateQuiz = async () => {
    const count = Math.max(1, Math.min(50, Number(quizGenerationSettings.count) || 10));
    setBusy(true);
    try {
      if (preview()) {
        setQuizText(JSON.stringify(Array.from({ length: count }, (_, index) => demoQuiz[index % demoQuiz.length]), null, 2));
      } else {
        await api.post(`/topics/control-works/${id}/generate-quiz`, {
          count,
          topicTitle: control?.topic?.title || title,
          difficulty: Number(quizGenerationSettings.difficulty) || 3,
          questionStyle: quizGenerationSettings.questionStyle,
          codeLength: quizGenerationSettings.codeLength,
          generationGuidance: quizGenerationSettings.guidance.trim(),
          language: isEn ? "en" : "uk",
        });
        await load();
      }
      showToast({ type: "success", message: tr("Квіз підготовлено.", "Quiz is ready.") });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося підготувати квіз.", "Could not prepare the quiz.")));
    } finally {
      setBusy(false);
    }
  };

  const normalizeQuiz = () => {
    try {
      const parsed = JSON.parse(quizText || "[]");
      setQuizText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      setError(tr("JSON квізу має помилку. Виправте синтаксис перед збереженням.", "The quiz JSON has an error. Fix the syntax before saving."));
    }
  };

  const openTaskEditor = (task: ControlTask) => {
    setError(null);
    setEditingTaskId(task.id);
    setTaskEditorTab("statement");
    setNewTask({
      title: task.title || "",
      description: task.description || "",
      template: task.template || "",
      maxAttempts: String(task.maxAttempts || 3),
      theory: task.theory?.content || "",
      projectSpecJson: task.projectSpec ? JSON.stringify(task.projectSpec, null, 2) : "",
      generationInstructions: "",
    });
    setDraftManualTests([]);
    setTaskGenerationProfile(defaultTaskGenerationProfile);
    setShowCreateTask(true);
    setTestEditorTask(null);
  };

  const deleteTask = async (task: ControlTask) => {
    if (!window.confirm(tr(`Видалити практичну задачу «${task.title}»?`, `Delete practice problem “${task.title}”?`))) return;
    setBusy(true);
    setError(null);
    try {
      if (preview()) {
        setControl(old => old ? { ...old, tasks: (old.tasks || []).filter(item => item.id !== task.id) } : old);
      } else {
        await api.delete(`/topics/${control?.topic?.id}/tasks/${task.id}`);
        await load();
      }
      setTestEditorTask(null);
      setTaskTests([]);
      setTestCounts(old => { const next = { ...old }; delete next[task.id]; return next; });
      showToast({ type: "success", message: tr("Практичну задачу видалено.", "Practice problem deleted.") });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити задачу. Призначену задачу або задачу зі спробами потрібно спершу відкріпити.", "Could not delete this problem. Unassign the assessment or remove its attempts first.")));
    } finally {
      setBusy(false);
    }
  };

  const createTask = async () => {
    if (!control?.topic?.id || !newTask.title.trim()) return;
    let projectSpec: unknown = null;
    if (newTask.projectSpecJson.trim()) {
      try {
        projectSpec = JSON.parse(newTask.projectSpecJson);
      } catch {
        setError(tr("Перевірте JSON опису мініпроєкту.", "Check the mini-project JSON."));
        setTaskEditorTab("settings");
        return;
      }
    }

    setBusy(true);
    setError(null);
    let generatedCount = 0;
    let testGenerationError: unknown = null;
    let manualTestSaveError: unknown = null;
    const manualTestsToSave = [...draftManualTests];
    let savedTask: ControlTask | null = null;
    const isEditing = editingTaskId !== null;
    const previousTask = control.tasks?.find(task => task.id === editingTaskId);
    try {
      const testCount = Math.max(1, Math.min(50, Number(testSettings.count) || 5));
      const payload = {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        template: newTask.template,
        maxAttempts: Math.max(1, Number(newTask.maxAttempts) || 3),
        projectSpec,
      };
      if (preview()) {
        const taskId = editingTaskId ?? Date.now();
        savedTask = {
          ...previousTask,
          ...payload,
          id: taskId,
          theory: newTask.theory.trim() ? { content: newTask.theory.trim() } : null,
        };
        setControl(old => old ? {
          ...old,
          tasks: editingTaskId
            ? (old.tasks || []).map(task => task.id === taskId ? savedTask as ControlTask : task)
            : [...(old.tasks || []), savedTask as ControlTask],
        } : old);
        if (!isEditing) {
          setTestCounts(old => ({ ...old, [taskId]: newTask.description.trim() ? testCount : 0 }));
          generatedCount = newTask.description.trim() ? testCount : 0;
        }
      } else {
        const topicId = control.topic.id;
        const response = isEditing
          ? await api.put("/topics/" + topicId + "/tasks/" + editingTaskId, payload)
          : await api.post("/topics/" + topicId + "/tasks", {
            ...payload,
            type: "CONTROL",
            controlWorkId: id,
            order: (control.tasks?.length || 0) + 1,
          });
        const createdTask = response.data?.task ?? response.data?.topicTask ?? response.data;
        const taskId = Number(createdTask?.id);
        if (!Number.isSafeInteger(taskId) || taskId <= 0) throw new Error("TASK_ID_MISSING_AFTER_SAVE");
        savedTask = createdTask as ControlTask;

        if (newTask.theory.trim()) {
          await api.post("/topics/" + topicId + "/tasks/" + taskId + "/theory", { content: newTask.theory.trim() });
        } else if (isEditing && previousTask?.theory) {
          await api.delete("/topics/" + topicId + "/tasks/" + taskId + "/theory");
        }

        if (!isEditing && newTask.description.trim()) {
          try {
            const requiredCases = testSettings.requiredCases.split(/\r?\n/).map(value => value.trim().slice(0, 240)).filter(Boolean).slice(0, 24);
            const result = await generateTestData(taskId, testCount, { replaceGenerated: testSettings.replaceGenerated, requiredCases });
            generatedCount = result.count;
            try {
              const current = await getTestData(taskId, { limit: 1, offset: 0 });
              setTestCounts(old => ({ ...old, [taskId]: current.pagination?.total ?? current.testData.length }));
            } catch { /* The generation response still provides the count. */ }
          } catch (caught) {
            testGenerationError = caught;
          }
        } else if (!isEditing) {
          setTestCounts(old => ({ ...old, [taskId]: 0 }));
        }

        if (!isEditing && manualTestsToSave.length) {
          try {
            await addTestData(taskId, manualTestsToSave);
            const current = await getTestData(taskId, { limit: 1, offset: 0 });
            setTestCounts(old => ({ ...old, [taskId]: current.pagination?.total ?? current.testData.length }));
          } catch (caught) {
            manualTestSaveError = caught;
          }
        }
      }

      setNewTask(emptyTaskDraft());
      setDraftManualTests([]);
      setEditingTaskId(null);
      setShowCreateTask(false);
      setTaskEditorTab("statement");
      if (!preview()) await load();
      if (!isEditing && savedTask) {
        await openTaskTests(savedTask);
        if (preview() && manualTestsToSave.length) {
          setTaskTests(old => [...old, ...manualTestsToSave.map((test, index) => ({ ...test, id: Date.now() + index, source: "MANUAL" as const }))]);
          setTestCounts(old => ({ ...old, [savedTask!.id]: (old[savedTask!.id] || 0) + manualTestsToSave.length }));
        }
      }
      if (testGenerationError) {
        const detail = getErrorMessageFromUnknown(testGenerationError, tr("перевірте умову задачі й спробуйте ще раз", "check the problem statement and try again"));
        setError(tr("Задачу додано, але тести не згенерувалися (" + detail + "). Натисніть «Згенерувати тести» нижче, щоб повторити.", "The problem was added, but tests were not generated (" + detail + "). Use the test controls below to retry."));
      } else if (generatedCount > 0) {
        showToast({ type: "success", message: tr("Задачу додано до контрольної разом із " + generatedCount + " тестами.", "Problem added to the assessment with " + generatedCount + " tests.") });
      } else if (isEditing) {
        showToast({ type: "success", message: tr("Практичну задачу оновлено.", "Practice problem updated.") });
      } else {
        showToast({ type: "success", message: tr("Задачу додано. Додайте умову, щоб згенерувати тести.", "Problem added. Add a statement to generate tests.") });
      }
      if (manualTestSaveError) {
        setError(getErrorMessageFromUnknown(manualTestSaveError, tr("Задачу створено, але власні тести не збереглися. Додайте їх через «Налаштувати тести».", "The problem was created, but custom tests were not saved. Add them through “Manage tests”.")));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти практичну задачу.", "Could not save the practice problem.")));
    } finally {
      setBusy(false);
    }
  };
  const generateTaskTests = async (task: ControlTask) => {
    const count = Math.max(1, Math.min(50, Number(testSettings.count) || 5));
    setGeneratingTestsFor(task.id);
    setTestEditorBusy(true);
    setError(null);
    try {
      if (preview()) {
        setTestCounts(old => ({ ...old, [task.id]: count }));
        setTaskTests(Array.from({ length: count }, (_, index) => ({ id: Date.now() + index, input: `${index + 1}`, expectedOutput: `${index + 1}`, points: 1, source: "AI_GENERATED" } as TestData)));
      } else {
        const requiredCases = testSettings.requiredCases.split(/\r?\n/).map(value => value.trim().slice(0, 240)).filter(Boolean).slice(0, 24);
        const result = await generateTestData(task.id, count, { replaceGenerated: testSettings.replaceGenerated, requiredCases });
        let currentCount = testSettings.replaceGenerated ? result.count : (testCounts[task.id] ?? 0) + result.count;
        try {
          const current = await getTestData(task.id, { limit: 1, offset: 0 });
          currentCount = current.pagination?.total ?? current.testData.length;
        } catch {
          // Keep the count returned by generation if the follow-up refresh fails.
        }
        setTestCounts(old => ({ ...old, [task.id]: currentCount }));
        if (testEditorTask?.id === task.id) {
          try {
            const refreshed = await getTestData(task.id, { limit: 100, offset: 0 });
            setTaskTests(refreshed.testData || []);
          } catch { /* Keep the generated count visible if refreshing the list fails. */ }
        }
        showToast({ type: "success", message: tr(`Додано ${result.count} тестів до задачі «${task.title}».`, `Added ${result.count} tests to “${task.title}”.`) });
      }
      if (preview()) showToast({ type: "success", message: tr(`Для задачі «${task.title}» підготовлено ${count} тестів.`, `Prepared ${count} tests for “${task.title}”.`) });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr(`Не вдалося згенерувати тести для «${task.title}».`, `Could not generate tests for “${task.title}”.`)));
    } finally {
      setGeneratingTestsFor(null);
      setTestEditorBusy(false);
    }
  };

  const clearGeneratedTaskTests = async (task: ControlTask) => {
    if (!window.confirm(tr("Видалити всі згенеровані AI-тести?", "Delete all AI-generated tests?"))) return;
    setTestEditorBusy(true);
    setError(null);
    try {
      if (preview()) {
        setTaskTests(old => old.filter(test => test.source !== "AI_GENERATED"));
      } else {
        await deleteGeneratedTestData(task.id);
        const refreshed = await getTestData(task.id, { limit: 100, offset: 0 });
        setTaskTests(refreshed.testData || []);
        setTestCounts(old => ({ ...old, [task.id]: refreshed.pagination?.total ?? refreshed.testData.length }));
      }
      setTestNotice(tr("AI-тести очищено.", "AI-generated tests removed."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося очистити AI-тести.", "Could not clear AI-generated tests.")));
    } finally {
      setTestEditorBusy(false);
    }
  };

  const generateTaskCondition = async () => {
    if (!control?.topic?.id || !newTask.title.trim()) return;
    setTaskAiBusy("condition");
    setError(null);
    try {
      if (preview()) {
        setNewTask(old => ({ ...old, description: tr(`## Завдання\n\nСтворіть програму для теми **${control.topic?.title || ""}**: ${old.title.trim()}.\n\n### Вхідні дані\nОпишіть значення, які отримує програма.\n\n### Вихідні дані\nВиведіть результат згідно з умовою.`, `## Problem\n\nWrite a program for **${control.topic?.title || ""}**: ${old.title.trim()}.\n\n### Input\nDescribe the values provided to the program.\n\n### Output\nPrint the result as required.`) }));
      } else {
        const response = await api.post(`/topics/${control.topic.id}/tasks/generate-condition`, {
          taskTitle: newTask.title.trim(),
          taskType: "CONTROL",
          difficulty: taskGenerationProfile.difficulty,
          generationGuidance: buildTaskGenerationGuidance(taskGenerationProfile, newTask.generationInstructions, isEn),
          language: isEn ? "en" : "uk",
        });
        setNewTask(old => ({ ...old, description: String(response.data?.description ?? old.description) }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати умову.", "Could not generate the problem statement.")));
    } finally {
      setTaskAiBusy(null);
    }
  };

  const generateTaskTemplate = async () => {
    if (!control?.topic?.id || !newTask.title.trim()) return;
    setTaskAiBusy("template");
    setError(null);
    try {
      if (preview()) {
        setNewTask(old => ({ ...old, template: "def solve():\n    # TODO: read input and implement the solution\n    pass\n\nif __name__ == \"__main__\":\n    solve()\n" }));
      } else {
        const response = await api.post(`/topics/${control.topic.id}/tasks/generate-template`, {
          taskTitle: newTask.title.trim(),
          description: newTask.description.trim(),
          language: isEn ? "en" : "uk",
          generationGuidance: buildTaskGenerationGuidance(taskGenerationProfile, newTask.generationInstructions, isEn),
        });
        setNewTask(old => ({ ...old, template: String(response.data?.template ?? old.template) }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати стартовий код.", "Could not generate starter code.")));
    } finally {
      setTaskAiBusy(null);
    }
  };

  const generateTaskTheory = async () => {
    if (!control?.topic?.id || !newTask.title.trim() || !newTask.description.trim()) return;
    setTaskAiBusy("theory");
    setError(null);
    try {
      if (preview()) {
        setNewTask(old => ({ ...old, theory: tr(`### Як підійти до задачі\n\n1. Визначте потрібні вхідні дані.\n2. Розбийте розв’язання на кроки.\n3. Перевірте крайні випадки.`, `### How to approach the problem\n\n1. Identify the required input.\n2. Break the solution into steps.\n3. Check edge cases.`) }));
      } else {
        const response = await api.post(`/topics/${control.topic.id}/tasks/generate-theory`, {
          taskTitle: newTask.title.trim(),
          taskDescription: newTask.description,
          taskType: "CONTROL",
          difficulty: taskGenerationProfile.difficulty,
          generationGuidance: buildTaskGenerationGuidance(taskGenerationProfile, newTask.generationInstructions, isEn),
          language: isEn ? "en" : "uk",
        });
        setNewTask(old => ({ ...old, theory: String(response.data?.theory ?? old.theory) }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати теорію.", "Could not generate the theory.")));
    } finally {
      setTaskAiBusy(null);
    }
  };

  const openTaskTests = async (task: ControlTask) => {
    if (testEditorTask?.id === task.id) {
      setTestEditorTask(null);
      return;
    }
    setTestEditorTask(task);
    setTaskTests([]);
    setManualTest({ input: "", expectedOutput: "", points: "1", isHidden: true, imageUrls: [] });
    setImportFiles([]);
    setTestNotice(null);
    setError(null);
    setTestEditorBusy(true);
    try {
      if (preview()) {
        const count = testCounts[task.id] || 0;
        setTaskTests(Array.from({ length: count }, (_, index) => ({ id: Date.now() + index, input: `${index + 1}`, expectedOutput: `${index + 1}`, points: 1, source: "AI_GENERATED" } as TestData)));
      } else {
        const result = await getTestData(task.id, { limit: 100, offset: 0 });
        setTaskTests(result.testData || []);
        setTestCounts(old => ({ ...old, [task.id]: result.pagination?.total ?? result.testData.length }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити тести.", "Could not load tests.")));
    } finally {
      setTestEditorBusy(false);
    }
  };

  const addManualTaskTest = async () => {
    if (!testEditorTask || !manualTest.expectedOutput.trim()) return;
    setTestEditorBusy(true);
    setError(null);
    try {
      const item = { input: manualTest.input, expectedOutput: manualTest.expectedOutput, points: Math.max(1, Number(manualTest.points) || 1), isHidden: manualTest.isHidden, imageUrls: manualTest.imageUrls };
      if (preview()) {
        setTaskTests(old => [...old, { ...item, id: Date.now(), source: "MANUAL" as const }]);
      } else {
        await addTestData(testEditorTask.id, [item]);
        const refreshed = await getTestData(testEditorTask.id, { limit: 100, offset: 0 });
        setTaskTests(refreshed.testData || []);
        setTestCounts(old => ({ ...old, [testEditorTask.id]: refreshed.pagination?.total ?? refreshed.testData.length }));
      }
      setManualTest(old => ({ ...old, input: "", expectedOutput: "", imageUrls: [] }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося додати тест.", "Could not add the test.")));
    } finally {
      setTestEditorBusy(false);
    }
  };

  const removeTaskTest = async (test: TestData) => {
    if (!testEditorTask) return;
    setTestEditorBusy(true);
    setError(null);
    try {
      if (preview()) {
        setTaskTests(old => old.filter(item => item.id !== test.id));
        setTestCounts(old => ({ ...old, [testEditorTask.id]: Math.max(0, (old[testEditorTask.id] ?? 0) - 1) }));
      } else {
        await deleteTestData(testEditorTask.id, test.id);
        const refreshed = await getTestData(testEditorTask.id, { limit: 100, offset: 0 });
        setTaskTests(refreshed.testData || []);
        setTestCounts(old => ({ ...old, [testEditorTask.id]: refreshed.pagination?.total ?? refreshed.testData.length }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити тест.", "Could not delete the test.")));
    } finally {
      setTestEditorBusy(false);
    }
  };

  const importTaskTests = async () => {
    if (!testEditorTask || !importFiles.length) return;
    setTestEditorBusy(true);
    setError(null);
    try {
      const parsed = await importTestsFromInOutFiles(importFiles);
      const imported = parsed.tests.map(test => ({ input: test.input, expectedOutput: test.expectedOutput, points: Math.max(1, Number(importTestSettings.points) || 1), isHidden: importTestSettings.isHidden }));
      if (imported.length) {
        if (preview()) {
          setTaskTests(old => [...old, ...imported.map((test, index) => ({ ...test, id: Date.now() + index, source: "MANUAL" } as TestData))]);
        } else {
          await addTestData(testEditorTask.id, imported);
          const refreshed = await getTestData(testEditorTask.id, { limit: 100, offset: 0 });
          setTaskTests(refreshed.testData || []);
          setTestCounts(old => ({ ...old, [testEditorTask.id]: refreshed.pagination?.total ?? refreshed.testData.length }));
        }
      }
      if (parsed.errors.length) setError(parsed.errors.join("; "));
      setImportFiles([]);
      setImportInputKey(old => old + 1);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося імпортувати тести.", "Could not import tests.")));
    } finally {
      setTestEditorBusy(false);
    }
  };

  if (loading) return <div className={root}><div className="h-[600px] animate-pulse rounded-[34px] bg-bg-hover dark:bg-white/[.05]" /></div>;
  if (!control) return <div className={root}>{error || tr("Контрольну не знайдено.", "Assessment not found.")}</div>;

  const tasks = control.tasks || [];
  const quiz = parseQuiz(quizText);
  const hasQuiz = quiz.length > 0;

  const content = (
    <div className={root}>
      <button type="button" onClick={() => navigate(withDevPreview(control.topic?.id ? `/edu/topics/${control.topic.id}` : "/edu"))} className="classroom-text-button classroom-control-back"><ArrowLeft className="size-4" aria-hidden="true" />{tr("До теми", "Back to topic")}</button>
      <header className="classroom-heading"><div><p>{tr("Контрольна робота", "Assessment")} / {control.topic?.title || "EDU"}</p><h1>{control.title || tr("Контрольна робота", "Assessment")}</h1><span>{tr("Завдання, запитання та правила оцінювання.", "Tasks, questions, and grading rules.")}</span></div><div className="classroom-actions"><button type="button" disabled={busy} className="classroom-button classroom-button--primary" onClick={() => void save()}><Save className="size-4" aria-hidden="true" />{busy ? tr("Зберігаємо…", "Saving…") : tr("Зберегти зміни", "Save changes")}</button></div></header>

      {error && <div className="mt-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm text-accent-error dark:text-accent-error">{error}</div>}

      <main className="classroom-control-layout">
        <section className="space-y-6">
          <section className="rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-bg-hover text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn"><FileCheck2 className="h-5 w-5" /></span>
              <div><p className="text-xs font-bold uppercase tracking-[.13em] text-accent-warn">{tr("Склад роботи", "Assessment overview")}</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">{tr("Практичні завдання", "Practice tasks")}</h2></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatusCard active={Boolean(control.hasTheory)} title={tr("Теорія", "Theory")} text={control.hasTheory ? (hasQuiz ? tr("Квіз готовий.", "Quiz is ready.") : tr("Увімкнено, квіз ще не заповнений.", "Enabled, but the quiz is empty.")) : tr("Вимкнено.", "Disabled.")} />
              <StatusCard active={Boolean(control.hasPractice)} title={tr("Практика", "Practice")} text={control.hasPractice ? tr(`${tasks.length} задач у наборі.`, `${tasks.length} problems in the set.`) : tr("Вимкнено.", "Disabled.")} warm />
              <StatusCard active={hasQuiz} title={tr("Квіз", "Quiz")} text={hasQuiz ? tr(`${quiz.length} питань.`, `${quiz.length} questions.`) : tr("Питань ще немає.", "No questions yet.")} />
            </div>
            <div className="mt-6 space-y-3">
              <div className="flex justify-end">
                <button type="button" onClick={() => { setNewTask(emptyTaskDraft()); setDraftManualTests([]); setTaskGenerationProfile(defaultTaskGenerationProfile); setEditingTaskId(null); setTaskEditorTab("statement"); setShowCreateTask(value => !value); }} className="inline-flex items-center gap-2 rounded-xl border border-accent-warn/25 px-4 py-2.5 text-sm font-bold text-accent-warn transition hover:bg-bg-hover dark:border-accent-warn/25 dark:text-accent-warn dark:hover:bg-accent-warn/10">
                  <Plus className="h-4 w-4" />{showCreateTask ? tr("Скасувати", "Cancel") : tr("Додати практичну задачу", "Add practice problem")}
                </button>
              </div>
              {showCreateTask && (
                <div className="rounded-2xl border border-accent-warn/20 bg-bg-hover p-5 dark:border-accent-warn/20 dark:bg-[var(--surface-warning)]">
                  <p className="text-sm font-bold">{editingTaskId ? tr("Редагувати практичну задачу", "Edit practice problem") : tr("Нова задача контрольної", "New assessment problem")}</p>
                  <TaskAuthoringFields
                    idPrefix="control-task"
                    topicId={control.topic?.id}
                    taskType="CONTROL"
                    responseLanguage={isEn ? "en" : "uk"}
                    value={newTask}
                    onChange={patch => setNewTask(old => ({ ...old, ...patch }))}
                    generationGuidance={newTask.generationInstructions}
                    onGenerationGuidanceChange={generationInstructions => setNewTask(old => ({ ...old, generationInstructions }))}
                    generationProfile={taskGenerationProfile}
                    onGenerationProfileChange={setTaskGenerationProfile}
                    guidanceEnabled={!editingTaskId && !preview()}
                    selectedTab={taskEditorTab}
                    onSelectedTabChange={setTaskEditorTab}
                    aiBusy={taskAiBusy}
                    busy={busy}
                    onGenerateCondition={() => void generateTaskCondition()}
                    onGenerateTemplate={() => void generateTaskTemplate()}
                    onGenerateTheory={() => void generateTaskTheory()}
                  />
                  <section className="mt-5 rounded-xl border border-border/10 bg-white/60 p-4 dark:border-white/10 dark:bg-black/10" aria-label={tr("Налаштування тестів", "Test settings")}>
                    <h3 className="text-sm font-bold">{tr("Налаштування тестів", "Test settings")}</h3>
                    <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Налаштуйте кількість і покриття тестів. Після збереження їх можна переглянути, змінити, імпортувати або доповнити вручну.", "Choose the test count and coverage. After saving, review, import, edit, or add tests manually.")}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-semibold">{tr("Кількість тестів", "Test count")}<input type="number" min="1" max="50" value={testSettings.count} onChange={event => setTestSettings(old => ({ ...old, count: event.target.value }))} className="mt-2 w-full rounded-xl border border-border/10 bg-white px-3 py-3 text-sm dark:border-white/10 dark:bg-bg-code" /></label>
                      <label className="text-sm font-semibold">{tr("Випадки для тестів · один на рядок", "Test cases · one per line")}<textarea value={testSettings.requiredCases} onChange={event => setTestSettings(old => ({ ...old, requiredCases: event.target.value }))} rows={3} maxLength={4000} placeholder={tr("Мінімальний ввід\nПовторювані значення\nГраничне значення", "Smallest input\nRepeated values\nBoundary value")} className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-3 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
                    </div>
                    <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-text-muted dark:text-text-secondary"><input type="checkbox" checked={testSettings.replaceGenerated} onChange={event => setTestSettings(old => ({ ...old, replaceGenerated: event.target.checked }))} className="mt-0.5 size-4 accent-primary" />{tr("Замінювати попередні AI-тести під час повторної генерації. Ручні тести залишаться.", "Replace previous AI tests when generating again. Manual tests are kept.")}</label>
                    <p className="mt-3 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Тести згенеруються автоматично, якщо в задачі вже є умова. Стартовий код необов’язковий.", "Tests will be generated automatically when the task has a statement. Starter code is optional.")}</p>
                  </section>
                  {!editingTaskId && <section className="mt-4 rounded-xl border border-border/10 bg-white/60 p-4 dark:border-white/10 dark:bg-black/10" aria-label={tr("Власні тестові випадки", "Custom test cases")}>
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold">{tr("Власні тестові випадки", "Custom test cases")}</h3><p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Додайте свої вхідні дані й очікувані відповіді зараз — вони збережуться разом із задачею та не видаляться під час заміни AI-тестів.", "Add your input and expected output now. They will be saved with the problem and kept when AI tests are replaced.")}</p></div><span className="rounded-full bg-bg-hover px-2.5 py-1 text-xs font-bold dark:bg-white/[.06]">{draftManualTests.length}</span></div>
                    {!!draftManualTests.length && <ol className="mt-3 space-y-2">{draftManualTests.map((test, index) => <li key={`${index}-${test.input}`} className="flex items-start justify-between gap-3 rounded-lg bg-bg-hover p-3 text-xs dark:bg-white/[.04]"><div className="min-w-0"><p className="font-bold">{tr("Власний тест", "Custom test")} {index + 1} · {test.isHidden ? tr("прихований", "hidden") : tr("відкритий", "sample")} · {test.points} {tr("балів", "points")}</p><p className="mt-1 truncate font-mono">{tr("Ввід:", "Input:")} {test.input || "∅"} → {test.expectedOutput}</p></div><button type="button" className="text-xs font-bold text-accent-error" aria-label={tr(`Видалити власний тест ${index + 1}`, `Remove custom test ${index + 1}`)} onClick={() => setDraftManualTests(old => old.filter((_, draftIndex) => draftIndex !== index))}>{tr("Прибрати", "Remove")}</button></li>)}</ol>}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{tr("Вхідні дані", "Input")}<textarea value={manualTest.input} onChange={event => setManualTest(old => ({ ...old, input: event.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-border/10 bg-white p-3 font-mono text-xs dark:border-white/10 dark:bg-bg-code" /></label><label className="text-xs font-bold">{tr("Очікуваний результат", "Expected output")}<textarea value={manualTest.expectedOutput} onChange={event => setManualTest(old => ({ ...old, expectedOutput: event.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-border/10 bg-white p-3 font-mono text-xs dark:border-white/10 dark:bg-bg-code" /></label></div>
                    <TestImageAttachments value={manualTest.imageUrls} onChange={imageUrls => setManualTest(old => ({ ...old, imageUrls }))} disabled={busy} />
                    <div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-xs font-semibold">{tr("Балів", "Points")} <input type="number" min="1" value={manualTest.points} onChange={event => setManualTest(old => ({ ...old, points: event.target.value }))} className="ml-1 w-16 rounded-lg border border-border/10 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-bg-code" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={manualTest.isHidden} onChange={event => setManualTest(old => ({ ...old, isHidden: event.target.checked }))} />{tr("Прихований тест", "Hidden test")}</label><button type="button" disabled={busy || !manualTest.expectedOutput.trim()} onClick={() => { setDraftManualTests(old => [...old, { input: manualTest.input, expectedOutput: manualTest.expectedOutput, points: Math.max(1, Number(manualTest.points) || 1), isHidden: manualTest.isHidden, imageUrls: [...manualTest.imageUrls] }]); setManualTest(old => ({ ...old, input: "", expectedOutput: "", imageUrls: [] })); }} className="classroom-button">{tr("Додати власний тест", "Add custom test")}</button></div>
                  </section>}
                  <button type="button" disabled={busy || !!taskAiBusy || !newTask.title.trim()} onClick={() => void createTask()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground">{busy ? (editingTaskId ? tr("Зберігаємо…", "Saving…") : tr("Додаємо…", "Adding…")) : editingTaskId ? tr("Зберегти зміни", "Save changes") : tr("Додати до контрольної", "Add to assessment")}</button>
                </div>
              )}
              {tasks.map((task, index) => <React.Fragment key={task.id}><div className="flex items-start gap-4 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.045]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-xs font-extrabold text-accent-warn shadow-sm dark:bg-bg-base dark:text-accent-warn">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-bold">{task.title}</p><div className="flex items-center gap-2"><button type="button" className="classroom-text-button" onClick={() => openTaskEditor(task)} aria-label={tr("Редагувати задачу " + task.title, "Edit problem " + task.title)}><Pencil className="size-3.5" aria-hidden="true" />{tr("Редагувати", "Edit")}</button><button type="button" className="classroom-text-button classroom-text-button--danger" disabled={busy || control.isAssigned || task.isAssigned} title={control.isAssigned || task.isAssigned ? tr("Спершу закрийте доступ до контрольної.", "Close assessment access first.") : undefined} onClick={() => void deleteTask(task)} aria-label={tr("Видалити задачу " + task.title, "Delete problem " + task.title)}><Trash2 className="size-3.5" aria-hidden="true" />{tr("Видалити", "Delete")}</button></div></div><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{task.description || tr("Практична частина контрольної.", "Practice section of the assessment.")}</p><div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-xs font-semibold text-text-muted dark:text-text-secondary">{tr("Тестів", "Tests")}: {testCounts[task.id] ?? 0}</span><button type="button" disabled={testEditorBusy || busy} onClick={() => void openTaskTests(task)} className="classroom-text-button"><FlaskConical className="size-3.5" aria-hidden="true" />{testEditorTask?.id === task.id ? tr("Закрити тести", "Close tests") : tr("Налаштувати тести", "Manage tests")}</button>{testEditorTask?.id === task.id && <button type="button" disabled={generatingTestsFor !== null || busy || testEditorBusy || !task.description?.trim()} onClick={() => void generateTaskTests(task)} className="classroom-text-button"><Sparkles className="size-3.5" aria-hidden="true" />{generatingTestsFor === task.id ? tr("Генеруємо…", "Generating…") : tr("Згенерувати ще", "Generate more")}</button>}</div></div></div>{testEditorTask?.id === task.id && <section className="ml-12 space-y-4 rounded-2xl border border-border/10 bg-white/70 p-4 dark:border-white/10 dark:bg-black/10" aria-label={tr("Керування тестами", "Test management")}>
                <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{tr("Тестові дані", "Test cases")}</h3><span className="text-xs text-text-muted dark:text-text-secondary">{testEditorBusy ? tr("Оновлюємо…", "Loading…") : taskTests.length}</span></div>
                {testNotice && <p role="status" aria-live="polite" className="rounded-xl bg-bg-hover px-3 py-2 text-xs text-text-muted dark:bg-white/[.04]">{testNotice}</p>}
                <div className="grid gap-3 sm:grid-cols-[120px_1fr]"><label className="text-xs font-bold">{tr("Кількість тестів", "Test count")}<input type="number" min="1" max="50" value={testSettings.count} onChange={event => setTestSettings(old => ({ ...old, count: event.target.value }))} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-bg-code" /></label><label className="text-xs font-bold">{tr("Випадки, які мають покрити тести · один на рядок", "Cases to cover · one per line")}<textarea value={testSettings.requiredCases} onChange={event => setTestSettings(old => ({ ...old, requiredCases: event.target.value }))} rows={3} maxLength={4000} className="mt-1 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-2 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label></div>
                <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs text-text-muted dark:text-text-secondary"><input type="checkbox" checked={testSettings.replaceGenerated} onChange={event => setTestSettings(old => ({ ...old, replaceGenerated: event.target.checked }))} />{tr("Замінювати попередні AI-тести. Ручні тести залишаться.", "Replace previous AI tests. Manual tests are kept.")}</label><button type="button" disabled={testEditorBusy || !taskTests.some(test => test.source === "AI_GENERATED")} onClick={() => void clearGeneratedTaskTests(task)} className="text-xs font-bold text-accent-error disabled:opacity-40">{tr("Очистити AI-тести", "Clear AI tests")}</button></div>
                {taskTests.map((test, testIndex) => <div key={test.id} className="grid gap-2 rounded-xl bg-bg-hover p-3 text-xs dark:bg-white/[.04] sm:grid-cols-[1fr_1fr_auto]"><div className="min-w-0"><span className="font-bold">{tr("Ввід", "Input")}</span><pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap font-mono">{test.input || "∅"}</pre></div><div className="min-w-0"><span className="font-bold">{tr("Очікуваний результат", "Expected output")}</span><pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap font-mono">{test.expectedOutput || "∅"}</pre>{!!test.imageUrls?.length && <div className="mt-2 flex gap-1">{test.imageUrls.map((url, imageIndex) => <img key={`${url}-${imageIndex}`} src={url} alt={tr(`Зображення тесту ${testIndex + 1}`, `Test ${testIndex + 1} image`)} className="h-10 w-12 rounded-md border border-border object-cover" loading="lazy" />)}</div>}<p className="mt-1 text-[10px] text-text-muted dark:text-text-secondary">{tr("Балів", "Points")}: {test.points} · {test.isHidden ? tr("прихований", "hidden") : tr("відкритий", "sample")} · {test.source || "MANUAL"}</p></div><button type="button" disabled={testEditorBusy} onClick={() => void removeTaskTest(test)} className="text-left font-bold text-accent-error sm:text-right">{tr(`Видалити №${testIndex + 1}`, `Delete #${testIndex + 1}`)}</button></div>)}
                {!taskTests.length && <p className="rounded-xl border border-dashed border-border/15 px-4 py-5 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Тестів поки немає. Згенеруйте їх, додайте вручну або імпортуйте .in/.out файли.", "No tests yet. Generate them, add one manually, or import .in/.out files.")}</p>}
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{tr("Вхідні дані", "Input")}<textarea value={manualTest.input} onChange={event => setManualTest(old => ({ ...old, input: event.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-border/10 bg-white p-3 font-mono text-xs dark:border-white/10 dark:bg-bg-code" /></label><label className="text-xs font-bold">{tr("Очікуваний результат", "Expected output")}<textarea value={manualTest.expectedOutput} onChange={event => setManualTest(old => ({ ...old, expectedOutput: event.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-border/10 bg-white p-3 font-mono text-xs dark:border-white/10 dark:bg-bg-code" /></label></div>
                <TestImageAttachments value={manualTest.imageUrls} onChange={imageUrls => setManualTest(old => ({ ...old, imageUrls }))} disabled={testEditorBusy} />
                <div className="flex flex-wrap items-center gap-3"><label className="text-xs font-semibold">{tr("Балів", "Points")} <input type="number" min="1" value={manualTest.points} onChange={event => setManualTest(old => ({ ...old, points: event.target.value }))} className="ml-1 w-16 rounded-lg border border-border/10 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-bg-code" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={manualTest.isHidden} onChange={event => setManualTest(old => ({ ...old, isHidden: event.target.checked }))} />{tr("Прихований тест", "Hidden test")}</label><button type="button" disabled={testEditorBusy || !manualTest.expectedOutput.trim()} onClick={() => void addManualTaskTest()} className="classroom-button">{tr("Додати тест вручну", "Add test manually")}</button></div>
                <div className="flex flex-wrap items-center gap-3 border-t border-border/10 pt-3 dark:border-white/10"><label className="inline-flex items-center gap-2 text-xs font-semibold"><Upload className="size-4" />{tr("Імпорт .in/.out", "Import .in/.out")}<input key={importInputKey} type="file" accept=".in,.out" multiple className="max-w-48 text-xs" onChange={event => setImportFiles(Array.from(event.target.files || []))} /></label><label className="text-xs font-semibold">{tr("Балів за тест", "Points per test")}<input type="number" min="1" max="100" value={importTestSettings.points} onChange={event => setImportTestSettings(old => ({ ...old, points: event.target.value }))} className="ml-2 w-20 rounded-lg border border-border/10 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-bg-code" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={importTestSettings.isHidden} onChange={event => setImportTestSettings(old => ({ ...old, isHidden: event.target.checked }))} />{tr("Приховані", "Hidden")}</label><button type="button" disabled={testEditorBusy || !importFiles.length} onClick={() => void importTaskTests()} className="classroom-button">{tr("Імпортувати", "Import files")}</button></div>
              </section>}</React.Fragment>)}
              {!tasks.length && <p className="rounded-2xl border border-dashed border-border/15 px-5 py-8 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Практичних задач ще немає.", "No practice problems yet.")}</p>}
            </div>
          </section>

          <section className="classroom-quiz-editor">
            <div className="classroom-section-title"><h2>{tr("Запитання квізу", "Quiz questions")}<span>{quiz.length}</span></h2></div>
            <section className="mt-4 rounded-2xl border border-border/10 bg-bg-hover/70 p-4 dark:border-white/10 dark:bg-white/[.035]" aria-label={tr("Налаштування генерації квізу", "Quiz generation settings")}>
              <div className="mb-3"><h3 className="text-sm font-bold">{tr("Налаштування генерації", "Generation settings")}</h3><p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Вкажіть кількість і рівень. Згенеровані питання можна буде відредагувати або видалити вручну.", "Choose the number and level. You can edit or remove generated questions afterward.")}</p></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-bold">{tr("Кількість запитань", "Number of questions")}<input aria-label={tr("Кількість запитань квізу", "Quiz question count")} type="number" min="1" max="50" value={quizGenerationSettings.count} onChange={event => setQuizGenerationSettings(old => ({ ...old, count: event.target.value }))} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-bg-code" /></label>
                <label className="text-xs font-bold">{tr("Складність", "Difficulty")}<select aria-label={tr("Складність квізу", "Quiz difficulty")} value={quizGenerationSettings.difficulty} onChange={event => setQuizGenerationSettings(old => ({ ...old, difficulty: event.target.value }))} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-bg-code">{[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>{tr(`${level} · ${["Початкова", "Легка", "Середня", "Висока", "Поглиблена"][level - 1]}`, `${level} · ${["Introductory", "Easy", "Intermediate", "Advanced", "Expert"][level - 1]}`)}</option>)}</select></label>
                <label className="text-xs font-bold">{tr("Фокус запитань", "Question focus")}<select aria-label={tr("Фокус запитань квізу", "Quiz question focus")} value={quizGenerationSettings.questionStyle} onChange={event => setQuizGenerationSettings(old => ({ ...old, questionStyle: event.target.value as QuizQuestionStyle }))} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-bg-code"><option value="MIXED">{tr("Змішаний", "Mixed")}</option><option value="CONCEPTS">{tr("Поняття й правила", "Concepts and rules")}</option><option value="CODE_READING">{tr("Читання коду", "Code reading")}</option><option value="DEBUGGING">{tr("Пошук помилок", "Debugging")}</option></select></label>
                <label className="text-xs font-bold">{tr("Обсяг коду", "Code length")}<select aria-label={tr("Обсяг коду у питаннях", "Code length in questions")} value={quizGenerationSettings.codeLength} onChange={event => setQuizGenerationSettings(old => ({ ...old, codeLength: event.target.value as QuizCodeLength }))} disabled={quizGenerationSettings.questionStyle === "CONCEPTS"} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-bg-code"><option value="SHORT">{tr("Компактний", "Compact")}</option><option value="MEDIUM">{tr("Середній", "Medium")}</option><option value="LONG">{tr("Розгорнутий", "Extended")}</option></select></label>
              </div>
              <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{tr("Питання, які посилаються на код, завжди міститимуть сам фрагмент. Для розгорнутого обсягу генератор створює змістовніші приклади коду.", "Questions that refer to code will include the snippet. Extended length creates more substantial code examples.")}</p>
              <label className="mt-3 block text-xs font-bold">{tr("Що врахувати генератору", "Additional instructions")}<textarea value={quizGenerationSettings.guidance} onChange={event => setQuizGenerationSettings(old => ({ ...old, guidance: event.target.value }))} rows={3} maxLength={4000} placeholder={tr("Наприклад: для учнів 8 класу; зосередься на циклах і масивах; не включай теми, яких ще не проходили.", "For example: for grade 8; focus on loops and arrays; avoid topics not covered yet.")} className="mt-1 w-full resize-y rounded-xl border border-border/10 bg-white p-3 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
              {hasQuiz && <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{tr("Повторна генерація замінить поточні запитання квізу.", "Regenerating replaces the current quiz questions.")}</p>}
              <button type="button" className="classroom-button mt-3" disabled={busy} onClick={() => void generateQuiz()}><Wand2 className="mr-2 inline size-4" aria-hidden="true" />{busy ? tr("Готуємо…", "Preparing…") : tr(`Згенерувати ${Math.max(1, Math.min(50, Number(quizGenerationSettings.count) || 10))} запитань`, `Generate ${Math.max(1, Math.min(50, Number(quizGenerationSettings.count) || 10))} questions`)}</button>
            </section>
            <p className="classroom-caption">{tr("Введіть запитання й варіанти відповідей. Позначте правильну відповідь кружечком.", "Enter a question and its answer options. Mark the correct answer using the circle.")}</p>
            {quiz.map((item, index) => <fieldset key={index} className="classroom-quiz-question"><legend>{tr("Запитання", "Question")} {index + 1}</legend><div className="classroom-quiz-question__heading"><div className="min-w-0 flex-1"><textarea ref={element => { quizQuestionRefs.current[index] = element; }} aria-label={tr(`Текст запитання ${index + 1}`, `Question ${index + 1} text`)} value={item.question || ""} onChange={event => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, question: event.target.value } : q), null, 2))} rows={2} placeholder={tr("Введіть запитання…", "Enter a question…")} /><div className="mt-1 flex justify-end"><MarkdownImageInsertButton value={item.question || ""} onChange={question => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, question } : q), null, 2))} textareaRef={{ current: quizQuestionRefs.current[index] }} className="text-xs" /></div></div><button type="button" className="classroom-icon-button" aria-label={tr(`Прибрати запитання ${index + 1}`, `Remove question ${index + 1}`)} onClick={() => setQuizText(JSON.stringify(quiz.filter((_, i) => i !== index), null, 2))}><Trash2 className="size-4" aria-hidden="true" /></button></div><div className="classroom-quiz-options">{Object.entries(item.options || { A: "", B: "", C: "", D: "" }).map(([key, value]) => <label key={key}><input type="radio" name={`quiz-correct-${index}`} checked={item.correct === key} aria-label={tr(`Правильна відповідь ${key} для запитання ${index + 1}`, `Correct answer ${key} for question ${index + 1}`)} onChange={() => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, correct: key } : q), null, 2))} /><span>{key}</span><input type="text" aria-label={tr(`Варіант ${key} запитання ${index + 1}`, `Question ${index + 1} option ${key}`)} value={value} onChange={event => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, options: { ...q.options, [key]: event.target.value } } : q), null, 2))} placeholder={tr("Варіант відповіді", "Answer option")} /></label>)}</div></fieldset>)}
            <button type="button" className="classroom-add-row" onClick={() => setQuizText(JSON.stringify([...quiz, { question: "", options: { "А": "", "Б": "", "В": "", "Г": "", "Д": "" }, correct: "А" }], null, 2))}><Plus className="size-4" aria-hidden="true" />{tr("Додати запитання", "Add question")}</button>
            <details className="classroom-quiz-source"><summary>{tr("Імпорт і розширений формат", "Import and advanced format")}</summary><p className="classroom-caption">{tr("Тут можна вставити набір запитань у форматі JSON.", "Paste a set of questions in JSON format here.")}</p><textarea aria-label={tr("Запитання у форматі JSON", "Questions in JSON format")} value={quizText} onChange={event => setQuizText(event.target.value)} rows={8} spellCheck={false} /><button type="button" className="classroom-text-button" onClick={normalizeQuiz}>{tr("Перевірити формат", "Check format")}</button></details>
          </section>

        </section>

        <aside className="rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{tr("Налаштування", "Settings")}</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">{tr("Параметри роботи", "Assessment settings")}</h2>
          <label className="mt-6 block text-sm font-bold">{tr("Назва", "Title")}<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-border/10 bg-bg-surface px-3 py-3 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
          <label className="mt-4 block text-sm font-bold">{tr("Час, хв", "Time, min")}<input value={minutes} onChange={(event) => setMinutes(event.target.value)} type="number" min="1" className="mt-2 w-full rounded-xl border border-border/10 bg-bg-surface px-3 py-3 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
          <div className="mt-6 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.045]">
            <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-primary-strong dark:text-primary-soft" /><p className="text-sm font-bold">{tr("Формула результату", "Score formula")}</p></div>
            <textarea value={formula} onChange={(event) => setFormula(event.target.value)} rows={3} className="mt-3 w-full resize-none rounded-xl border border-border/10 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-bg-code" />
            <p className="mt-2 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Наприклад:", "For example:")} <code>0.35 * test + 0.65 * avg(practice)</code></p>
          </div>
          <button type="button" disabled={busy} onClick={() => void save()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Save className="h-4 w-4" />{busy ? tr("Зберігаємо…", "Saving…") : tr("Зберегти", "Save")}</button>
        </aside>
      </main>
    </div>
  );
  return parentClass ? <ClassWorkspaceFrame classId={parentClass.id} className={parentClass.name} active="learning">{content}</ClassWorkspaceFrame> : <div className="classroom-frame__body">{content}</div>;
};

const StatusCard: React.FC<{ active: boolean; title: string; text: string; warm?: boolean }> = ({ active, title, text, warm = false }) => (
  <div className={`classroom-control-status ${active ? "is-active" : ""}`}>
    <div className="flex items-center gap-2">
      {warm ? <Clock3 className="h-4 w-4 text-accent-warn" /> : <FileCheck2 className="h-4 w-4 text-primary-strong dark:text-primary-soft" />}
      <p className="text-sm font-bold">{title}</p>
    </div>
    <p className="mt-2 text-sm text-text-muted dark:text-text-secondary">{text}</p>
  </div>
);
