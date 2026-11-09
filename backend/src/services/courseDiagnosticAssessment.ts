import crypto from "crypto";
import { AppDataSource } from "../data-source";
import { Course } from "../entities/Course";
import { CourseItem } from "../entities/CourseItem";
import { CourseItemProgress } from "../entities/CourseItemProgress";
import {
  CourseDiagnosticAssessment,
  type CourseDiagnosticPayload,
  type CourseDiagnosticPractical,
  type CourseDiagnosticQuestion,
  type CourseDiagnosticResult,
} from "../entities/CourseDiagnosticAssessment";
import { UserCourseEnrollment } from "../entities/UserCourseEnrollment";
import { getLLMOrchestrator } from "./llm/LLMOrchestrator";
import { safeAICall } from "./ai/safeAICall";
import { judgeWithSemaphore } from "./judgeWorker";
import type { JudgeLanguage } from "./judgeWorker/types";
import { projectEntryFile } from "./learningCatalogProjectFiles";
import { localizeCourseItem, localizedCourseDescription, localizedCourseTitle, localizedModuleTitle, type CurriculumLocale } from "./curriculumLocalization";
import { logger } from "../utils/logger";

const assessmentRepo = () => AppDataSource.getRepository(CourseDiagnosticAssessment);
const enrollmentRepo = () => AppDataSource.getRepository(UserCourseEnrollment);
const courseRepo = () => AppDataSource.getRepository(Course);

type Runtime = "JAVA" | "PYTHON" | "CPP";
type UnknownRecord = Record<string, unknown>;
type AssessmentGenerationStage = "questions" | "practical_task" | "hidden_tests";
type CourseDiagnosticTopic = { id: number; moduleId: number; moduleTitle: string; title: string; context: string; itemIds: number[] };

function recordOf(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown, maxLength = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function assessmentError(code: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(code), { statusCode });
}

function withAssessmentStage(error: unknown, stage: AssessmentGenerationStage): Error & { assessmentStage: AssessmentGenerationStage } {
  const cause = error instanceof Error ? error : new Error(String(error));
  return Object.assign(cause, { assessmentStage: stage });
}

async function runAtAssessmentStage<T>(stage: AssessmentGenerationStage, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw withAssessmentStage(error, stage);
  }
}

export function assessmentFailureReason(error: unknown): string {
  const details = recordOf(error);
  const message = error instanceof Error ? error.message : String(details?.message ?? error ?? "");
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return "provider_rate_limited";
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(message)) return "provider_timeout";
  if (/ECONN|ENOTFOUND|fetch failed|network|\b50[234]\b|bad gateway|unavailable/i.test(message)) return "provider_unavailable";
  if (typeof details?.invalidSource === "string") return "task_contract_review_failed";
  if (details?.name === "AIValidationError" || recordOf(details?.errors)) return "invalid_provider_response";
  if (/empty (ai )?response/i.test(message)) return "empty_provider_response";
  if (/json|parse|schema|invalid response|validation/i.test(message)) return "invalid_provider_response";
  return "provider_generation_failed";
}

/** Select bounded, non-payload diagnostics; deliberately never includes rawResponse or prompts. */
export function assessmentGenerationErrorLogDetails(error: unknown): Record<string, unknown> {
  const details = recordOf(error);
  const validation = recordOf(details?.errors);
  const zodIssues = Array.isArray(validation?.issues) ? validation.issues : [];
  const contractIssues = Array.isArray(details?.issues) ? details.issues : [];
  const cause = recordOf(details?.cause);
  const invalidSource = details?.invalidSource;
  const validationMode = details?.mode;

  return {
    ...(typeof details?.message === "string" && typeof invalidSource !== "string"
      ? { errorMessage: text(details.message, 1_200) }
      : {}),
    ...(typeof validationMode === "string" ? { validationMode: text(validationMode, 100) } : {}),
    ...(zodIssues.length ? {
      validationIssueCount: zodIssues.length,
      validationIssues: zodIssues.slice(0, 8).map((value) => {
        const issue = recordOf(value);
        const path = Array.isArray(issue?.path)
          ? issue.path.map((part) => String(part)).join(".").slice(0, 200)
          : "";
        return {
          ...(path ? { path } : {}),
          ...(typeof issue?.code === "string" ? { code: text(issue.code, 60) } : {}),
          ...(typeof issue?.message === "string" ? { message: text(issue.message, 400) } : {}),
        };
      }),
      ...(zodIssues.length > 8 ? { validationIssuesTruncated: true } : {}),
    } : {}),
    ...(typeof invalidSource === "string" ? { contractInvalidSource: text(invalidSource, 40) } : {}),
    ...(contractIssues.length ? {
      contractIssueCount: contractIssues.length,
      contractIssues: contractIssues.slice(0, 3).map((issue) => text(issue, 400)).filter(Boolean),
      ...(contractIssues.length > 3 ? { contractIssuesTruncated: true } : {}),
    } : {}),
    ...(typeof details?.clarificationQuestion === "string"
      ? { clarificationQuestion: text(details.clarificationQuestion, 500) }
      : {}),
    ...(cause ? {
      causeName: typeof cause.name === "string" ? text(cause.name, 100) : undefined,
      causeCode: typeof cause.code === "string" || typeof cause.code === "number" ? cause.code : undefined,
      causeStatusCode: typeof cause.statusCode === "number" || typeof cause.statusCode === "string" ? cause.statusCode : undefined,
      ...(typeof cause.message === "string" ? { causeMessage: text(cause.message, 600) } : {}),
    } : {}),
  };
}

