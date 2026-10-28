import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Play, Sparkles } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { CodeEditor } from "../../components/CodeEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { TaskGenerationOverlay } from "../../components/TaskGenerationOverlay";
import {
  getCourseDiagnostic,
  getLearningCourse,
  runCourseDiagnostic,
  retryCourseDiagnostic,
  submitCourseDiagnostic,
  type CourseDiagnosticAssessment,
  type CourseDiagnosticPractical,
  type CourseDiagnosticResult,
  type LearningCourse,
} from "../../lib/api/learningCatalog";
import type { JudgeLanguage } from "../../lib/judgeLanguages";
import { tr } from "../../i18n";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { withDevPreview } from "../../lib/devPreview";

function messageForError(error: unknown): string {
  const code = getErrorMessageFromUnknown(error, "");
  switch (code) {
    case "ASSESSMENT_GENERATION_FAILED":
    case "ASSESSMENT_PRACTICAL_INVALID":
    case "ASSESSMENT_QUESTIONS_INVALID":
      return tr("Не вдалося згенерувати тест. Спробуй завантажити сторінку ще раз.", "Could not generate the assessment. Try loading this page again.");
    case "JUDGE_UNAVAILABLE":
      return tr("Перевірка коду тимчасово недоступна. Спробуй ще раз за хвилину.", "Code evaluation is temporarily unavailable. Try again in a minute.");
    case "ASSESSMENT_ALREADY_SUBMITTED":
      return tr("Тест уже завершено. Онови сторінку, щоб побачити результат.", "This assessment is already submitted. Refresh to view your result.");
    case "ASSESSMENT_ALREADY_PASSED":
      return tr("Кваліфікацію вже підтверджено.", "Your qualification has already been confirmed.");
    case "ASSESSMENT_ANSWERS_INVALID":
      return tr("Перевір, що відповів на кожне питання.", "Make sure you answered every question.");
    case "COURSE_NOT_ACTIVE":
      return tr("Спочатку активуй курс, щоб пройти діагностику.", "Activate the course before taking its diagnostic.");
    case "COURSE_ALREADY_COMPLETED":
      return tr("Цей курс уже завершено.", "This course is already complete.");
    default:
      return tr("Не вдалося завантажити або зберегти тест.", "Could not load or submit the assessment.");
  }
}

const hasPracticalAnswer = (task: CourseDiagnosticPractical, codes: Record<string, string>) => {
  const code = (codes[task.id] || "").trim();
  const starter = (task.codeTemplate || "").trim();
  return Boolean(code && code !== starter);
};

