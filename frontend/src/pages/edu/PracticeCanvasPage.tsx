import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getTask,
  runCode,
  submitCode,
  type TaskWithGrade,
} from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import {
  StudyCodIDEWorkspace,
  type StudyCodIdeCheckResult,
  type StudyCodIdeRunResult,
} from "../../components/ide/StudyCodIDEWorkspace";
import type { JudgeLanguage } from "../../lib/judgeLanguages";

const preview = () =>
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "true";
const starter: Record<string, string> = {
  PYTHON:
    "def solve(numbers):\n    # write your solution\n    return 0\n\nprint(solve([]))",
  JAVA: "public class Main {\n  public static void main(String[] args) {\n    // write your solution\n  }\n}",
  CPP: "#include <iostream>\nusing namespace std;\n\nint main() {\n  // write your solution\n  return 0;\n}",
};
const demoTask: TaskWithGrade = {
  id: 501,
  title: "Словник частот",
  description:
    "Створіть функцію, яка отримує список слів і повертає словник з кількістю появ кожного слова. Ігноруйте регістр, але збережіть ключі в нижньому регістрі.",
  template: starter.PYTHON,
  language: "PYTHON",
  testDataCount: 5,
  savedCode: starter.PYTHON,
  maxAttempts: 3,
  attemptsUsed: 1,
  lesson: {
    id: 41,
    title: "Колекції: мислити даними",
    type: "LESSON",
    hasTheory: true,
  },
  hasGrade: false,
};
const workspace = "mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10";