function percent(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number * 100) / 100)) : 0;
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

type CourseDiagnosticTestCase = { input: string; output: string };

export function canFallbackToDiagnosticPublicExamples(validationMessage: string): boolean {
  const rejectedSource = validationMessage.match(/^TASK_CONTRACT_REVIEW_FAILED\[([^\]]+)\]:/s)?.[1];
  return rejectedSource !== "statement" && rejectedSource !== "publicExamples";
}

export function shouldRegenerateDiagnosticTask(error: unknown): boolean {
  const details = recordOf(error);
  return details?.invalidSource === "statement" || details?.invalidSource === "publicExamples";
}

export async function generateDiagnosticTaskPackageWithRetry<T>(
  generatePackage: (attempt: 1 | 2, previousError?: unknown) => Promise<T>,
  onRetry?: (error: unknown) => void,
): Promise<T> {
  try {
    return await generatePackage(1);
  } catch (error) {
    if (!shouldRegenerateDiagnosticTask(error)) throw error;
    onRetry?.(error);
    return generatePackage(2, error);
  }
}

export function selectCourseDiagnosticTestCases(
  generatedTests: unknown,
  publicExamples: unknown,
): { tests: CourseDiagnosticTestCase[]; source: "hidden" | "public_examples" } | null {
  const cleanCases = (value: unknown): CourseDiagnosticTestCase[] => {
    if (!Array.isArray(value)) return [];
    const cases: CourseDiagnosticTestCase[] = [];
    const seenInputs = new Set<string>();
    for (const candidate of value) {
      const item = recordOf(candidate);
      const input = text(item?.input, 10_000);
      const output = text(item?.output, 10_000);
      if (!input || !output || seenInputs.has(input)) continue;
      seenInputs.add(input);
      cases.push({ input, output });
      if (cases.length === 8) break;
    }
    return cases;
  };

  const hidden = cleanCases(generatedTests);
  if (hidden.length >= 3) return { tests: hidden, source: "hidden" };

  // The task and these public examples have already passed the independent
  // task-contract review. They keep the diagnostic usable if the separate
  // hidden-test oracle cannot produce a consistent output suite.
  const examples = cleanCases(publicExamples);
  return examples.length ? { tests: examples, source: "public_examples" } : null;
}

type DiagnosticTestGenerationResult =
  | { success: true; data: unknown }
  | { success: false; error: { details?: unknown; error?: unknown; message?: unknown } };