export const CourseDiagnosticPage: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = React.useState<LearningCourse | null>(null);
  const [assessment, setAssessment] = React.useState<CourseDiagnosticAssessment | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [practicalCodes, setPracticalCodes] = React.useState<Record<string, string>>({});
  const [sampleInputs, setSampleInputs] = React.useState<Record<string, string>>({});
  const [sampleOutputs, setSampleOutputs] = React.useState<Record<string, string | null>>({});
  const [sampleErrors, setSampleErrors] = React.useState<Record<string, string | null>>({});
  const [loading, setLoading] = React.useState(true);
  const [runningTaskId, setRunningTaskId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [activePart, setActivePart] = React.useState<"knowledge" | "practical">("knowledge");
  const [activePracticalIndex, setActivePracticalIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CourseDiagnosticResult | null>(null);

  const load = React.useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const loadedCourse = await getLearningCourse(Number(courseId));
      const loadedAssessment = await getCourseDiagnostic(loadedCourse.enrollment.id);
      setCourse(loadedCourse);
      setAssessment(loadedAssessment);
      setResult(loadedAssessment.result);
      const tasks = loadedAssessment.practicals?.length ? loadedAssessment.practicals : [loadedAssessment.practical];
      setPracticalCodes(Object.fromEntries(tasks.map((task) => [task.id, task.codeTemplate || ""])));
      setSampleInputs(Object.fromEntries(tasks.map((task) => [task.id, task.examples[0]?.input || ""])));
      setSampleOutputs({});
      setSampleErrors({});
      setAnswers({});
      setActivePart("knowledge");
      setActivePracticalIndex(0);
    } catch (caught: unknown) {
      setError(messageForError(caught));
    } finally {
      setLoading(false);
    }
  }, [courseId, locale]);

  React.useEffect(() => { void load(); }, [load]);

  const runSample = async (task: CourseDiagnosticPractical) => {
    if (!assessment || runningTaskId) return;
    const code = practicalCodes[task.id] || "";
    const input = sampleInputs[task.id] || "";
    if (!code.trim()) return;
    setRunningTaskId(task.id);
    setSampleErrors((current) => ({ ...current, [task.id]: null }));
    setSampleOutputs((current) => ({ ...current, [task.id]: null }));
    try {
      const response = await runCourseDiagnostic(assessment.enrollmentId, task.id, code, input);
      setSampleOutputs((current) => ({ ...current, [task.id]: response.stdout }));
      if (response.stderr) setSampleErrors((current) => ({ ...current, [task.id]: response.stderr }));
      else if (!response.success) setSampleErrors((current) => ({ ...current, [task.id]: tr("Програма завершилася з помилкою.", "The program exited with an error.") }));
    } catch (caught: unknown) {
      setSampleErrors((current) => ({ ...current, [task.id]: messageForError(caught) }));
    } finally {
      setRunningTaskId(null);
    }
  };

  const submit = async () => {
    if (!assessment || submitting) return;
    if (assessment.questions.some((question) => !Number.isInteger(answers[question.id]))) {
      setActivePart("knowledge");
      setError(tr("Відповідай на кожне питання перед поданням.", "Answer every question before submitting."));
      return;
    }
    const tasks = assessment.practicals?.length ? assessment.practicals : [assessment.practical];
    const missingTaskIndex = tasks.findIndex((task) => !hasPracticalAnswer(task, practicalCodes));
    if (missingTaskIndex >= 0) {
      setActivePart("practical");
      setActivePracticalIndex(missingTaskIndex);
      setError(tr("Додай розв’язок до кожної практичної задачі.", "Add a solution to every practical task."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const graded = await submitCourseDiagnostic(
        assessment.enrollmentId,
        assessment.questions.map((question) => ({ questionId: question.id, selectedIndex: answers[question.id] })),
        tasks.map((task) => ({ taskId: task.id, code: practicalCodes[task.id] })),
      );
      setResult(graded);
      setAssessment((current) => current ? { ...current, status: "SUBMITTED", result: graded } : current);
      window.dispatchEvent(new Event("studycod:course-progress-changed"));
    } catch (caught: unknown) {
      setError(messageForError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async () => {
    if (!assessment || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      const next = await retryCourseDiagnostic(assessment.enrollmentId);
      setAssessment(next);
      setResult(next.result);
      setAnswers({});
      const tasks = next.practicals?.length ? next.practicals : [next.practical];
      setPracticalCodes(Object.fromEntries(tasks.map((task) => [task.id, task.codeTemplate || ""])));
      setSampleInputs(Object.fromEntries(tasks.map((task) => [task.id, task.examples[0]?.input || ""])));
      setSampleOutputs({});
      setSampleErrors({});
      setActivePart("knowledge");
      setActivePracticalIndex(0);
    } catch (caught: unknown) {
      setError(messageForError(caught));
    } finally {
      setRetrying(false);
    }
  };

  const answeredCount = Object.values(answers).filter(Number.isInteger).length;
  const practicals = assessment?.practicals?.length ? assessment.practicals : assessment?.practical ? [assessment.practical] : [];
  const practical = practicals[activePracticalIndex] ?? practicals[0] ?? null;
  const practicalCompletedCount = practicals.filter((task) => hasPracticalAnswer(task, practicalCodes)).length;

  if (loading) return <TaskGenerationOverlay open mode="assessment" phase="generating" />;

  if (!assessment || !course) return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
    <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${courseId}/path`))} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary"><ArrowLeft className="size-4" />{tr("До маршруту курсу", "Back to course path")}</button>
    <section role="alert" className="rounded-2xl border border-accent-error/30 bg-accent-error/10 p-5 text-sm text-accent-error">
      <p>{error || tr("Тест недоступний.", "This assessment is unavailable.")}</p>
      <button type="button" onClick={() => void load()} className="mt-4 rounded-lg border border-current px-4 py-2 font-bold">{tr("Спробувати ще", "Try again")}</button>
    </section>
  </main>;

  return <>
    <TaskGenerationOverlay open={retrying} mode="assessment" phase="generating" />
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-5 text-text-primary sm:px-6 lg:px-8 lg:pt-8">
    <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${course.id}/path`))} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary transition hover:underline">
      <ArrowLeft className="size-4" />{tr("До маршруту курсу", "Back to course path")}
    </button>

    <header className="mb-6 overflow-hidden rounded-[24px] border border-white/10 bg-[#17372d] text-[#f3f2e9]">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end lg:p-8">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-[#c4e58a]"><Sparkles className="size-4" />{tr("Персональна діагностика", "Personal knowledge check")}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight tracking-[-.05em] sm:text-4xl">{course.enrollment.completionPercent > 0 ? tr("Підтверди свої знання", "Confirm what you know") : tr("Перевір свій стартовий рівень", "Measure your starting level")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d3ded4]">{course.title}. {tr("Це повне персональне оцінювання всіх тем курсу: велика тестова частина ABCD і кілька згенерованих практичних задач. Засвоєні теми зарахуються в маршрут за результатами перевірки.", "This is a complete, personalized assessment of the course: a full ABCD test and several generated practical tasks. Topics you already know are credited to your learning route based on your results.")}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-[#10281f]/80 p-4">
          <p className="text-xs font-bold text-[#d3ded4]">{tr("Поріг зарахування", "Passing requirements")}</p>
          <p className="mt-2 text-sm font-extrabold">{tr("Загалом", "Overall")}: {assessment.passing.totalScore}%</p>
          <p className="mt-1 text-xs text-[#d3ded4]">{tr("Теорія", "Knowledge")}: {assessment.passing.knowledgeScore}% · {tr("Практика", "Practical")}: {assessment.passing.practicalScore}%</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 bg-black/[.08] px-5 py-3 text-xs font-semibold text-[#d3ded4] sm:px-8">
        <span>{assessment.questions.length} {tr("питань ABCD", "ABCD questions")}</span>
        <span>{practicals.length} {tr("практичних задач", "practical tasks")}</span>
        <span>{tr("Спроба", "Attempt")} {assessment.attemptNumber}</span>
      </div>
    </header>

    {error && <div role="alert" className="mb-5 rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}

    {result ? <section aria-live="polite" className="space-y-5">
      <div className={`rounded-2xl border p-5 sm:p-7 ${result.passed ? "border-primary/30 bg-primary/[.06]" : "border-accent-warn/30 bg-accent-warn/[.06]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-text-secondary"><CheckCircle2 className="size-4" />{result.passed ? tr("Рівень підтверджено", "Knowledge confirmed") : tr("Діагностику завершено", "Diagnostic complete")}</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{result.passed ? tr("Курс зараховано. Можеш переглянути маршрут або обрати наступний рівень.", "The course is complete. Review the route or choose your next level.") : tr("Підтверджені теми вже зараховані в твій маршрут. Інші теми й практика залишаються в плані навчання.", "Topics confirmed by this assessment are already credited in your route. The remaining topics and practice stay in your learning plan.")}</p>
          </div>
          <strong className="text-5xl font-black tabular-nums tracking-[-.06em]">{result.score}<span className="text-2xl">%</span></strong>
        </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-bg-surface p-4"><p className="text-xs font-semibold text-text-secondary">{tr("Теорія", "Knowledge")}</p><p className="mt-1 text-2xl font-black tabular-nums">{result.knowledgeScore}%</p><p className="mt-1 text-xs text-text-muted">{result.correctCount}/{result.totalQuestions} {tr("правильних", "correct")}</p></div>
          <div className="rounded-xl border border-border bg-bg-surface p-4"><p className="text-xs font-semibold text-text-secondary">{tr("Практика", "Practical")}</p><p className="mt-1 text-2xl font-black tabular-nums">{result.practicalScore}%</p><p className="mt-1 text-xs text-text-muted">{result.testsPassed}/{result.testsTotal} {tr("перевірок пройдено", "checks passed")}</p></div>
          <div className="rounded-xl border border-border bg-bg-surface p-4"><p className="text-xs font-semibold text-text-secondary">{tr("Поріг", "Passing score")}</p><p className="mt-1 text-2xl font-black tabular-nums">{assessment.passing.totalScore}%</p><p className="mt-1 text-xs text-text-muted">{result.passed ? tr("Зараховано", "Passed") : tr("Переходь до навчального маршруту", "Continue with the course")}</p></div>
        </div>
      </div>

      {result.practicalResults?.length ? <section aria-labelledby="diagnostic-practical-results" className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-6">
        <div className="border-b border-border pb-3"><p className="text-[10px] font-black uppercase tracking-[.15em] text-primary">{tr("Частина 2", "Part 2")}</p><h2 id="diagnostic-practical-results" className="mt-1 text-lg font-black">{tr("Результати практичних задач", "Practical task results")}</h2></div>
        <div className="mt-3 divide-y divide-border">{result.practicalResults.map((task) => <article key={task.taskId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div><h3 className="font-bold">{task.title}</h3><p className="mt-1 text-xs text-text-secondary">{task.moduleTitle || tr("Теми курсу", "Course topics")} · {task.testsPassed}/{task.testsTotal} {tr("перевірок", "checks")}</p></div>
          <strong className="text-xl font-black tabular-nums">{task.score}%</strong>
        </article>)}</div>
      </section> : null}

      {!result.passed && <section aria-labelledby="diagnostic-plan-heading" className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-6">
        <div className="border-b border-border pb-3"><p className="text-[10px] font-black uppercase tracking-[.15em] text-primary">{tr("Персональний маршрут", "Your learning plan")}</p><h2 id="diagnostic-plan-heading" className="mt-1 text-lg font-black">{tr("Що зараховано, а що попереду", "Credited topics and next steps")}</h2></div>
        <div className="mt-4 divide-y divide-border">{result.topicResults.map((topic) => <article key={topic.topicId} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div><h3 className="font-bold">{topic.topicTitle}</h3><p className="mt-1 text-xs text-text-secondary">{topic.correctCount}/{topic.totalQuestions} {tr("питань правильно", "questions correct")} · {topic.score}%</p></div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className={`rounded-full px-2.5 py-1 ${topic.theoryCredited ? "bg-primary/[.08] text-primary" : "bg-accent-warn/[.08] text-accent-warn"}`}>{topic.theoryCredited ? tr("Теорію зараховано", "Knowledge credited") : tr("Теорію пройти", "Study this topic")}</span>
            <span className={`rounded-full px-2.5 py-1 ${topic.practiceCredited ? "bg-primary/[.08] text-primary" : "bg-bg-hover text-text-secondary"}`}>{topic.practiceCredited ? tr("Практику зараховано", "Practice credited") : tr("Практика в маршруті", "Practice remains")}</span>
          </div>
        </article>)}</div>
      </section>}

      <div className="flex flex-wrap justify-end gap-3 rounded-2xl border border-border bg-bg-surface p-4">
        {!result.passed && <button type="button" disabled={retrying} onClick={() => void retry()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-extrabold text-text-primary transition hover:border-primary/40 disabled:cursor-wait disabled:opacity-55">{retrying && <LoaderCircle className="size-4 animate-spin" />}{retrying ? tr("Готуємо нові завдання…", "Generating a new assessment…") : tr("Спробувати з новими завданнями", "Try a new assessment")}</button>}
        <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${course.id}/path`))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition hover:brightness-105">{result.passed ? tr("До курсу", "View course") : tr("Продовжити маршрут", "Continue learning")}<ArrowRight className="size-4" /></button>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-black">{tr("Перегляд відповідей", "Answer review")}</h2>
        <div className="space-y-3">{result.review.map((item, index) => <article key={item.questionId} className="rounded-2xl border border-border bg-bg-surface p-4 sm:p-5">
          <p className="text-[11px] font-black uppercase tracking-[.12em] text-text-muted">{tr("Питання", "Question")} {index + 1} · {item.topicTitle}</p>
          <h3 className="mt-2 font-bold leading-6">{item.question}</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{item.options.map((option, optionIndex) => <li key={`${item.questionId}-${optionIndex}`} className={`rounded-lg border px-3 py-2 text-sm ${optionIndex === item.correctIndex ? "border-primary/30 bg-primary/[.06] text-primary" : optionIndex === item.selectedIndex ? "border-accent-error/25 bg-accent-error/[.05] text-accent-error" : "border-border text-text-secondary"}`}>
            <span className="mr-2 font-black">{String.fromCharCode(65 + optionIndex)}.</span>{option}{optionIndex === item.correctIndex ? <span className="ml-2 font-bold">· {tr("Правильно", "Correct")}</span> : optionIndex === item.selectedIndex ? <span className="ml-2 font-bold">· {tr("Твоя відповідь", "Your answer")}</span> : null}
          </li>)}</ul>
        </article>)}</div>
      </div>
    </section> : <div className="space-y-5">
      <nav aria-label={tr("Частини оцінювання", "Assessment parts")} className="grid gap-3 sm:grid-cols-2">
        <button type="button" aria-current={activePart === "knowledge" ? "step" : undefined} onClick={() => setActivePart("knowledge")} className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-4 text-left transition ${activePart === "knowledge" ? "border-primary bg-primary/[.08]" : "border-border bg-bg-surface hover:border-primary/40"}`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">01</span>
          <span className="min-w-0 flex-1"><span className="block font-extrabold">{tr("Теоретична частина · ABCD", "Theory · ABCD")}</span><span className="mt-1 block text-xs text-text-secondary">{assessment.questions.length} {tr("питань · відповіді", "questions · answered")} {answeredCount}/{assessment.questions.length}</span></span>
          {answeredCount === assessment.questions.length && <CheckCircle2 className="size-5 shrink-0 text-primary" />}
        </button>
        <button type="button" aria-current={activePart === "practical" ? "step" : undefined} onClick={() => setActivePart("practical")} className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-4 text-left transition ${activePart === "practical" ? "border-primary bg-primary/[.08]" : "border-border bg-bg-surface hover:border-primary/40"}`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">02</span>
          <span className="min-w-0 flex-1"><span className="block font-extrabold">{tr("Практична частина", "Practical tasks")}</span><span className="mt-1 block text-xs text-text-secondary">{practicals.length} {tr("задач · розв’язано", "tasks · solutions added")} {practicalCompletedCount}/{practicals.length}</span></span>
          {practicals.length > 0 && practicalCompletedCount === practicals.length && <CheckCircle2 className="size-5 shrink-0 text-primary" />}
        </button>
      </nav>

      {activePart === "knowledge" ? <>
        <section aria-labelledby="diagnostic-questions" className="rounded-2xl border border-border bg-bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-primary">{tr("Частина 1 · Повне охоплення курсу", "Part 1 · Full course coverage")}</p><h2 id="diagnostic-questions" className="mt-1 text-xl font-black">{tr("Теорія та знання", "Theory and knowledge")}</h2><p className="mt-1 text-sm text-text-secondary">{tr("Обери одну відповідь A, B, C або D. Питання згруповані за темами курсу.", "Choose one answer: A, B, C, or D. Questions are grouped by course topic.")}</p></div>
            <span className="rounded-full border border-border bg-bg-base px-3 py-1.5 text-xs font-bold tabular-nums text-text-secondary">{answeredCount}/{assessment.questions.length}</span>
          </div>
          <div className="mt-4 space-y-5">{assessment.questions.map((question, questionIndex) => <fieldset key={question.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
            <legend className="text-xs font-black uppercase tracking-[.12em] text-text-muted">{question.topicTitle} · {tr("Питання", "Question")} {questionIndex + 1}/{assessment.questions.length}</legend>
            <h3 className="mt-2 text-base font-bold leading-6 sm:text-lg">{question.question}</h3>
            <div role="radiogroup" aria-label={`${question.topicTitle}: ${tr("питання", "question")} ${questionIndex + 1}`} className="mt-3 grid gap-2 sm:grid-cols-2">
              {question.options.map((option, optionIndex) => {
                const selected = answers[question.id] === optionIndex;
                const inputId = `diagnostic-${question.id}-${optionIndex}`;
                return <label key={inputId} htmlFor={inputId} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${selected ? "border-primary bg-primary/[.07]" : "border-border hover:border-primary/40"}`}>
                  <span className="flex shrink-0 items-center gap-2"><input id={inputId} type="radio" name={`diagnostic-${question.id}`} checked={selected} onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} className="size-4 shrink-0 accent-primary" /><span className="flex size-6 items-center justify-center rounded-md border border-current text-[11px] font-black">{String.fromCharCode(65 + optionIndex)}</span></span>
                  <span className="text-text-primary">{option}</span>
                </label>;
              })}
            </div>
          </fieldset>)}</div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-surface p-4">
          <p className="text-xs leading-5 text-text-secondary">{tr("У тесті є питання з кожної теми. Перейди до другої частини, коли будеш готовий.", "The test includes questions from every topic. Continue to the second part when you are ready.")}</p>
          <button type="button" onClick={() => { setActivePart("practical"); setError(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition hover:brightness-105">{tr("До практичної частини", "Continue to practical tasks")}<ArrowRight className="size-4" /></button>
        </div>
      </> : <>
        <nav aria-label={tr("Практичні задачі", "Practical tasks")} className="flex gap-2 overflow-x-auto pb-1">
          {practicals.map((task, index) => {
            const active = activePracticalIndex === index;
            const completed = hasPracticalAnswer(task, practicalCodes);
            return <button key={task.id} type="button" aria-current={active ? "step" : undefined} onClick={() => setActivePracticalIndex(index)} className={`flex min-w-52 max-w-72 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-primary bg-primary/[.08]" : "border-border bg-bg-surface hover:border-primary/40"}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-black ${completed ? "bg-primary text-primary-foreground" : "bg-bg-hover text-text-secondary"}`}>{completed ? <CheckCircle2 className="size-4" /> : String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0"><span className="block truncate text-xs font-extrabold">{task.title}</span><span className="block truncate text-[10px] text-text-muted">{task.moduleTitle || tr("Теми курсу", "Course topics")}</span></span>
            </button>;
          })}
        </nav>

        {practical && <section aria-labelledby="diagnostic-practical" className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
          <div className="border-b border-border p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-primary">{tr("Частина 2 · Задача", "Part 2 · Task")} {activePracticalIndex + 1} / {practicals.length}</p><h2 id="diagnostic-practical" className="mt-1 text-xl font-black">{practical.title}</h2></div><span className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text-secondary">{practical.moduleTitle || tr("Усі теми курсу", "Course topics")}</span></div>
            <div className="mt-3 max-w-none text-sm leading-6 text-text-secondary"><MarkdownView content={practical.statement} /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-bg-base p-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-text-muted">{tr("Формат введення", "Input format")}</p><div className="mt-1 text-sm text-text-primary"><MarkdownView content={practical.inputFormat} /></div></div>
              <div className="rounded-xl bg-bg-base p-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-text-muted">{tr("Формат виведення", "Output format")}</p><div className="mt-1 text-sm text-text-primary"><MarkdownView content={practical.outputFormat} /></div></div>
              {practical.constraints && <div className="rounded-xl bg-bg-base p-3 sm:col-span-2"><p className="text-[10px] font-black uppercase tracking-[.12em] text-text-muted">{tr("Обмеження", "Constraints")}</p><div className="mt-1 text-sm text-text-primary"><MarkdownView content={practical.constraints} /></div></div>}
            </div>
            {practical.examples.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{practical.examples.map((example, index) => <article key={`example-${index}`} className="rounded-xl border border-border p-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-text-muted">{tr("Приклад", "Example")} {index + 1}</p><div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-[10px] font-bold text-text-muted">{tr("Ввід", "Input")}</p><pre className="mt-1 overflow-x-auto rounded-md bg-bg-base p-2 text-xs">{example.input || "∅"}</pre></div><div><p className="text-[10px] font-bold text-text-muted">{tr("Вивід", "Output")}</p><pre className="mt-1 overflow-x-auto rounded-md bg-bg-base p-2 text-xs">{example.output || "∅"}</pre></div></div>{example.explanation && <p className="mt-2 text-xs leading-5 text-text-secondary">{example.explanation}</p>}</article>)}</div>}
          </div>
          <div className="p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">{practical.entryFile}</h3><p className="text-xs text-text-muted">{practical.runtime}</p></div><button type="button" disabled={runningTaskId !== null || !(practicalCodes[practical.id] || "").trim()} onClick={() => void runSample(practical)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold text-text-primary transition hover:border-primary/40 disabled:opacity-50">{runningTaskId === practical.id ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{tr("Запустити приклад", "Run sample")}</button></div>
            <CodeEditor language={practical.runtime.toLowerCase() as JudgeLanguage} value={practicalCodes[practical.id] || ""} onChange={(value) => setPracticalCodes((current) => ({ ...current, [practical.id]: value }))} height={340} fontSize={14} wordWrap enableSemanticLsp={false} filePath={practical.entryFile} />
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="block text-xs font-bold text-text-secondary">{tr("Тестове введення", "Sample input")}<textarea value={sampleInputs[practical.id] || ""} onChange={(event) => setSampleInputs((current) => ({ ...current, [practical.id]: event.target.value }))} rows={3} spellCheck={false} className="mt-1.5 w-full resize-y rounded-xl border border-border bg-bg-base p-3 font-mono text-sm text-text-primary outline-none focus:border-primary" /></label>
              <div aria-live="polite" className="rounded-xl border border-border bg-[#171b19] p-3 text-[#e8eee7]"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#a2cdaa]">{tr("Результат запуску", "Run output")}</p>{sampleOutputs[practical.id] == null ? <p className="mt-2 text-xs text-[#aeb9af]">{tr("Запусти код, щоб побачити його вивід.", "Run the code to see its output.")}</p> : <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{sampleOutputs[practical.id] || tr("Немає виводу", "No output")}</pre>}{sampleErrors[practical.id] && <p className="mt-2 whitespace-pre-wrap text-xs text-red-300">{sampleErrors[practical.id]}</p>}</div>
            </div>
          </div>
        </section>}

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg-surface p-4">
          <button type="button" onClick={() => { setActivePart("knowledge"); setError(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-extrabold text-text-primary transition hover:border-primary/40"><ArrowLeft className="size-4" />{tr("До ABCD", "Back to ABCD")}</button>
          {activePracticalIndex > 0 && <button type="button" onClick={() => setActivePracticalIndex((index) => index - 1)} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold text-text-secondary transition hover:border-primary/40">{tr("Попередня задача", "Previous task")}</button>}
          {activePracticalIndex < practicals.length - 1 && <button type="button" onClick={() => setActivePracticalIndex((index) => index + 1)} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold text-text-secondary transition hover:border-primary/40">{tr("Наступна задача", "Next task")}</button>}
          <div className="ml-auto flex flex-wrap items-center gap-3"><p className="text-xs leading-5 text-text-secondary">{practicalCompletedCount}/{practicals.length} {tr("розв’язано · потрібні всі відповіді й задачі", "solutions · all answers and tasks are required")}</p><button type="button" disabled={submitting || assessment.status === "SUBMITTED"} onClick={() => void submit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition hover:brightness-105 disabled:cursor-wait disabled:opacity-55">{submitting && <LoaderCircle className="size-4 animate-spin" />}{submitting ? tr("Перевіряємо…", "Checking…") : tr("Подати оцінювання", "Submit assessment")}<ArrowRight className="size-4" /></button></div>
        </div>
      </>}
    </div>}
    </main>
  </>;
};
