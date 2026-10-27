import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "../core/TasksPage";
import { PageLoader } from "../../components/ui/PageLoadingTransition";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";
import type { JudgeLanguage } from "../../lib/judgeLanguages";
import {
  checkCatalogProject,
  getCatalogProject,
  getCatalogQuiz,
  getLearningCourse,
  runCatalogProject,
  saveCatalogProject,
  submitCatalogQuiz,
  submitCatalogProject,
  type CatalogQuiz,
  type CatalogQuizResult,
  type LearningCourseItem,
  type LearningProject,
  type CatalogRuntime,
} from "../../lib/api/learningCatalog";
import type { CodeFile, LibraryTaskProjectSpec } from "../../lib/api/library";
import { tr } from "../../i18n";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { DEV_PREVIEW_USER, isDevPreviewActive, withDevPreview } from "../../lib/devPreview";

const kindLabel = (kind: LearningCourseItem["kind"]): string => {
  switch (kind) {
    case "THEORY": return tr("теорією", "theory");
    case "QUIZ": return tr("тестом", "quiz");
    case "WEB_TASK": return tr("вебзавданням", "web task");
    case "MANUAL": return tr("навчальним елементом", "learning item");
    case "PAGE": return tr("сторінкою", "page");
    default: return tr("елементом курсу", "course item");
  }
};

const isProjectItem = (item: LearningCourseItem | null): boolean =>
  item?.kind === "MANUAL" && item.content.project === true;

const projectTitle = (title: string): string =>
  title.replace(/^(Мініпроєкт|Mini-project):\s*/i, "");