export function resolveCourseDiagnosticTestCases(
  result: DiagnosticTestGenerationResult,
  publicExamples: unknown,
): { tests: CourseDiagnosticTestCase[]; source: "hidden" | "public_examples" } | null {
  if (result.success) return selectCourseDiagnosticTestCases(result.data, publicExamples);

  const details = recordOf(result.error.details);
  const validationMessage = typeof details?.validationError === "string"
    ? details.validationError
    : String(result.error.error ?? result.error.message ?? "");
  return canFallbackToDiagnosticPublicExamples(validationMessage)
    ? selectCourseDiagnosticTestCases([], publicExamples)
    : null;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function normalizeQuestions(
  rawQuiz: unknown,
  topicAssignments: CourseDiagnosticTopic[],
  expectedCount: number,
  startIndex: number,
): CourseDiagnosticQuestion[] {
  let parsed: unknown = rawQuiz;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  const root = recordOf(parsed);
  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(root?.questions) ? root.questions : [];
  const questions: CourseDiagnosticQuestion[] = [];
  for (const [index, raw] of candidates.entries()) {
    const question = recordOf(raw);
    const rawPrompt = text(question?.q ?? question?.question ?? question?.prompt, 2_000);
    const topicMarker = rawPrompt.match(/^\[topic:(-?\d+)\]\s*/i);
    const markedTopic = topicMarker ? topicAssignments.find((topic) => topic.id === Number(topicMarker[1])) : undefined;
    const topic = markedTopic ?? topicAssignments[index % topicAssignments.length];
    const prompt = rawPrompt.replace(/^\[topic:-?\d+\]\s*/i, "").trim();
    const rawOptions = Array.isArray(question?.options) ? question.options.map((option) => text(option, 800)) : [];
    const correct = Number(question?.correct);
    if (!prompt || rawOptions.length < 4 || rawOptions.length > 5 || !Number.isInteger(correct) || correct < 0 || correct >= rawOptions.length || rawOptions.some((option) => !option)) continue;

    const distractorIndexes = shuffled(rawOptions.map((_, optionIndex) => optionIndex).filter((optionIndex) => optionIndex !== correct)).slice(0, 3);
    const options = shuffled([correct, ...distractorIndexes].map((optionIndex) => ({ text: rawOptions[optionIndex], correct: optionIndex === correct })));
    questions.push({
      id: `q${startIndex + index + 1}`,
      question: prompt,
      options: options.map((option) => option.text),
      correct: options.findIndex((option) => option.correct),
      topicId: topic.id,
      topicTitle: topic.title,
    });
    if (questions.length >= expectedCount) break;
  }
  if (questions.length !== expectedCount) throw assessmentError("ASSESSMENT_QUESTIONS_INVALID", 503);
  return questions;
}

function courseDiagnosticTopics(course: Course, locale: CurriculumLocale): CourseDiagnosticTopic[] {
  const modules = [...(course.modules || [])].sort((a, b) => a.order - b.order || a.id - b.id);
  const allItems = modules.flatMap((module) => module.items || []).filter((item) => item.isActive !== false);
  const isLearningItem = (item: CourseItem) => item.content?.required !== false && item.content?.project !== true;
  const topics: CourseDiagnosticTopic[] = [];

  for (const module of modules) {
    const moduleItems = [...(module.items || [])]
      .filter((item) => item.isActive !== false && isLearningItem(item))
      .sort((a, b) => a.order - b.order || a.id - b.id);
    const theoryItems = moduleItems.filter((item) => item.kind === "THEORY");
    if (!theoryItems.length) {
      if (!moduleItems.length) continue;
      const title = localizedModuleTitle(module.contentKey, locale, module.title);
      topics.push({ id: -module.id, moduleId: module.id, moduleTitle: title, title, context: `Topic: ${title}`, itemIds: moduleItems.map((item) => item.id) });
      continue;
    }

    for (const theoryItem of theoryItems) {
      const localized = localizeCourseItem(theoryItem, locale);
      const content = localized.content || {};
      const topicTitle = localized.title;
      const sourceKey = typeof content.sourceKey === "string" ? content.sourceKey : "";
      const explicitRelated = allItems.filter((item) => Number(item.content?.theoryItemId ?? 0) === theoryItem.id && isLearningItem(item));
      const sameModuleRelated = theoryItems.length === 1
        ? moduleItems.filter((item) => item.id !== theoryItem.id)
        : moduleItems.filter((item) => item.id !== theoryItem.id && Number(item.content?.theoryItemId ?? 0) === theoryItem.id);
      const itemIds = Array.from(new Set([theoryItem.id, ...sameModuleRelated.map((item) => item.id), ...explicitRelated.map((item) => item.id)]));
      const detail = [content.markdown, content.description, content.objective, content.outcome]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join("\n")
        .slice(0, 1_200);
      topics.push({
        id: theoryItem.id,
        moduleId: module.id,
        moduleTitle: localizedModuleTitle(module.contentKey, locale, module.title),
        title: topicTitle,
        context: [topicTitle, sourceKey, detail].filter(Boolean).join("\n"),
        itemIds,
      });
    }
  }
  return topics;
}

async function generateAssessment(course: Course, runtime: Runtime, userId: number, locale: CurriculumLocale, courseTopics: CourseDiagnosticTopic[]): Promise<CourseDiagnosticPayload> {
  const seed = crypto.randomBytes(16).toString("hex");
  const requestId = `assessment-${crypto.randomUUID()}`;
  const courseContext = [
    `Course: ${localizedCourseTitle(course, locale)}.`,
    localizedCourseDescription(course, locale)?.slice(0, 1_000),
    "Generate new assessment content using only the curriculum topics supplied with each task.",
    `Variation token (never include it in the learner-facing text): ${seed}`,
  ].filter(Boolean).join("\n");
  const topics = [...courseTopics];
  if (!topics.length) throw assessmentError("ASSESSMENT_TOPICS_INVALID", 503);
  const llm = getLLMOrchestrator();
  const language = locale === "en" ? "en" : "uk";
  try {
    const questionAssignments = topics.flatMap((topic) => Array.from({ length: 2 }, () => topic));
    const questionBatches = chunks(questionAssignments, 8);
    const practicalGroups: CourseDiagnosticTopic[][] = [];
    for (const topic of topics) {
      const currentGroup = practicalGroups[practicalGroups.length - 1];
      if (!currentGroup || currentGroup[0].moduleId !== topic.moduleId || currentGroup.length >= 4) {
        practicalGroups.push([topic]);
      } else {
        currentGroup.push(topic);
      }
    }

    const [generatedQuestions, practicals] = await Promise.all([
      // Keep one question batch and one practical task in flight at a time.
      // This overlaps the two parts without flooding providers with four
      // concurrent generation/review chains.
      mapWithConcurrency(questionBatches, 1, async (topicAssignments, batchIndex) => {
        try {
          const questionPlan = [
            "QUESTION COVERAGE PLAN. Generate exactly one question for each listed assignment, in order. Prefix q with [topic:ID].",
            ...topicAssignments.map((topic, index) => `Question ${index + 1}: [topic:${topic.id}] ${topic.title}. Test this topic only. ${topic.context}`),
            "When the same topic appears twice, assess two different skills. The [topic:ID] marker is metadata and must be at the beginning of q.",
          ].join("\n");
          const quiz = await llm.generateQuizWithAI({
            lang: runtime,
            prevTopics: `${courseContext}\n\n${questionPlan}`,
            count: topicAssignments.length,
            userId,
            language,
            requestId,
          });
          return normalizeQuestions(quiz.quizJson, topicAssignments, topicAssignments.length, batchIndex * 8);
        } catch (error) {
          throw withAssessmentStage(error, "questions");
        }
      }),
      mapWithConcurrency(practicalGroups, 1, async (topicGroup, taskIndex) => {
        const topicList = topicGroup.map((topic) => `- [topic:${topic.id}] ${topic.title}: ${topic.context}`).join("\n");
        const groupSeed = `${seed}-task-${taskIndex + 1}`;
        const topicTitle = topicGroup[0].moduleTitle.slice(0, 255);
        const taskContext = [
          courseContext,
          `Module: ${topicTitle}`,
          `PRACTICAL ASSESSMENT ${taskIndex + 1}/${practicalGroups.length}. This task covers the following course topics:`,
          topicList,
          `Variation token: ${groupSeed}. Generate a fresh integrated programming task that requires applying the listed topics. Do not use concepts outside the course. Include standard input/output, clear constraints, examples, and a concise starter template with TODO markers.`,
        ].join("\n\n");
        const generatePackage = async (generationContext: string): Promise<CourseDiagnosticPractical> => {
          const generatedTask = await runAtAssessmentStage("practical_task", () => llm.generateTaskWithAI({
            topicTitle,
            theory: generationContext,
            lang: runtime,
            topicIndex: taskIndex + 1,
            numInTopic: practicalGroups.length,
            isFirstTask: false,
            isControl: true,
            difus: 0.5,
            allowedIoTypes: ["STDIN_STDOUT"],
            prevTopics: topicList,
            userId,
            topicId: topicGroup[0].id > 0 ? topicGroup[0].id : undefined,
            language,
            requestId,
          }));
          const taskDescription = [
            generatedTask.practicalTask,
            `Input format: ${generatedTask.inputFormat}`,
            `Output format: ${generatedTask.outputFormat}`,
            `Constraints: ${generatedTask.constraints}`,
            `Examples: ${generatedTask.examples.map((example) => `Input:\n${example.input}\nOutput:\n${example.output}`).join("\n")}`,
          ].join("\n\n");
          const testSelection = await runAtAssessmentStage("hidden_tests", async () => {
            const result = await safeAICall<Array<{ input: string; output: string; explanation?: string }>>("generateTestData", {
              taskTitle: generatedTask.title,
              taskDescription,
              lang: runtime,
              count: 5,
              ioType: generatedTask.ioType ?? "STDIN_STDOUT",
              userId,
              publicExamples: generatedTask.examples,
              requiredCases: ["minimum valid input", "typical input", "boundary input defined by the statement"],
            }, { language, requestId, maxAttempts: 2 });
            const resultDetails = recordOf(result.success ? null : result.error.details);
            const validationMessage = result.success
              ? ""
              : typeof resultDetails?.validationError === "string"
                ? resultDetails.validationError
                : String(result.error.error ?? result.error.message);
            const rejectedSource = validationMessage.match(/^TASK_CONTRACT_REVIEW_FAILED\[([^\]]+)\]:/s)?.[1];

            // A failed hidden-test oracle should not make a valid practical
            // task unavailable. The public examples were independently
            // reviewed with the task, so retain them as the checked fallback.
            // Do not mask a broken statement or broken public examples.
            const selection = resolveCourseDiagnosticTestCases(result, generatedTask.examples);
            if (selection) {
              if (selection.source === "public_examples") {
                logger.warn("[learning/diagnostic] hidden tests unavailable; using reviewed public examples", {
                  requestId,
                  courseId: course.id,
                  moduleId: topicGroup[0].moduleId,
                  testCount: selection.tests.length,
                  reason: result.success ? "insufficient_hidden_tests" : rejectedSource || "hidden_test_generation_failed",
                });
              }
              return selection;
            }

            if (result.success) {
              throw withAssessmentStage(assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503), "hidden_tests");
            }

            const contractFailure = validationMessage.match(/^TASK_CONTRACT_REVIEW_FAILED\[([^\]]+)\]:\s*(.*)$/s);
            const providerStatus = result.error.statusCode;
            const statusCode = providerStatus === 429 || providerStatus === 503 || providerStatus === 504
              ? providerStatus
              : 503;
            throw Object.assign(new Error(validationMessage), {
              name: "AIValidationError",
              statusCode,
              mode: "generateTestData",
              ...(contractFailure ? { invalidSource: contractFailure[1], issues: [contractFailure[2]] } : {}),
              cause: result.error,
            });
          });
          if (!text(generatedTask.practicalTask)) {
            throw withAssessmentStage(assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503), "practical_task");
          }
          if (testSelection.tests.length < 1) {
            throw withAssessmentStage(assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503), "hidden_tests");
          }
          const examples = generatedTask.examples
            .map((example) => ({ input: text(example.input, 2_000), output: text(example.output, 2_000), explanation: text(example.explanation, 1_000) }))
            .filter((example) => example.input || example.output)
            .slice(0, 3);
          const moduleTitles = Array.from(new Set(topicGroup.map((topic) => topic.moduleTitle)));
          const practical: CourseDiagnosticPractical = {
            id: `p${taskIndex + 1}`,
            moduleTitle: moduleTitles.join(" · "),
            topicIds: topicGroup.map((topic) => topic.id),
            title: text(generatedTask.title, 255) || (locale === "en" ? `Practical task ${taskIndex + 1}` : `Практичне завдання ${taskIndex + 1}`),
            statement: text(generatedTask.practicalTask, 8_000),
            inputFormat: text(generatedTask.inputFormat, 2_000),
            outputFormat: text(generatedTask.outputFormat, 2_000),
            constraints: text(generatedTask.constraints, 2_000),
            examples,
            codeTemplate: text(generatedTask.codeTemplate, 40_000),
            runtime,
            entryFile: projectEntryFile(runtime),
            tests: testSelection.tests,
          };
          return practical;
        };

        return generateDiagnosticTaskPackageWithRetry(
          (packageAttempt, previousError) => {
            if (packageAttempt === 1) return generatePackage(taskContext);
            const rejectedSource = recordOf(previousError)?.invalidSource === "publicExamples" ? "public examples" : "statement";
            const replacementContext = [
              taskContext,
              `REPLACEMENT TASK REQUIREMENT: The previous draft failed independent review of its ${rejectedSource}. Generate a substantially different task with a complete, unambiguous input/output contract. For every decimal or floating-point output, state exact precision and rounding or an explicit tolerance, then recalculate every public example.`,
              `Replacement variation token: ${groupSeed}-replacement-${packageAttempt}.`,
            ].join("\n\n");
            return generatePackage(replacementContext);
          },
          (error) => {
            const rejectedSource = recordOf(error)?.invalidSource === "publicExamples" ? "public examples" : "statement";
            logger.warn("[learning/diagnostic] regenerating practical task after contract failure", {
              requestId,
              courseId: course.id,
              moduleId: topicGroup[0].moduleId,
              attempt: 2,
              rejectedSource,
            });
          },
        );
      }),
    ]);
    const questions = generatedQuestions.flat();
    return { version: 2, seed, questions, practicals };
  } catch (error) {
    const details = recordOf(error);
    const stage = details?.assessmentStage;
    const reason = assessmentFailureReason(error);
    logger.error("[learning/diagnostic] assessment generation failed", {
      requestId,
      userId,
      courseId: course.id,
      stage: typeof stage === "string" ? stage : "unknown",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: details?.code,
      statusCode: details?.statusCode,
      reason,
      ...assessmentGenerationErrorLogDetails(error),
    });
    if (recordOf(error)?.statusCode) throw error;
    const failure = assessmentError("ASSESSMENT_GENERATION_FAILED", 503);
    throw Object.assign(failure, {
      assessmentStage: typeof stage === "string" ? stage : "unknown",
      assessmentReason: reason,
    });
  }
}

