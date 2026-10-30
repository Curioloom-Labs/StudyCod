import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, Clock3, FileCheck2, Plus, Save, Sparkles, Wand2, Trash2 } from "lucide-react";
import { api } from "../../lib/api/client";
import { generateTestData, getTestData, updateControlWorkFormula } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { showToast } from "../../lib/toast";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { ClassWorkspaceFrame } from "./ClassWorkspaceNavigation";
import { withDevPreview } from "../../lib/devPreview";

type ControlTask = { id: number; title: string; description?: string; maxAttempts?: number };
type QuizItem = { question?: string; options?: Record<string, string>; correct?: string };
type Control = {
  id: number;
  title?: string | null;
  topic?: { id: number; title: string };
  topicId?: number;
  timeLimitMinutes?: number | null;
  quizJson?: string | null;
  hasTheory?: boolean;
  hasPractice?: boolean;
  formula?: string | null;
  tasks?: ControlTask[];
};

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-control-workspace";

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
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
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
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = React.useState(false);
  const [newTask, setNewTask] = React.useState({ title: "", description: "", template: "", difficulty: "3", testCount: "5", replaceGeneratedTests: true });
  const [testCounts, setTestCounts] = React.useState<Record<number, number>>({});
  const [generatingTestsFor, setGeneratingTestsFor] = React.useState<number | null>(null);
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
    setBusy(true);
    try {
      if (preview()) {
        setQuizText(JSON.stringify(demoQuiz, null, 2));
      } else {
        await api.post(`/topics/control-works/${id}/generate-quiz`, { count: 10, topicTitle: control?.topic?.title || title });
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

  const createTask = async () => {
    if (!control?.topic?.id) return;
    if (!newTask.title.trim() || !newTask.description.trim() || !newTask.template.trim()) {
      setError(tr("Заповніть назву, умову та стартовий код практичної задачі.", "Fill in the title, problem statement, and starter code."));
      return;
    }
    setBusy(true);
    setError(null);
    let generatedCount = 0;
    let testGenerationError: unknown = null;
    try {
      const testCount = Math.max(1, Math.min(50, Number(newTask.testCount) || 5));
      if (preview()) {
        const taskId = Date.now();
        setControl(old => old ? { ...old, tasks: [...(old.tasks || []), { id: taskId, title: newTask.title.trim(), description: newTask.description.trim() }] } : old);
        setTestCounts(old => ({ ...old, [taskId]: testCount }));
        generatedCount = testCount;
      } else {
        const response = await api.post(`/topics/${control.topic.id}/tasks`, {
          title: newTask.title.trim(),
          description: newTask.description.trim(),
          template: newTask.template,
          type: "CONTROL",
          controlWorkId: id,
          order: (control.tasks?.length || 0) + 1,
          maxAttempts: 1,
        });
        const createdTask = response.data?.task ?? response.data?.topicTask ?? response.data;
        const taskId = Number(createdTask?.id);
        if (Number.isSafeInteger(taskId) && taskId > 0) {
          try {
            const result = await generateTestData(taskId, testCount, { replaceGenerated: newTask.replaceGeneratedTests });
            generatedCount = result.count;
          } catch (caught) {
            testGenerationError = caught;
          }
        } else {
          testGenerationError = new Error("TASK_ID_MISSING_AFTER_CREATE");
        }
      }
      setNewTask(old => ({ ...old, title: "", description: "", template: "" }));
      setShowCreateTask(false);
      if (!preview()) await load();
      if (testGenerationError) {
        const detail = getErrorMessageFromUnknown(testGenerationError, tr("перевірте умову задачі й спробуйте ще раз", "check the problem statement and try again"));
        setError(tr(`Задачу додано, але тести не згенерувалися (${detail}). Натисніть «Згенерувати тести» біля задачі, щоб повторити.`, `The problem was added, but tests were not generated (${detail}). Click “Generate tests” beside the problem to retry.`));
      } else {
        showToast({ type: "success", message: tr(`Задачу додано до контрольної разом із ${generatedCount} тестами.`, `Problem added to the assessment with ${generatedCount} tests.`) });
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося додати практичну задачу.", "Could not add practice problem.")));
    } finally {
      setBusy(false);
    }
  };

  const generateTaskTests = async (task: ControlTask) => {
    const count = Math.max(1, Math.min(50, Number(newTask.testCount) || 5));
    setGeneratingTestsFor(task.id);
    setError(null);
    try {
      if (preview()) {
        setTestCounts(old => ({ ...old, [task.id]: count }));
      } else {
        const result = await generateTestData(task.id, count, { replaceGenerated: newTask.replaceGeneratedTests });
        let currentCount = newTask.replaceGeneratedTests ? result.count : (testCounts[task.id] ?? 0) + result.count;
        try {
          const current = await getTestData(task.id, { limit: 1, offset: 0 });
          currentCount = current.pagination?.total ?? current.testData.length;
        } catch {
          // Keep the count returned by generation if the follow-up refresh fails.
        }
        setTestCounts(old => ({ ...old, [task.id]: currentCount }));
        showToast({ type: "success", message: tr(`Додано ${result.count} тестів до задачі «${task.title}».`, `Added ${result.count} tests to “${task.title}”.`) });
      }
      if (preview()) showToast({ type: "success", message: tr(`Для задачі «${task.title}» підготовлено ${count} тестів.`, `Prepared ${count} tests for “${task.title}”.`) });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr(`Не вдалося згенерувати тести для «${task.title}».`, `Could not generate tests for “${task.title}”.`)));
    } finally {
      setGeneratingTestsFor(null);
    }
  };

  const generateTaskCondition = async () => {
    if (!control?.topic?.id || !newTask.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (preview()) {
        setNewTask(old => ({ ...old, description: tr(`## Завдання\n\nСтворіть програму для теми **${control.topic?.title || ""}**: ${old.title.trim()}.\n\n### Вхідні дані\nОпишіть значення, які отримує програма.\n\n### Вихідні дані\nВиведіть результат згідно з умовою.`, `## Problem\n\nWrite a program for **${control.topic?.title || ""}**: ${old.title.trim()}.\n\n### Input\nDescribe the values provided to the program.\n\n### Output\nPrint the result as required.`) }));
      } else {
        const response = await api.post(`/topics/${control.topic.id}/tasks/generate-condition`, {
          taskTitle: newTask.title.trim(),
          taskType: "CONTROL",
          difficulty: Math.max(1, Math.min(5, Number(newTask.difficulty) || 3)),
          language: isEn ? "en" : "uk",
        });
        setNewTask(old => ({ ...old, description: String(response.data?.description ?? old.description) }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати умову.", "Could not generate the problem statement.")));
    } finally {
      setBusy(false);
    }
  };

  const generateTaskTemplate = async () => {
    if (!control?.topic?.id || !newTask.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (preview()) {
        setNewTask(old => ({ ...old, template: "def solve():\n    # TODO: read input and implement the solution\n    pass\n\nif __name__ == \"__main__\":\n    solve()\n" }));
      } else {
        const response = await api.post(`/topics/${control.topic.id}/tasks/generate-template`, {
          taskTitle: newTask.title.trim(),
          description: newTask.description.trim(),
          language: isEn ? "en" : "uk",
        });
        setNewTask(old => ({ ...old, template: String(response.data?.template ?? old.template) }));
      }
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати стартовий код.", "Could not generate starter code.")));
    } finally {
      setBusy(false);
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
                <button type="button" onClick={() => setShowCreateTask((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-accent-warn/25 px-4 py-2.5 text-sm font-bold text-accent-warn transition hover:bg-bg-hover dark:border-accent-warn/25 dark:text-accent-warn dark:hover:bg-accent-warn/10">
                  <Plus className="h-4 w-4" />{showCreateTask ? tr("Скасувати", "Cancel") : tr("Додати практичну задачу", "Add practice problem")}
                </button>
              </div>
              {showCreateTask && (
                <div className="rounded-2xl border border-accent-warn/20 bg-bg-hover p-5 dark:border-accent-warn/20 dark:bg-[var(--surface-warning)]">
                  <p className="text-sm font-bold">{tr("Нова задача контрольної", "New assessment problem")}</p>
                  <label className="mt-4 block text-sm font-bold">{tr("Назва", "Title")}<input aria-label={tr("Назва практичної задачі", "Practice problem title")} value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} className="mt-2 w-full rounded-xl border border-border/10 bg-white px-3 py-3 text-sm font-normal outline-none focus:ring-4 focus:ring-accent-warn/15 dark:border-white/10 dark:bg-bg-code" /></label>
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><p className="flex-1 text-sm font-bold">{tr("Умова", "Problem statement")}</p><button type="button" disabled={busy || !newTask.title.trim()} onClick={() => void generateTaskCondition()} className="classroom-text-button"><Sparkles className="size-4" aria-hidden="true" />{busy ? tr("Генеруємо…", "Generating…") : tr("Згенерувати умову", "Generate statement")}</button></div>
                  <textarea aria-label={tr("Умова практичної задачі", "Practice problem statement")} value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} rows={5} className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-3 text-sm font-normal outline-none focus:ring-4 focus:ring-accent-warn/15 dark:border-white/10 dark:bg-bg-code" />
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><p className="flex-1 text-sm font-bold">{tr("Стартовий код", "Starter code")}</p><button type="button" disabled={busy || !newTask.title.trim()} onClick={() => void generateTaskTemplate()} className="classroom-text-button"><Sparkles className="size-4" aria-hidden="true" />{busy ? tr("Генеруємо…", "Generating…") : tr("Згенерувати код", "Generate code")}</button></div>
                  <textarea aria-label={tr("Стартовий код практичної задачі", "Practice problem starter code")} value={newTask.template} onChange={(event) => setNewTask({ ...newTask, template: event.target.value })} rows={5} spellCheck={false} className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-3 font-mono text-xs leading-6 outline-none focus:ring-4 focus:ring-accent-warn/15 dark:border-white/10 dark:bg-bg-code" />
                  <section className="mt-5 rounded-xl border border-border/10 bg-white/60 p-4 dark:border-white/10 dark:bg-black/10" aria-label={tr("Налаштування генератора", "Generator settings")}>
                    <h3 className="text-sm font-bold">{tr("Налаштування генератора", "Generator settings")}</h3>
                    <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Ці параметри керують складністю умови й набором тестів для задачі.", "These settings control statement difficulty and the generated test set.")}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-semibold">{tr("Складність умови", "Statement difficulty")}<select value={newTask.difficulty} onChange={event => setNewTask(old => ({ ...old, difficulty: event.target.value }))} className="mt-2 w-full rounded-xl border border-border/10 bg-white px-3 py-3 text-sm dark:border-white/10 dark:bg-bg-code"><option value="1">{tr("1 · Початкова", "1 · Introductory")}</option><option value="2">{tr("2 · Легка", "2 · Easy")}</option><option value="3">{tr("3 · Середня", "3 · Medium")}</option><option value="4">{tr("4 · Складна", "4 · Hard")}</option><option value="5">{tr("5 · Поглиблена", "5 · Advanced")}</option></select></label>
                      <label className="text-sm font-semibold">{tr("Кількість тестів", "Test count")}<input type="number" min="1" max="50" value={newTask.testCount} onChange={event => setNewTask(old => ({ ...old, testCount: event.target.value }))} className="mt-2 w-full rounded-xl border border-border/10 bg-white px-3 py-3 text-sm dark:border-white/10 dark:bg-bg-code" /></label>
                    </div>
                    <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-text-muted dark:text-text-secondary"><input type="checkbox" checked={newTask.replaceGeneratedTests} onChange={event => setNewTask(old => ({ ...old, replaceGeneratedTests: event.target.checked }))} className="mt-0.5 size-4 accent-primary" />{tr("Замінювати попередні AI-тести під час повторної генерації. Ручні тести залишаться.", "Replace previous AI tests when generating again. Manual tests are kept.")}</label>
                    <p className="mt-3 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Після додавання задачі генератор одразу підготує вказану кількість тестів.", "After adding the problem, the generator will create the selected number of tests.")}</p>
                  </section>
                  <button type="button" disabled={busy} onClick={() => void createTask()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground">{busy ? tr("Додаємо…", "Adding…") : tr("Додати до контрольної", "Add to assessment")}</button>
                </div>
              )}
              {tasks.map((task, index) => <div key={task.id} className="flex items-start gap-4 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.045]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-xs font-extrabold text-accent-warn shadow-sm dark:bg-bg-base dark:text-accent-warn">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="font-bold">{task.title}</p><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{task.description || tr("Практична частина контрольної.", "Practice section of the assessment.")}</p><div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-xs font-semibold text-text-muted dark:text-text-secondary">{tr("Тестів", "Tests")}: {testCounts[task.id] ?? 0}</span><button type="button" disabled={generatingTestsFor !== null || busy} onClick={() => void generateTaskTests(task)} className="classroom-text-button"><Sparkles className="size-3.5" aria-hidden="true" />{generatingTestsFor === task.id ? tr("Генеруємо…", "Generating…") : testCounts[task.id] ? newTask.replaceGeneratedTests ? tr("Замінити AI-тести", "Replace AI tests") : tr("Додати тести", "Add tests") : tr("Згенерувати тести", "Generate tests")}</button></div></div></div>)}
              {!tasks.length && <p className="rounded-2xl border border-dashed border-border/15 px-5 py-8 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Практичних задач ще немає.", "No practice problems yet.")}</p>}
            </div>
          </section>

          <section className="classroom-quiz-editor">
            <div className="classroom-section-title"><h2>{tr("Запитання квізу", "Quiz questions")}<span>{quiz.length}</span></h2><button type="button" className="classroom-text-button" disabled={busy} onClick={() => void generateQuiz()}><Wand2 className="size-4" aria-hidden="true" />{busy ? tr("Готуємо…", "Preparing…") : hasQuiz ? tr("Згенерувати знову", "Regenerate") : tr("Згенерувати", "Generate")}</button></div>
            <p className="classroom-caption">{tr("Введіть запитання й варіанти відповідей. Позначте правильну відповідь кружечком.", "Enter a question and its answer options. Mark the correct answer using the circle.")}</p>
            {quiz.map((item, index) => <fieldset key={index} className="classroom-quiz-question"><legend>{tr("Запитання", "Question")} {index + 1}</legend><div className="classroom-quiz-question__heading"><textarea aria-label={tr(`Текст запитання ${index + 1}`, `Question ${index + 1} text`)} value={item.question || ""} onChange={event => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, question: event.target.value } : q), null, 2))} rows={2} placeholder={tr("Введіть запитання…", "Enter a question…")} /><button type="button" className="classroom-icon-button" aria-label={tr(`Прибрати запитання ${index + 1}`, `Remove question ${index + 1}`)} onClick={() => setQuizText(JSON.stringify(quiz.filter((_, i) => i !== index), null, 2))}><Trash2 className="size-4" aria-hidden="true" /></button></div><div className="classroom-quiz-options">{Object.entries(item.options || { A: "", B: "", C: "", D: "" }).map(([key, value]) => <label key={key}><input type="radio" name={`quiz-correct-${index}`} checked={item.correct === key} aria-label={tr(`Правильна відповідь ${key} для запитання ${index + 1}`, `Correct answer ${key} for question ${index + 1}`)} onChange={() => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, correct: key } : q), null, 2))} /><span>{key}</span><input type="text" aria-label={tr(`Варіант ${key} запитання ${index + 1}`, `Question ${index + 1} option ${key}`)} value={value} onChange={event => setQuizText(JSON.stringify(quiz.map((q, i) => i === index ? { ...q, options: { ...q.options, [key]: event.target.value } } : q), null, 2))} placeholder={tr("Варіант відповіді", "Answer option")} /></label>)}</div></fieldset>)}
            <button type="button" className="classroom-add-row" onClick={() => setQuizText(JSON.stringify([...quiz, { question: "", options: { A: "", B: "", C: "", D: "" }, correct: "A" }], null, 2))}><Plus className="size-4" aria-hidden="true" />{tr("Додати запитання", "Add question")}</button>
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
