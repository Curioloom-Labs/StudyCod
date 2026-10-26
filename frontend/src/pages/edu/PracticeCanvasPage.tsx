import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getTask,
  runCode,
  submitCode,
  type LearningAttemptSummary,
  type LearningFeedback,
  type TaskWithGrade,
} from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import {
  StudyCodIDEWorkspace,
  type StudyCodIdeCheckResult,
  type StudyCodIdeRunResult,
} from "../../components/ide/StudyCodIDEWorkspace";
import { type CodeEditorHandle } from "../../components/CodeEditor";
import { scopedStorageKey } from "../../lib/storageScope";
import { defaultCompilerForFamily, JUDGE_ENTRY_FILES } from "../../lib/judgeLanguages";
import type { JudgeLanguage } from "../../lib/judgeLanguages";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { FailureRecoveryCard } from "../../components/FailureRecoveryCard";

const preview = () =>
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "true";
const getSafeEduReturnTo = (search: string): string | null => {
  const requested = new URLSearchParams(search).get("returnTo");
  if (!requested || requested.startsWith("//") || requested.includes("\\")) return null;
  try {
    const target = new URL(requested, window.location.origin);
    if (target.origin !== window.location.origin || !/^\/edu(?:\/|$)/.test(target.pathname)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
};
const starter: Record<string, string> = {
  PYTHON:
    "def solve(numbers):\n    # write your solution\n    return 0\n\nprint(solve([]))",
  JAVA: "public class Main {\n  public static void main(String[] args) {\n    // write your solution\n  }\n}",
  CPP: "#include <iostream>\nusing namespace std;\n\nint main() {\n  // write your solution\n  return 0;\n}",
};
const loopBoundaryStarter = "def sum_to(n):\n    total = 0\n    for value in range(1, n):\n        total += value\n    return total\n\nprint(sum_to(5))";
const demoTask: TaskWithGrade = {
  id: 501,
  title: "Сума від 1 до n",
  description: "Напишіть sum_to(n), яка повертає суму цілих чисел від 1 до n включно. Для n = 5 очікуємо 15.",
  template: loopBoundaryStarter,
  language: "PYTHON",
  testDataCount: 1,
  savedCode: loopBoundaryStarter,
  maxAttempts: 3,
  attemptsUsed: 1,
  lesson: {
    id: 41,
    title: "Цикли: від ідеї до коду",
    type: "LESSON",
    hasTheory: true,
  },
  hasGrade: false,
};
const workspace = "mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10";
const entryFileForLanguage = (language: string) => JUDGE_ENTRY_FILES[String(language).toLowerCase() as JudgeLanguage] || "main.py";
type PracticeDraft = {
  code: string;
  viewState: ReturnType<CodeEditorHandle["saveViewState"]>;
  savedAt: number;
};
const practiceDraftKey = (taskId: number) => scopedStorageKey("studycod:edu:practice-draft:v1", taskId);
const readPracticeDraft = (taskId: number): PracticeDraft | null => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(practiceDraftKey(taskId)) || "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<PracticeDraft>;
    return typeof draft.code === "string" ? {
      code: draft.code,
      viewState: draft.viewState ?? null,
      savedAt: typeof draft.savedAt === "number" ? draft.savedAt : 0,
    } : null;
  } catch {
    return null;
  }
};