async function ownedEnrollment(userId: number, enrollmentId: number) {
  const enrollment = await enrollmentRepo().findOne({
    where: { id: enrollmentId, user: { id: userId } },
    relations: ["course", "variant"],
  });
  if (!enrollment) throw assessmentError("ENROLLMENT_NOT_FOUND", 404);
  if (!enrollment.course || enrollment.course.organizationId != null) throw assessmentError("PERSONAL_COURSE_REQUIRED", 403);
  if (enrollment.status === "LOCKED" || enrollment.status === "AVAILABLE") throw assessmentError("COURSE_NOT_ACTIVE", 409);
  return enrollment;
}

function assessmentPracticals(payload: CourseDiagnosticPayload): CourseDiagnosticPractical[] {
  const stored = Array.isArray(payload.practicals) ? payload.practicals : payload.practical ? [payload.practical] : [];
  return stored.map((practical, index) => ({
    ...practical,
    id: practical.id || `p${index + 1}`,
    moduleTitle: practical.moduleTitle || "",
    topicIds: Array.isArray(practical.topicIds) ? practical.topicIds : [],
  }));
}

function hasComprehensivePayload(payload: CourseDiagnosticPayload): boolean {
  return payload.version >= 2 && Array.isArray(payload.practicals) && payload.practicals.length > 0;
}

