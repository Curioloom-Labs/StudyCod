import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  ListChecks,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  Upload,
  X,
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
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { MarkdownView } from "../../components/MarkdownView";
import { useDialogA11y } from "../../components/ui/useDialogA11y";
import { importTestsFromInOutFiles } from "../../utils/testInOutImport";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

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
  class?: { id: number } | null;
  tasks?: TopicTask[];
  controlWorks?: Control[];
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "min-h-[100dvh] bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-10 lg:py-10";
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
  class: { id: 7 },
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

const Modal: React.FC<{ title: string; caption?: string; children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ title, caption, children, onClose, wide }) => {
  const titleId = React.useId();
  const panelRef = useDialogA11y({ open: true, onClose });
  return <div data-dialog-a11y="direct" data-material="topic-dialog-scrim" className="fixed inset-0 z-[90] overflow-y-auto bg-bg-code/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef as React.RefObject<HTMLElement>} data-dialog-a11y="direct" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-material="topic-dialog" className={`mx-auto my-8 w-full rounded-[32px] bg-bg-surface p-5 shadow-[0_28px_90px_rgba(10,31,17,.28)] dark:bg-bg-code sm:p-7 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-accent-warn">Topic studio</p>
          <h2 id={titleId} className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em]">{title}</h2>
          {caption && <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted dark:text-text-secondary">{caption}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={tr("Закрити вікно", "Close dialog")} className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-hover text-text-muted transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 dark:bg-white/[.07] dark:text-text-primary">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-7">{children}</div>
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
  const [selectedTask, setSelectedTask] = React.useState<TopicTask | null>(null);
  const [editingTaskId, setEditingTaskId] = React.useState<number | null>(null);
  const [tests, setTests] = React.useState<TestData[]>([]);
  const [testNotice, setTestNotice] = React.useState<string | null>(null);
  const [testGenerationCount, setTestGenerationCount] = React.useState("5");
  const [replaceGeneratedTests, setReplaceGeneratedTests] = React.useState(true);
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
  const [controlForm, setControlForm] = React.useState({
    title: "",
    timeLimitMinutes: "45",
    hasTheory: true,
    hasPractice: true,
    quizCount: "10",
    practiceCount: "2",
    formula: defaultControlFormula,
  });
  const [testForm, setTestForm] = React.useState({ input: "", expectedOutput: "", points: "1", isHidden: true });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
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
    setEditingTaskId(null);
    setTaskForm({ title: "", description: "", template: "", maxAttempts: "3", theory: "", projectSpecJson: "" });
    setMode("task");
  };

  const openTaskEditor = (task: TopicTask) => {
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
    setMode("task");
  };

  const openControlBuilder = () => {
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
        difficulty: 3,
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
        difficulty: 3,
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
      const result = await generateTestData(selectedTask.id, count, { replaceGenerated: replaceGeneratedTests });
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
        setTests((old) => [...old, { id: Date.now(), input: testForm.input, expectedOutput: testForm.expectedOutput, points: Number(testForm.points) || 1, isHidden: testForm.isHidden, source: "MANUAL" } as TestData]);
      } else {
        await addTestData(selectedTask.id, [{ input: testForm.input, expectedOutput: testForm.expectedOutput, points: Number(testForm.points) || 1, isHidden: testForm.isHidden }]);
        const data = await getTestData(selectedTask.id, { limit: 100, offset: 0 });
        setTests(data.testData || []);
      }
      setTestForm({ input: "", expectedOutput: "", points: "1", isHidden: true });
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

  const tasks = topic.tasks || [];
  const controls = topic.controlWorks || [];
  const assignedTasks = tasks.filter((task) => task.isAssigned).length;

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1480px] space-y-6">
        <header className="overflow-hidden rounded-[36px] border border-border/10 bg-bg-code text-text-primary shadow-[0_28px_90px_rgba(7,24,13,.20)] dark:border-white/10">
          <div className="grid lg:grid-cols-[1.25fr_.75fr]">
            <div className="p-6 sm:p-9 lg:p-11">
              <button type="button" onClick={() => navigate(backPath)} className="inline-flex items-center gap-2 text-sm font-bold text-text-primary transition hover:text-white">
                <ArrowLeft className="size-4" />
                {tr("До класу", "Back to class")}
              </button>
              <p className="mt-10 text-xs font-black uppercase tracking-[.18em] text-primary-soft">{topic.language} · {tr("конструктор теми", "topic studio")}</p>
              <h1 className="mt-4 max-w-4xl font-[family-name:var(--font-display)] text-4xl font-black tracking-[-.07em] sm:text-6xl">{topic.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-text-primary">
                {topic.description || tr("Зберіть тему як маршрут: коротка теорія, практика з тестами, контрольна з окремими правилами оцінювання.", "Build a learning path with concise theory, tested practice, and a test with its own grading rules.")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={openTaskBuilder} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground">
                  <Plus className="size-4" />
                  {tr("Практика + теорія", "Practice + theory")}
                </button>
                <button type="button" onClick={openControlBuilder} className="inline-flex items-center gap-2 rounded-2xl border border-white/14 px-5 py-3 text-sm font-bold text-text-primary">
                  <ClipboardCheck className="size-4" />
                  {tr("Контрольна", "Test")}
                </button>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[.045] p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10">
              <div className="grid gap-3">
                {[
                  { label: tr("практик", "practice tasks"), value: tasks.length, icon: TerminalSquare },
                  { label: tr("відкрито учням", "assigned to students"), value: assignedTasks, icon: CheckCircle2 },
                  { label: tr("контрольних", "tests"), value: controls.length, icon: ShieldCheck },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[.055] p-5">
                      <div className="flex items-center justify-between">
                        <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary-soft"><Icon className="size-5" /></span>
                        <strong className="text-4xl font-black tracking-[-.07em]">{item.value}</strong>
                      </div>
                      <p className="mt-4 text-sm font-bold text-text-primary">{item.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-accent-error/25 bg-accent-error/10 px-4 py-3 text-sm font-medium text-accent-error" role="alert">{error}</div>}

        <main className="grid gap-6 xl:grid-cols-[1fr_410px]">
          <section className="rounded-[32px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{tr("Практичний маршрут", "Practice path")}</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.05em]">{tr("Завдання теми", "Topic tasks")}</h2>
              </div>
              <button type="button" onClick={openTaskBuilder} className="rounded-xl bg-bg-code px-4 py-2.5 text-sm font-bold text-text-primary dark:bg-primary dark:text-primary-foreground">
                {tr("Додати", "Add")}
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {tasks.map((task, index) => (
                <article key={task.id} className="group rounded-[26px] border border-border/10 bg-bg-hover p-4 transition hover:border-primary/40 hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:hover:bg-white/[.07] sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-[54px_1fr]">
                    <span className="grid size-12 place-items-center rounded-2xl bg-white text-sm font-black text-primary-strong shadow-sm dark:bg-bg-code dark:text-primary-soft">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black tracking-[-.04em]">{task.title}</h3>
                          <div className="mt-2 max-h-48 max-w-2xl overflow-hidden text-sm leading-6 text-text-muted [mask-image:linear-gradient(to_bottom,black_72%,transparent)] dark:text-text-secondary">
                            {task.description ? <MarkdownView content={task.description} /> : tr("Умова ще готується.", "The problem statement is being prepared.")}
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${task.isAssigned ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-bg-hover text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}>
                          {task.isAssigned ? tr("доступ відкритий", "access open") : tr("чернетка · доступ закритий", "draft · access closed")}
                        </span>
                      </div>
                      <div className="mt-5 flex flex-wrap items-end gap-2">
                        <label htmlFor={`topic-task-deadline-${task.id}`} className="block min-w-[220px] flex-1">
                          <span className="mb-1 block text-[11px] font-black uppercase tracking-[.1em] text-text-muted dark:text-text-secondary">{tr("Дедлайн доступу", "Access deadline")}</span>
                          <input id={`topic-task-deadline-${task.id}`} name={`taskDeadline-${task.id}`} type="datetime-local" value={deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline)} onChange={(event) => setDeadlineDrafts((old) => ({ ...old, [task.id]: event.target.value }))} disabled={assignmentBusyId === task.id} className="w-full rounded-xl border border-border/10 bg-white px-3 py-2 text-xs font-bold text-text-primary outline-none transition focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code dark:text-text-primary" />
                        </label>
                        <button type="button" disabled={assignmentBusyId === task.id} onClick={() => openTaskEditor(task)} aria-label={tr(`Редагувати задачу ${task.title}`, `Edit task ${task.title}`)} className="inline-flex items-center gap-1.5 rounded-xl border border-border/12 bg-white px-3 py-2 text-xs font-black text-text-primary shadow-sm transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-45 dark:border-white/10 dark:bg-bg-code dark:text-text-primary">
                          <Pencil className="size-3.5" aria-hidden="true" />
                          {tr("Редагувати", "Edit")}
                        </button>
                        <button type="button" disabled={assignmentBusyId === task.id} onClick={() => void toggleTask(task)} aria-pressed={!!task.isAssigned} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-45 ${task.isAssigned ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-white text-text-primary dark:bg-bg-code dark:text-text-primary"}`}>
                           {task.isAssigned ? tr("Закрити доступ", "Close access") : tr("Відкрити учням", "Open to students")}
                        </button>
                        {task.isAssigned && <button type="button" disabled={assignmentBusyId === task.id} onClick={() => void saveTaskDeadline(task)} className="rounded-xl border border-primary-strong/25 bg-white px-3 py-2 text-xs font-black text-primary-strong transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-45 dark:bg-bg-code dark:text-primary-soft">
                          {tr("Зберегти дедлайн", "Save deadline")}
                        </button>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void openTests(task)} className="inline-flex items-center gap-1 rounded-xl bg-bg-hover px-3 py-2 text-xs font-black text-accent-warn transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-warn/25 dark:bg-accent-warn/12 dark:text-accent-warn">
                          <FlaskConical className="size-3.5" />
                          {tr("Тести", "Tests")}
                        </button>
                        <button type="button" onClick={() => void deleteTask(task)} aria-label={tr(`Видалити задачу ${task.title}`, `Delete task ${task.title}`)} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-accent-error opacity-100 transition hover:bg-accent-error/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-error/20 dark:text-accent-error sm:opacity-0 sm:group-hover:opacity-100">
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          {tr("Видалити", "Delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {!tasks.length && (
                <div className="rounded-[26px] border border-dashed border-border/15 px-6 py-16 text-center dark:border-white/10">
                  <TerminalSquare className="mx-auto size-9 text-primary-strong dark:text-primary-soft" />
                  <h3 className="mt-4 text-xl font-black">{tr("Додайте першу практику", "Add your first practice task")}</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted dark:text-text-secondary">
                    {tr("Після створення одразу відкриється вікно тестів, щоб завдання не лишалось порожньою карткою.", "After creation, the tests window opens so the task is ready to use.")}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[32px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-bg-hover text-accent-warn dark:bg-accent-warn/12"><ClipboardCheck className="size-5" /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[.13em] text-accent-warn">{tr("Перевірки", "Assessments")}</p>
                  <h2 className="mt-1 text-xl font-black">{tr("Контрольні", "Tests")}</h2>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {controls.map((control) => (
                  <div key={control.id} className="rounded-[22px] bg-bg-hover p-4 dark:bg-white/[.045]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{control.title || tr("Контрольна робота", "Test")}</p>
                        <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{control.timeLimitMinutes ? `${control.timeLimitMinutes} ${tr("хв", "min")}` : tr("Без обмеження часу", "No time limit")}</p>
                      </div>
                      <button type="button" disabled={assignmentBusyId === control.id} onClick={() => void toggleControl(control)} aria-pressed={!!control.isAssigned} className={`rounded-full px-2.5 py-1 text-[11px] font-black transition disabled:cursor-wait disabled:opacity-60 ${control.isAssigned ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-white text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}>
                        {assignmentBusyId === control.id ? tr("зберігаю…", "saving…") : control.isAssigned ? tr("активна", "active") : tr("чернетка", "draft")}
                      </button>
                    </div>
                    <button type="button" onClick={() => navigate(`/edu/control-works/${control.id}${preview() ? "?preview=true" : ""}`)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-black text-text-primary shadow-sm dark:bg-bg-code dark:text-text-primary">
                      <Settings className="size-4" />
                      {tr("Налаштувати", "Configure")}
                    </button>
                  </div>
                ))}
                {!controls.length && <p className="rounded-2xl border border-dashed border-border/15 px-4 py-8 text-center text-sm leading-6 text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Контрольної поки немає.", "No tests yet.")}</p>}
              </div>
              <button type="button" onClick={openControlBuilder} className="mt-5 w-full rounded-xl border border-border/12 px-3 py-2.5 text-sm font-black text-text-primary dark:border-white/10 dark:text-text-primary">
                {tr("Створити контрольну", "Create a test")}
              </button>
            </section>

            <section className="rounded-[32px] bg-bg-hover p-6 dark:bg-primary">
              <p className="text-xs font-black uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{tr("Правило теми", "Topic guideline")}</p>
              <p className="mt-3 text-sm leading-6 text-text-muted dark:text-text-primary">
                {tr("Тема спершу збирається в чернетку. Відкривайте учням лише ті практики й контрольні, які вже мають теорію, тести або зрозумілу схему оцінювання.", "Build the topic as a draft first. Give students access only to practice tasks and tests with theory, test cases, or clear grading rules.")}
              </p>
            </section>
          </aside>
        </main>

        {mode === "task" && (
          <Modal title={editingTaskId ? tr("Редагувати практику", "Edit practice task") : tr("Нова практика", "New practice task")} caption={editingTaskId ? tr("Змініть умову, код, теорію або кількість спроб. Чернетку можна редагувати до відкриття учням.", "Edit the problem statement, code, theory, or attempt limit. You can edit the draft until it is assigned to students.") : tr("Одне вікно для умови, стартового коду й короткої теорії. Після створення відкриється налаштування тестів.", "Add the problem statement, starter code, and brief theory in one place. Test settings open after creation.")} onClose={() => { setMode(null); setEditingTaskId(null); }} wide>
            <div className="grid gap-5 lg:grid-cols-[1fr_.85fr]">
              <section className="space-y-4 rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <TerminalSquare className="size-5 text-primary-strong dark:text-primary-soft" />
                  <h3 className="font-black">{tr("Практичне завдання", "Practice task")}</h3>
                </div>
                <input id="topic-task-title" name="taskTitle" aria-label={tr("Назва завдання", "Task title")} value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder={tr("Назва завдання", "Task title")} className="w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/15 dark:border-white/10 dark:bg-bg-code" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void generateCondition()} disabled={!!aiBusy || !taskForm.title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-bg-hover px-3 py-2 text-xs font-black text-accent-warn disabled:opacity-45 dark:bg-accent-warn/12 dark:text-accent-warn">
                    <Sparkles className="size-3.5" />
                    {aiBusy === "condition" ? tr("Генерую…", "Generating…") : tr("Згенерувати умову", "Generate problem statement")}
                  </button>
                  <button type="button" onClick={() => void generateTemplate()} disabled={!!aiBusy || !taskForm.title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-bg-hover px-3 py-2 text-xs font-black text-primary-strong disabled:opacity-45 dark:bg-primary/10 dark:text-primary-soft">
                    <Sparkles className="size-3.5" />
                    {aiBusy === "template" ? tr("Генерую…", "Generating…") : tr("Стартовий код", "Starter code")}
                  </button>
                </div>
                <textarea id="topic-task-description" name="taskDescription" aria-label={tr("Умова завдання", "Problem statement")} value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder={tr("Умова, контекст, обмеження", "Problem statement, context, constraints")} rows={6} className="w-full resize-none rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/15 dark:border-white/10 dark:bg-bg-code" />
                <textarea id="topic-task-template" name="taskTemplate" aria-label={tr("Стартовий код", "Starter code")} value={taskForm.template} onChange={(event) => setTaskForm({ ...taskForm, template: event.target.value })} placeholder={tr("Стартовий код (необовʼязково)", "Starter code (optional)")} rows={6} className="w-full resize-none rounded-xl border border-border/10 bg-bg-code px-4 py-3 font-mono text-sm text-text-primary outline-none focus:ring-4 focus:ring-primary/15 dark:border-white/10" />
              </section>
              <section className="space-y-4 rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <BookOpen className="size-5 text-accent-warn" />
                  <h3 className="font-black">{tr("Теорія і правила", "Theory and settings")}</h3>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("Спроб", "Attempts")}</span>
                  <input id="topic-task-max-attempts" name="maxAttempts" aria-label={tr("Максимальна кількість спроб", "Maximum attempts")} value={taskForm.maxAttempts} onChange={(event) => setTaskForm({ ...taskForm, maxAttempts: event.target.value })} type="number" min="1" className="w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code" />
                </label>
                <button type="button" onClick={() => void generateTheory()} disabled={!!aiBusy || !taskForm.description.trim()} className="inline-flex items-center gap-2 rounded-xl bg-bg-hover px-3 py-2 text-xs font-black text-accent-warn disabled:opacity-45 dark:bg-accent-warn/12 dark:text-accent-warn">
                  <Sparkles className="size-3.5" />
                  {aiBusy === "theory" ? tr("Генерую…", "Generating…") : tr("Згенерувати теорію", "Generate theory")}
                </button>
                <textarea id="topic-task-theory" name="taskTheory" aria-label={tr("Теорія завдання", "Task theory")} value={taskForm.theory} onChange={(event) => setTaskForm({ ...taskForm, theory: event.target.value })} placeholder={tr("Коротке пояснення перед практикою: поняття, приклад, пастки", "A short explanation before practice: concepts, examples, and pitfalls")} rows={9} className="w-full resize-none rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/15 dark:border-white/10 dark:bg-bg-code" />
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("Мініпроєкт · projectSpec JSON (необовʼязково)", "Mini project · projectSpec JSON (optional)")}</label>
                  <textarea
                    id="topic-task-project-spec"
                    name="projectSpecJson"
                    aria-label={tr("Специфікація мініпроєкту JSON", "Mini project JSON specification")}
                    value={taskForm.projectSpecJson}
                    onChange={(event) => setTaskForm({ ...taskForm, projectSpecJson: event.target.value })}
                    placeholder={tr('{"version":1,"kind":"MINI_PROJECT","estimatedMinutes":45,"skills":["цикли"],"milestones":[{"id":"step-1","title":"Перший етап","description":"Що має зробити учень.","required":true}]}', '{"version":1,"kind":"MINI_PROJECT","estimatedMinutes":45,"skills":["loops"],"milestones":[{"id":"step-1","title":"First step","description":"What the student should do.","required":true}]}')}
                    rows={7}
                    className="w-full resize-none rounded-xl border border-border/10 bg-bg-code px-4 py-3 font-mono text-xs text-text-primary outline-none focus:ring-4 focus:ring-primary/15 dark:border-white/10"
                  />
                  <p className="mt-2 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Для мініпроєкту додайте тести нижче. Учень побачить етапи в IDE, а submit перевірятиметься judgeʼом.", "Add tests below for a mini project. Students will see the milestones in the IDE, and submissions will be checked by the judge.")}</p>
                </div>
                <button type="button" disabled={busy || !taskForm.title.trim()} onClick={() => void createTask()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-45">
                  <ArrowRight className="size-4" />
                  {editingTaskId ? tr("Зберегти зміни", "Save changes") : tr("Створити й додати тести", "Create and add tests")}
                </button>
              </section>
            </div>
          </Modal>
        )}

        {mode === "control" && (
          <Modal title={tr("Нова контрольна", "New test")} caption={tr("Контрольна створюється не просто назвою: одразу визначаємо час, частини роботи й формулу оцінювання.", "Create a complete test by setting its time limit, sections, and grading formula.")} onClose={() => setMode(null)} wide>
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
          <Modal title={`${tr("Тести", "Tests")} · ${selectedTask.title}`} caption={tr("Згенеруйте тести, імпортуйте пари sample.in + sample.out або додайте один тест вручну. Вони використовуються автоперевіркою.", "Generate tests, import sample.in + sample.out pairs, or add a test manually. They are used for automatic grading.")} onClose={() => { setMode(null); setSelectedTask(null); setTestNotice(null); setImportFiles([]); }} wide>
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
                    <button type="button" disabled={busy} onClick={() => void generateTests()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-45">
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
                    <button type="button" disabled={busy || importFiles.length === 0} onClick={() => void importTestFiles()} className="inline-flex items-center gap-2 rounded-xl border border-primary-strong/25 bg-white px-3 py-2.5 text-xs font-black text-primary-strong transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-45 dark:bg-bg-code dark:text-primary-soft">
                      <Upload className="size-3.5" aria-hidden="true" />
                      {tr("Імпортувати", "Import")}{importFiles.length ? ` (${importFiles.length})` : ""}
                    </button>
                  </div>
                </div>
                <div className="border-t border-border/10 pt-3 dark:border-white/10">
                  <h3 className="font-black">{tr("Додати тест вручну", "Add a test manually")}</h3>
                  <textarea id="topic-test-input" name="testInput" aria-label={tr("Вхідні дані тесту", "Test input")} value={testForm.input} onChange={(event) => setTestForm({ ...testForm, input: event.target.value })} placeholder={tr("Вхідні дані", "Input")} rows={4} spellCheck={false} className="mt-3 w-full resize-none rounded-xl border border-border/10 bg-bg-hover px-3 py-2 font-mono text-xs outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                  <textarea id="topic-test-output" name="expectedOutput" aria-label={tr("Очікуваний результат тесту", "Expected test output")} value={testForm.expectedOutput} onChange={(event) => setTestForm({ ...testForm, expectedOutput: event.target.value })} placeholder={tr("Очікуваний результат", "Expected output")} rows={4} spellCheck={false} className="mt-3 w-full resize-none rounded-xl border border-border/10 bg-bg-hover px-3 py-2 font-mono text-xs outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label htmlFor="topic-test-points" className="sr-only">{tr("Бали за тест", "Test points")}</label>
                    <input id="topic-test-points" name="testPoints" aria-label={tr("Бали за тест", "Test points")} value={testForm.points} onChange={(event) => setTestForm({ ...testForm, points: event.target.value })} type="number" min="1" className="w-24 rounded-xl border border-border/10 bg-bg-hover px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary/20 dark:border-white/10 dark:bg-bg-code" />
                    <label className="flex items-center gap-2 text-sm font-bold text-text-muted dark:text-text-secondary">
                      <input name="testIsHidden" type="checkbox" checked={testForm.isHidden} onChange={(event) => setTestForm({ ...testForm, isHidden: event.target.checked })} />
                      {tr("Прихований", "Hidden")}
                    </label>
                    <button type="button" disabled={busy || !testForm.expectedOutput.trim()} onClick={() => void addTest()} className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-45">
                      {tr("Додати до набору", "Add to test set")}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
};

export default TopicStudioPage;
