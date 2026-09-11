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
const root = "min-h-[100dvh] bg-[#f3f5f0] px-4 py-6 text-[#101812] dark:bg-[#08100b] dark:text-[#ecf5ee] sm:px-6 lg:px-10 lg:py-10";
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
      return "У цьому класі ще немає учнів. Додайте учнів, а потім відкрийте контрольну ще раз.";
    case "CLASS_NOT_FOUND":
      return "Клас для цієї теми не знайдено. Оновіть сторінку та перевірте прив’язку теми.";
    case "ACCESS_DENIED":
      return "У вас немає доступу, щоб змінити доступність цієї контрольної.";
    default:
      return message;
  }
};
const previewTemplateForLanguage = (language: string) => {
  switch (language.toUpperCase()) {
    case "JAVA":
      return "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    // TODO: прочитайте дані й реалізуйте рішення\n  }\n}\n";
    case "CPP":
      return "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  // TODO: прочитайте дані й реалізуйте рішення\n  return 0;\n}\n";
    case "C":
      return "#include <stdio.h>\n\nint main(void) {\n  // TODO: прочитайте дані й реалізуйте рішення\n  return 0;\n}\n";
    case "CSHARP":
      return "using System;\n\nclass Program {\n  static void Main() {\n    // TODO: прочитайте дані й реалізуйте рішення\n  }\n}\n";
    case "KOTLIN":
      return "fun main() {\n    // TODO: прочитайте дані й реалізуйте рішення\n}\n";
    case "JS":
      return "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n// TODO: прочитайте дані й реалізуйте рішення\nconsole.log(input);\n";
    case "GO":
      return "package main\n\nimport \"fmt\"\n\nfunc main() {\n    // TODO: прочитайте дані й реалізуйте рішення\n    fmt.Println()\n}\n";
    case "RUST":
      return "use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // TODO: прочитайте дані й реалізуйте рішення\n    print!(\"{}\", input);\n}\n";
    case "PASCAL":
      return "program Main;\nbegin\n  { TODO: прочитайте дані й реалізуйте рішення }\nend.\n";
    case "D":
      return "import std.stdio;\n\nvoid main() {\n    // TODO: прочитайте дані й реалізуйте рішення\n}\n";
    case "DART":
      return "import 'dart:io';\n\nvoid main() {\n  final input = stdin.readAsStringSync();\n  // TODO: прочитайте дані й реалізуйте рішення\n  stdout.write(input);\n}\n";
    case "HASKELL":
      return "import qualified Data.ByteString.Char8 as BS\n\nmain :: IO ()\nmain = do\n  input <- BS.getContents\n  -- TODO: прочитайте дані й реалізуйте рішення\n  BS.putStr input\n";
    case "LISP":
      return "(defun main ()\n  ;; TODO: прочитайте дані й реалізуйте рішення\n  (format t \"~%\"))\n\n(main)\n";
    case "LUA":
      return "local input = io.read(\"*a\")\n-- TODO: прочитайте дані й реалізуйте рішення\nio.write(input)\n";
    case "PERL":
      return "use strict;\nuse warnings;\n\nmy $input = do { local $/; <STDIN> };\n# TODO: прочитайте дані й реалізуйте рішення\nprint $input;\n";
    case "PHP":
      return "<?php\n$input = stream_get_contents(STDIN);\n// TODO: прочитайте дані й реалізуйте рішення\necho $input;\n";
    case "RUBY":
      return "input = STDIN.read\n# TODO: прочитайте дані й реалізуйте рішення\nputs input\n";
    case "SWIFT":
      return "import Foundation\n\nlet input = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? \"\"\n// TODO: прочитайте дані й реалізуйте рішення\nprint(input, terminator: \"\")\n";
    case "PYTHON":
    default:
      return "def solve():\n    # TODO: прочитайте дані й реалізуйте рішення\n    pass\n\nif __name__ == \"__main__\":\n    solve()\n";
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
  return <div data-dialog-a11y="direct" data-material="topic-dialog-scrim" className="fixed inset-0 z-[90] overflow-y-auto bg-[#07100a]/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef as React.RefObject<HTMLElement>} data-dialog-a11y="direct" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-material="topic-dialog" className={`mx-auto my-8 w-full rounded-[32px] bg-[#fbfdfb] p-5 shadow-[0_28px_90px_rgba(10,31,17,.28)] dark:bg-[#101a13] sm:p-7 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#e17800]">Topic studio</p>
          <h2 id={titleId} className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em]">{title}</h2>
          {caption && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718075] dark:text-[#a6b4a9]">{caption}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Закрити вікно" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eef3ef] text-[#536258] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/30 dark:bg-white/[.07] dark:text-[#dbe6de]">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-7">{children}</div>
    </section>
  </div>;
};

export const TopicStudioPage: React.FC = () => {
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
        setError(getErrorMessageFromUnknown(caught, "Не вдалося відкрити тему."));
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
      title: old.title || `Контрольна · ${topic?.title || "тема"}`,
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
          description: `## Завдання\n\nСтворіть програму для теми **${topic.title}**: ${old.title.trim()}.\n\n### Вхідні дані\nОдин або кілька рядків з даними задачі.\n\n### Вихідні дані\nРезультат обробки у зрозумілому форматі.\n\n### Приклад\n\n\`\`\`\ninput: 5\noutput: 15\n\`\`\``
        }));
        return;
      }
      const response = await api.post(`/topics/${id}/tasks/generate-condition`, {
        taskTitle: taskForm.title.trim(),
        taskType: "PRACTICE",
        difficulty: 3,
        language: "uk",
      });
      setTaskForm((old) => ({ ...old, description: String(response.data?.description ?? old.description) }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося згенерувати умову."));
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
        language: "uk",
      });
      setTaskForm((old) => ({ ...old, template: String(response.data?.template ?? old.template) }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося згенерувати стартовий код."));
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
          theory: `### Як думати про задачу\n\n1. Визначте, які дані треба зібрати.\n2. Оберіть структуру даних для теми **${topic.title}**.\n3. Перевірте крайні випадки: порожній ввід, одне значення, повтори.\n\n> Пояснення показується учню перед практикою, якщо ви його залишили.`
        }));
        return;
      }
      const response = await api.post(`/topics/${id}/tasks/generate-theory`, {
        taskTitle: taskForm.title.trim(),
        taskDescription: taskForm.description,
        taskType: "PRACTICE",
        difficulty: 3,
        language: "uk",
      });
      setTaskForm((old) => ({ ...old, theory: String(response.data?.theory ?? old.theory) }));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося згенерувати теорію."));
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
      setError(getErrorMessageFromUnknown(caught, "Не вдалося завантажити тестові дані."));
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
        setTestNotice(`Додано ${count} демонстраційних тестів.`);
        return;
      }
      const result = await generateTestData(selectedTask.id, count, { replaceGenerated: replaceGeneratedTests });
      await reloadTests(selectedTask.id);
      setTestNotice(`Згенеровано ${result.count} тестів${result.skippedDuplicates ? `; дублі пропущено: ${result.skippedDuplicates}` : ""}.`);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося згенерувати тести."));
    } finally {
      setBusy(false);
    }
  };

  const clearGeneratedTests = async () => {
    if (!selectedTask || !window.confirm("Видалити всі згенеровані AI-тести?")) return;
    setBusy(true);
    try {
      if (preview()) {
        setTests((old) => old.filter((test) => test.source !== "AI_GENERATED"));
      } else {
        const result = await deleteGeneratedTestData(selectedTask.id);
        await reloadTests(selectedTask.id);
        setTestNotice(`AI-тести очищено: ${result.deleted}.`);
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося очистити AI-тести."));
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
      const problems = result.errors.length ? ` ${result.errors.slice(0, 5).join("; ")}${result.errors.length > 5 ? `; ще ${result.errors.length - 5}` : ""}` : "";
      setTestNotice(result.tests.length ? `Імпортовано ${result.tests.length} тестів.${problems}` : `Не імпортовано жодного тесту.${problems}`);
      setImportFiles([]);
      setImportInputKey((value) => value + 1);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося імпортувати тести."));
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
          setError("Перевірте JSON опису мініпроєкту.");
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
      setError(getErrorMessageFromUnknown(caught, "Не вдалося створити практику."));
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
      setError(getErrorMessageFromUnknown(caught, "Не вдалося створити контрольну."));
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async (task: TopicTask) => {
    if (!window.confirm(`Видалити «${task.title}»?`)) return;
    try {
      if (preview()) {
        setTopic((old) => old ? { ...old, tasks: (old.tasks || []).filter((item) => item.id !== task.id) } : old);
      } else {
        await api.delete(`/topics/${id}/tasks/${task.id}`);
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося видалити практику."));
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
            setError("Оберіть майбутній дедлайн доступу до задачі.");
            return;
          }
          setTopic((old) => old ? { ...old, tasks: (old.tasks || []).map((item) => item.id === task.id ? { ...item, isAssigned: true, deadline } : item) } : old);
        }
      } else {
        if (task.isAssigned) await unassignTask(task.id);
        else {
          const deadline = fromDateTimeLocalValue(deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline));
          if (!deadline || new Date(deadline).getTime() <= Date.now()) {
            setError("Оберіть майбутній дедлайн доступу до задачі.");
            return;
          }
          await api.post(`/topics/${id}/tasks/${task.id}/assign`, { deadline });
        }
        await load();
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося змінити доступність практики."));
    } finally {
      setAssignmentBusyId(null);
    }
  };

  const saveTaskDeadline = async (task: TopicTask) => {
    if (!task.isAssigned) return;
    const deadline = fromDateTimeLocalValue(deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline));
    if (!deadline || new Date(deadline).getTime() <= Date.now()) {
      setError("Оберіть майбутній дедлайн доступу до задачі.");
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
          description: task.description || "Опис задачі",
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
      setError(getErrorMessageFromUnknown(caught, "Не вдалося зберегти дедлайн."));
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
      setError(getAssignmentErrorMessage(caught, "Не вдалося змінити доступність контрольної."));
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
      setError(getErrorMessageFromUnknown(caught, "Не вдалося додати тест."));
    } finally {
      setBusy(false);
    }
  };

  const removeTest = async (test: TestData) => {
    if (!selectedTask || !window.confirm("Видалити тест?")) return;
    try {
      if (preview()) {
        setTests((old) => old.filter((item) => item.id !== test.id));
      } else {
        await deleteTestData(selectedTask.id, test.id);
        const data = await getTestData(selectedTask.id, { limit: 100, offset: 0 });
        setTests(data.testData || []);
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося видалити тест."));
    }
  };

  if (loading) {
    return (
      <div className={root}>
        <div className="mx-auto max-w-[1480px]">
          <div className="h-12 w-48 animate-pulse rounded-2xl bg-[#e8eeea] dark:bg-white/[.06]" />
          <div className="mt-6 h-[520px] animate-pulse rounded-[36px] bg-[#e8eeea] dark:bg-white/[.05]" />
        </div>
      </div>
    );
  }

  if (!topic) return <div className={root}><div className="mx-auto max-w-[1480px]">{error || "Тему не знайдено."}</div></div>;

  const tasks = topic.tasks || [];
  const controls = topic.controlWorks || [];
  const assignedTasks = tasks.filter((task) => task.isAssigned).length;

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1480px] space-y-6">
        <header className="overflow-hidden rounded-[36px] border border-[#122017]/10 bg-[#101812] text-white shadow-[0_28px_90px_rgba(7,24,13,.20)] dark:border-white/10">
          <div className="grid lg:grid-cols-[1.25fr_.75fr]">
            <div className="p-6 sm:p-9 lg:p-11">
              <button type="button" onClick={() => navigate(backPath)} className="inline-flex items-center gap-2 text-sm font-bold text-[#c8d8cc] transition hover:text-white">
                <ArrowLeft className="size-4" />
                До класу
              </button>
              <p className="mt-10 text-xs font-black uppercase tracking-[.18em] text-[#7bedb4]">{topic.language} · конструктор теми</p>
              <h1 className="mt-4 max-w-4xl font-[family-name:var(--font-display)] text-4xl font-black tracking-[-.07em] sm:text-6xl">{topic.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#c6d4c9]">
                {topic.description || "Зберіть тему як маршрут: коротка теорія, практика з тестами, контрольна з окремими правилами оцінювання."}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={openTaskBuilder} className="inline-flex items-center gap-2 rounded-2xl bg-[#00d978] px-5 py-3 text-sm font-black text-[#061e10]">
                  <Plus className="size-4" />
                  Практика + теорія
                </button>
                <button type="button" onClick={openControlBuilder} className="inline-flex items-center gap-2 rounded-2xl border border-white/14 px-5 py-3 text-sm font-bold text-white">
                  <ClipboardCheck className="size-4" />
                  Контрольна
                </button>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[.045] p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10">
              <div className="grid gap-3">
                {[
                  { label: "практик", value: tasks.length, icon: TerminalSquare },
                  { label: "відкрито учням", value: assignedTasks, icon: CheckCircle2 },
                  { label: "контрольних", value: controls.length, icon: ShieldCheck },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[.055] p-5">
                      <div className="flex items-center justify-between">
                        <span className="grid size-11 place-items-center rounded-2xl bg-[#00d978]/15 text-[#7bedb4]"><Icon className="size-5" /></span>
                        <strong className="text-4xl font-black tracking-[-.07em]">{item.value}</strong>
                      </div>
                      <p className="mt-4 text-sm font-bold text-[#c6d4c9]">{item.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/10 px-4 py-3 text-sm font-medium text-[#c4436b]" role="alert">{error}</div>}

        <main className="grid gap-6 xl:grid-cols-[1fr_410px]">
          <section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">Практичний маршрут</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Завдання теми</h2>
              </div>
              <button type="button" onClick={openTaskBuilder} className="rounded-xl bg-[#111a14] px-4 py-2.5 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#061e10]">
                Додати
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {tasks.map((task, index) => (
                <article key={task.id} className="group rounded-[26px] border border-[#142018]/10 bg-[#f7faf6] p-4 transition hover:border-[#00d978]/40 hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:hover:bg-white/[.07] sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-[54px_1fr]">
                    <span className="grid size-12 place-items-center rounded-2xl bg-white text-sm font-black text-[#16834d] shadow-sm dark:bg-[#0b130e] dark:text-[#7bedb4]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black tracking-[-.04em]">{task.title}</h3>
                          <div className="mt-2 max-h-48 max-w-2xl overflow-hidden text-sm leading-6 text-[#6b7a70] [mask-image:linear-gradient(to_bottom,black_72%,transparent)] dark:text-[#aebbb2]">
                            {task.description ? <MarkdownView content={task.description} /> : "Умова ще готується."}
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${task.isAssigned ? "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-[#edf2ed] text-[#718075] dark:bg-white/[.06] dark:text-[#a6b4a9]"}`}>
                          {task.isAssigned ? "доступ відкритий" : "чернетка · доступ закритий"}
                        </span>
                      </div>
                      <div className="mt-5 flex flex-wrap items-end gap-2">
                        <label htmlFor={`topic-task-deadline-${task.id}`} className="block min-w-[220px] flex-1">
                          <span className="mb-1 block text-[11px] font-black uppercase tracking-[.1em] text-[#718075] dark:text-[#a6b4a9]">Дедлайн доступу</span>
                          <input id={`topic-task-deadline-${task.id}`} name={`taskDeadline-${task.id}`} type="datetime-local" value={deadlineDrafts[task.id] ?? toDateTimeLocalValue(task.deadline)} onChange={(event) => setDeadlineDrafts((old) => ({ ...old, [task.id]: event.target.value }))} disabled={assignmentBusyId === task.id} className="w-full rounded-xl border border-[#142018]/10 bg-white px-3 py-2 text-xs font-bold text-[#32443a] outline-none transition focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/10 dark:bg-[#0b130e] dark:text-[#d8e3db]" />
                        </label>
                        <button type="button" disabled={assignmentBusyId === task.id} onClick={() => openTaskEditor(task)} aria-label={`Редагувати задачу ${task.title}`} className="inline-flex items-center gap-1.5 rounded-xl border border-[#142018]/12 bg-white px-3 py-2 text-xs font-black text-[#32443a] shadow-sm transition hover:border-[#00d978]/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 disabled:opacity-45 dark:border-white/10 dark:bg-[#0b130e] dark:text-[#d8e3db]">
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Редагувати
                        </button>
                        <button type="button" disabled={assignmentBusyId === task.id} onClick={() => void toggleTask(task)} aria-pressed={!!task.isAssigned} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 disabled:opacity-45 ${task.isAssigned ? "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-white text-[#32443a] dark:bg-[#0b130e] dark:text-[#d8e3db]"}`}>
                           {task.isAssigned ? "Закрити доступ" : "Відкрити учням"}
                        </button>
                        {task.isAssigned && <button type="button" disabled={assignmentBusyId === task.id} onClick={() => void saveTaskDeadline(task)} className="rounded-xl border border-[#16834d]/25 bg-white px-3 py-2 text-xs font-black text-[#16834d] transition hover:border-[#00d978]/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 disabled:opacity-45 dark:bg-[#0b130e] dark:text-[#72edb0]">
                          Зберегти дедлайн
                        </button>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void openTests(task)} className="inline-flex items-center gap-1 rounded-xl bg-[#fff1dc] px-3 py-2 text-xs font-black text-[#a55e00] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffb454]/25 dark:bg-[#ff8c00]/12 dark:text-[#ffca7e]">
                          <FlaskConical className="size-3.5" />
                          Тести
                        </button>
                        <button type="button" onClick={() => void deleteTask(task)} aria-label={`Видалити задачу ${task.title}`} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-[#bd4067] opacity-100 transition hover:bg-[#bd4067]/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6b9d]/20 dark:text-[#ff9abd] sm:opacity-0 sm:group-hover:opacity-100">
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Видалити
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {!tasks.length && (
                <div className="rounded-[26px] border border-dashed border-[#142018]/15 px-6 py-16 text-center dark:border-white/10">
                  <TerminalSquare className="mx-auto size-9 text-[#16834d] dark:text-[#7bedb4]" />
                  <h3 className="mt-4 text-xl font-black">Додайте першу практику</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                    Після створення одразу відкриється вікно тестів, щоб завдання не лишалось порожньою карткою.
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#fff1dc] text-[#e17800] dark:bg-[#ff8c00]/12"><ClipboardCheck className="size-5" /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[.13em] text-[#e17800]">Перевірки</p>
                  <h2 className="mt-1 text-xl font-black">Контрольні</h2>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {controls.map((control) => (
                  <div key={control.id} className="rounded-[22px] bg-[#f7faf6] p-4 dark:bg-white/[.045]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{control.title || "Контрольна робота"}</p>
                        <p className="mt-1 text-xs text-[#718075] dark:text-[#a6b4a9]">{control.timeLimitMinutes ? `${control.timeLimitMinutes} хв` : "Без обмеження часу"}</p>
                      </div>
                      <button type="button" disabled={assignmentBusyId === control.id} onClick={() => void toggleControl(control)} aria-pressed={!!control.isAssigned} className={`rounded-full px-2.5 py-1 text-[11px] font-black transition disabled:cursor-wait disabled:opacity-60 ${control.isAssigned ? "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-white text-[#718075] dark:bg-white/[.06] dark:text-[#a6b4a9]"}`}>
                        {assignmentBusyId === control.id ? "зберігаю…" : control.isAssigned ? "активна" : "чернетка"}
                      </button>
                    </div>
                    <button type="button" onClick={() => navigate(`/edu/control-works/${control.id}${preview() ? "?preview=true" : ""}`)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-black text-[#32443a] shadow-sm dark:bg-[#0b130e] dark:text-[#d8e3db]">
                      <Settings className="size-4" />
                      Налаштувати
                    </button>
                  </div>
                ))}
                {!controls.length && <p className="rounded-2xl border border-dashed border-[#142018]/15 px-4 py-8 text-center text-sm leading-6 text-[#718075] dark:border-white/10 dark:text-[#a6b4a9]">Контрольної поки немає.</p>}
              </div>
              <button type="button" onClick={openControlBuilder} className="mt-5 w-full rounded-xl border border-[#142018]/12 px-3 py-2.5 text-sm font-black text-[#32443a] dark:border-white/10 dark:text-[#d8e3db]">
                Створити контрольну
              </button>
            </section>

            <section className="rounded-[32px] bg-[#e9f8ef] p-6 dark:bg-[#12301e]">
              <p className="text-xs font-black uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]">Правило теми</p>
              <p className="mt-3 text-sm leading-6 text-[#627269] dark:text-[#c1d2c5]">
                Тема спершу збирається в чернетку. Відкривайте учням лише ті практики й контрольні, які вже мають теорію, тести або зрозумілу схему оцінювання.
              </p>
            </section>
          </aside>
        </main>

        {mode === "task" && (
          <Modal title={editingTaskId ? "Редагувати практику" : "Нова практика"} caption={editingTaskId ? "Змініть умову, код, теорію або кількість спроб. Чернетку можна редагувати до відкриття учням." : "Одне вікно для умови, стартового коду й короткої теорії. Після створення відкриється налаштування тестів."} onClose={() => { setMode(null); setEditingTaskId(null); }} wide>
            <div className="grid gap-5 lg:grid-cols-[1fr_.85fr]">
              <section className="space-y-4 rounded-[26px] border border-[#142018]/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <TerminalSquare className="size-5 text-[#16834d] dark:text-[#7bedb4]" />
                  <h3 className="font-black">Практичне завдання</h3>
                </div>
                <input id="topic-task-title" name="taskTitle" aria-label="Назва завдання" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="Назва завдання" className="w-full rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#00d978]/15 dark:border-white/10 dark:bg-[#0d1710]" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void generateCondition()} disabled={!!aiBusy || !taskForm.title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#fff3df] px-3 py-2 text-xs font-black text-[#9b5300] disabled:opacity-45 dark:bg-[#ff8c00]/12 dark:text-[#ffbc6a]">
                    <Sparkles className="size-3.5" />
                    {aiBusy === "condition" ? "Генерую…" : "Згенерувати умову"}
                  </button>
                  <button type="button" onClick={() => void generateTemplate()} disabled={!!aiBusy || !taskForm.title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#e9f8ef] px-3 py-2 text-xs font-black text-[#147b47] disabled:opacity-45 dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                    <Sparkles className="size-3.5" />
                    {aiBusy === "template" ? "Генерую…" : "Стартовий код"}
                  </button>
                </div>
                <textarea id="topic-task-description" name="taskDescription" aria-label="Умова завдання" value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="Умова, контекст, обмеження" rows={6} className="w-full resize-none rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#00d978]/15 dark:border-white/10 dark:bg-[#0d1710]" />
                <textarea id="topic-task-template" name="taskTemplate" aria-label="Стартовий код" value={taskForm.template} onChange={(event) => setTaskForm({ ...taskForm, template: event.target.value })} placeholder="Стартовий код (необовʼязково)" rows={6} className="w-full resize-none rounded-xl border border-[#142018]/10 bg-[#0d1510] px-4 py-3 font-mono text-sm text-[#dbe8df] outline-none focus:ring-4 focus:ring-[#00d978]/15 dark:border-white/10" />
              </section>
              <section className="space-y-4 rounded-[26px] border border-[#142018]/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <BookOpen className="size-5 text-[#e17800]" />
                  <h3 className="font-black">Теорія і правила</h3>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">Спроб</span>
                  <input id="topic-task-max-attempts" name="maxAttempts" aria-label="Максимальна кількість спроб" value={taskForm.maxAttempts} onChange={(event) => setTaskForm({ ...taskForm, maxAttempts: event.target.value })} type="number" min="1" className="w-full rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm dark:border-white/10 dark:bg-[#0d1710]" />
                </label>
                <button type="button" onClick={() => void generateTheory()} disabled={!!aiBusy || !taskForm.description.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#fff3df] px-3 py-2 text-xs font-black text-[#9b5300] disabled:opacity-45 dark:bg-[#ff8c00]/12 dark:text-[#ffbc6a]">
                  <Sparkles className="size-3.5" />
                  {aiBusy === "theory" ? "Генерую…" : "Згенерувати теорію"}
                </button>
                <textarea id="topic-task-theory" name="taskTheory" aria-label="Теорія завдання" value={taskForm.theory} onChange={(event) => setTaskForm({ ...taskForm, theory: event.target.value })} placeholder="Коротке пояснення перед практикою: поняття, приклад, пастки" rows={9} className="w-full resize-none rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#00d978]/15 dark:border-white/10 dark:bg-[#0d1710]" />
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">Мініпроєкт · projectSpec JSON (необовʼязково)</label>
                  <textarea
                    id="topic-task-project-spec"
                    name="projectSpecJson"
                    aria-label="Специфікація мініпроєкту JSON"
                    value={taskForm.projectSpecJson}
                    onChange={(event) => setTaskForm({ ...taskForm, projectSpecJson: event.target.value })}
                    placeholder={'{"version":1,"kind":"MINI_PROJECT","estimatedMinutes":45,"skills":["цикли"],"milestones":[{"id":"step-1","title":"Перший етап","description":"Що має зробити учень.","required":true}]}' }
                    rows={7}
                    className="w-full resize-none rounded-xl border border-[#142018]/10 bg-[#0d1510] px-4 py-3 font-mono text-xs text-[#dbe8df] outline-none focus:ring-4 focus:ring-[#00d978]/15 dark:border-white/10"
                  />
                  <p className="mt-2 text-xs leading-5 text-[#718075] dark:text-[#a6b4a9]">Для мініпроєкту додайте тести нижче. Учень побачить етапи в IDE, а submit перевірятиметься judgeʼом.</p>
                </div>
                <button type="button" disabled={busy || !taskForm.title.trim()} onClick={() => void createTask()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3 text-sm font-black text-[#061e10] disabled:opacity-45">
                  <ArrowRight className="size-4" />
                  {editingTaskId ? "Зберегти зміни" : "Створити й додати тести"}
                </button>
              </section>
            </div>
          </Modal>
        )}

        {mode === "control" && (
          <Modal title="Нова контрольна" caption="Контрольна створюється не просто назвою: одразу визначаємо час, частини роботи й формулу оцінювання." onClose={() => setMode(null)} wide>
            <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
              <section className="space-y-4 rounded-[26px] border border-[#142018]/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="size-5 text-[#e17800]" />
                  <h3 className="font-black">Параметри контрольної</h3>
                </div>
                <input id="topic-control-title" name="controlTitle" aria-label="Назва контрольної" value={controlForm.title} onChange={(event) => setControlForm({ ...controlForm, title: event.target.value })} placeholder="Наприклад, Контрольна · Колекції" className="w-full rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm dark:border-white/10 dark:bg-[#0d1710]" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">хвилин</span>
                    <input id="topic-control-time" name="timeLimitMinutes" aria-label="Ліміт часу в хвилинах" value={controlForm.timeLimitMinutes} onChange={(event) => setControlForm({ ...controlForm, timeLimitMinutes: event.target.value })} type="number" min="1" className="w-full rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm dark:border-white/10 dark:bg-[#0d1710]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">тестів</span>
                    <input id="topic-control-quiz-count" name="quizCount" aria-label="Кількість тестів" value={controlForm.quizCount} onChange={(event) => setControlForm({ ...controlForm, quizCount: event.target.value })} type="number" min="0" className="w-full rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm dark:border-white/10 dark:bg-[#0d1710]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">практик</span>
                    <input id="topic-control-practice-count" name="practiceCount" aria-label="Кількість практичних задач" value={controlForm.practiceCount} onChange={(event) => setControlForm({ ...controlForm, practiceCount: event.target.value })} type="number" min="0" className="w-full rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-4 py-3 text-sm dark:border-white/10 dark:bg-[#0d1710]" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl bg-[#f2f6f2] p-4 text-sm font-black dark:bg-white/[.05]">
                    <input type="checkbox" checked={controlForm.hasTheory} onChange={(event) => setControlForm({ ...controlForm, hasTheory: event.target.checked })} />
                    Теоретичний тест
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl bg-[#f2f6f2] p-4 text-sm font-black dark:bg-white/[.05]">
                    <input type="checkbox" checked={controlForm.hasPractice} onChange={(event) => setControlForm({ ...controlForm, hasPractice: event.target.checked })} />
                    Практична частина
                  </label>
                </div>
              </section>
              <section className="space-y-4 rounded-[26px] border border-[#142018]/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center gap-3">
                  <ListChecks className="size-5 text-[#16834d] dark:text-[#7bedb4]" />
                  <h3 className="font-black">Оцінювання</h3>
                </div>
                <textarea id="topic-control-formula" name="gradingFormula" aria-label="Формула оцінювання" value={controlForm.formula} onChange={(event) => setControlForm({ ...controlForm, formula: event.target.value })} rows={6} className="w-full resize-none rounded-xl border border-[#142018]/10 bg-[#0d1510] px-4 py-3 font-mono text-sm text-[#dbe8df] outline-none focus:ring-4 focus:ring-[#00d978]/15 dark:border-white/10" />
                <div className="rounded-2xl bg-[#e9f8ef] p-4 text-sm leading-6 text-[#506057] dark:bg-[#12301e] dark:text-[#c1d2c5]">
                  Після створення відкриється control studio — там можна згенерувати квіз, додати практичні задачі та перевірити формулу.
                </div>
                <button type="button" disabled={busy || !controlForm.title.trim() || (!controlForm.hasTheory && !controlForm.hasPractice)} onClick={() => void createControl()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3 text-sm font-black text-[#061e10] disabled:opacity-45">
                  <Settings className="size-4" />
                  Створити й налаштувати
                </button>
              </section>
            </div>
          </Modal>
        )}

        {mode === "tests" && selectedTask && (
          <Modal title={`Тести · ${selectedTask.title}`} caption="Згенеруйте тести, імпортуйте пари sample.in + sample.out або додайте один тест вручну. Вони використовуються автоперевіркою." onClose={() => { setMode(null); setSelectedTask(null); setTestNotice(null); setImportFiles([]); }} wide>
            <div className="grid gap-5 lg:grid-cols-[1fr_.85fr]">
              <section className="space-y-3 rounded-[26px] border border-[#142018]/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black">Набір тестів</h3>
                  <span className="rounded-full bg-[#e8f6ed] px-3 py-1 text-xs font-black text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">{tests.length}</span>
                </div>
                {testNotice && <p role="status" aria-live="polite" className="rounded-2xl bg-[#e9f8ef] px-4 py-3 text-xs leading-5 text-[#287048] dark:bg-[#12301e] dark:text-[#b9e7c8]">{testNotice}</p>}
                {tests.map((test, index) => (
                  <div key={test.id} className="flex items-start gap-3 rounded-2xl bg-[#f2f6f2] p-4 dark:bg-white/[.045]">
                    <span className="mt-1 text-xs font-black text-[#e17800]">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-[#34463a] dark:text-[#d8e3db]">in: {test.input || "∅"}</p>
                      <p className="mt-1 truncate font-mono text-xs text-[#34463a] dark:text-[#d8e3db]">out: {test.expectedOutput}</p>
                    </div>
                    <button type="button" onClick={() => void removeTest(test)} aria-label={`Видалити тест ${index + 1}`} className="text-[#bd4067] dark:text-[#ff9abd]"><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                ))}
                {!tests.length && <p className="rounded-2xl border border-dashed border-[#142018]/15 px-4 py-10 text-center text-sm text-[#718075] dark:border-white/10 dark:text-[#a6b4a9]">Тестів ще немає.</p>}
              </section>
              <section className="space-y-3 rounded-[26px] border border-[#142018]/10 bg-white p-5 dark:border-white/10 dark:bg-white/[.045]">
                <div className="rounded-2xl border border-[#142018]/10 bg-[#f7faf6] p-4 dark:border-white/10 dark:bg-white/[.04]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff1dc] text-[#a55e00] dark:bg-[#ff8c00]/12 dark:text-[#ffca7e]"><Sparkles className="size-4" aria-hidden="true" /></span>
                    <div>
                      <h3 className="font-black">Згенерувати тести</h3>
                      <p className="mt-1 text-xs leading-5 text-[#718075] dark:text-[#a6b4a9]">AI створить приклади за назвою та умовою задачі.</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label htmlFor="topic-test-generation-count" className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[.1em] text-[#718075] dark:text-[#a6b4a9]">Кількість</span>
                      <input id="topic-test-generation-count" name="testGenerationCount" value={testGenerationCount} onChange={(event) => setTestGenerationCount(event.target.value)} type="number" min="1" max="50" className="w-24 rounded-xl border border-[#142018]/10 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/10 dark:bg-[#0d1710]" />
                    </label>
                    <button type="button" disabled={busy} onClick={() => void generateTests()} className="inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-3 py-2.5 text-xs font-black text-[#061e10] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/25 disabled:opacity-45">
                      <Sparkles className="size-3.5" aria-hidden="true" />
                      {busy ? "Генерую…" : "Згенерувати"}
                    </button>
                    <button type="button" disabled={busy || !tests.some((test) => test.source === "AI_GENERATED")} onClick={() => void clearGeneratedTests()} className="rounded-xl px-3 py-2.5 text-xs font-black text-[#bd4067] transition hover:bg-[#bd4067]/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff6b9d]/20 disabled:opacity-40 dark:text-[#ff9abd]">
                      Очистити AI
                    </button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#627269] dark:text-[#aab7ad]">
                    <input name="replaceGeneratedTests" type="checkbox" checked={replaceGeneratedTests} onChange={(event) => setReplaceGeneratedTests(event.target.checked)} />
                    Замінювати попередні AI-тести
                  </label>
                </div>
                <div className="rounded-2xl border border-[#142018]/10 bg-[#f7faf6] p-4 dark:border-white/10 dark:bg-white/[.04]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e9f8ef] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]"><Upload className="size-4" aria-hidden="true" /></span>
                    <div>
                      <h3 className="font-black">Імпорт .in / .out</h3>
                      <p className="mt-1 text-xs leading-5 text-[#718075] dark:text-[#a6b4a9]">Файли з однаковою назвою обʼєднаються в один тест.</p>
                    </div>
                  </div>
                  <label htmlFor="topic-test-files" className="mt-3 block text-xs font-black text-[#32443a] dark:text-[#d8e3db]">Файли тестів</label>
                  <input key={importInputKey} id="topic-test-files" name="testFiles" type="file" multiple accept=".in,.out,text/plain" onChange={(event) => setImportFiles(Array.from(event.target.files || []))} className="mt-1 block w-full rounded-xl border border-dashed border-[#142018]/20 bg-white px-3 py-2 text-xs text-[#536258] outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#e9f8ef] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#16834d] focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/15 dark:bg-[#0d1710] dark:text-[#c7d5ca]" />
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label htmlFor="topic-import-points" className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[.1em] text-[#718075] dark:text-[#a6b4a9]">Бали</span>
                      <input id="topic-import-points" name="importPoints" value={importPoints} onChange={(event) => setImportPoints(event.target.value)} type="number" min="1" max="100" className="w-20 rounded-xl border border-[#142018]/10 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/10 dark:bg-[#0d1710]" />
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-xs font-bold text-[#627269] dark:text-[#aab7ad]">
                      <input name="importIsHidden" type="checkbox" checked={importIsHidden} onChange={(event) => setImportIsHidden(event.target.checked)} />
                      Приховані
                    </label>
                    <button type="button" disabled={busy || importFiles.length === 0} onClick={() => void importTestFiles()} className="inline-flex items-center gap-2 rounded-xl border border-[#16834d]/25 bg-white px-3 py-2.5 text-xs font-black text-[#16834d] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 disabled:opacity-45 dark:bg-[#0b130e] dark:text-[#72edb0]">
                      <Upload className="size-3.5" aria-hidden="true" />
                      Імпортувати{importFiles.length ? ` (${importFiles.length})` : ""}
                    </button>
                  </div>
                </div>
                <div className="border-t border-[#142018]/10 pt-3 dark:border-white/10">
                  <h3 className="font-black">Додати тест вручну</h3>
                  <textarea id="topic-test-input" name="testInput" aria-label="Вхідні дані тесту" value={testForm.input} onChange={(event) => setTestForm({ ...testForm, input: event.target.value })} placeholder="Вхідні дані" rows={4} spellCheck={false} className="mt-3 w-full resize-none rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-3 py-2 font-mono text-xs outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/10 dark:bg-[#0d1710]" />
                  <textarea id="topic-test-output" name="expectedOutput" aria-label="Очікуваний результат тесту" value={testForm.expectedOutput} onChange={(event) => setTestForm({ ...testForm, expectedOutput: event.target.value })} placeholder="Очікуваний результат" rows={4} spellCheck={false} className="mt-3 w-full resize-none rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-3 py-2 font-mono text-xs outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/10 dark:bg-[#0d1710]" />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label htmlFor="topic-test-points" className="sr-only">Бали за тест</label>
                    <input id="topic-test-points" name="testPoints" aria-label="Бали за тест" value={testForm.points} onChange={(event) => setTestForm({ ...testForm, points: event.target.value })} type="number" min="1" className="w-24 rounded-xl border border-[#142018]/10 bg-[#f8fbf8] px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/20 dark:border-white/10 dark:bg-[#0d1710]" />
                    <label className="flex items-center gap-2 text-sm font-bold text-[#627269] dark:text-[#aab7ad]">
                      <input name="testIsHidden" type="checkbox" checked={testForm.isHidden} onChange={(event) => setTestForm({ ...testForm, isHidden: event.target.checked })} />
                      Прихований
                    </label>
                    <button type="button" disabled={busy || !testForm.expectedOutput.trim()} onClick={() => void addTest()} className="rounded-xl bg-[#00d978] px-4 py-3 text-sm font-black text-[#061e10] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00d978]/25 disabled:opacity-45">
                      Додати до набору
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