function publicAssessment(assessment: CourseDiagnosticAssessment, course: Course) {
  const payload = assessment.assessmentData;
  const practicals = assessmentPracticals(payload);
  const publicPracticals = practicals.map(({ tests: _tests, ...practical }) => practical);
  if (!publicPracticals.length) throw assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503);
  return {
    id: assessment.id,
    enrollmentId: assessment.enrollmentId,
    attemptNumber: assessment.attemptNumber,
    courseTitle: course.title,
    status: assessment.status,
    passing: { totalScore: 75, knowledgeScore: 70, practicalScore: 60 },
    questions: payload.questions.map(({ id, question, options, topicId, topicTitle }) => ({ id, question, options, topicId, topicTitle })),
    practical: publicPracticals[0],
    practicals: publicPracticals,
    result: assessment.resultData ?? null,
  };
}

async function generateForCourse(userId: number, course: Course, runtime: Runtime, locale: CurriculumLocale): Promise<CourseDiagnosticPayload> {
  const topics = courseDiagnosticTopics(course, locale);
  if (!topics.length) throw assessmentError("ASSESSMENT_TOPICS_INVALID", 503);
  return generateAssessment(course, runtime, userId, locale, topics);
}

export async function getCourseDiagnosticAssessment(userId: number, enrollmentId: number, locale: CurriculumLocale = "uk") {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  let assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  const course = await courseRepo().findOne({
    where: { id: enrollment.courseId },
    relations: ["modules", "modules.items"],
  });
  if (!course) throw assessmentError("COURSE_NOT_FOUND", 404);
  if (assessment && assessment.status === "READY" && !hasComprehensivePayload(assessment.assessmentData)) {
    if (enrollment.finalAssessmentPassed || enrollment.status === "COMPLETED") throw assessmentError("COURSE_ALREADY_COMPLETED", 409);
    const runtime = enrollment.variant.runtime === "JAVA" || enrollment.variant.runtime === "CPP" ? enrollment.variant.runtime : "PYTHON";
    assessment.assessmentData = await generateForCourse(userId, course, runtime, locale);
    assessment = await assessmentRepo().save(assessment);
  }
  if (assessment) return publicAssessment(assessment, course);
  if (enrollment.finalAssessmentPassed || enrollment.status === "COMPLETED") throw assessmentError("COURSE_ALREADY_COMPLETED", 409);

  const runtime = enrollment.variant.runtime === "JAVA" || enrollment.variant.runtime === "CPP" ? enrollment.variant.runtime : "PYTHON";
  const assessmentData = await generateForCourse(userId, course, runtime, locale);
  assessment = assessmentRepo().create({ enrollment: { id: enrollment.id }, attemptNumber: 1, assessmentData, status: "READY" });
  try {
    assessment = await assessmentRepo().save(assessment);
  } catch (error) {
    const raced = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
    if (!raced) throw error;
    assessment = raced;
  }
  return publicAssessment(assessment, course);
}