export const PracticeCanvasPage: React.FC = () => {
  useTranslation();
  const { taskId } = useParams<{ taskId: string }>();
  const id = Number(taskId);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = getSafeEduReturnTo(location.search);
  const [task, setTask] = React.useState<TaskWithGrade | null>(null);
  const [code, setCode] = React.useState("");
  const [input, setInput] = React.useState("");
  const [consoleText, setConsoleText] = React.useState(
    tr("Запустіть код, щоб побачити результат тут.", "Run your code to see the output here."),
  );
  const [consoleTone, setConsoleTone] = React.useState<"idle" | "ok" | "bad">(
    "idle",
  );
  const [hints, setHints] = React.useState<string[]>([]);
  const [learningFeedback, setLearningFeedback] = React.useState<LearningFeedback | null>(null);
  const [learningAttempt, setLearningAttempt] = React.useState<LearningAttemptSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"run" | "submit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const codeRef = React.useRef(code);
  const draftReadyRef = React.useRef(false);
  const codeEditorRef = React.useRef<CodeEditorHandle | null>(null);
  const draftSaveTimerRef = React.useRef<number | null>(null);
  const editorStateSubscriptionsRef = React.useRef<Array<{ dispose: () => void }>>([]);
  React.useEffect(() => { codeRef.current = code; }, [code]);
  const persistDraft = React.useCallback(() => {
    if (!draftReadyRef.current || !Number.isFinite(id) || id <= 0) return;
    try {
      const draft: PracticeDraft = {
        code: codeRef.current,
        viewState: codeEditorRef.current?.saveViewState() ?? null,
        savedAt: Date.now(),
      };
      localStorage.setItem(practiceDraftKey(id), JSON.stringify(draft));
    } catch {
      // A private window or full storage quota must not interrupt the editor.
    }
  }, [id]);
  const scheduleDraftSave = React.useCallback(() => {
    if (draftSaveTimerRef.current != null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      persistDraft();
    }, 280);
  }, [persistDraft]);
  const handleCodeChange = React.useCallback((nextCode: string) => {
    codeRef.current = nextCode;
    setCode(nextCode);
    scheduleDraftSave();
  }, [scheduleDraftSave]);
  const handleCodeEditorMount = React.useCallback((editor: CodeEditorHandle) => {
    codeEditorRef.current = editor;
    editorStateSubscriptionsRef.current.forEach(subscription => subscription.dispose());
    editorStateSubscriptionsRef.current = [];
    const draft = readPracticeDraft(id);
    if (draft?.viewState && editor.getModel()) {
      window.requestAnimationFrame(() => {
        try {
          if (editor.getModel()) editor.restoreViewState(draft.viewState);
        } catch {
          // Ignore a view state produced by a different editor/model version.
        }
      });
    }
    editorStateSubscriptionsRef.current = [
      editor.onDidChangeCursorPosition(scheduleDraftSave),
      editor.onDidScrollChange(scheduleDraftSave),
    ];
  }, [id, scheduleDraftSave]);
  React.useEffect(() => () => {
    if (draftSaveTimerRef.current != null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = null;
    persistDraft();
    editorStateSubscriptionsRef.current.forEach(subscription => subscription.dispose());
    editorStateSubscriptionsRef.current = [];
    codeEditorRef.current = null;
  }, [persistDraft]);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTask(id);
      setTask(result);
      const savedDraft = readPracticeDraft(id);
      const nextCode = savedDraft?.code ?? (result.savedCode || result.template || starter[result.language] || "");
      codeRef.current = nextCode;
      draftReadyRef.current = true;
      setCode(nextCode);
      setHints([]);
      setLearningFeedback(null);
      setLearningAttempt(null);
      setError(null);
    } catch (caught) {
      if (preview()) {
        setTask(demoTask);
        const savedDraft = readPracticeDraft(id);
        const nextCode = savedDraft?.code ?? (demoTask.savedCode || demoTask.template);
        codeRef.current = nextCode;
        draftReadyRef.current = true;
        setCode(nextCode);
      } else
        setError(
          getErrorMessageFromUnknown(caught, tr("Не вдалося відкрити задачу.", "Could not open the problem.")),
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
        const includesLastNumber = /\brange\s*\(\s*1\s*,\s*n\s*\+\s*1\s*\)/.test(code);
        setConsoleTone("ok");
        setConsoleText(includesLastNumber ? `15\n\n${tr("Код виконано без помилок.", "Code ran without errors.")}` : `10\n\n${tr("Для n = 5 очікувалося 15. Цикл зупинився перед числом 5.", "For n = 5, expected 15. The loop stopped before 5.")}`);
        return;
      }
      const result = await runCode(task.id, code, input);
      setConsoleTone(result.stderr ? "bad" : "ok");
      setConsoleText(
        result.stderr
          ? `${result.output || ""}\n${result.stderr}`
          : result.output || tr("Виконано без виводу.", "No output."),
      );
    } catch (caught) {
      setConsoleTone("bad");
      setConsoleText(
        getErrorMessageFromUnknown(caught, tr("Не вдалося виконати код.", "Could not run the code.")),
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
        const passed = /\brange\s*\(\s*1\s*,\s*n\s*\+\s*1\s*\)/.test(code);
        setConsoleTone(passed ? "ok" : "bad");
        setConsoleText(passed
          ? tr("Публічний тест 1/1 пройдено: n = 5 → 15", "Public test 1/1 passed: n = 5 → 15")
          : tr("Публічний тест 0/1 · n = 5\nОчікувалося: 15\nОтримано: 10\n\nУ range права межа не входить у послідовність.", "Public test 0/1 · n = 5\nExpected: 15\nReceived: 10\n\nrange excludes its upper bound."));
        setHints(passed ? [] : [
          tr("Щоб включити n до циклу, додай 1 до правої межі range.", "Add 1 to range's upper bound so the loop includes n."),
        ]);
        setTask({
          ...task,
          hasGrade: true,
          grade: {
            id: 1,
            total: passed ? 100 : 0,
            testsPassed: passed ? 1 : 0,
            testsTotal: 1,
            isCompleted: passed,
            submittedCode: code,
            testResults: [{ passed, testId: 1, verdict: passed ? "AC" : "WA", errorKind: passed ? null : "WRONG_ANSWER", input: "5", expected: "15", actual: passed ? "15" : "10" }],
          },
        });
        return;
      }
      const response = await submitCode(task.id, code);
      const passed = response.grade.testsPassed;
      const total = response.grade.testsTotal;
      setHints(Array.isArray(response.hints) ? response.hints : []);
      setLearningFeedback(response.learningFeedback ?? null);
      setLearningAttempt(response.learningAttempt ?? null);
      const score = response.scoring?.score ?? response.grade.total ?? 0;
      setTask((current) => current ? {
        ...current,
        hasGrade: true,
        grade: {
          ...current.grade,
          id: response.grade.id,
          total: score,
          score,
          maxScore: response.scoring?.maxScore ?? 100,
          testsPassed: passed,
          testsTotal: total,
          isCompleted: response.learningFeedback?.verdict?.toUpperCase() === "AC" || (total > 0 && passed >= total),
          submittedCode: code,
          groupScores: response.scoring?.groupScores ?? null,
          testResults: (response.testResults ?? []).map((test) => ({
            passed: test.passed,
            testId: test.testId,
            verdict: test.verdict,
            errorKind: test.errorKind,
            input: test.input,
            expected: test.expected,
            actual: test.actual,
            stderr: test.stderr,
          })),
        },
      } : current);
      setConsoleTone(passed === total ? "ok" : "bad");
      setConsoleText(
        `${passed} / ${total} ${tr("тестів пройдено", "tests passed")}\n${response.hints?.join("\n") || tr("Результат збережено.", "Result saved.")}`,
      );
    } catch (caught) {
      setConsoleTone("bad");
      setConsoleText(
        getErrorMessageFromUnknown(caught, tr("Не вдалося надіслати розв'язок.", "Could not submit the solution.")),
      );
    } finally {
      setBusy(null);
    }
  };
  if (loading)
    return (
      <div className={workspace}>
        <div className="h-[760px] animate-pulse rounded-[32px] bg-bg-hover dark:bg-white/[.05]" />
      </div>
    );
  if (!task)
    return <div className={workspace}>{error || tr("Задачу не знайдено.", "Problem not found.")}</div>;
  const grade = task.grade;
  /* const status = grade?.isCompleted
    ? "Завершено"
    : `${task.attemptsUsed || 0} / ${task.maxAttempts || "∞"} спроб`;
  */
  const ideCheckResult: StudyCodIdeCheckResult | null = grade
    ? {
        verdict: learningFeedback?.verdict ?? (grade.isCompleted ? "AC" : "WA"),
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
  const ideLanguage = String(task.language).toLowerCase() as JudgeLanguage;
  return (
    <StudyCodIDEWorkspace
      toolbar={preview() ? <span role="status" className="rounded-md border border-accent-warn/25 bg-accent-warn/[.08] px-2 py-1 text-[10px] font-semibold text-text-secondary">{tr("Демо: перевірка одного публічного тесту змодельована локально", "Demo: one public test is simulated locally")}</span> : undefined}
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        section: task.lesson.title,
      }}
      expandResultsOnFailure
      theory={task.lesson.theory || null}
      language={ideLanguage}
      onLanguageChange={() => undefined}
      disableLanguageChange
      compiler={defaultCompilerForFamily(ideLanguage)}
      onCompilerChange={() => undefined}
      code={code}
      onCodeChange={handleCodeChange}
      onCodeEditorMount={handleCodeEditorMount}
      files={[
        {
          path: entryFileForLanguage(task.language),
          content: code,
        },
      ]}
      onFilesChange={(next) => setCode(next[0]?.content || "")}
      useFiles={false}
      onEnableFiles={() => undefined}
      entryFile={entryFileForLanguage(task.language)}
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
            returnTo ||
            `/edu/lessons/${task.lesson.id}`,
        )
      }
      runResult={ideRunResult}
      checkResult={ideCheckResult}
      hints={hints}
      resultCards={({ onReturnToCode }) => {
        const verdict = String(learningFeedback?.verdict ?? ideCheckResult?.verdict ?? "").toUpperCase();
        if (!ideCheckResult || !verdict || verdict === "AC" || grade?.isManuallyGraded) return null;
        return <FailureRecoveryCard
          verdict={verdict}
          testsPassed={ideCheckResult.testsPassed}
          testsTotal={ideCheckResult.testsTotal}
          score={ideCheckResult.score}
          maxScore={ideCheckResult.maxScore}
          firstFailure={learningFeedback?.firstFailure ?? null}
          availableHints={hints}
          taskId={task.id}
          taskKind="EDU"
          learningAttemptId={learningAttempt?.id}
          failureCategory={learningAttempt?.failureCategory ?? learningFeedback?.firstFailure?.errorKind ?? null}
          highestHintLevelShown={learningAttempt?.highestHintLevelShown ?? 0}
          onTryAgain={onReturnToCode}
        />;
      }}
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
          className="inline-flex items-center gap-2 text-sm font-bold text-text-muted transition hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"
        >
          <ArrowLeft className="h-4 w-4" />
          {tr("До уроку", "Back to lesson")}
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${grade?.isCompleted ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-bg-hover text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn"}`}
          >
            {status}
          </span>
          <span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-text-muted dark:bg-white/[.06] dark:text-text-secondary">
            {task.language}
          </span>
        </div>
      </header>
      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm text-accent-error dark:text-accent-error">
          {error}
        </div>
      )}
      <main className="grid overflow-hidden rounded-[32px] border border-border/10 bg-white shadow-[0_18px_55px_rgba(20,43,26,.08)] dark:border-white/[.09] dark:bg-bg-surface xl:grid-cols-[minmax(360px,.82fr)_minmax(500px,1.18fr)]">
        <section className="border-b border-border/10 dark:border-white/[.08] xl:border-b-0 xl:border-r">
          <div className="p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-accent-warn">
              Практика · {task.lesson.title}
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em] sm:text-4xl">
              {task.title}
            </h1>
            <p className="mt-4 text-base leading-8 text-text-muted dark:text-text-primary">
              {task.description}
            </p>
          </div>
          <button type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex w-full items-center justify-between border-y border-border/10 px-6 py-4 text-sm font-bold dark:border-white/[.08] sm:px-8"
          >
            <span>{tr("Що перевіряється", "What is checked")}</span>
            <ChevronDown
              className={`h-4 w-4 transition ${detailsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {detailsOpen && (
            <div className="space-y-3 p-6 sm:p-8">
              <div className="flex gap-3 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.045]">
                <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong dark:text-primary-soft" />
                <p className="text-sm leading-6 text-text-muted dark:text-text-secondary">
                  Коректність на прихованих та відкритих тестах. Пишіть рішення,
                  яке працює для будь-якого валідного вводу.
                </p>
              </div>
              <div className="flex gap-3 rounded-2xl bg-bg-hover p-4 dark:bg-accent-warn/10">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent-warn dark:text-accent-warn" />
                <p className="text-sm leading-6 text-accent-warn dark:text-accent-warn">
                  Рухайтесь малими кроками: спочатку запустіть приклад, потім
                  перевірте крайні випадки.
                </p>
              </div>
            </div>
          )}
          <div className="p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.13em] text-text-muted dark:text-text-secondary">
              {tr("Ваш результат", "Your result")}
            </p>
            <div className="mt-3 flex items-end gap-3">
              <span className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em]">
                {grade?.total ?? "—"}
              </span>
              <span className="mb-1 text-sm text-text-muted dark:text-text-secondary">
                {grade
                  ? `${grade.testsPassed}/${grade.testsTotal} тестів`
                  : "ще не перевірено"}
              </span>
            </div>
          </div>
        </section>
        <section className="min-w-0 bg-bg-hover p-4 dark:bg-bg-base sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 dark:bg-bg-base">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
                <Code2 className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold">{tr("Розв'язок", "Solution")}</span>
            </div>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => void run()}
                disabled={busy !== null}
                className="rounded-xl bg-bg-hover px-3 py-2 text-xs font-bold text-text-primary disabled:opacity-40 dark:bg-white/[.08] dark:text-text-primary"
              >
                <Play className="mr-1 inline h-3.5 w-3.5" />
                {busy === "run" ? "Запуск…" : "Запустити"}
              </button>
              <button type="button"
                onClick={() => void submit()}
                disabled={busy !== null || task.isClosed}
                className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"
              >
                <Send className="mr-1 inline h-3.5 w-3.5" />
                {busy === "submit" ? "Надсилання…" : "Перевірити"}
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-[22px] border border-border/10 bg-bg-hover dark:border-white/[.08] dark:bg-bg-code">
            <React.Suspense
              fallback={
                <div className="h-[430px] animate-pulse bg-bg-hover dark:bg-white/[.04]" />
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
            <label className="rounded-2xl bg-white p-4 dark:bg-bg-base">
              <span className="text-xs font-bold uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">
                {tr("Ввід для запуску", "Input for run")}
              </span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={tr("За потреби додайте власні дані", "Add custom input if needed")}
                rows={4}
                className="mt-3 w-full resize-none bg-transparent font-mono text-xs leading-6 outline-none placeholder:text-text-secondary dark:placeholder:text-text-muted"
              />
            </label>
            <section
              className={`rounded-2xl p-4 ${consoleTone === "ok" ? "bg-bg-hover dark:bg-primary/10" : consoleTone === "bad" ? "bg-bg-hover dark:bg-accent-error/10" : "bg-white dark:bg-bg-base"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${consoleTone === "ok" ? "bg-bg-surface" : consoleTone === "bad" ? "bg-accent-error" : "bg-bg-surface"}`}
                />
                <span className="text-xs font-bold uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">
                  {tr("Результат", "Result")}
                </span>
              </div>
              <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-text-primary dark:text-text-primary">
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
