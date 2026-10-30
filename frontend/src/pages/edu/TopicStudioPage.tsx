import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FlaskConical,
  ListChecks,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  TerminalSquare,
  Trash2,
  Upload,
  X,
  ChevronDown,
  Search,
} from "lucide-react";
import { api } from "../../lib/api/client";
import {
  addTestData,
  deleteGeneratedTestData,
  deleteTestData,
  generateTestData,
  getTestData,
  unassignControlWork,
  unassignTask,
  updateControlWorkFormula,
  type TestData,
} from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { MarkdownView } from "../../components/MarkdownView";
import { useDialogA11y } from "../../components/ui/useDialogA11y";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { ClassWorkspaceFrame } from "./ClassWorkspaceNavigation";
import { TaskAuthoringFields, type TaskAuthoringTab } from "./TaskAuthoringFields";
import { buildTaskGenerationGuidance, defaultTaskGenerationProfile, type TaskGenerationProfile } from "./taskGenerationSettings";
import { TestImageAttachments } from "../../components/TestImageAttachments";
import { withDevPreview } from "../../lib/devPreview";

type TopicTask = {
  id: number;
  title: string;
  description?: string;
  template?: string;
  taskMode?: "CODE" | "WEB";
  projectSpec?: unknown;
  webTemplateFiles?: unknown;
  webValidationRules?: unknown;
  webValidationProfile?: unknown;
  type: "PRACTICE" | "CONTROL" | string;
  maxAttempts?: number;
  isAssigned?: boolean;
  deadline?: string | null;
  theory?: { content: string } | null;
};

type Control = {
  id: number;
  title?: string | null;
  timeLimitMinutes?: number | null;
  isAssigned?: boolean;
  deadline?: string | null;
  hasTheory?: boolean;
  hasPractice?: boolean;
  formula?: string | null;
};