export async function retryCourseDiagnosticAssessment(userId: number, enrollmentId: number, locale: CurriculumLocale = "uk") {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const latest = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!latest || latest.status === "READY") return getCourseDiagnosticAssessment(userId, enrollmentId, locale);
  if (latest.resultData?.passed || enrollment.finalAssessmentPassed) throw assessmentError("ASSESSMENT_ALREADY_PASSED", 409);
  if (enrollment.status === "COMPLETED") throw assessmentError("COURSE_ALREADY_COMPLETED", 409);
  const course = await courseRepo().findOne({ where: { id: enrollment.courseId }, relations: ["modules", "modules.items"] });
  if (!course) throw assessmentError("COURSE_NOT_FOUND", 404);
  const runtime = enrollment.variant.runtime === "JAVA" || enrollment.variant.runtime === "CPP" ? enrollment.variant.runtime : "PYTHON";
  const assessmentData = await generateForCourse(userId, course, runtime, locale);
  let next = assessmentRepo().create({
    enrollment: { id: enrollment.id },
    attemptNumber: latest.attemptNumber + 1,
    assessmentData,
    status: "READY",
  });
  try {
    next = await assessmentRepo().save(next);
  } catch (error) {
    const raced = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
    if (!raced) throw error;
    next = raced;
  }
  return publicAssessment(next, course);
}

function normalizeAnswers(rawAnswers: unknown, questions: CourseDiagnosticQuestion[]): Array<{ questionId: string; selectedIndex: number }> | null {
  if (!Array.isArray(rawAnswers) || rawAnswers.length !== questions.length) return null;
  const answers = new Map<string, number>();
  for (const raw of rawAnswers) {
    const answer = recordOf(raw);
    if (typeof answer?.questionId !== "string" || !Number.isInteger(answer.selectedIndex)) return null;
    const selectedIndex = Number(answer.selectedIndex);
    if (selectedIndex < 0 || selectedIndex > 3 || answers.has(answer.questionId)) return null;
    answers.set(answer.questionId, selectedIndex);
  }
  if (questions.some((question) => !answers.has(question.id)) || answers.size !== questions.length) return null;
  return questions.map((question) => ({ questionId: question.id, selectedIndex: answers.get(question.id)! }));
}

function gradeAnswers(questions: CourseDiagnosticQuestion[], answers: Array<{ questionId: string; selectedIndex: number }>) {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.selectedIndex]));
  let correctCount = 0;
  const topicCounts = new Map<number, { topicTitle: string; correctCount: number; totalQuestions: number }>();
  const review = questions.map((question) => {
    const selectedIndex = byId.get(question.id)!;
    const isCorrect = selectedIndex === question.correct;
    if (isCorrect) correctCount += 1;
    const topic = topicCounts.get(question.topicId) ?? { topicTitle: question.topicTitle, correctCount: 0, totalQuestions: 0 };
    topic.totalQuestions += 1;
    if (isCorrect) topic.correctCount += 1;
    topicCounts.set(question.topicId, topic);
    return {
      questionId: question.id,
      question: question.question,
      options: question.options,
      selectedIndex,
      correctIndex: question.correct,
      topicTitle: question.topicTitle,
    };
  });
  const topicResults = Array.from(topicCounts, ([topicId, topic]) => {
    const score = Math.round(topic.correctCount / topic.totalQuestions * 100);
    return {
      topicId,
      topicTitle: topic.topicTitle,
      correctCount: topic.correctCount,
      totalQuestions: topic.totalQuestions,
      score,
      theoryCredited: score >= 80,
      practiceCredited: false,
    };
  });
  return { correctCount, review, topicResults, score: Math.round(correctCount / questions.length * 100) };
}