const projectMarkdown = (item: LearningCourseItem): string => {
  const markdown = typeof item.content.markdown === "string" ? item.content.markdown : "";
  return markdown
    .split("\n")
    .filter((line) => !/README(?:\.md)?/i.test(line) && !/Спочатку спроєктуйте контракт.*README/i.test(line))
    .join("\n")
    .replace(/^##\s+[^\n]+\n*/i, "")
    .trim();
};

function toIdeProjectSpec(spec: NonNullable<LearningProject["projectSpec"]>): LibraryTaskProjectSpec {
  return {
    version: 1,
    kind: "MINI_PROJECT",
    estimatedMinutes: Number(spec.estimatedMinutes ?? 30),
    skills: spec.skills ?? [],
    inputFormat: spec.inputFormat,
    outputFormat: spec.outputFormat,
    milestones: spec.milestones,
  };
}

type CourseProjectPracticeProps = {
  courseId: string;
  item: LearningCourseItem;
};

const CourseProjectPractice: React.FC<CourseProjectPracticeProps> = ({ courseId, item }) => {
  const navigate = useNavigate();
  const [project, setProject] = React.useState<LearningProject | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [files, setFiles] = React.useState<CodeFile[]>([]);
  const [starterFiles, setStarterFiles] = React.useState<CodeFile[]>([]);
  const [milestoneIds, setMilestoneIds] = React.useState<string[]>([]);
  const [stdin, setStdin] = React.useState("");
  const [runResult, setRunResult] = React.useState<StudyCodIdeRunResult | null>(null);
  const [checkResult, setCheckResult] = React.useState<StudyCodIdeCheckResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getCatalogProject(item.id)
      .then((loaded) => {
        if (cancelled) return;
        setProject(loaded);
        const defaults = loaded.starterFiles?.length
          ? loaded.starterFiles
          : [{ path: loaded.entryFile, content: loaded.starterCode }];
        const initialFiles = loaded.progress.files?.length
          ? loaded.progress.files
          : [{ path: loaded.entryFile, content: loaded.progress.draft || loaded.starterCode }];
        setStarterFiles(defaults);
        setFiles(initialFiles);
        setCode(initialFiles.find((file) => file.path === loaded.entryFile)?.content || loaded.starterCode);
        setMilestoneIds(loaded.progress.milestoneIds || []);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(getErrorMessageFromUnknown(caught, "") === "COURSE_SEQUENCE_LOCKED"
          ? tr("Спочатку заверши попередні теми курсу.", "Complete the previous course topics first.")
          : tr("Не вдалося завантажити мініпроєкт.", "Could not load the mini-project."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [item.id]);

  const language = (project?.runtime || "JAVA").toLowerCase() as JudgeLanguage;

  const saveDraft = async () => {
    if (!project) return;
    try {
      const response = await saveCatalogProject(item.id, { milestoneIds, draft: code, files });
      if (response?.project) setProject((current) => current ? { ...current, ...response.project } : current);
      setMessage(tr("Код збережено.", "Code saved."));
      setError(null);
    } catch {
      setError(tr("Не вдалося зберегти код.", "Could not save the code."));
    }
  };

  const submit = async () => {
    if (!project) return;
    try {
      const response = await submitCatalogProject(item.id, { milestoneIds, draft: code, files });
      if (response?.project) setProject((current) => current ? { ...current, ...response.project } : current);
      setMessage(tr("Мініпроєкт подано й зараховано.", "Mini-project submitted and completed."));
      setError(null);
    } catch (caught: unknown) {
      setError(getErrorMessageFromUnknown(caught, "") === "PROJECT_REQUIREMENTS_INCOMPLETE"
        ? tr("Спочатку пройди перевірку, відміть усі milestones і збережи код.", "Run a check, complete every milestone, and save the code first.")
        : tr("Не вдалося подати мініпроєкт.", "Could not submit the mini-project."));
    }
  };

  const run = async () => {
    if (!project) return;
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const result = await runCatalogProject(item.id, files, stdin);
      setRunResult(result ? {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exitCode ?? (result.success ? 0 : 1),
        success: result.success ?? false,
        timeMs: result.timeMs,
        memoryKb: result.memoryKb,
      } : null);
    } catch (caught: unknown) {
      setError(getErrorMessageFromUnknown(caught, "") === "JUDGE_UNAVAILABLE"
        ? tr("Перевіряльник тимчасово недоступний.", "The judge is temporarily unavailable.")
        : tr("Не вдалося запустити код.", "Could not run the code."));
    } finally {
      setRunning(false);
    }
  };

  const check = async () => {
    if (!project) return;
    setChecking(true);
    setMessage(null);
    setError(null);
    try {
      const result = await checkCatalogProject(item.id, files);
      const nextCheck: StudyCodIdeCheckResult = {
        verdict: result?.verdict || (result?.passed ? "AC" : "WA"),
        testsPassed: Number(result?.testsPassed || 0),
        testsTotal: Number(result?.testsTotal || 0),
        score: Number(result?.score || 0),
        maxScore: Number(result?.maxScore || 100),
        publicTestResults: Array.isArray(result?.tests) ? result.tests.map((test, index) => ({
          testId: Number(test.test_id || index + 1),
          input: test.input,
          expectedOutput: test.expected,
          actualOutput: test.actual,
          passed: test.verdict === "AC",
          verdict: test.verdict,
          error: test.message,
          stderr: test.stderr,
        })) : [],
      };
      setCheckResult(nextCheck);
      if (result?.progress) setProject((current) => current ? { ...current, progress: { ...current.progress, ...result.progress }, itemStatus: result.itemStatus || current.itemStatus } : current);
      setMessage(result?.passed
        ? tr(`Оцінка: ${nextCheck.score}/${nextCheck.maxScore}. Код пройшов перевірку — тепер зафіксуй докази й подай проєкт.`, `Score: ${nextCheck.score}/${nextCheck.maxScore}. Code check passed — complete the evidence and submit the project.`)
        : tr(`Оцінка: ${nextCheck.score}/${nextCheck.maxScore}. Виправ код і спробуй ще раз.`, `Score: ${nextCheck.score}/${nextCheck.maxScore}. Fix the code and try again.`));
    } catch (caught: unknown) {
      setError(getErrorMessageFromUnknown(caught, "") === "PROJECT_CHECK_NOT_CONFIGURED"
        ? tr("Для цього мініпроєкту ще не налаштовані тести.", "Tests are not configured for this mini-project yet.")
        : tr("Не вдалося перевірити мініпроєкт.", "Could not check the mini-project."));
    } finally {
      setChecking(false);
    }
  };

  const ideCheckResult = checkResult;
  const projectTask = project ? {
    id: project.itemId,
    title: projectTitle(item.title),
    description: projectMarkdown(item),
    section: tr("Мініпроєкт курсу", "Course mini-project"),
    projectSpec: project.projectSpec ? toIdeProjectSpec(project.projectSpec) : null,
  } : null;

  return <main className="min-h-full bg-bg-base px-3 py-4 text-text-primary sm:px-5 sm:py-6 lg:px-8">
    <div className="mx-auto max-w-[1680px]">
      <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${courseId}/path`))} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:underline">
        <ArrowLeft className="size-4" />{tr("До тем курсу", "Back to course topics")}
      </button>
      <header className="mb-4 rounded-2xl border border-accent-warn/30 bg-accent-warn/[.06] p-5 sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-[.18em] text-accent-warn dark:text-accent-warn">{tr("Практика курсу · мініпроєкт", "Course practice · mini-project")}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-text-primary sm:text-4xl">{projectTitle(item.title)}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{tr("Це повноцінна практична задача: пиши код в IDE, запускай його та отримуй оцінку за прихованими тестами.", "This is a full practice task: write code in the IDE, run it, and get a score from hidden tests.")}</p>
      </header>
      {message && <div role="status" className="mb-4 rounded-xl border border-primary/25 bg-primary/[.06] px-4 py-3 text-sm text-primary">{message}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}
      {project?.projectSpec?.assessment?.requiredEvidence?.length ? <section className="mb-4 rounded-2xl border border-border bg-bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{tr("Докази готовності", "Readiness evidence")}</p>
            <p className="mt-1 text-sm text-text-secondary">{tr("Перевірка коду й milestones — різні кроки. Подання відкривається лише після обох.", "Code checking and milestones are separate steps. Submission opens only after both.")}</p>
          </div>
          <button type="button" onClick={() => void submit()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{tr("Подати проєкт", "Submit project")}</button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {project.projectSpec.assessment.requiredEvidence.map((evidence) => <label key={evidence.id} className="flex gap-3 rounded-xl border border-border/70 p-3 text-sm">
            <input type="checkbox" checked={milestoneIds.includes(evidence.id)} onChange={(event) => setMilestoneIds((current) => event.target.checked ? [...new Set([...current, evidence.id])] : current.filter((id) => id !== evidence.id))} className="mt-1 accent-primary" />
            <span><span className="font-bold text-text-primary">{evidence.label}</span><span className="mt-1 block text-text-secondary">{evidence.description}</span></span>
          </label>)}
        </div>
      </section> : null}
      {loading || !project || !projectTask ? <div role="status" className="h-[760px] rounded-[28px] border border-border bg-bg-surface p-6 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо мініпроєкт…", "Loading mini-project…")}</div> : <StudyCodIDEWorkspace
        task={projectTask}
        theory={null}
        language={language}
        onLanguageChange={() => undefined}
        compiler={language}
        onCompilerChange={() => undefined}
        code={code}
        onCodeChange={(next) => { setCode(next); setFiles((current) => current.map((file) => file.path === project.entryFile ? { ...file, content: next } : file)); setCheckResult(null); }}
        files={files}
        onFilesChange={(next) => { setFiles(next); setCode(next.find((file) => file.path === project.entryFile)?.content || next[0]?.content || ""); setCheckResult(null); }}
        useFiles={true}
        onEnableFiles={() => undefined}
        entryFile={project.entryFile}
        stdin={stdin}
        onStdinChange={setStdin}
        firstExampleInput={undefined}
        onUseExampleInput={() => undefined}
        running={running}
        checking={checking}
        onRun={() => void run()}
        onCheck={() => void check()}
        onSave={() => void saveDraft()}
        onReset={() => { setFiles(starterFiles); setCode(starterFiles.find((file) => file.path === project.entryFile)?.content || project.starterCode); setCheckResult(null); setRunResult(null); }}
        readOnly={false}
        disableLanguageChange
        runResult={runResult}
        checkResult={ideCheckResult}
        resultCards={checkResult ? <div className="rounded-xl border border-primary/20 bg-primary/[.06] p-3 text-sm text-text-secondary"><b className="text-text-primary">{tr("Поточна оцінка", "Current score")}</b><span className="ml-2 font-bold text-primary">{checkResult.score}/{checkResult.maxScore}</span></div> : null}
      />}
    </div>
  </main>;
};

type CourseQuizPracticeProps = {
  courseId: string;
  item: LearningCourseItem;
};

const CourseQuizPractice: React.FC<CourseQuizPracticeProps> = ({ courseId, item }) => {
  const navigate = useNavigate();
  const [quiz, setQuiz] = React.useState<CatalogQuiz | null>(null);
  const [result, setResult] = React.useState<CatalogQuizResult | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getCatalogQuiz(item.id)
      .then((loaded) => { if (!cancelled) { setQuiz(loaded); setError(null); } })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const code = getErrorMessageFromUnknown(caught, "");
        setError(code === "COURSE_SEQUENCE_LOCKED"
          ? tr("Спочатку заверши попередні елементи маршруту.", "Complete the previous roadmap items first.")
          : code === "PREREQUISITES_INCOMPLETE"
            ? tr("Спочатку заверши потрібний базовий курс.", "Complete the required foundation course first.")
            : tr("Не вдалося завантажити квіз.", "Could not load the quiz."));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  const submit = async () => {
    if (!quiz) return;
    if (quiz.questions.some((question) => !Number.isInteger(answers[question.id]))) {
      setError(tr("Відповідай на кожне запитання перед поданням.", "Answer every question before submitting."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const graded = await submitCatalogQuiz(item.id, quiz.questions.map((question) => ({ questionId: question.id, selectedIndex: answers[question.id] })));
      setResult(graded);
      setQuiz((current) => current ? { ...current, progress: graded.progress } : current);
      window.dispatchEvent(new Event("studycod:course-progress-changed"));
    } catch (caught: unknown) {
      const code = getErrorMessageFromUnknown(caught, "");
      setError(code === "COURSE_QUIZ_ANSWERS_INVALID"
        ? tr("Перевір відповіді й подай їх ще раз.", "Check your answers and submit again.")
        : code === "COURSE_SEQUENCE_LOCKED"
          ? tr("Спочатку заверши попередні елементи маршруту.", "Complete the previous roadmap items first.")
          : tr("Не вдалося перевірити квіз.", "Could not grade the quiz."));
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setAnswers({});
    setResult(null);
    setError(null);
  };

  return <main className="min-h-full bg-bg-base px-3 py-4 text-text-primary sm:px-5 sm:py-6 lg:px-8">
    <div className="mx-auto max-w-4xl">
      <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${courseId}/path`))} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:underline">
        <ArrowLeft className="size-4" />{tr("До тем курсу", "Back to course topics")}
      </button>
      <header className="mb-5 rounded-2xl border border-primary/20 bg-primary/[.045] p-5 sm:p-7">
        <p className="text-[11px] font-black uppercase tracking-[.18em] text-primary">{tr("Перевірка знань курсу", "Course knowledge check")}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-text-primary sm:text-4xl">{quiz?.title || item.title}</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">{tr("Вибери одну відповідь для кожного запитання. Щоб зарахувати квіз, потрібно набрати щонайменше", "Choose one answer for each question. You need at least")} {quiz?.passingScore ?? 60}%.</p>
        {quiz?.progress.score != null && <p className="mt-2 text-xs font-semibold text-text-secondary">{tr("Найкращий результат", "Best score")}: {quiz.progress.score}%</p>}
      </header>

      {error && <div role="alert" className="mb-4 rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}
      {loading ? <div role="status" className="rounded-2xl border border-border bg-bg-surface p-6 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо квіз…", "Loading quiz…")}</div> : quiz && <>
        {!result ? <div className="space-y-4">
          {quiz.questions.map((question, questionIndex) => <fieldset key={question.id} className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-6">
            <legend className="sr-only">{tr("Запитання", "Question")} {questionIndex + 1}</legend>
            <p className="text-xs font-black uppercase tracking-[.12em] text-text-muted">{tr("Запитання", "Question")} {questionIndex + 1} / {quiz.questions.length}</p>
            <h2 className="mt-2 text-lg font-bold leading-7 text-text-primary">{question.question}</h2>
            <div role="radiogroup" aria-label={`${tr("Запитання", "Question")} ${questionIndex + 1}`} className="mt-4 space-y-2">
              {question.options.map((option, optionIndex) => {
                const selected = answers[question.id] === optionIndex;
                const controlId = `quiz-${item.id}-${question.id}-${optionIndex}`;
                return <label key={controlId} htmlFor={controlId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${selected ? "border-primary bg-primary/[.07]" : "border-border hover:border-primary/40"}`}>
                  <input id={controlId} type="radio" name={`quiz-${item.id}-${question.id}`} checked={selected} onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} className="mt-1 accent-primary" />
                  <span className="min-w-0 text-text-primary">{option}</span>
                </label>;
              })}
            </div>
          </fieldset>)}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-surface p-4">
            <p className="text-xs text-text-secondary">{Object.keys(answers).length} / {quiz.questions.length} {tr("відповідей вибрано", "answers selected")}</p>
            <button type="button" disabled={submitting} onClick={() => void submit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-55">
              {submitting && <LoaderCircle className="size-4 animate-spin" />}{tr("Перевірити відповіді", "Check answers")}
            </button>
          </div>
        </div> : <section aria-live="polite" className="space-y-4">
          <div className={`rounded-2xl border p-5 sm:p-6 ${result.passed ? "border-primary/30 bg-primary/[.06]" : "border-accent-warn/30 bg-accent-warn/[.06]"}`}>
            <p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">{result.passed ? tr("Квіз зараховано", "Quiz passed") : tr("Потрібна ще одна спроба", "One more attempt needed")}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"><strong className="text-4xl font-black tracking-[-.05em] text-text-primary">{result.score}%</strong><span className="text-sm text-text-secondary">{result.correctCount} / {result.total} {tr("правильних відповідей", "correct answers")}</span></div>
            <p className="mt-2 text-sm text-text-secondary">{tr("Пороговий результат", "Passing score")}: {result.passingScore}%</p>
          </div>
          {result.review.map((review, questionIndex) => <article key={review.questionId} className="rounded-2xl border border-border bg-bg-surface p-5">
            <p className="text-xs font-black uppercase tracking-[.12em] text-text-muted">{tr("Запитання", "Question")} {questionIndex + 1}</p>
            <h2 className="mt-2 font-bold leading-6 text-text-primary">{review.question}</h2>
            <ul className="mt-3 space-y-2">{review.options.map((option, optionIndex) => <li key={`${review.questionId}-${optionIndex}`} className={`rounded-xl border px-3 py-2 text-sm ${optionIndex === review.correctIndex ? "border-primary/30 bg-primary/[.06] text-primary" : optionIndex === review.selectedIndex ? "border-accent-error/25 bg-accent-error/[.05] text-accent-error" : "border-border text-text-secondary"}`}>
              {option}{optionIndex === review.correctIndex ? <span className="ml-2 font-bold">· {tr("Правильно", "Correct")}</span> : optionIndex === review.selectedIndex ? <span className="ml-2 font-bold">· {tr("Твоя відповідь", "Your answer")}</span> : null}
            </li>)}</ul>
          </article>)}
          <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-border bg-bg-surface p-4">
            <button type="button" onClick={retake} className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold text-text-primary">{tr("Спробувати ще раз", "Try again")}</button>
            <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${courseId}/path`))} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">{tr("Повернутися до курсу", "Return to course")}</button>
          </div>
        </section>}
      </>}
    </div>
  </main>;
};

const CoursePracticeContent: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const { courseId, courseItemId } = useParams<{ courseId: string; courseItemId: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [courseItem, setCourseItem] = React.useState<LearningCourseItem | null>(null);
  const [runtime, setRuntime] = React.useState<CatalogRuntime>("PYTHON");
  const [userError, setUserError] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [courseLookupState, setCourseLookupState] = React.useState<"pending" | "loaded" | "failed">("pending");

  React.useEffect(() => {
    let cancelled = false;
    setCourseLookupState("pending");
    setUserError(false);
    if (isDevPreviewActive()) setUser(DEV_PREVIEW_USER);
    else void getMe({ suppressAuthRedirect: true })
      .then((nextUser) => { if (!cancelled) setUser(nextUser); })
      .catch(() => { if (!cancelled) setUserError(true); });
    if (!courseId || !courseItemId) {
      setCourseLookupState("failed");
      return () => { cancelled = true; };
    }
    void getLearningCourse(Number(courseId))
      .then((course) => {
        if (cancelled) return;
        const items = course.modules.flatMap((module) => module.items);
        const item = items.find((candidate) => candidate.id === Number(courseItemId));
        setRuntime(course.runtime);
        setCourseItem(item ?? null);
        setCourseLookupState("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          setCourseItem(null);
          setCourseLookupState("failed");
        }
      });
    return () => { cancelled = true; };
  }, [courseId, courseItemId, locale, retry]);

  if ((!user && !userError) || courseLookupState === "pending") return <PageLoader />;
  if (!user || userError || courseLookupState !== "loaded" || !courseItem || (courseItem.kind !== "CODE_TASK" && courseItem.kind !== "QUIZ" && !isProjectItem(courseItem))) {
    const itemKindMessage = userError
      ? tr("Не вдалося завантажити профіль.", "Could not load your profile.")
      : courseLookupState === "failed"
      ? tr("Не вдалося перевірити елемент курсу.", "Could not verify this course item.")
      : courseItem
      ? tr(`Відкритий елемент є ${kindLabel(courseItem.kind)}.`, `The opened item is a ${kindLabel(courseItem.kind)}.`)
      : tr("Цей елемент не знайдено в поточному курсі.", "This item was not found in the current course.");
    return <main className="mx-auto flex min-h-[60vh] w-full min-w-0 max-w-2xl items-center px-6 py-12">
      <section role="alert" className="w-full rounded-3xl border border-border bg-bg-surface p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Курсова практика", "Course practice")}</p>
        <h1 className="mt-3 text-2xl font-bold text-text-primary">{tr("Цей елемент не відкривається у практиці", "This item cannot be opened in Practice")}</h1>
        <p className="mt-3 leading-7 text-text-secondary">{tr(`${itemKindMessage} Відкрий маршрут, щоб продовжити навчання.`, `${itemKindMessage} Open the path to continue learning.`)}</p>
        {(userError || courseLookupState === "failed") && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-6 mr-3 rounded-xl border border-border px-4 py-2.5 text-sm font-bold">{tr("Повторити", "Retry")}</button>}
        <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${courseId}/path`), { replace: true })} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{tr("Відкрити теми", "Open topics")}</button>
      </section>
    </main>;
  }

  if (isProjectItem(courseItem)) return <CourseProjectPractice courseId={courseId!} item={courseItem} />;
  if (courseItem.kind === "QUIZ") return <CourseQuizPractice courseId={courseId!} item={courseItem} />;

  // The practice shell owns the whole sequence. It mounts before theory so
  // catalog generation can create the first task; TasksPage then opens theory
  // inside the native IDE for that generated task.
  return <TasksPage user={{ ...user, activeRuntime: runtime }} />;
};

export const CoursePracticePage: React.FC = () => {
  const { courseId, courseItemId } = useParams<{ courseId: string; courseItemId: string }>();
  return <CoursePracticeContent key={`${courseId}:${courseItemId}`} />;
};
