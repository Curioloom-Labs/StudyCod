import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "../core/TasksPage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";
import type { JudgeLanguage } from "../../lib/judgeLanguages";
import {
  checkCatalogProject,
  getCatalogProject,
  getLearningCourse,
  runCatalogProject,
  saveCatalogProject,
  type LearningCourseItem,
  type LearningProject,
} from "../../lib/api/learningCatalog";
import type { CodeFile } from "../../lib/api/library";
import { tr } from "../../i18n";

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
        setCode(loaded.progress.draft || loaded.starterCode);
        setError(null);
      })
      .catch((caught: any) => {
        if (!cancelled) setError(caught?.response?.data?.message === "COURSE_SEQUENCE_LOCKED"
          ? tr("Спочатку заверши попередні теми курсу.", "Complete the previous course topics first.")
          : tr("Не вдалося завантажити мініпроєкт.", "Could not load the mini-project."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [item.id]);

  const files = React.useMemo<CodeFile[]>(() => project ? [{ path: project.entryFile, content: code }] : [], [code, project]);
  const language = (project?.runtime || "JAVA").toLowerCase() as JudgeLanguage;

  const saveDraft = async () => {
    if (!project) return;
    try {
      const response = await saveCatalogProject(item.id, { milestoneIds: [], draft: code });
      if (response?.project) setProject(response.project);
      setMessage(tr("Код збережено.", "Code saved."));
      setError(null);
    } catch {
      setError(tr("Не вдалося зберегти код.", "Could not save the code."));
    }
  };

  const run = async () => {
    if (!project) return;
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const result = await runCatalogProject(item.id, files, stdin);
      setRunResult(result);
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "JUDGE_UNAVAILABLE"
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
        publicTestResults: Array.isArray(result?.tests) ? result.tests.map((test: any, index: number) => ({
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
        ? tr(`Оцінка: ${nextCheck.score}/${nextCheck.maxScore}. Мініпроєкт зараховано.`, `Score: ${nextCheck.score}/${nextCheck.maxScore}. Mini-project passed.`)
        : tr(`Оцінка: ${nextCheck.score}/${nextCheck.maxScore}. Виправ код і спробуй ще раз.`, `Score: ${nextCheck.score}/${nextCheck.maxScore}. Fix the code and try again.`));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "PROJECT_CHECK_NOT_CONFIGURED"
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
    projectSpec: project.projectSpec as any,
  } : null;

  return <main className="min-h-full bg-bg-base px-3 py-4 text-text-primary sm:px-5 sm:py-6 lg:px-8">
    <div className="mx-auto max-w-[1680px]">
      <button type="button" onClick={() => navigate(`/learning/course/${courseId}/path`)} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:underline">
        <ArrowLeft className="size-4" />{tr("До тем курсу", "Back to course topics")}
      </button>
      <header className="mb-4 rounded-2xl border border-[#bd8837]/30 bg-[#bd8837]/[.06] p-5 sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-[.18em] text-[#bd8837] dark:text-[#ffbf68]">{tr("Практика курсу · мініпроєкт", "Course practice · mini-project")}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-text-primary sm:text-4xl">{projectTitle(item.title)}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{tr("Це повноцінна практична задача: пиши код в IDE, запускай його та отримуй оцінку за прихованими тестами.", "This is a full practice task: write code in the IDE, run it, and get a score from hidden tests.")}</p>
      </header>
      {message && <div role="status" className="mb-4 rounded-xl border border-primary/25 bg-primary/[.06] px-4 py-3 text-sm text-primary">{message}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}
      {loading || !project || !projectTask ? <div role="status" className="h-[760px] rounded-[28px] border border-border bg-bg-surface p-6 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо мініпроєкт…", "Loading mini-project…")}</div> : <StudyCodIDEWorkspace
        task={projectTask}
        theory={null}
        language={language}
        onLanguageChange={() => undefined}
        compiler={language}
        onCompilerChange={() => undefined}
        code={code}
        onCodeChange={(next) => { setCode(next); setCheckResult(null); }}
        files={files}
        onFilesChange={(next) => setCode(next[0]?.content || "")}
        useFiles={false}
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
        onReset={() => { setCode(project.starterCode); setCheckResult(null); setRunResult(null); }}
        readOnly={false}
        disableLanguageChange
        runResult={runResult}
        checkResult={ideCheckResult}
        resultCards={checkResult ? <div className="rounded-xl border border-primary/20 bg-primary/[.06] p-3 text-sm text-text-secondary"><b className="text-text-primary">{tr("Поточна оцінка", "Current score")}</b><span className="ml-2 font-bold text-primary">{checkResult.score}/{checkResult.maxScore}</span></div> : null}
      />}
    </div>
  </main>;
};

export const CoursePracticePage: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const { courseId, courseItemId } = useParams<{ courseId: string; courseItemId: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [courseItem, setCourseItem] = React.useState<LearningCourseItem | null>(null);
  const [courseLookupState, setCourseLookupState] = React.useState<"pending" | "loaded" | "failed">("pending");

  React.useEffect(() => {
    let cancelled = false;
    void getMe({ suppressAuthRedirect: true }).then((nextUser) => {
      if (!cancelled) setUser(nextUser);
    });
    if (!courseId || !courseItemId) {
      setCourseLookupState("failed");
      return () => { cancelled = true; };
    }
    void getLearningCourse(Number(courseId))
      .then((course) => {
        if (cancelled) return;
        const items = course.modules.flatMap((module) => module.items);
        const item = items.find((candidate) => candidate.id === Number(courseItemId));
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
  }, [courseId, courseItemId, locale]);

  if (!user || courseLookupState === "pending") return <BrandedPageLoader />;
  if (courseLookupState !== "loaded" || !courseItem || (courseItem.kind !== "CODE_TASK" && !isProjectItem(courseItem))) {
    const itemKindMessage = courseLookupState === "failed"
      ? tr("Не вдалося перевірити елемент курсу.", "Could not verify this course item.")
      : courseItem
      ? tr(`Відкритий елемент є ${kindLabel(courseItem.kind)}.`, `The opened item is a ${kindLabel(courseItem.kind)}.`)
      : tr("Цей елемент не знайдено в поточному курсі.", "This item was not found in the current course.");
    return <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-6 py-12">
      <section role="alert" className="w-full rounded-3xl border border-border bg-bg-surface p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Курсова практика", "Course practice")}</p>
        <h1 className="mt-3 text-2xl font-bold text-text-primary">{tr("Цей елемент не відкривається у практиці", "This item cannot be opened in Practice")}</h1>
        <p className="mt-3 leading-7 text-text-secondary">{tr(`${itemKindMessage} Відкрий маршрут, щоб продовжити навчання.`, `${itemKindMessage} Open the path to continue learning.`)}</p>
        <button type="button" onClick={() => navigate(`/learning/course/${courseId}/path`, { replace: true })} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{tr("Відкрити теми", "Open topics")}</button>
      </section>
    </main>;
  }

  if (isProjectItem(courseItem)) return <CourseProjectPractice courseId={courseId!} item={courseItem} />;

  // The practice shell owns the whole sequence. It mounts before theory so
  // catalog generation can create the first task; TasksPage then opens theory
  // inside the native IDE for that generated task.
  return <TasksPage user={user} />;
};