async function runPractical(enrollmentId: number, assessmentId: number, practical: CourseDiagnosticPractical, code: string) {
  const result = await judgeWithSemaphore({
    submission_id: `diagnostic-${enrollmentId}-${assessmentId}-${practical.id}-${Date.now()}`,
    language: practical.runtime.toLowerCase() as JudgeLanguage,
    files: [{ path: practical.entryFile, content: code }],
    entry: practical.entryFile,
    tests: practical.tests.map((test, index) => ({ id: `case-${index + 1}`, input: test.input, output: test.output, hidden: true, group: "diagnostic", weight: 1 })),
    checker: { type: "exact" },
    limits: { time_limit_ms: 5_000, memory_limit_mb: 384, output_limit_kb: 32 },
    run_all: true,
    debug: false,
  }, { timeoutMs: 15_000 });
  const testsPassed = result.tests.filter((test) => test.verdict === "AC").length;
  const testsTotal = result.tests.length;
  if (!testsTotal) throw assessmentError("JUDGE_UNAVAILABLE", 503);
  return { testsPassed, testsTotal, score: Math.round(testsPassed / testsTotal * 100) };
}

function normalizePracticalSubmissions(
  rawPracticals: unknown,
  rawLegacyCode: unknown,
  practicals: CourseDiagnosticPractical[],
): Array<{ taskId: string; code: string }> | null {
  if (Array.isArray(rawPracticals)) {
    if (rawPracticals.length !== practicals.length) return null;
    const codeByTask = new Map<string, string>();
    for (const raw of rawPracticals) {
      const submission = recordOf(raw);
      const taskId = text(submission?.taskId, 80);
      const code = text(submission?.code, 100_000);
      if (!taskId || !code || codeByTask.has(taskId)) return null;
      codeByTask.set(taskId, code);
    }
    if (practicals.some((practical) => !codeByTask.has(practical.id))) return null;
    return practicals.map((practical) => ({ taskId: practical.id, code: codeByTask.get(practical.id)! }));
  }

  const code = text(rawLegacyCode, 100_000);
  return practicals.length === 1 && code ? [{ taskId: practicals[0].id, code }] : null;
}

export async function runCourseDiagnosticSample(userId: number, enrollmentId: number, rawTaskId: unknown, rawCode: unknown, rawInput: unknown) {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!assessment) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
  if (assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
  const code = text(rawCode, 100_000);
  if (!code) throw assessmentError("PRACTICAL_CODE_REQUIRED", 400);
  const input = text(rawInput, 20_000);
  const practicals = assessmentPracticals(assessment.assessmentData);
  const taskId = text(rawTaskId, 80) || practicals[0]?.id;
  const practical = practicals.find((candidate) => candidate.id === taskId);
  if (!practical) throw assessmentError("ASSESSMENT_PRACTICAL_INVALID", 400);
  try {
    const result = await judgeWithSemaphore({
      submission_id: `diagnostic-run-${enrollment.id}-${assessment.id}-${Date.now()}`,
      language: practical.runtime.toLowerCase() as JudgeLanguage,
      files: [{ path: practical.entryFile, content: code }],
      entry: practical.entryFile,
      tests: [{ id: "sample", input, output: "", hidden: false }],
      checker: { type: "exact" },
      limits: { time_limit_ms: 10_000, memory_limit_mb: 384, output_limit_kb: 128 },
      run_all: true,
      debug: true,
    }, { timeoutMs: 15_000 });
    const test = result.tests[0];
    return {
      stdout: String(test?.actual || ""),
      stderr: String(test?.stderr || result.compile?.stderr || ""),
      exitCode: result.verdict === "CE" || ["RE", "TLE", "MLE"].includes(String(test?.verdict)) ? 1 : 0,
      success: ["AC", "WA"].includes(String(test?.verdict)),
    };
  } catch {
    throw assessmentError("JUDGE_UNAVAILABLE", 503);
  }
}