type Topic = {
  id: number;
  title: string;
  description?: string | null;
  language: string;
  class?: { id: number; name?: string } | null;
  tasks?: TopicTask[];
  controlWorks?: Control[];
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-topic-studio min-h-[100dvh] bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-10 lg:py-10";
const defaultControlFormula = "0.35 * test + 0.65 * avg(practice)";
const defaultAssignmentDeadline = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const toDateTimeLocalValue = (value?: string | null) => {
  const date = new Date(value || defaultAssignmentDeadline());
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
};
const fromDateTimeLocalValue = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const getAssignmentErrorMessage = (error: unknown, fallback: string) => {
  const message = getErrorMessageFromUnknown(error, fallback);
  switch (message) {
    case "CLASS_HAS_NO_STUDENTS":
      return tr("У цьому класі ще немає учнів. Додайте учнів, а потім відкрийте контрольну ще раз.", "This class has no students yet. Add students, then open the test again.");
    case "CLASS_NOT_FOUND":
      return tr("Клас для цієї теми не знайдено. Оновіть сторінку та перевірте прив’язку теми.", "The class for this topic could not be found. Refresh and check the topic assignment.");
    case "ACCESS_DENIED":
      return tr("У вас немає доступу, щоб змінити доступність цієї контрольної.", "You do not have permission to change access to this test.");
    default:
      return message;
  }
};
const previewTemplateForLanguage = (language: string) => {
  switch (language.toUpperCase()) {
    case "JAVA":
      return "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    // TODO: read input and implement the solution\n  }\n}\n";
    case "CPP":
      return "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  // TODO: read input and implement the solution\n  return 0;\n}\n";
    case "C":
      return "#include <stdio.h>\n\nint main(void) {\n  // TODO: read input and implement the solution\n  return 0;\n}\n";
    case "CSHARP":
      return "using System;\n\nclass Program {\n  static void Main() {\n    // TODO: read input and implement the solution\n  }\n}\n";
    case "KOTLIN":
      return "fun main() {\n    // TODO: read input and implement the solution\n}\n";
    case "JS":
      return "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n// TODO: read input and implement the solution\nconsole.log(input);\n";
    case "GO":
      return "package main\n\nimport \"fmt\"\n\nfunc main() {\n    // TODO: read input and implement the solution\n    fmt.Println()\n}\n";
    case "RUST":
      return "use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // TODO: read input and implement the solution\n    print!(\"{}\", input);\n}\n";
    case "PASCAL":
      return "program Main;\nbegin\n  { TODO: read input and implement the solution }\nend.\n";
    case "D":
      return "import std.stdio;\n\nvoid main() {\n    // TODO: read input and implement the solution\n}\n";
    case "DART":
      return "import 'dart:io';\n\nvoid main() {\n  final input = stdin.readAsStringSync();\n  // TODO: read input and implement the solution\n  stdout.write(input);\n}\n";
    case "HASKELL":
      return "import qualified Data.ByteString.Char8 as BS\n\nmain :: IO ()\nmain = do\n  input <- BS.getContents\n  -- TODO: read input and implement the solution\n  BS.putStr input\n";
    case "LISP":
      return "(defun main ()\n  ;; TODO: read input and implement the solution\n  (format t \"~%\"))\n\n(main)\n";
    case "LUA":
      return "local input = io.read(\"*a\")\n-- TODO: read input and implement the solution\nio.write(input)\n";
    case "PERL":
      return "use strict;\nuse warnings;\n\nmy $input = do { local $/; <STDIN> };\n# TODO: read input and implement the solution\nprint $input;\n";
    case "PHP":
      return "<?php\n$input = stream_get_contents(STDIN);\n// TODO: read input and implement the solution\necho $input;\n";
    case "RUBY":
      return "input = STDIN.read\n# TODO: read input and implement the solution\nputs input\n";
    case "SWIFT":
      return "import Foundation\n\nlet input = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? \"\"\n// TODO: read input and implement the solution\nprint(input, terminator: \"\")\n";
    case "PYTHON":
    default:
      return "def solve():\n    # TODO: read input and implement the solution\n    pass\n\nif __name__ == \"__main__\":\n    solve()\n";
  }
};

const demo: Topic = {
  id: 31,
  title: "Колекції та зрізи",
  description: "Тема, де учні переходять від окремих значень до роботи зі структурованими даними.",
  language: "PYTHON",
  class: { id: 31, name: "11-А" },
  tasks: [
    {
      id: 101,
      title: "Словник частот",
      description: "Збери частоти слів у тексті та виведи три найуживаніші.",
      type: "PRACTICE",
      maxAttempts: 3,
      isAssigned: true,
      deadline: null,
    },
    {
      id: 102,
      title: "Маршрут доставки",
      description: "Знайди оптимальний шлях за заданими обмеженнями.",
      type: "PRACTICE",
      maxAttempts: 2,
      isAssigned: false,
    },
  ],
  controlWorks: [
    { id: 12, title: "Контрольна · Колекції", timeLimitMinutes: 45, isAssigned: true, hasTheory: true, hasPractice: true, formula: defaultControlFormula },
  ],
};

const Modal: React.FC<{ title: string; caption?: string; error?: string | null; children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ title, caption, error, children, onClose, wide }) => {
  const titleId = React.useId();
  const panelRef = useDialogA11y({ open: true, onClose });
  return <div data-dialog-a11y="direct" data-material="topic-dialog-scrim" className="topic-editor__scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef as React.RefObject<HTMLElement>} data-dialog-a11y="direct" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-material="topic-dialog" className={`topic-editor ${wide ? "topic-editor--wide" : ""}`}>
      <div className="topic-editor__header">
        <div>
          <p className="classroom-caption">{tr("Редактор теми", "Topic editor")}</p>
          <h2 id={titleId}>{title}</h2>
          {caption && <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted dark:text-text-secondary">{caption}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={tr("Закрити вікно", "Close dialog")} className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-hover text-text-muted transition  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 dark:bg-white/[.07] dark:text-text-primary">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="topic-editor__body">{error && <div className="classroom-notice classroom-notice--error" role="alert">{error}</div>}{children}</div>
    </section>
  </div>;
};

export const TopicStudioPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const id = Number(topicId);
  const [topic, setTopic] = React.useState<Topic | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"task" | "control" | "tests" | null>(null);
  const [topicTab, setTopicTab] = React.useState<"tasks" | "controls">("tasks");
  const [taskQuery, setTaskQuery] = React.useState("");
  const [taskFilter, setTaskFilter] = React.useState<"all" | "assigned" | "draft">("all");
  const [expandedTaskId, setExpandedTaskId] = React.useState<number | null>(null);
  const [editorTab, setEditorTab] = React.useState<TaskAuthoringTab>("statement");
  const [selectedTask, setSelectedTask] = React.useState<TopicTask | null>(null);
  const [editingTaskId, setEditingTaskId] = React.useState<number | null>(null);
  const [tests, setTests] = React.useState<TestData[]>([]);
  const [testNotice, setTestNotice] = React.useState<string | null>(null);
  const [testGenerationCount, setTestGenerationCount] = React.useState("5");
  const [replaceGeneratedTests, setReplaceGeneratedTests] = React.useState(true);
  const [testCoverage, setTestCoverage] = React.useState("");
  const [importFiles, setImportFiles] = React.useState<File[]>([]);
  const [importPoints, setImportPoints] = React.useState("1");
  const [importIsHidden, setImportIsHidden] = React.useState(false);
  const [importInputKey, setImportInputKey] = React.useState(0);
  const [deadlineDrafts, setDeadlineDrafts] = React.useState<Record<number, string>>({});
  const [assignmentBusyId, setAssignmentBusyId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState<"condition" | "template" | "theory" | null>(null);
  const [taskForm, setTaskForm] = React.useState({
    title: "",
    description: "",
    template: "",
    maxAttempts: "3",
    theory: "",
    projectSpecJson: "",
  });
  const [generationInstructions, setGenerationInstructions] = React.useState("");
  const [generationProfile, setGenerationProfile] = React.useState<TaskGenerationProfile>(defaultTaskGenerationProfile);
  const [controlForm, setControlForm] = React.useState({
    title: "",
    timeLimitMinutes: "45",
    hasTheory: true,
    hasPractice: true,
    quizCount: "10",
    practiceCount: "2",
    formula: defaultControlFormula,
  });
  const [testForm, setTestForm] = React.useState({ input: "", expectedOutput: "", points: "1", isHidden: true, imageUrls: [] as string[] });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (preview()) { setTopic({ ...demo, id }); setError(null); return; }
      const response = await api.get(`/topics/${id}`);
      setTopic(response.data.topic ?? response.data);
      setError(null);
    } catch (caught) {
      if (preview()) {
        setTopic(demo);
        setError(null);
      } else {
        setError(getErrorMessageFromUnknown(caught, tr("Не вдалося відкрити тему.", "Could not open the topic.")));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  const backPath = topic?.class?.id ? `/edu/classes/${topic.class.id}${preview() ? "?preview=true" : ""}` : `/edu${preview() ? "?preview=true" : ""}`;

  const openTaskBuilder = () => {
    setError(null);
    setEditorTab("statement");
    setEditingTaskId(null);
    setTaskForm({ title: "", description: "", template: "", maxAttempts: "3", theory: "", projectSpecJson: "" });
    setGenerationInstructions("");
    setGenerationProfile(defaultTaskGenerationProfile);
    setMode("task");
  };

  const openTaskEditor = (task: TopicTask) => {
    setError(null);
    setEditorTab("statement");
    setSelectedTask(task);
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title || "",
      description: task.description || "",
      template: task.template || "",
      maxAttempts: String(task.maxAttempts || 3),
      theory: task.theory?.content || "",
      projectSpecJson: task.projectSpec ? JSON.stringify(task.projectSpec, null, 2) : "",
    });
    setGenerationInstructions("");
    setGenerationProfile(defaultTaskGenerationProfile);
    setMode("task");
  };

  const openControlBuilder = () => {
    setError(null);
    setControlForm((old) => ({
      ...old,
      title: old.title || tr(`Контрольна · ${topic?.title || "тема"}`, `Test · ${topic?.title || "topic"}`),
    }));
    setMode("control");
  };

  const generateCondition = async () => {
    if (!taskForm.title.trim() || !topic) return;
    setAiBusy("condition");
    try {
      if (preview()) {
        setTaskForm((old) => ({
          ...old,
          description: tr(`## Завдання\n\nСтворіть програму для теми **${topic.title}**: ${old.title.trim()}.\n\n### Вхідні дані\nОдин або кілька рядків з даними задачі.\n\n### Вихідні дані\nРезультат обробки у зрозумілому форматі.\n\n### Приклад\n\n\`\`\`\ninput: 5\noutput: 15\n\`\`\``, `## Problem\n\nWrite a program for the topic **${topic.title}**: ${old.title.trim()}.\n\n### Input\nOne or more lines containing the problem data.\n\n### Output\nPrint the processed result in a clear format.\n\n### Example\n\n\`\`\`\ninput: 5\noutput: 15\n\`\`\``)
        }));
        return;
      }
      const response = await api.post(`/topics/${id}/tasks/generate-condition`, {
        taskTitle: taskForm.title.trim(),
        taskType: "PRACTICE",
        difficulty: generationProfile.difficulty,
        generationGuidance: buildTaskGenerationGuidance(generationProfile, generationInstructions, isEn),
        language: isEn ? "en" : "uk",
      });
      setTaskForm((old) => ({ ...old, description: String(response.data?.description ?? old.description) }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати умову.", "Could not generate the problem statement.")));
    } finally {
      setAiBusy(null);
    }
  };

  const generateTemplate = async () => {
    if (!taskForm.title.trim() || !topic) return;
    setAiBusy("template");
    try {
      if (preview()) {
        setTaskForm((old) => ({
          ...old,
          template: previewTemplateForLanguage(topic.language)
        }));
        return;
      }
      const response = await api.post(`/topics/${id}/tasks/generate-template`, {
        taskTitle: taskForm.title.trim(),
        description: taskForm.description,
        language: isEn ? "en" : "uk",
        generationGuidance: buildTaskGenerationGuidance(generationProfile, generationInstructions, isEn),
      });
      setTaskForm((old) => ({ ...old, template: String(response.data?.template ?? old.template) }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати стартовий код.", "Could not generate starter code.")));
    } finally {
      setAiBusy(null);
    }
  };

  const generateTheory = async () => {
    if (!taskForm.description.trim() || !topic) return;
    setAiBusy("theory");
    try {
      if (preview()) {
        setTaskForm((old) => ({
          ...old,
          theory: tr(`### Як думати про задачу\n\n1. Визначте, які дані треба зібрати.\n2. Оберіть структуру даних для теми **${topic.title}**.\n3. Перевірте крайні випадки: порожній ввід, одне значення, повтори.\n\n> Пояснення показується учню перед практикою, якщо ви його залишили.`, `### How to approach the problem\n\n1. Identify the data you need to collect.\n2. Choose a data structure for **${topic.title}**.\n3. Check edge cases: empty input, a single value, and duplicates.\n\n> This explanation is shown to students before practice if you keep it.`)
        }));
        return;
      }
      const response = await api.post(`/topics/${id}/tasks/generate-theory`, {
        taskTitle: taskForm.title.trim(),
        taskDescription: taskForm.description,
        taskType: "PRACTICE",
        difficulty: generationProfile.difficulty,
        generationGuidance: buildTaskGenerationGuidance(generationProfile, generationInstructions, isEn),
        language: isEn ? "en" : "uk",
      });
      setTaskForm((old) => ({ ...old, theory: String(response.data?.theory ?? old.theory) }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати теорію.", "Could not generate the theory.")));
    } finally {
      setAiBusy(null);
    }
  };

  const openTests = async (task: TopicTask) => {
    setSelectedTask(task);
    setTestNotice(null);
    setImportFiles([]);
    setTestCoverage("");
    setMode("tests");
    try {
      if (preview()) {
        setTests([{ id: 1, input: "3\n1 2 3", expectedOutput: "6", points: 1, isHidden: false, source: "MANUAL" } as TestData]);
        return;
      }
      const data = await getTestData(task.id, { limit: 100, offset: 0 });
      setTests(data.testData || []);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити тестові дані.", "Could not load test data.")));
    }
  };

  const reloadTests = async (taskId: number) => {
    const data = await getTestData(taskId, { limit: 100, offset: 0 });
    setTests(data.testData || []);
  };

  const generateTests = async () => {
    if (!selectedTask) return;
    const count = Math.max(1, Math.min(50, Number(testGenerationCount) || 5));
    setBusy(true);
    setTestNotice(null);
    try {
      if (preview()) {
        setTests((old) => [...old, ...Array.from({ length: count }, (_, index) => ({
          id: Date.now() + index,
          input: `${index + 1} ${index + 2} ${index + 3}`,
          expectedOutput: String((index + 1) + (index + 2) + (index + 3)),
          points: 1,
          isHidden: false,
          source: "AI_GENERATED",
        } as TestData))]);
        setTestNotice(tr(`Додано ${count} демонстраційних тестів.`, `Added ${count} demo tests.`));
        return;
      }
      const requiredCases = testCoverage.split(/\r?\n/).map(value => value.trim().slice(0, 240)).filter(Boolean).slice(0, 24);
      const result = await generateTestData(selectedTask.id, count, { replaceGenerated: replaceGeneratedTests, requiredCases });
      await reloadTests(selectedTask.id);
      setTestNotice(tr(`Згенеровано ${result.count} тестів${result.skippedDuplicates ? `; дублі пропущено: ${result.skippedDuplicates}` : ""}.`, `Generated ${result.count} tests${result.skippedDuplicates ? `; skipped duplicates: ${result.skippedDuplicates}` : ""}.`));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати тести.", "Could not generate tests.")));
    } finally {
      setBusy(false);
    }
  };

  const clearGeneratedTests = async () => {
    if (!selectedTask || !window.confirm(tr("Видалити всі згенеровані AI-тести?", "Delete all AI-generated tests?"))) return;
    setBusy(true);
    try {
      if (preview()) {
        setTests((old) => old.filter((test) => test.source !== "AI_GENERATED"));
      } else {
        const result = await deleteGeneratedTestData(selectedTask.id);
        await reloadTests(selectedTask.id);
        setTestNotice(tr(`AI-тести очищено: ${result.deleted}.`, `AI tests removed: ${result.deleted}.`));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося очистити AI-тести.", "Could not clear AI tests.")));
    } finally {
      setBusy(false);
    }
  };

  const importTestFiles = async () => {
    if (!selectedTask || importFiles.length === 0) return;
    setBusy(true);
    setTestNotice(null);
    try {
      const result = await importTestsFromInOutFiles(importFiles);
      if (result.tests.length > 0) {
        const imported = result.tests.map((test) => ({
          input: test.input,
          expectedOutput: test.expectedOutput,
          points: Math.max(1, Number(importPoints) || 1),
          isHidden: importIsHidden,
        }));
        if (preview()) {
          setTests((old) => [...old, ...imported.map((test, index) => ({ ...test, id: Date.now() + index, source: "MANUAL" } as TestData))]);
        } else {
          await addTestData(selectedTask.id, imported);
          await reloadTests(selectedTask.id);
        }
      }
      const problems = result.errors.length ? ` ${result.errors.slice(0, 5).join("; ")}${result.errors.length > 5 ? `; ${tr("ще", "and")} ${result.errors.length - 5}` : ""}` : "";
      setTestNotice(result.tests.length ? tr(`Імпортовано ${result.tests.length} тестів.${problems}`, `Imported ${result.tests.length} tests.${problems}`) : tr(`Не імпортовано жодного тесту.${problems}`, `No tests were imported.${problems}`));
      setImportFiles([]);
      setImportInputKey((value) => value + 1);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося імпортувати тести.", "Could not import tests.")));
    } finally {
      setBusy(false);
    }
  };

  const createTask = async () => {
    if (!taskForm.title.trim()) return;
    setBusy(true);
    try {
      let projectSpec: unknown = null;
      if (taskForm.projectSpecJson.trim()) {
        try {
          projectSpec = JSON.parse(taskForm.projectSpecJson);
        } catch {
          setError(tr("Перевірте JSON опису мініпроєкту.", "Check the mini-project JSON."));
          setBusy(false);
          return;
        }
      }
      let created: TopicTask | null = null;
      if (!preview()) {
        const payload = {
          title: taskForm.title.trim(),
          description: taskForm.description.trim(),
          template: taskForm.template,
          taskMode: editingTaskId ? (selectedTask?.taskMode || "CODE") : "CODE",
          ...(editingTaskId ? {
            webTemplateFiles: selectedTask?.webTemplateFiles,
            webValidationRules: selectedTask?.webValidationRules,
            webValidationProfile: selectedTask?.webValidationProfile,
          } : {}),
          maxAttempts: Number(taskForm.maxAttempts) || 3,
          projectSpec,
        };
        const response = editingTaskId
          ? await api.put(`/topics/${id}/tasks/${editingTaskId}`, payload)
          : await api.post(`/topics/${id}/tasks`, { ...payload, type: "PRACTICE" });
        created = response.data.task ?? response.data.topicTask ?? response.data;
        if ((!created?.id || !created?.title) && response.data.id) created = response.data as TopicTask;
        if (created?.id && taskForm.theory.trim()) {
          await api.post(`/topics/${id}/tasks/${created.id}/theory`, { content: taskForm.theory.trim() });
        } else if (editingTaskId && selectedTask?.theory && !taskForm.theory.trim()) {
          await api.delete(`/topics/${id}/tasks/${editingTaskId}/theory`);
        }
      } else {
        if (editingTaskId) {
          created = {
            ...(topic?.tasks || []).find((task) => task.id === editingTaskId),
            id: editingTaskId,
            title: taskForm.title.trim(),
            description: taskForm.description.trim(),
            template: taskForm.template,
            maxAttempts: Number(taskForm.maxAttempts) || 3,
            theory: taskForm.theory.trim() ? { content: taskForm.theory.trim() } : null,
          } as TopicTask;
          setTopic((old) => old ? { ...old, tasks: (old.tasks || []).map((task) => task.id === editingTaskId ? created as TopicTask : task) } : old);
        } else {
          created = {
            id: Date.now(),
            title: taskForm.title.trim(),
            description: taskForm.description.trim(),
            template: taskForm.template,
            type: "PRACTICE",
            maxAttempts: Number(taskForm.maxAttempts) || 3,
            isAssigned: false,
            theory: taskForm.theory.trim() ? { content: taskForm.theory.trim() } : null,
          };
          setTopic((old) => old ? { ...old, tasks: [...(old.tasks || []), created as TopicTask] } : old);
        }
      }
      const savedTaskId = created?.id;
      setEditingTaskId(null);
      setTaskForm({ title: "", description: "", template: "", maxAttempts: "3", theory: "", projectSpecJson: "" });
      if (!preview()) await load();
      if (savedTaskId) {
        setSelectedTask(created);
        setTestNotice(null);
        setTests([]);
        setMode("tests");
      } else {
        setMode(null);
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося створити практику.", "Could not create the practice task.")));
    } finally {
      setBusy(false);
    }
  };

  const createControl = async () => {
    if (!controlForm.title.trim()) return;
    setBusy(true);
    try {
      if (preview()) {
        setMode(null);
        navigate(`/edu/control-works/12?preview=true`);
        return;
      }
      const response = await api.post(`/topics/${id}/control-works`, {
        title: controlForm.title.trim(),
        timeLimitMinutes: Number(controlForm.timeLimitMinutes) || null,
        hasTheory: controlForm.hasTheory,
        hasPractice: controlForm.hasPractice,
        quizCount: Number(controlForm.quizCount) || 10,
        practiceCount: Number(controlForm.practiceCount) || 2,
      });
      const createdId = Number(response.data?.controlWork?.id ?? response.data?.id ?? 0);
      if (createdId && controlForm.formula.trim()) {
        await updateControlWorkFormula(createdId, controlForm.formula.trim());
      }
      setControlForm({
        title: "",
        timeLimitMinutes: "45",
        hasTheory: true,
        hasPractice: true,
        quizCount: "10",
        practiceCount: "2",
        formula: defaultControlFormula,
      });
      setMode(null);
      if (createdId) navigate(`/edu/control-works/${createdId}`);
      else await load();
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося створити контрольну.", "Could not create the test.")));
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async (task: TopicTask) => {
    if (!window.confirm(tr(`Видалити «${task.title}»?`, `Delete “${task.title}”?`))) return;
    try {
      if (preview()) {
        setTopic((old) => old ? { ...old, tasks: (old.tasks || []).filter((item) => item.id !== task.id) } : old);
      } else {
        await api.delete(`/topics/${id}/tasks/${task.id}`);
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити практику.", "Could not delete the practice task.")));
    }
  };

  const deleteControl = async (control: Control) => {
    const title = control.title || tr("Контрольна робота", "Assessment");
    if (!window.confirm(tr(`Видалити «${title}» разом із відповідями та оцінками учнів?`, `Delete “${title}” along with student responses and grades?`))) return;
    setError(null);
    setAssignmentBusyId(control.id);
    try {
      if (preview()) {
        setTopic((old) => old ? { ...old, controlWorks: (old.controlWorks || []).filter((item) => item.id !== control.id) } : old);
      } else {
        await api.delete(`/topics/control-works/${control.id}`);
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити контрольну.", "Could not delete the assessment.")));
    } finally {
      setAssignmentBusyId(null);
    }
  };

  const deleteTopic = async () => {
    if (!topic?.class?.id) return;
    if (!window.confirm(tr(`Видалити тему «${topic.title}» разом із завданнями, контрольними, відповідями й оцінками учнів?`, `Delete “${topic.title}” with its tasks, assessments, student responses, and grades?`))) return;
    setBusy(true);
    setError(null);
    try {
      if (!preview()) await api.delete(`/topics/${topic.id}`);
      navigate(preview() ? backPath : `/edu/classes/${topic.class.id}?view=learning`);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити тему.", "Could not delete the topic.")));
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (task: TopicTask) => {
    setError(null);
    setAssignmentBusyId(task.id);
    try {
      if (preview()) {
        if (task.isAssigned) {
          setTopic((old) => old ? { ...old, tasks: (old.tasks || []).map((item) => item.id === task.id ? { ...item, isAssigned: false, deadline: null } : item) } : old);
        } else {
          const deadline = fromDateTimeLocalValue(deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline));
          if (!deadline || new Date(deadline).getTime() <= Date.now()) {
            setError(tr("Оберіть майбутній дедлайн доступу до задачі.", "Choose a future access deadline for the task."));
            return;
          }
          setTopic((old) => old ? { ...old, tasks: (old.tasks || []).map((item) => item.id === task.id ? { ...item, isAssigned: true, deadline } : item) } : old);
        }
      } else {
        if (task.isAssigned) await unassignTask(task.id);
        else {
          const deadline = fromDateTimeLocalValue(deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline));
          if (!deadline || new Date(deadline).getTime() <= Date.now()) {
            setError(tr("Оберіть майбутній дедлайн доступу до задачі.", "Choose a future access deadline for the task."));
            return;
          }
          await api.post(`/topics/${id}/tasks/${task.id}/assign`, { deadline });
        }
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося змінити доступність практики.", "Could not change practice access.")));
    } finally {
      setAssignmentBusyId(null);
    }
  };

  const saveTaskDeadline = async (task: TopicTask) => {
    if (!task.isAssigned) return;
    const deadline = fromDateTimeLocalValue(deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline));
    if (!deadline || new Date(deadline).getTime() <= Date.now()) {
      setError(tr("Оберіть майбутній дедлайн доступу до задачі.", "Choose a future access deadline for the task."));
      return;
    }
    setError(null);
    setAssignmentBusyId(task.id);
    try {
      if (preview()) {
        setTopic((old) => old ? { ...old, tasks: (old.tasks || []).map((item) => item.id === task.id ? { ...item, deadline } : item) } : old);
      } else {
        await api.put(`/topics/${id}/tasks/${task.id}`, {
          title: task.title,
          description: task.description || tr("Опис задачі", "Problem statement"),
          template: task.template || "",
          taskMode: task.taskMode || "CODE",
          webTemplateFiles: task.webTemplateFiles,
          webValidationRules: task.webValidationRules,
          webValidationProfile: task.webValidationProfile,
          projectSpec: task.projectSpec ?? null,
          maxAttempts: task.maxAttempts,
          deadline,
        });
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти дедлайн.", "Could not save the deadline.")));
    } finally {
      setAssignmentBusyId(null);
    }
  };

  const toggleControl = async (control: Control) => {
    if (assignmentBusyId === control.id) return;
    setAssignmentBusyId(control.id);
    setError(null);
    try {
      if (preview()) {
        setTopic((old) => old ? { ...old, controlWorks: (old.controlWorks || []).map((item) => item.id === control.id ? { ...item, isAssigned: !item.isAssigned } : item) } : old);
      } else {
        if (control.isAssigned) await unassignControlWork(control.id);
        else await api.post(`/topics/control-works/${control.id}/assign`, { deadline: defaultAssignmentDeadline() });
        await load();
      }
    } catch (caught) {
      setError(getAssignmentErrorMessage(caught, tr("Не вдалося змінити доступність контрольної.", "Could not change test access.")));
    } finally {
      setAssignmentBusyId(null);
    }
  };

  const addTest = async () => {
    if (!selectedTask || !testForm.expectedOutput.trim()) return;
    setBusy(true);
    try {
      if (preview()) {
        setTests((old) => [...old, { id: Date.now(), input: testForm.input, expectedOutput: testForm.expectedOutput, points: Number(testForm.points) || 1, isHidden: testForm.isHidden, imageUrls: testForm.imageUrls, source: "MANUAL" } as TestData]);
      } else {
        await addTestData(selectedTask.id, [{ input: testForm.input, expectedOutput: testForm.expectedOutput, points: Number(testForm.points) || 1, isHidden: testForm.isHidden, imageUrls: testForm.imageUrls }]);
        const data = await getTestData(selectedTask.id, { limit: 100, offset: 0 });
        setTests(data.testData || []);
      }
      setTestForm({ input: "", expectedOutput: "", points: "1", isHidden: true, imageUrls: [] });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося додати тест.", "Could not add the test.")));
    } finally {
      setBusy(false);
    }
  };

  const removeTest = async (test: TestData) => {
    if (!selectedTask || !window.confirm(tr("Видалити тест?", "Delete this test?"))) return;
    try {
      if (preview()) {
        setTests((old) => old.filter((item) => item.id !== test.id));
      } else {
        await deleteTestData(selectedTask.id, test.id);
        const data = await getTestData(selectedTask.id, { limit: 100, offset: 0 });
        setTests(data.testData || []);
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося видалити тест.", "Could not delete the test.")));
    }
  };

  if (loading) {
    return (
      <div className={root}>
        <div className="mx-auto max-w-[1480px]">
          <div className="h-12 w-48 animate-pulse rounded-2xl bg-bg-hover dark:bg-white/[.06]" />
          <div className="mt-6 h-[520px] animate-pulse rounded-[36px] bg-bg-hover dark:bg-white/[.05]" />
        </div>
      </div>
    );
  }

  if (!topic) return <div className={root}><div className="mx-auto max-w-[1480px]">{error || tr("Тему не знайдено.", "Topic not found.")}</div></div>;

  // Control-work practice tasks are also stored in topic.tasks. Keep them in
  // the Control Studio list and out of the topic's regular practice tab.
  const tasks = (topic.tasks || []).filter((task) => task.type !== "CONTROL");
  const controls = topic.controlWorks || [];
  const assignedTasks = tasks.filter((task) => task.isAssigned).length;

  return (
    <main className={root}>
      <ClassWorkspaceFrame classId={topic.class?.id || "0"} className={topic.class?.name || tr("Клас", "Class")} active="learning">
        <header className="classroom-heading">
          <div><p>{tr("Теми та завдання", "Topics and tasks")} / {tr("Тема", "Topic")}</p><h1>{topic.title}</h1><span>{topic.description || tr("Матеріали та завдання для учнів класу.", "Materials and tasks for your class.")}</span></div>
          <div className="classroom-actions">{topic.class?.id && <button type="button" className="classroom-button classroom-button--danger" disabled={busy} onClick={() => void deleteTopic()}><Trash2 className="size-4" aria-hidden="true" />{tr("Видалити тему", "Delete topic")}</button>}<button type="button" className="classroom-button" onClick={openControlBuilder}><ClipboardCheck className="size-4" aria-hidden="true" />{tr("Контрольна", "Assessment")}</button><button type="button" className="classroom-button classroom-button--primary" onClick={openTaskBuilder}><Plus className="size-4" aria-hidden="true" />{tr("Додати завдання", "Add task")}</button></div>
        </header>
        <div className="classroom-facts"><span className="classroom-language">{topic.language}</span><span>{tr("Завдання", "Tasks")}: {tasks.length}</span><span><span className="classroom-status-dot" />{tr("Відкрито учням", "Open to students")}: {assignedTasks}</span></div>
        {error && <div className="classroom-notice classroom-notice--error" role="alert">{error}</div>}
        <div className="classroom-tabs" role="tablist" aria-label={tr("Матеріали теми", "Topic materials")}>
          <button type="button" role="tab" id="topic-tab-tasks" aria-selected={topicTab === "tasks"} aria-controls="topic-panel-tasks" onClick={() => setTopicTab("tasks")}>{tr("Завдання", "Tasks")}<span>{tasks.length}</span></button>
          <button type="button" role="tab" id="topic-tab-controls" aria-selected={topicTab === "controls"} aria-controls="topic-panel-controls" onClick={() => setTopicTab("controls")}>{tr("Контрольні роботи", "Assessments")}<span>{controls.length}</span></button>
        </div>
        {topicTab === "tasks" ? <section role="tabpanel" id="topic-panel-tasks" aria-labelledby="topic-tab-tasks" className="classroom-task-workspace">
          <div className="classroom-toolbar"><label className="classroom-search"><Search className="size-4" aria-hidden="true" /><input type="search" aria-label={tr("Знайти завдання", "Search tasks")} placeholder={tr("Знайти завдання…", "Search tasks…")} value={taskQuery} onChange={event => setTaskQuery(event.target.value)} /></label><select className="classroom-filter" aria-label={tr("Фільтр доступності", "Access filter")} value={taskFilter} onChange={event => setTaskFilter(event.target.value as typeof taskFilter)}><option value="all">{tr("Усі завдання", "All tasks")}</option><option value="assigned">{tr("Відкриті учням", "Open to students")}</option><option value="draft">{tr("Чернетки", "Drafts")}</option></select></div>
          <div className="classroom-task-columns" aria-hidden="true"><span>{tr("Завдання", "Task")}</span><span>{tr("Доступ", "Access")}</span><span>{tr("Дії", "Actions")}</span></div>
          <div className="classroom-task-list">{tasks.filter(task => task.title.toLocaleLowerCase().includes(taskQuery.toLocaleLowerCase()) && (taskFilter === "all" || (taskFilter === "assigned" ? task.isAssigned : !task.isAssigned))).map((task, index) => <article className={`classroom-task ${expandedTaskId === task.id ? "is-expanded" : ""}`} key={task.id}>
            <div className="classroom-task__row"><div className="classroom-task__identity"><span className="classroom-task__number">{String(index + 1).padStart(2, "0")}</span><div><button type="button" className="classroom-task__title" onClick={() => openTaskEditor(task)}>{task.title}</button><p>{task.theory?.content ? tr("Теорія та практика", "Theory and practice") : tr("Практичне завдання", "Practice task")}{task.maxAttempts ? ` · ${tr("Спроби", "Attempts")}: ${task.maxAttempts}` : ""}</p></div></div><span className={`classroom-status ${task.isAssigned ? "is-open" : ""}`}><i aria-hidden="true" />{task.isAssigned ? tr("Відкрито", "Open") : tr("Чернетка", "Draft")}</span><div className="classroom-task__actions"><button type="button" className="classroom-text-button" aria-label={tr(`Редагувати задачу ${task.title}`, `Edit task ${task.title}`)} onClick={() => openTaskEditor(task)}><Pencil className="size-3.5" aria-hidden="true" />{tr("Редагувати", "Edit")}</button><button type="button" className="classroom-icon-button" aria-expanded={expandedTaskId === task.id} aria-controls={`task-details-${task.id}`} aria-label={tr(`Доступ і тести: ${task.title}`, `Access and tests: ${task.title}`)} onClick={() => setExpandedTaskId(current => current === task.id ? null : task.id)}><ChevronDown className="size-4" aria-hidden="true" /></button></div></div>
            {expandedTaskId === task.id && <div id={`task-details-${task.id}`} className="classroom-task__details"><div className="classroom-task__description">{task.description ? <MarkdownView content={task.description} /> : <p>{tr("Умова ще готується.", "The problem statement is being prepared.")}</p>}</div><div className="classroom-task__access"><label htmlFor={`topic-task-deadline-${task.id}`}>{tr("Доступ до", "Access until")}<input id={`topic-task-deadline-${task.id}`} type="datetime-local" value={deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline)} onChange={event => setDeadlineDrafts(old => ({ ...old, [task.id]: event.target.value }))} disabled={assignmentBusyId === task.id} /></label>{task.isAssigned && <button type="button" className="classroom-button" disabled={assignmentBusyId === task.id} onClick={() => void saveTaskDeadline(task)}>{tr("Зберегти дедлайн", "Save deadline")}</button>}<button type="button" className="classroom-button" disabled={assignmentBusyId === task.id} aria-pressed={!!task.isAssigned} onClick={() => void toggleTask(task)}>{assignmentBusyId === task.id ? tr("Зберігаємо…", "Saving…") : task.isAssigned ? tr("Закрити доступ", "Close access") : tr("Відкрити учням", "Open to students")}</button></div><div className="classroom-task__utilities"><button type="button" className="classroom-text-button" onClick={() => void openTests(task)}><FlaskConical className="size-4" aria-hidden="true" />{tr("Налаштувати тести", "Configure tests")}</button>{task.type !== "CONTROL" && <button type="button" className="classroom-text-button classroom-text-button--danger" onClick={() => void deleteTask(task)} aria-label={tr(`Видалити задачу ${task.title}`, `Delete task ${task.title}`)}><Trash2 className="size-4" aria-hidden="true" />{tr("Видалити завдання", "Delete task")}</button>}</div></div>}
          </article>)}</div>
          {!tasks.filter(task => task.title.toLocaleLowerCase().includes(taskQuery.toLocaleLowerCase()) && (taskFilter === "all" || (taskFilter === "assigned" ? task.isAssigned : !task.isAssigned))).length && <div className="classroom-empty"><TerminalSquare className="size-6" aria-hidden="true" /><strong>{tasks.length ? tr("Завдань не знайдено", "No matching tasks") : tr("Почніть із першого завдання", "Start with your first task")}</strong><p>{tasks.length ? tr("Змініть пошук або фільтр.", "Change the search or filter.") : tr("Додайте умову, теорію та тести для перевірки.", "Add a problem statement, theory, and test cases.")}</p></div>}
          <button type="button" className="classroom-add-row" onClick={openTaskBuilder}><Plus className="size-4" aria-hidden="true" />{tr("Додати завдання", "Add task")}</button>
          <p className="classroom-list-hint">{tr("Натисніть назву, щоб редагувати. Стрілка праворуч відкриває доступ, дедлайн і тести.", "Select a title to edit. The arrow on the right opens access, deadline, and test settings.")}</p>
        </section> : <section role="tabpanel" id="topic-panel-controls" aria-labelledby="topic-tab-controls" className="classroom-task-workspace"><div className="classroom-toolbar"><p className="classroom-caption">{tr("Перевірка знань із теми", "Assess knowledge of this topic")}</p></div>{controls.map(control => <article key={control.id} className="classroom-assessment"><span className="classroom-assessment__icon"><ClipboardCheck className="size-5" aria-hidden="true" /></span><div><h2>{control.title || tr("Контрольна робота", "Assessment")}</h2><p>{control.timeLimitMinutes ? `${control.timeLimitMinutes} ${tr("хвилин", "minutes")}` : tr("Без обмеження часу", "No time limit")}</p></div><span className={`classroom-status ${control.isAssigned ? "is-open" : ""}`}><i aria-hidden="true" />{control.isAssigned ? tr("Відкрито", "Open") : tr("Чернетка", "Draft")}</span><div className="classroom-actions"><button type="button" className="classroom-button" disabled={assignmentBusyId === control.id} onClick={() => void toggleControl(control)}>{control.isAssigned ? tr("Закрити доступ", "Close access") : tr("Відкрити учням", "Open to students")}</button><button type="button" className="classroom-text-button" onClick={() => navigate(withDevPreview(`/edu/control-works/${control.id}`))}>{tr("Налаштувати", "Configure")}<ArrowRight className="size-4" aria-hidden="true" /></button><button type="button" className="classroom-text-button classroom-text-button--danger" disabled={assignmentBusyId === control.id} onClick={() => void deleteControl(control)} aria-label={tr(`Видалити контрольну ${control.title || ""}`, `Delete assessment ${control.title || ""}`)}><Trash2 className="size-4" aria-hidden="true" />{tr("Видалити", "Delete")}</button></div></article>)}{!controls.length && <div className="classroom-empty"><ClipboardCheck className="size-6" aria-hidden="true" /><strong>{tr("Контрольних ще немає", "No assessments yet")}</strong><p>{tr("Створіть контрольну, коли матеріали теми будуть готові.", "Create an assessment when the topic materials are ready.")}</p></div>}<button type="button" className="classroom-add-row" onClick={openControlBuilder}><Plus className="size-4" aria-hidden="true" />{tr("Створити контрольну", "Create assessment")}</button></section>}


        {mode === "task" && (
          <Modal error={error} title={editingTaskId ? tr("Редагувати практику", "Edit practice task") : tr("Нова практика", "New practice task")} caption={editingTaskId ? tr("Змініть умову, код, теорію або кількість спроб. Чернетку можна редагувати до відкриття учням.", "Edit the problem statement, code, theory, or attempt limit. You can edit the draft until it is assigned to students.") : tr("Одне вікно для умови, стартового коду й короткої теорії. Після створення відкриється налаштування тестів.", "Add the problem statement, starter code, and brief theory in one place. Test settings open after creation.")} onClose={() => { setMode(null); setEditingTaskId(null); }} wide>
            <form className="task-authoring" onSubmit={event => { event.preventDefault(); void createTask(); }}>
              <TaskAuthoringFields idPrefix="topic-task" topicId={id} taskType="PRACTICE" responseLanguage={isEn ? "en" : "uk"} value={taskForm} onChange={patch => setTaskForm(old => ({ ...old, ...patch }))} generationGuidance={generationInstructions} onGenerationGuidanceChange={setGenerationInstructions} generationProfile={generationProfile} onGenerationProfileChange={setGenerationProfile} guidanceEnabled={!editingTaskId && !preview()} selectedTab={editorTab} onSelectedTabChange={setEditorTab} aiBusy={aiBusy} busy={busy} onGenerateCondition={() => void generateCondition()} onGenerateTemplate={() => void generateTemplate()} onGenerateTheory={() => void generateTheory()} />
              <div className="task-authoring__footer"><button type="button" className="classroom-button" disabled={busy} onClick={() => { setMode(null); setEditingTaskId(null); }}>{tr("Скасувати", "Cancel")}</button><button type="submit" className="classroom-button classroom-button--primary" disabled={busy || !!aiBusy || !taskForm.title.trim()}>{busy ? tr("Зберігаємо…", "Saving…") : tr("Зберегти й налаштувати тести", "Save and configure tests")}<ArrowRight className="size-4" aria-hidden="true" /></button></div>
            </form>

          </Modal>
        )}

        {mode === "control" && (
          <Modal error={error} title={tr("Нова контрольна", "New test")} caption={tr("Контрольна створюється не просто назвою: одразу визначаємо час, частини роботи й формулу оцінювання.", "Create a complete test by setting its time limit, sections, and grading formula.")} onClose={() => setMode(null)} wide>
            <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
              <section className="space-y-4 rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="size-5 text-accent-warn" />
                  <h3 className="font-black">{tr("Параметри контрольної", "Test settings")}</h3>
                </div>
                <input id="topic-control-title" name="controlTitle" aria-label={tr("Назва контрольної", "Test title")} value={controlForm.title} onChange={(event) => setControlForm({ ...controlForm, title: event.target.value })} placeholder={tr("Наприклад, Контрольна · Колекції", "For example, Collections test")} className="w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("хвилин", "minutes")}</span>
                    <input id="topic-control-time" name="timeLimitMinutes" aria-label={tr("Ліміт часу в хвилинах", "Time limit in minutes")} value={controlForm.timeLimitMinutes} onChange={(event) => setControlForm({ ...controlForm, timeLimitMinutes: event.target.value })} type="number" min="1" className="w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("тестів", "quiz questions")}</span>
                    <input id="topic-control-quiz-count" name="quizCount" aria-label={tr("Кількість тестів", "Number of quiz questions")} value={controlForm.quizCount} onChange={(event) => setControlForm({ ...controlForm, quizCount: event.target.value })} type="number" min="0" className="w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("практик", "practice tasks")}</span>
                    <input id="topic-control-practice-count" name="practiceCount" aria-label={tr("Кількість практичних задач", "Number of practice tasks")} value={controlForm.practiceCount} onChange={(event) => setControlForm({ ...controlForm, practiceCount: event.target.value })} type="number" min="0" className="w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl bg-bg-hover p-4 text-sm font-black dark:bg-white/[.05]">
                    <input type="checkbox" checked={controlForm.hasTheory} onChange={(event) => setControlForm({ ...controlForm, hasTheory: event.target.checked })} />
                    {tr("Теоретичний тест", "Theory quiz")}
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl bg-bg-hover p-4 text-sm font-black dark:bg-white/[.05]">
                    <input type="checkbox" checked={controlForm.hasPractice} onChange={(event) => setControlForm({ ...controlForm, hasPractice: event.target.checked })} />
                    {tr("Практична частина", "Practice section")}
                  </label>
                </div>
              </section>
              <section className="space-y-4 rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <ListChecks className="size-5 text-primary-strong dark:text-primary-soft" />
                  <h3 className="font-black">{tr("Оцінювання", "Grading")}</h3>
                </div>
                <textarea id="topic-control-formula" name="gradingFormula" aria-label={tr("Формула оцінювання", "Grading formula")} value={controlForm.formula} onChange={(event) => setControlForm({ ...controlForm, formula: event.target.value })} rows={6} className="w-full resize-none rounded-xl border border-border/10 bg-bg-code px-4 py-3 font-mono text-sm text-text-primary outline-none focus:ring-4 focus:ring-primary/15 dark:border-white/10" />
                <div className="rounded-2xl bg-bg-hover p-4 text-sm leading-6 text-text-muted dark:bg-primary dark:text-primary-foreground">
                  {tr("Після створення відкриється control studio — там можна згенерувати квіз, додати практичні задачі та перевірити формулу.", "After creation, the test studio opens, where you can generate a quiz, add practice problems, and review the formula.")}
                </div>
                <button type="button" disabled={busy || !controlForm.title.trim() || (!controlForm.hasTheory && !controlForm.hasPractice)} onClick={() => void createControl()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-45">
                  <Settings className="size-4" />
                  {tr("Створити й налаштувати", "Create and configure")}
                </button>
              </section>
            </div>
          </Modal>
        )}

        {mode === "tests" && selectedTask && (
          <Modal error={error} title={`${tr("Тести", "Tests")} · ${selectedTask.title}`} caption={tr("Згенеруйте тести, імпортуйте пари sample.in + sample.out або додайте один тест вручну. Вони використовуються автоперевіркою.", "Generate tests, import sample.in + sample.out pairs, or add a test manually. They are used for automatic grading.")} onClose={() => { setMode(null); setSelectedTask(null); setTestNotice(null); setImportFiles([]); }} wide>
            <div className="grid gap-5 lg:grid-cols-[1fr_.85fr]">
              <section className="space-y-3 rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black">{tr("Набір тестів", "Test set")}</h3>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{tests.length}</span>
                </div>
                {testNotice && <p role="status" aria-live="polite" className="rounded-2xl bg-bg-hover px-4 py-3 text-xs leading-5 text-text-muted dark:bg-primary dark:text-primary-foreground">{testNotice}</p>}
                {tests.map((test, index) => (
                  <div key={test.id} className="flex items-start gap-3 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.045]">
                    <span className="mt-1 text-xs font-black text-accent-warn">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-text-primary dark:text-text-primary">in: {test.input || "∅"}</p>
                      <p className="mt-1 truncate font-mono text-xs text-text-primary dark:text-text-primary">out: {test.expectedOutput}</p>
                      {!!test.imageUrls?.length && <div className="mt-2 flex gap-1">{test.imageUrls.map((url, imageIndex) => <img key={`${url}-${imageIndex}`} src={url} alt={tr(`Зображення тесту ${index + 1}`, `Test ${index + 1} image`)} className="h-10 w-12 rounded-md border border-border object-cover" loading="lazy" />)}</div>}
                    </div>
                    <button type="button" onClick={() => void removeTest(test)} aria-label={tr(`Видалити тест ${index + 1}`, `Delete test ${index + 1}`)} className="text-accent-error dark:text-accent-error"><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                ))}
                {!tests.length && <p className="rounded-2xl border border-dashed border-border/15 px-4 py-10 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Тестів ще немає.", "No tests yet.")}</p>}
              </section>
              <section className="space-y-3 rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="rounded-2xl border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.04]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg-hover text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn"><Sparkles className="size-4" aria-hidden="true" /></span>
                    <div>
                      <h3 className="font-black">{tr("Згенерувати тести", "Generate tests")}</h3>
                      <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("AI створить приклади за назвою та умовою задачі.", "AI will create examples based on the problem title and statement.")}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label htmlFor="topic-test-generation-count" className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[.1em] text-text-muted dark:text-text-secondary">{tr("Кількість", "Count")}</span>
                      <input id="topic-test-generation-count" name="testGenerationCount" value={testGenerationCount} onChange={(event) => setTestGenerationCount(event.target.value)} type="number" min="1" max="50" className="w-24 rounded-xl border border-border/10 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                    </label>
                    <button type="button" disabled={busy} onClick={() => void generateTests()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground transition  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-45">
                      <Sparkles className="size-3.5" aria-hidden="true" />
                      {busy ? tr("Генерую…", "Generating…") : tr("Згенерувати", "Generate")}
                    </button>
                    <button type="button" disabled={busy || !tests.some((test) => test.source === "AI_GENERATED")} onClick={() => void clearGeneratedTests()} className="rounded-xl px-3 py-2.5 text-xs font-black text-accent-error transition hover:bg-accent-error/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-error/20 disabled:opacity-40 dark:text-accent-error">
                      {tr("Очистити AI", "Clear AI tests")}
                    </button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs font-bold text-text-muted dark:text-text-secondary">
                    <input name="replaceGeneratedTests" type="checkbox" checked={replaceGeneratedTests} onChange={(event) => setReplaceGeneratedTests(event.target.checked)} />
                    {tr("Замінювати попередні AI-тести", "Replace previous AI tests")}
                  </label>
                  <label className="mt-3 block text-xs font-bold text-text-muted dark:text-text-secondary" htmlFor="topic-test-coverage">{tr("Що мають покрити тести? Додайте по одному випадку в рядок.", "What should the tests cover? Add one case per line.")}</label>
                  <textarea id="topic-test-coverage" value={testCoverage} onChange={event => setTestCoverage(event.target.value)} rows={4} maxLength={4000} placeholder={tr("Наприклад:\n- мінімальний допустимий ввід\n- однакові значення\n- велике значення на межі обмежень", "For example:\n- smallest valid input\n- repeated values\n- a large value at the constraint boundary")} className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                </div>
                <div className="rounded-2xl border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.04]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><Upload className="size-4" aria-hidden="true" /></span>
                    <div>
                      <h3 className="font-black">{tr("Імпорт .in / .out", "Import .in / .out")}</h3>
                      <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Файли з однаковою назвою обʼєднаються в один тест.", "Files with matching names will be combined into one test.")}</p>
                    </div>
                  </div>
                  <label htmlFor="topic-test-files" className="mt-3 block text-xs font-black text-text-primary dark:text-text-primary">{tr("Файли тестів", "Test files")}</label>
                  <input key={importInputKey} id="topic-test-files" name="testFiles" type="file" multiple accept=".in,.out,text/plain" onChange={(event) => setImportFiles(Array.from(event.target.files || []))} className="mt-1 block w-full rounded-xl border border-dashed border-border/20 bg-white px-3 py-2 text-xs text-text-muted outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-bg-hover file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-primary-strong focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/15 dark:bg-bg-code dark:text-text-primary" />
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label htmlFor="topic-import-points" className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[.1em] text-text-muted dark:text-text-secondary">{tr("Бали", "Points")}</span>
                      <input id="topic-import-points" name="importPoints" value={importPoints} onChange={(event) => setImportPoints(event.target.value)} type="number" min="1" max="100" className="w-20 rounded-xl border border-border/10 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-xs font-bold text-text-muted dark:text-text-secondary">
                      <input name="importIsHidden" type="checkbox" checked={importIsHidden} onChange={(event) => setImportIsHidden(event.target.checked)} />
                      {tr("Приховані", "Hidden")}
                    </label>
                    <button type="button" disabled={busy || importFiles.length === 0} onClick={() => void importTestFiles()} className="inline-flex items-center gap-2 rounded-xl border border-primary-strong/25 bg-white px-3 py-2.5 text-xs font-black text-primary-strong transition  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-45 dark:bg-bg-code dark:text-primary-soft">
                      <Upload className="size-3.5" aria-hidden="true" />
                      {tr("Імпортувати", "Import")}{importFiles.length ? ` (${importFiles.length})` : ""}
                    </button>
                  </div>
                </div>
                <div className="border-t border-border/10 pt-3 dark:border-white/10">
                  <h3 className="font-black">{tr("Додати тест вручну", "Add a test manually")}</h3>
                  <textarea id="topic-test-input" name="testInput" aria-label={tr("Вхідні дані тесту", "Test input")} value={testForm.input} onChange={(event) => setTestForm({ ...testForm, input: event.target.value })} placeholder={tr("Вхідні дані", "Input")} rows={4} spellCheck={false} className="mt-3 w-full resize-none rounded-xl border border-border/10 bg-bg-hover px-3 py-2 font-mono text-xs outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                  <textarea id="topic-test-output" name="expectedOutput" aria-label={tr("Очікуваний результат тесту", "Expected test output")} value={testForm.expectedOutput} onChange={(event) => setTestForm({ ...testForm, expectedOutput: event.target.value })} placeholder={tr("Очікуваний результат", "Expected output")} rows={4} spellCheck={false} className="mt-3 w-full resize-none rounded-xl border border-border/10 bg-bg-hover px-3 py-2 font-mono text-xs outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                  <div className="mt-3"><TestImageAttachments value={testForm.imageUrls} onChange={imageUrls => setTestForm(old => ({ ...old, imageUrls }))} disabled={busy} /></div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label htmlFor="topic-test-points" className="sr-only">{tr("Бали за тест", "Test points")}</label>
                    <input id="topic-test-points" name="testPoints" aria-label={tr("Бали за тест", "Test points")} value={testForm.points} onChange={(event) => setTestForm({ ...testForm, points: event.target.value })} type="number" min="1" className="w-24 rounded-xl border border-border/10 bg-bg-hover px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                    <label className="flex items-center gap-2 text-sm font-bold text-text-muted dark:text-text-secondary">
                      <input name="testIsHidden" type="checkbox" checked={testForm.isHidden} onChange={(event) => setTestForm({ ...testForm, isHidden: event.target.checked })} />
                      {tr("Прихований", "Hidden")}
                    </label>
                    <button type="button" disabled={busy || !testForm.expectedOutput.trim()} onClick={() => void addTest()} className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-45">
                      {tr("Додати до набору", "Add to test set")}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </Modal>
        )}
      </ClassWorkspaceFrame>
    </main>
  );
};

export default TopicStudioPage;