export const PracticeCanvasPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const id = Number(taskId);
  const navigate = useNavigate();
  const location = useLocation();
  const [task, setTask] = React.useState<TaskWithGrade | null>(null);
  const [code, setCode] = React.useState("");
  const [input, setInput] = React.useState("");
  const [consoleText, setConsoleText] = React.useState(
    "Запустіть код, щоб побачити результат тут.",
  );
  const [consoleTone, setConsoleTone] = React.useState<"idle" | "ok" | "bad">(
    "idle",
  );
  const [hints, setHints] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"run" | "submit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTask(id);
      setTask(result);
      setCode(
        result.savedCode || result.template || starter[result.language] || "",
      );
      setHints([]);
      setError(null);
    } catch (caught) {
      if (preview()) {
        setTask(demoTask);
        setCode(demoTask.savedCode || demoTask.template);
      } else
        setError(
          getErrorMessageFromUnknown(caught, "Не вдалося відкрити задачу."),
        );
    } finally {
      setLoading(false);
    }
  }, [id]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const run = async () => {
    if (!task) return;
    setBusy("run");
    try {
      if (preview()) {
        setConsoleTone("ok");
        setConsoleText("4\n\nКод виконано без помилок.");
        return;
      }
      const result = await runCode(task.id, code, input);
      setConsoleTone(result.stderr ? "bad" : "ok");
      setConsoleText(
        result.stderr
          ? `${result.output || ""}\n${result.stderr}`
          : result.output || "Виконано без виводу.",
      );
    } catch (caught) {
      setConsoleTone("bad");
      setConsoleText(
        getErrorMessageFromUnknown(caught, "Не вдалося виконати код."),
      );
    } finally {
      setBusy(null);
    }
  };
  const submit = async () => {
    if (!task) return;
    setBusy("submit");
    try {
      if (preview()) {
        setConsoleTone("ok");
        setConsoleText("5 / 5 тестів пройдено\nРоботу надіслано на перевірку.");
        setHints([
          "Перевір, де саме формується словник частот, і чи всі слова проходять через lower().",
          "Спробуй використати один прохід по списку та оновлювати значення ключа під час зустрічі слова.",
        ]);
        setTask({
          ...task,
          hasGrade: true,
          grade: {
            id: 1,
            total: 100,
            testsPassed: 5,
            testsTotal: 5,
            isCompleted: true,
          },
        });
        return;
      }
      const response = await submitCode(task.id, code);
      const passed = response.grade.testsPassed;
      const total = response.grade.testsTotal;
      setHints(Array.isArray(response.hints) ? response.hints : []);
      setConsoleTone(passed === total ? "ok" : "bad");
      setConsoleText(
        `${passed} / ${total} тестів пройдено\n${response.hints?.join("\n") || "Результат збережено."}`,
      );
      await load();
    } catch (caught) {
      setConsoleTone("bad");
      setConsoleText(
        getErrorMessageFromUnknown(caught, "Не вдалося надіслати розв'язок."),
      );
    } finally {
      setBusy(null);
    }
  };
  if (loading)
    return (
      <div className={workspace}>
        <div className="h-[760px] animate-pulse rounded-[32px] bg-[#e8eeea] dark:bg-white/[.05]" />
      </div>
    );
  if (!task)
    return <div className={workspace}>{error || "Задачу не знайдено."}</div>;
  const grade = task.grade;
  /* const status = grade?.isCompleted
    ? "Завершено"
    : `${task.attemptsUsed || 0} / ${task.maxAttempts || "∞"} спроб`;
  */
  const ideCheckResult: StudyCodIdeCheckResult | null = grade
    ? {
        verdict: grade.isCompleted ? "AC" : "WA",
        testsPassed: grade.testsPassed,
        testsTotal: grade.testsTotal,
        score: grade.total,
        maxScore: 100,
        publicTestResults: (grade.testResults || []).map((test, index) => ({
          testId: Number(test.testId || index + 1),
          input: test.input,
          expectedOutput: test.expected,
          actualOutput: test.actual,
          passed: test.passed,
          verdict: test.verdict,
          error: test.error,
          stderr: test.stderr,
        })),
      }
    : null;
  const ideRunResult: StudyCodIdeRunResult | null =
    consoleTone === "idle"
      ? null
      : {
          stdout: consoleTone === "ok" ? consoleText : "",
          stderr: consoleTone === "bad" ? consoleText : "",
          exitCode: consoleTone === "ok" ? 0 : 1,
          success: consoleTone === "ok",
        };
  return (
    <StudyCodIDEWorkspace
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        section: task.lesson.title,
      }}
      theory={task.lesson.theory || null}
      language={task.language as JudgeLanguage}
      onLanguageChange={() => undefined}
      compiler={task.language}
      onCompilerChange={() => undefined}
      code={code}
      onCodeChange={setCode}
      files={[
        {
          path:
            task.language === "JAVA"
              ? "Main.java"
              : task.language === "PYTHON"
                ? "main.py"
                : "main.cpp",
          content: code,
        },
      ]}
      onFilesChange={(next) => setCode(next[0]?.content || "")}
      useFiles={false}
      onEnableFiles={() => undefined}
      entryFile={
        task.language === "JAVA"
          ? "Main.java"
          : task.language === "PYTHON"
            ? "main.py"
            : "main.cpp"
      }
      stdin={input}
      onStdinChange={setInput}
      firstExampleInput={undefined}
      onUseExampleInput={() => undefined}
      running={busy === "run"}
      checking={busy === "submit"}
      onRun={() => void run()}
      onCheck={() => void submit()}
      onSave={() => undefined}
      onReset={() => setCode(task.template || starter[task.language] || "")}
      readOnly={task.isClosed}
      onBack={() =>
        navigate(
          (location.state as { from?: string } | null)?.from ||
            `/edu/lessons/${task.lesson.id}`,
        )
      }
      runResult={ideRunResult}
      checkResult={ideCheckResult}
      hints={hints}
    />
  );
  /* Legacy task canvas retained below for reference; the shared IDE is the live renderer.
  return (
    <div className={workspace}>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button"
          onClick={() =>
            navigate(
              (location.state as { from?: string } | null)?.from ||
                `/edu/lessons/${task.lesson.id}`,
            )
          }
          className="inline-flex items-center gap-2 text-sm font-bold text-[#617268] transition hover:text-[#16834d] dark:text-[#aab7ad] dark:hover:text-[#72edb0]"
        >
          <ArrowLeft className="h-4 w-4" />
          До уроку
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${grade?.isCompleted ? "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-[#fff1dc] text-[#a55e00] dark:bg-[#ff8c00]/12 dark:text-[#ffca7e]"}`}
          >
            {status}
          </span>
          <span className="rounded-full bg-[#edf2ed] px-3 py-1.5 text-xs font-bold text-[#617268] dark:bg-white/[.06] dark:text-[#aab7ad]">
            {task.language}
          </span>
        </div>
      </header>
      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/[.08] px-4 py-3 text-sm text-[#c4436b] dark:text-[#ff9abd]">
          {error}
        </div>
      )}
      <main className="grid overflow-hidden rounded-[32px] border border-[#19291d]/10 bg-white shadow-[0_18px_55px_rgba(20,43,26,.08)] dark:border-white/[.09] dark:bg-[#111b14] xl:grid-cols-[minmax(360px,.82fr)_minmax(500px,1.18fr)]">
        <section className="border-b border-[#19291d]/10 dark:border-white/[.08] xl:border-b-0 xl:border-r">
          <div className="p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#e17800]">
              Практика · {task.lesson.title}
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em] sm:text-4xl">
              {task.title}
            </h1>
            <p className="mt-4 text-base leading-8 text-[#4a5a50] dark:text-[#c7d3ca]">
              {task.description}
            </p>
          </div>
          <button type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex w-full items-center justify-between border-y border-[#19291d]/10 px-6 py-4 text-sm font-bold dark:border-white/[.08] sm:px-8"
          >
            <span>Що перевіряється</span>
            <ChevronDown
              className={`h-4 w-4 transition ${detailsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {detailsOpen && (
            <div className="space-y-3 p-6 sm:p-8">
              <div className="flex gap-3 rounded-2xl bg-[#f3f7f3] p-4 dark:bg-white/[.045]">
                <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16834d] dark:text-[#72edb0]" />
                <p className="text-sm leading-6 text-[#607066] dark:text-[#bfcbc2]">
                  Коректність на прихованих та відкритих тестах. Пишіть рішення,
                  яке працює для будь-якого валідного вводу.
                </p>
              </div>
              <div className="flex gap-3 rounded-2xl bg-[#fff5e5] p-4 dark:bg-[#ff8c00]/10">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#c97600] dark:text-[#ffca7e]" />
                <p className="text-sm leading-6 text-[#825c19] dark:text-[#ffd296]">
                  Рухайтесь малими кроками: спочатку запустіть приклад, потім
                  перевірте крайні випадки.
                </p>
              </div>
            </div>
          )}
          <div className="p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.13em] text-[#718075] dark:text-[#a6b4a9]">
              Ваш результат
            </p>
            <div className="mt-3 flex items-end gap-3">
              <span className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em]">
                {grade?.total ?? "—"}
              </span>
              <span className="mb-1 text-sm text-[#708077] dark:text-[#a6b4a9]">
                {grade
                  ? `${grade.testsPassed}/${grade.testsTotal} тестів`
                  : "ще не перевірено"}
              </span>
            </div>
          </div>
        </section>
        <section className="min-w-0 bg-[#f7faf7] p-4 dark:bg-[#0d1510] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 dark:bg-[#152018]">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                <Code2 className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold">Розв'язок</span>
            </div>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => void run()}
                disabled={busy !== null}
                className="rounded-xl bg-[#edf2ed] px-3 py-2 text-xs font-bold text-[#314239] disabled:opacity-40 dark:bg-white/[.08] dark:text-[#dbe6de]"
              >
                <Play className="mr-1 inline h-3.5 w-3.5" />
                {busy === "run" ? "Запуск…" : "Запустити"}
              </button>
              <button type="button"
                onClick={() => void submit()}
                disabled={busy !== null || task.isClosed}
                className="rounded-xl bg-[#153321] px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-[#00d978] dark:text-[#062211]"
              >
                <Send className="mr-1 inline h-3.5 w-3.5" />
                {busy === "submit" ? "Надсилання…" : "Перевірити"}
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-[22px] border border-[#19291d]/10 bg-[#fdfefd] dark:border-white/[.08] dark:bg-[#101a13]">
            <React.Suspense
              fallback={
                <div className="h-[430px] animate-pulse bg-[#eef4ef] dark:bg-white/[.04]" />
              }
            >
              <Editor
                height="430px"
                language={languageMap[task.language] || "python"}
                value={code}
                onChange={(value) => setCode(value || "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  padding: { top: 18, bottom: 18 },
                  scrollBeyondLastLine: false,
                  lineNumbersMinChars: 3,
                  roundedSelection: true,
                }}
              />
            </React.Suspense>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
            <label className="rounded-2xl bg-white p-4 dark:bg-[#152018]">
              <span className="text-xs font-bold uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">
                Ввід для запуску
              </span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="За потреби додайте власні дані"
                rows={4}
                className="mt-3 w-full resize-none bg-transparent font-mono text-xs leading-6 outline-none placeholder:text-[#95a39a] dark:placeholder:text-[#718076]"
              />
            </label>
            <section
              className={`rounded-2xl p-4 ${consoleTone === "ok" ? "bg-[#e9f7ee] dark:bg-[#00ff88]/10" : consoleTone === "bad" ? "bg-[#fff0f5] dark:bg-[#ff6b9d]/10" : "bg-white dark:bg-[#152018]"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${consoleTone === "ok" ? "bg-[#18a45e]" : consoleTone === "bad" ? "bg-[#ff6b9d]" : "bg-[#d1ddd3]"}`}
                />
                <span className="text-xs font-bold uppercase tracking-[.12em] text-[#718075] dark:text-[#a6b4a9]">
                  Результат
                </span>
              </div>
              <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-[#3c4d42] dark:text-[#d3dfd6]">
                {consoleText}
              </pre>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
  */
};