export async function submitCourseDiagnosticAssessment(
  userId: number,
  enrollmentId: number,
  rawAnswers: unknown,
  rawPracticals: unknown,
  rawLegacyCode?: unknown,
) {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!assessment) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
  if (assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
  const payload = assessment.assessmentData;
  const answers = normalizeAnswers(rawAnswers, payload.questions);
  if (!answers) throw assessmentError("ASSESSMENT_ANSWERS_INVALID", 400);
  const practicals = assessmentPracticals(payload);
  const practicalSubmissions = normalizePracticalSubmissions(rawPracticals, rawLegacyCode, practicals);
  if (!practicalSubmissions) throw assessmentError("PRACTICAL_CODE_REQUIRED", 400);
  const submissionByTask = new Map(practicalSubmissions.map((submission) => [submission.taskId, submission.code]));

  let practicalResults: Array<{
    taskId: string;
    title: string;
    moduleTitle: string;
    topicIds: number[];
    testsPassed: number;
    testsTotal: number;
    score: number;
  }>;
  try {
    practicalResults = await mapWithConcurrency(practicals, 2, async (practical) => {
      const evaluation = await runPractical(enrollment.id, assessment.id, practical, submissionByTask.get(practical.id)!);
      return {
        taskId: practical.id,
        title: practical.title,
        moduleTitle: practical.moduleTitle,
        topicIds: practical.topicIds,
        ...evaluation,
      };
    });
  } catch (error) {
    if (recordOf(error)?.statusCode) throw error;
    throw assessmentError("JUDGE_UNAVAILABLE", 503);
  }
  const testsPassed = practicalResults.reduce((total, task) => total + task.testsPassed, 0);
  const testsTotal = practicalResults.reduce((total, task) => total + task.testsTotal, 0);
  if (!testsTotal) throw assessmentError("JUDGE_UNAVAILABLE", 503);
  const practicalScore = Math.round(testsPassed / testsTotal * 100);
  const topicPracticeScores = new Map<number, number>();
  for (const task of practicalResults) {
    for (const topicId of task.topicIds) topicPracticeScores.set(topicId, task.score);
  }
  const hasTopicCoverage = practicals.some((practical) => practical.topicIds.length > 0);
  const knowledge = gradeAnswers(payload.questions, answers);
  const score = Math.round((knowledge.score + practicalScore) / 2);
  const passed = score >= 75 && knowledge.score >= 70 && practicalScore >= 60;
  const result: CourseDiagnosticResult = {
    score,
    knowledgeScore: knowledge.score,
    practicalScore,
    correctCount: knowledge.correctCount,
    totalQuestions: payload.questions.length,
    testsPassed,
    testsTotal,
    practicalResults,
    passed,
    answers,
    topicResults: knowledge.topicResults.map((topic) => ({
      ...topic,
      practiceCredited: topic.theoryCredited && (hasTopicCoverage ? (topicPracticeScores.get(topic.topicId) ?? 0) >= 60 : practicalScore >= 60),
    })),
    review: knowledge.review,
    submittedAt: new Date().toISOString(),
  };

  await AppDataSource.transaction(async (manager) => {
    const storedAssessment = await manager.getRepository(CourseDiagnosticAssessment).findOne({ where: { id: assessment.id, enrollment: { id: enrollment.id } } });
    if (!storedAssessment || storedAssessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
    storedAssessment.status = "SUBMITTED";
    storedAssessment.resultData = result;
    storedAssessment.submittedAt = new Date(result.submittedAt);
    await manager.getRepository(CourseDiagnosticAssessment).save(storedAssessment);

    const course = await manager.getRepository(Course).findOne({ where: { id: enrollment.courseId }, relations: ["modules", "modules.items"] });
    if (!course) throw assessmentError("COURSE_NOT_FOUND", 404);
    const items = await manager.getRepository(CourseItem).createQueryBuilder("item")
      .innerJoin("item.module", "module")
      .where("module.course_id = :courseId", { courseId: enrollment.courseId })
      .andWhere("item.is_active = 1")
      .getMany();
    const itemById = new Map(items.map((item) => [item.id, item]));
    const topicById = new Map(courseDiagnosticTopics(course, "uk").map((topic) => [topic.id, topic]));
    const progressRepository = manager.getRepository(CourseItemProgress);
    const completeItem = async (item: CourseItem) => {
      if (item.content?.required === false) return;
      const progress = await progressRepository.findOne({ where: { enrollment: { id: enrollment.id }, item: { id: item.id } } })
        || progressRepository.create({ enrollment: { id: enrollment.id }, item: { id: item.id } });
      progress.status = "COMPLETED";
      progress.score = 100;
      progress.completedAt = progress.completedAt || new Date();
      await progressRepository.save(progress);
    };

    for (const topicResult of result.topicResults) {
      if (!topicResult.theoryCredited) continue;
      const topic = topicById.get(topicResult.topicId);
      if (!topic) continue;
      for (const itemId of topic.itemIds) {
        const item = itemById.get(itemId);
        if (!item || item.content?.project === true) continue;
        const theoryEvidence = item.kind === "THEORY" || item.kind === "QUIZ";
        if (theoryEvidence || topicResult.practiceCredited) await completeItem(item);
      }
    }

    if (passed) {
      for (const item of items) await completeItem(item);
      enrollment.finalAssessmentPassed = true;
      enrollment.status = "COMPLETED";
      enrollment.completedAt = enrollment.completedAt || new Date();
    }

    const requiredItems = items.filter((item) => item.content?.required !== false);
    const currentProgress = await progressRepository.find({ where: { enrollment: { id: enrollment.id } } });
    const progressByItem = new Map(currentProgress.map((entry) => [entry.itemId, entry]));
    const scoredTotal = requiredItems.reduce((total, item) => {
      const entry = progressByItem.get(item.id);
      const itemScore = Number(entry?.score);
      return total + (Number.isFinite(itemScore) ? Math.max(0, Math.min(100, itemScore)) : entry?.status === "COMPLETED" ? 100 : 0);
    }, 0);
    enrollment.completionPercent = requiredItems.length ? percent(scoredTotal / requiredItems.length) : 0;
    if (enrollment.finalAssessmentPassed && enrollment.completionPercent >= 100) enrollment.status = "COMPLETED";
    else if (enrollment.status === "AVAILABLE") enrollment.status = "IN_PROGRESS";
    await manager.getRepository(UserCourseEnrollment).save(enrollment);
  });
  return result;
}
