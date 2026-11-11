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
  type CourseDiagnosticTaskAttempts,
  type CourseDiagnosticTaskAttemptState,
} from "../entities/CourseDiagnosticAssessment";
import { UserCourseEnrollment } from "../entities/UserCourseEnrollment";
import { getLLMOrchestrator } from "./llm/LLMOrchestrator";
import { runWithPromptExecutionContext } from "./llm/promptExecution";
import { safeAICall } from "./ai/safeAICall";
import { judgeWithSemaphore } from "./judgeWorker";
import type { JudgeLanguage } from "./judgeWorker/types";
import { projectEntryFile } from "./learningCatalogProjectFiles";
import { localizeCourseItem, localizedCourseTitle, localizedModuleTitle, type CurriculumLocale } from "./curriculumLocalization";
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
  if (/timeout|timed out|ETIMEDOUT|request aborted|deadline exceeded|AbortError/i.test(message)) return "provider_timeout";
  if (/ECONN|ENOTFOUND|fetch failed|network|\b50[234]\b|bad gateway|unavailable/i.test(message)) return "provider_unavailable";
  if (/\b(?:CORE_OPERATION_MISSING|TOPIC_MISMATCH_HARD_FAIL|FORBIDDEN_SCOPE_VIOLATION|MULTI_TASK_NOT_ALLOWED):/i.test(message)) return "task_semantic_validation_failed";
  if (typeof details?.invalidSource === "string") return "task_contract_review_failed";
  if (details?.name === "AIValidationError" || recordOf(details?.errors)) return "invalid_provider_response";
  if (/empty (ai )?response/i.test(message)) return "empty_provider_response";
  if (/json|parse|schema|invalid response|validation/i.test(message)) return "invalid_provider_response";
  return "provider_generation_failed";
}

const RETRYABLE_DIAGNOSTIC_TASK_PROVIDER_FAILURE_REASONS = new Set([
  "provider_generation_failed",
  "provider_unavailable",
  "provider_timeout",
  "invalid_provider_response",
  "empty_provider_response",
]);

function isRetryableDiagnosticTaskProviderFailure(error: unknown): boolean {
  const details = recordOf(error);
  if (details?.assessmentStage !== "practical_task") return false;
  const statusCode = Number(details.statusCode);
  if (Number.isFinite(statusCode) && ![502, 503, 504].includes(statusCode)) return false;
  return RETRYABLE_DIAGNOSTIC_TASK_PROVIDER_FAILURE_REASONS.has(assessmentFailureReason(error));
}

function isRetryableDiagnosticHiddenTestFailure(error: unknown): boolean {
  const details = recordOf(error);
  if (details?.assessmentStage !== "hidden_tests") return false;
  return [502, 503, 504].includes(Number(details.statusCode));
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
const DIAGNOSTIC_QUESTION_BATCH_SIZE = 4;
const DIAGNOSTIC_PRACTICAL_TASK_COUNT = 5;

export function groupDiagnosticTopicsForPracticals(
  topics: CourseDiagnosticTopic[],
  requestedTaskCount = DIAGNOSTIC_PRACTICAL_TASK_COUNT,
): CourseDiagnosticTopic[][] {
  if (!topics.length) return [];
  const taskCount = Math.min(topics.length, Math.max(1, Math.floor(requestedTaskCount)));
  const groups: CourseDiagnosticTopic[][] = [];
  let offset = 0;
  for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
    const tasksRemaining = taskCount - taskIndex;
    const topicsRemaining = topics.length - offset;
    const groupSize = Math.ceil(topicsRemaining / tasksRemaining);
    groups.push(topics.slice(offset, offset + groupSize));
    offset += groupSize;
  }
  return groups;
}

export function buildDiagnosticPracticalTaskContext(
  courseTitle: string,
  topicGroup: readonly CourseDiagnosticTopic[],
  variationToken: string,
  locale: CurriculumLocale,
): string {
  const requirements = locale === "en"
    ? "COURSE DIAGNOSTIC: Create one beginner-friendly STDIN/STDOUT task combining at least two assigned topics; each must affect output. Keep behavior observable; avoid unobservable method calls, UI actions, or external setup. If objects/methods matter, encode actions in input and show results. Define exact input grammar; never silently split or trim meaningful text. Give exactly three distinct non-empty examples matching the statement and reference. Samples must be plain data, never labels/type names/comments or blank/extra lines; prefer one non-empty input line and use multiline only when the grammar defines each line. Use assigned topics and deterministic, non-empty output. Prefer integers; avoid weights, percentages, and decimals. If decimals are essential, specify fixed digits, rounding, trailing-zero policy, and decimal point; never imply preserving the input's spelling. Include a non-integer example."
    : "ДІАГНОСТИКА КУРСУ: Створи доступну консольну задачу STDIN/STDOUT, що поєднує щонайменше дві призначені теми; кожна впливає на результат. Уся поведінка має бути видимою через ввід/вивід: без невидимих викликів методів, дій UI чи зовнішнього налаштування. Якщо важливі об’єкти/методи, закодуй дії у вводі й покажи результати. Точно опиши граматику вводу; не діли й не обрізай значущий текст мовчки. Додай рівно три різні непорожні приклади, узгоджені з умовою й еталоном. Приклади — лише дані, без міток/назв типів/коментарів і порожніх чи зайвих рядків. Ввід — в один рядок, крім випадків, коли граматика визначає кожен рядок. Використовуй лише призначені теми; вивід детермінований і непорожній. Переважно використовуй цілі числа; уникай ваги, відсотків і дробових результатів. Якщо дроби необхідні, задай фіксовану точність, округлення, правило кінцевих нулів і десяткову крапку; не вимагай зберігати запис числа з вводу. Додай приклад із нецілим результатом."
  const topicList = topicGroup.map((topic) => {
    const detail = topic.context
      .split(/\r?\n/)
      .slice(2)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const shortDetail = text(detail, 14);
    return "[topic:" + topic.id + "] " + text(topic.title, 50) + (shortDetail ? " — " + shortDetail : "");
  }).join("\n");

  return [
    requirements,
    "Course: " + text(courseTitle, 55) + ".",
    "Assigned course topics:",
    topicList,
    "Variation token: " + text(variationToken, 40) + " (internal; never include in the task).",
  ].join("\n\n");
}

export function shouldRegenerateDiagnosticTask(error: unknown): boolean {
  const details = recordOf(error);
  if (details?.invalidSource === "statement" || details?.invalidSource === "publicExamples") return true;
  const message = String(details?.message ?? "");
  if (/\b(?:CORE_OPERATION_MISSING|TOPIC_MISMATCH_HARD_FAIL|FORBIDDEN_SCOPE_VIOLATION|MULTI_TASK_NOT_ALLOWED):/i.test(message)) return true;
  if (isRetryableDiagnosticHiddenTestFailure(error)) return true;
  if (isRetryableDiagnosticTaskProviderFailure(error)) return true;
  return details?.name === "AIValidationError"
    && details?.mode === "generateTask"
    && /^(?:Example\s+\d+:\s*)?Task generation validation failed:/i.test(message);
}

export function diagnosticTaskRegenerationReason(error: unknown): "statement" | "publicExamples" | "hiddenTestFailure" | "shallowDecision" | "implementationHint" | "emptyOutput" | "coreOperation" | "topicMismatch" | "forbiddenScope" | "multipleTasks" | "providerFailure" | "taskValidation" | null {
  const details = recordOf(error);
  if (details?.invalidSource === "statement") return "statement";
  if (details?.invalidSource === "publicExamples") return "publicExamples";
  if (isRetryableDiagnosticHiddenTestFailure(error)) return "hiddenTestFailure";
  const message = String(details?.message ?? "");
  if (/examples\.\d+\.(?:input|output).*non-empty string/i.test(message)
    || /Example\s+\d+:.*(?:STDIN_STDOUT example must have non-empty input|example output must be a non-empty string)/i.test(message)) {
    return "publicExamples";
  }
  if (/decision task is too shallow/i.test(message)) return "shallowDecision";
  if (/reveals an implementation technique/i.test(message)) return "implementationHint";
  if (/requires empty output/i.test(message)) return "emptyOutput";
  if (/CORE_OPERATION_MISSING/i.test(message)) return "coreOperation";
  if (/TOPIC_MISMATCH_HARD_FAIL/i.test(message)) return "topicMismatch";
  if (/FORBIDDEN_SCOPE_VIOLATION/i.test(message)) return "forbiddenScope";
  if (/MULTI_TASK_NOT_ALLOWED/i.test(message)) return "multipleTasks";
  if (details?.name === "AIValidationError"
    && details?.mode === "generateTask"
    && /^(?:Example\s+\d+:\s*)?Task generation validation failed:/i.test(message)) {
    return "taskValidation";
  }
  if (isRetryableDiagnosticTaskProviderFailure(error)) return "providerFailure";
  if (!shouldRegenerateDiagnosticTask(error)) return null;
  return "taskValidation";
}

export async function generateDiagnosticTaskPackageWithRetry<T>(
  generatePackage: (attempt: 1 | 2 | 3 | 4 | 5, previousError?: unknown) => Promise<T>,
  onRetry?: (error: unknown, nextAttempt: 2 | 3 | 4 | 5) => void,
): Promise<T> {
  let previousError: unknown;
  for (const attempt of [1, 2, 3, 4, 5] as const) {
    try {
      return await generatePackage(attempt, previousError);
    } catch (error) {
      if (attempt === 5 || !shouldRegenerateDiagnosticTask(error)) throw error;
      previousError = error;
      onRetry?.(error, (attempt + 1) as 2 | 3 | 4 | 5);
    }
  }
  throw new Error("Unreachable diagnostic task regeneration state");
}

export function selectCourseDiagnosticTestCases(
  generatedTests: unknown,
  publicExamples: unknown = [],
): { tests: CourseDiagnosticTestCase[]; source: "hidden" } | null {
  const publicInputs = new Set(Array.isArray(publicExamples) ? publicExamples.map((candidate) => text(recordOf(candidate)?.input, 10_000)).filter(Boolean) : []);
  const cleanCases = (value: unknown, excludedInputs = new Set<string>()): CourseDiagnosticTestCase[] => {
    if (!Array.isArray(value)) return [];
    const cases: CourseDiagnosticTestCase[] = [];
    const seenInputs = new Set<string>();
    for (const candidate of value) {
      const item = recordOf(candidate);
      const input = text(item?.input, 10_000);
      const output = text(item?.output, 10_000);
      if (!input || !output || seenInputs.has(input) || excludedInputs.has(input)) continue;
      seenInputs.add(input);
      cases.push({ input, output });
      if (cases.length === 15) break;
    }
    return cases;
  };

  const hidden = cleanCases(generatedTests, publicInputs);
  if (hidden.length !== 15) return null;
  return { tests: hidden, source: "hidden" };
}

export function isDiagnosticPracticalInputContractValid(ioType: unknown, publicExamples: unknown): boolean {
  if (ioType !== "STDIN_STDOUT" || !Array.isArray(publicExamples) || publicExamples.length !== 3) return false;
  const seen = new Set<string>();
  return publicExamples.every((candidate) => {
    const item = recordOf(candidate);
    const input = text(item?.input, 10_000);
    const output = text(item?.output, 10_000);
    if (!input || !output || seen.has(input)) return false;
    seen.add(input);
    return true;
  });
}

type DiagnosticTestGenerationResult =
  | { success: true; data: unknown }
  | { success: false; error: { details?: unknown; error?: unknown; message?: unknown } };

export function resolveCourseDiagnosticTestCases(
  result: DiagnosticTestGenerationResult,
  publicExamples: unknown = [],
): { tests: CourseDiagnosticTestCase[]; source: "hidden" } | null {
  if (result.success) return selectCourseDiagnosticTestCases(result.data, publicExamples);
  return null;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  failureState: { failed: boolean } = { failed: false },
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let hasFailure = false;
  let firstFailure: unknown;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (!failureState.failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failureState.failed = true;
        if (!hasFailure) {
          hasFailure = true;
          firstFailure = error;
        }
        return;
      }
    }
  }));
  if (hasFailure) throw firstFailure;
  return results;
}

export function normalizeQuestions(
  rawQuiz: unknown,
  topicAssignments: CourseDiagnosticTopic[],
  expectedCount: number,
  startIndex: number,
  allowPartial = false,
): CourseDiagnosticQuestion[] {
  let parsed: unknown = rawQuiz;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  const root = recordOf(parsed);
  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(root?.questions) ? root.questions : [];
  const questions: CourseDiagnosticQuestion[] = [];
  const seenPrompts = new Set<string>();
  for (const [index, raw] of candidates.entries()) {
    const question = recordOf(raw);
    const rawPrompt = text(question?.q ?? question?.question ?? question?.prompt, 2_000);
    const topicMarker = rawPrompt.match(/^\[topic:(-?\d+)\]\s*/i);
    const markedTopic = topicMarker ? topicAssignments.find((topic) => topic.id === Number(topicMarker[1])) : undefined;
    const topic = markedTopic ?? topicAssignments[questions.length % topicAssignments.length];
    const prompt = rawPrompt.replace(/^\[topic:-?\d+\]\s*/i, "").trim();
    const rawOptions = Array.isArray(question?.options) ? question.options.map((option) => text(option, 800)) : [];
    const correct = Number(question?.correct);
    const normalizedPrompt = prompt.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const normalizedOptions = rawOptions.map((option) => option.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim());
    const vagueQuestion = /^(?:why (?:is|are) (?:programming|coding)|what is the point of programming|explain why|describe the general idea)|^(?:чому програмування|для чого взагалі програмування|поясни чому|опиши загальну ідею)/i.test(prompt);
    if (!prompt || prompt.length < 24 || normalizedPrompt.split(/\s+/).length < 5 || vagueQuestion || seenPrompts.has(normalizedPrompt)
      || rawOptions.length !== 4 || !Number.isInteger(correct) || correct < 0 || correct >= rawOptions.length
      || rawOptions.some((option) => !option) || new Set(normalizedOptions).size !== 4) continue;
    seenPrompts.add(normalizedPrompt);

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
  if (questions.length !== expectedCount && !allowPartial) throw assessmentError("ASSESSMENT_QUESTIONS_INVALID", 503);
  return questions;
}

export function hasExactDiagnosticQuestionCoverage(
  questions: CourseDiagnosticQuestion[],
  topicAssignments: Array<Pick<CourseDiagnosticTopic, "id">>,
): boolean {
  const expected = new Map<number, number>();
  const actual = new Map<number, number>();
  for (const topic of topicAssignments) expected.set(topic.id, (expected.get(topic.id) ?? 0) + 1);
  for (const question of questions) actual.set(question.topicId, (actual.get(question.topicId) ?? 0) + 1);
  return expected.size === actual.size && [...expected].every(([topicId, count]) => actual.get(topicId) === count);
}

export async function generateDiagnosticQuestionsWithCoverageRetry<
  TTopic extends Pick<CourseDiagnosticTopic, "id">,
  T,
>(
  topicAssignments: TTopic[],
  generate: (assignments: TTopic[], coverageFeedback?: string) => Promise<T>,
  normalize: (raw: T, assignments: TTopic[], startIndex: number) => CourseDiagnosticQuestion[],
  startIndex = 0,
): Promise<CourseDiagnosticQuestion[]> {
  const first = normalize(await generate(topicAssignments), topicAssignments, startIndex);
  if (hasExactDiagnosticQuestionCoverage(first, topicAssignments)) return first;

  const expected = new Map<number, number>();
  const actual = new Map<number, number>();
  for (const topic of topicAssignments) expected.set(topic.id, (expected.get(topic.id) ?? 0) + 1);
  for (const question of first) actual.set(question.topicId, (actual.get(question.topicId) ?? 0) + 1);
  const findings = [...expected].filter(([topicId, count]) => actual.get(topicId) !== count)
    .map(([topicId, count]) => `topic ${topicId}: expected ${count}, received ${actual.get(topicId) ?? 0}`);
  const feedback = [
    "GENERATE ONLY THE MISSING QUESTIONS. Keep the valid questions from the previous response; do not regenerate them.",
    `Coverage findings: ${findings.join("; ")}.`,
    "Return exactly one question for each supplied missing assignment, in order, with the matching [topic:ID] marker. Do not add or omit questions.",
  ].join("\n");
  const retainedByTopic = new Map<number, CourseDiagnosticQuestion[]>();
  for (const question of first) {
    const limit = expected.get(question.topicId) ?? 0;
    const retained = retainedByTopic.get(question.topicId) ?? [];
    if (retained.length < limit) retained.push(question);
    retainedByTopic.set(question.topicId, retained);
  }

  const retainedQuestionCount = [...retainedByTopic.values()].reduce((total, questions) => total + questions.length, 0);
  const missingAssignments: TTopic[] = [];
  const assignmentOccurrences = new Map<number, number>();
  for (const assignment of topicAssignments) {
    const occurrence = (assignmentOccurrences.get(assignment.id) ?? 0) + 1;
    assignmentOccurrences.set(assignment.id, occurrence);
    if ((retainedByTopic.get(assignment.id)?.length ?? 0) < occurrence) missingAssignments.push(assignment);
  }

  if (!missingAssignments.length) {
    const occurrences = new Map<number, number>();
    return topicAssignments.map((assignment, index) => {
      const occurrence = occurrences.get(assignment.id) ?? 0;
      occurrences.set(assignment.id, occurrence + 1);
      const question = retainedByTopic.get(assignment.id)?.[occurrence];
      if (!question) throw assessmentError("ASSESSMENT_QUESTIONS_INVALID", 503);
      return { ...question, id: `q${startIndex + index + 1}` };
    });
  }

  const replacement = normalize(
    await generate(missingAssignments, feedback),
    missingAssignments,
    startIndex + retainedQuestionCount,
  );
  if (!hasExactDiagnosticQuestionCoverage(replacement, missingAssignments)) {
    throw assessmentError("ASSESSMENT_QUESTIONS_INVALID", 503);
  }

  const replacementByTopic = new Map<number, CourseDiagnosticQuestion[]>();
  for (const question of replacement) {
    const questions = replacementByTopic.get(question.topicId) ?? [];
    questions.push(question);
    replacementByTopic.set(question.topicId, questions);
  }

  const merged: CourseDiagnosticQuestion[] = [];
  const mergedOccurrences = new Map<number, number>();
  for (const assignment of topicAssignments) {
    const occurrence = mergedOccurrences.get(assignment.id) ?? 0;
    mergedOccurrences.set(assignment.id, occurrence + 1);
    const retained = retainedByTopic.get(assignment.id) ?? [];
    const question = retained[occurrence] ?? replacementByTopic.get(assignment.id)?.[occurrence - retained.length];
    if (!question) throw assessmentError("ASSESSMENT_QUESTIONS_INVALID", 503);
    merged.push(question);
  }

  return merged.map((question, index) => ({ ...question, id: `q${startIndex + index + 1}` }));
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
    "Generate new assessment content using only the curriculum topics supplied with each task.",
    `Variation token (never include it in the learner-facing text): ${seed}`,
  ].filter(Boolean).join("\n");
  const topics = [...courseTopics];
  if (!topics.length) throw assessmentError("ASSESSMENT_TOPICS_INVALID", 503);
  const llm = getLLMOrchestrator();
  const language = locale === "en" ? "en" : "uk";
  try {
    const questionAssignments = topics.flatMap((topic) => Array.from({ length: 2 }, () => topic));
    const questionBatches = chunks(questionAssignments, DIAGNOSTIC_QUESTION_BATCH_SIZE);
    const practicalGroups = groupDiagnosticTopicsForPracticals(topics);

    const generationFailureState = { failed: false };
    const [questionResult, practicalResult] = await Promise.allSettled([
      // Keep provider concurrency bounded to avoid retry-budget exhaustion.
      mapWithConcurrency(questionBatches, 1, async (topicAssignments, batchIndex) => {
        try {
          const baseGuidance = language === "en"
            ? "COURSE DIAGNOSTIC KNOWLEDGE QUESTIONS: Test the assigned programming concept. Each question must assess one concrete skill or language rule from its assigned topic, be precise, and be fully answerable from its wording and choices alone without executing or tracing a program. Avoid vague, opinion-based, analogy-based, metaphorical, open-ended, or generic discussion questions (for example, 'why is programming like ...'). Ask about specific language rules, syntax, terminology, and the purpose of constructs. Do not mention or refer to code, snippets, or programs in a question; never ask what one prints, returns, outputs, or does. If the assigned topic is flow control, ask about the meaning and use of conditions and branches without presenting a tiny list of values to map directly to outputs. Return exactly four distinct choices: one technically unambiguous correct answer and three plausible but clearly incorrect distractors from the same category. Do not use 'all/none of the above'. Before responding, verify the language rule, unique correctness, topic alignment, and that no wording or options are duplicated."
            : "ПИТАННЯ ДІАГНОСТИКИ ЗНАНЬ: Перевіряй призначене поняття з програмування. Кожне питання має перевіряти одну конкретну навичку або правило з відповідної теми й бути зрозумілим без додаткового контексту; формулюй його точно, без розпливчастості, думок, аналогій, метафор і загальних міркувань. Не використовуй питання на кшталт «чому програмування схоже на…». Питай про правила мови, синтаксис, терміни й призначення конструкцій. Не згадуй і не описуй код, фрагменти чи програми в питаннях; ніколи не питай, що програма виведе, поверне або виконає. Якщо тема стосується керування потоком, перевіряй значення й призначення умов та гілок без прямого зіставлення невеликого набору значень із результатами. Поверни рівно 4 різні варіанти відповіді: один беззаперечно правильний згідно з правилами мови, три правдоподібні, але однозначно неправильні відволікальні варіанти з тієї самої категорії. Не використовуй варіанти «усі відповіді» або «жодна відповідь». Перед відповіддю перевір фактичну правильність, єдиність правильної відповіді, відсутність дублювання та відповідність питання саме призначеній темі.";
          return runWithPromptExecutionContext("task.quiz", { traceId: requestId, forceNewContext: true }, () =>
            generateDiagnosticQuestionsWithCoverageRetry(
              topicAssignments,
              (assignments, coverageFeedback) => {
                const repairPlan = [
                  "QUESTION COVERAGE PLAN. Generate exactly one question for each listed assignment, in order. Prefix q with [topic:ID].",
                  ...assignments.map((topic, index) => `Question ${index + 1}: [topic:${topic.id}] ${topic.title}. Test this topic only. ${topic.context}`),
                  "When the same topic appears twice, assess two different skills. The [topic:ID] marker is metadata and must be at the beginning of q.",
                ].join("\n");
                return llm.generateQuizWithAI({
                  lang: runtime,
                  prevTopics: `${courseContext}\n\n${repairPlan}`,
                  count: assignments.length,
                  optionCount: 4,
                  questionStyle: "CONCEPTS",
                  generationGuidance: [baseGuidance, coverageFeedback].filter(Boolean).join("\n\n"),
                  userId,
                  language,
                  requestId,
                });
              },
              (quiz, assignments, startIndex) => normalizeQuestions(
                quiz.quizJson,
                assignments as CourseDiagnosticTopic[],
                assignments.length,
                startIndex,
                true,
              ),
              batchIndex * DIAGNOSTIC_QUESTION_BATCH_SIZE,
            ),
          );
        } catch (error) {
          throw withAssessmentStage(error, "questions");
        }
      }, generationFailureState),
      mapWithConcurrency(practicalGroups, 2, async (topicGroup, taskIndex) => {
        const topicList = topicGroup.map((topic) => `- [topic:${topic.id}] ${topic.title}: ${topic.context}`).join("\n");
        const moduleTitles = Array.from(new Set(topicGroup.map((topic) => topic.moduleTitle)));
        const groupSeed = `${seed}-task-${taskIndex + 1}`;
        const topicTitle = moduleTitles[0].slice(0, 255);
        const taskContext = buildDiagnosticPracticalTaskContext(
          localizedCourseTitle(course, locale),
          topicGroup,
          groupSeed,
          locale,
        );
        const generatePackage = async (generationContext: string): Promise<CourseDiagnosticPractical> => {
          const generatedTask = await runAtAssessmentStage("practical_task", () => runWithPromptExecutionContext("task.generate", { traceId: requestId, forceNewContext: true }, () => llm.generateTaskWithAI({
            topicTitle,
            theory: generationContext,
            lang: runtime,
            topicIndex: taskIndex + 1,
            numInTopic: practicalGroups.length,
            isFirstTask: false,
            isControl: true,
            difus: 0.5,
            allowedIoTypes: ["STDIN_STDOUT"],
            exampleCount: 3,
            userId,
            topicId: topicGroup[0].id > 0 ? topicGroup[0].id : undefined,
            language,
            requestId,
          })));
          if (!isDiagnosticPracticalInputContractValid(generatedTask.ioType, generatedTask.examples)) {
            logger.warn("[learning/diagnostic] practical task rejected before hidden-test generation", {
              requestId,
              courseId: course.id,
              moduleId: topicGroup[0].moduleId,
              ioType: generatedTask.ioType,
              publicExampleCount: generatedTask.examples.length,
              emptyInputCount: generatedTask.examples.filter((example) => !text(example.input, 10_000)).length,
              emptyOutputCount: generatedTask.examples.filter((example) => !text(example.output, 10_000)).length,
            });
            throw Object.assign(new Error("Diagnostic practical task must use STDIN_STDOUT and include exactly three distinct usable public examples."), {
              name: "AIValidationError",
              statusCode: 503,
              mode: "generateTask",
              invalidSource: "publicExamples",
            });
          }
          const taskDescription = [
            generatedTask.practicalTask,
            `Input format: ${generatedTask.inputFormat}`,
            `Output format: ${generatedTask.outputFormat}`,
            `Constraints: ${generatedTask.constraints}`,
            `Examples: ${generatedTask.examples.map((example) => `Input:\n${example.input}\nOutput:\n${example.output}`).join("\n")}`,
          ].join("\n\n");
          const testSelection = await runAtAssessmentStage("hidden_tests", async () => {
            const result = await runWithPromptExecutionContext("task.reference-tests", {
              traceId: requestId,
              // Allow one initial call and two bounded candidate-suite repairs,
              // each with headroom beyond the 90s OpenRouter transport guard.
              timeoutMs: 330_000,
              forceNewContext: true,
            }, () => safeAICall<Array<{ input: string; output: string; explanation?: string }>>("generateTestData", {
              taskTitle: generatedTask.title,
              taskDescription,
              lang: runtime,
              count: 15,
              ioType: generatedTask.ioType ?? "STDIN_STDOUT",
              userId,
              publicExamples: generatedTask.examples,
              requiredCases: [
                "5 hidden basic cases: smallest valid input, simplest non-trivial input, repeated values, zero or neutral value when allowed, and a small positive case",
                "5 hidden typical cases: ordinary values, varied ordering, multiple values, mixed signs or categories when allowed, and a case that exercises the main topic interaction",
                "5 hidden edge cases: exact lower bound, exact upper bound, just-inside bounds, maximum permitted size, and a boundary interaction defined by the statement",
              ],
            // Two bounded safeAICall repairs handle candidate-test contract findings
            // before replacing the whole practical task package.
            }, { language, requestId, maxAttempts: 3 }));
            const resultDetails = recordOf(result.success ? null : result.error.details);
            const clarificationQuestion = result.success
              ? ""
              : text(recordOf(result.error.clarification)?.question, 500);
            const validationMessage = result.success
              ? ""
              : result.error.error === "AI_CLARIFICATION_REQUIRED" && clarificationQuestion
                ? `TASK_CONTRACT_REVIEW_FAILED[statement]: ${clarificationQuestion}`
                : typeof resultDetails?.validationError === "string"
                ? resultDetails.validationError
                : String(result.error.error ?? result.error.message);
            const rejectedSource = validationMessage.match(/^TASK_CONTRACT_REVIEW_FAILED\[([^\]]+)\]:/s)?.[1];

            // A fixed assessment contract requires a complete hidden suite.
            // Public examples remain visible and never count as a hidden-test fallback.
            const selection = resolveCourseDiagnosticTestCases(result, generatedTask.examples);
            if (selection) {
              return selection;
            }

            logger.error("[learning/diagnostic] required hidden test suite is unavailable", {
              requestId,
              courseId: course.id,
              moduleId: topicGroup[0].moduleId,
              reason: rejectedSource || (result.success ? "insufficient_test_cases" : "hidden_test_generation_failed"),
              statusCode: result.success ? null : result.error.statusCode,
              requiredHiddenTestCount: 15,
              publicExampleCount: Array.isArray(generatedTask.examples) ? generatedTask.examples.length : 0,
            });

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
          if (testSelection.tests.length !== 15) {
            throw withAssessmentStage(assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503), "hidden_tests");
          }
          const examples = generatedTask.examples
            .map((example) => ({ input: text(example.input, 2_000), output: text(example.output, 2_000), explanation: text(example.explanation, 1_000) }))
            .filter((example) => example.input || example.output)
            .slice(0, 3);
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
            const regenerationReason = diagnosticTaskRegenerationReason(previousError);
            const previousMessage = String(recordOf(previousError)?.message ?? "");
            const validationIssues = Array.isArray(recordOf(previousError)?.issues)
              ? (recordOf(previousError)?.issues as unknown[]).map((issue) => text(issue, 500)).filter(Boolean).slice(0, 3)
              : [];
            if (!validationIssues.length && regenerationReason !== "providerFailure" && shouldRegenerateDiagnosticTask(previousError)) {
              validationIssues.push(text(recordOf(previousError)?.message, 500));
            }
            const replacementRequirement = regenerationReason === "providerFailure"
              ? "RETRY AFTER TRANSIENT GENERATION FAILURE: No valid task was returned for this assignment. Generate the same compact task package from scratch, preserving the listed topic group, the required STDIN_STDOUT contract, and exactly three short public examples with non-empty input/output. Do not invent validator findings or mention the retry."
              : regenerationReason === "hiddenTestFailure"
                ? "REPLACEMENT TASK REQUIREMENT: The previous practical package failed hidden-test generation or review after its bounded repair attempts. Generate a simpler but useful replacement task from the assigned topic group, with deterministic behavior, explicit input bounds, an exact non-empty output contract, and exactly three short non-empty public examples. Keep the Python reference implementation straightforward and ensure at least 15 valid, distinct hidden inputs can be generated without relying on ambiguous parsing, unstated edge rules, or complicated output formatting. Recompute and verify every public example."
              : /STDIN_STDOUT.*non-empty.*input/i.test(previousMessage)
                ? "REPLACEMENT TASK REQUIREMENT: The previous draft had an empty input in a public example. Generate exactly three distinct examples, and give every example a concrete, non-empty STDIN value and its correct non-empty output. Recheck all three examples against the input grammar and task rules."
              : regenerationReason === "coreOperation"
              ? "REPLACEMENT TASK REQUIREMENT: The previous task omitted the required core operation. Regenerate a substantially different task that explicitly asks the learner to perform that operation in its title or statement, while keeping the task within the assigned topic and preserving a complete input/output contract. Recompute every example."
              : regenerationReason === "topicMismatch"
                ? "REPLACEMENT TASK REQUIREMENT: The previous task did not assess the assigned topic. Generate a new task directly about the assigned topic and required core operation; do not introduce adjacent concepts. Keep one cohesive task and recompute every example."
                : regenerationReason === "forbiddenScope"
                  ? "REPLACEMENT TASK REQUIREMENT: The previous task included forbidden scope. Remove the prohibited concepts entirely and create one task limited to the assigned topic and required core operation. Recompute every example."
                  : regenerationReason === "multipleTasks"
                    ? "REPLACEMENT TASK REQUIREMENT: The previous output contained multiple exercises. Return exactly one cohesive programming task with one clear goal and contract."
                    : regenerationReason === "shallowDecision"
                      ? "REPLACEMENT TASK REQUIREMENT: The previous decision task was rejected as too shallow. Create a substantially richer decision problem with at least two interacting conditions and at least four meaningful valid input combinations. Specify the input bounds and behavior for every combination. Avoid a direct one-to-one mapping of a tiny set of values to outputs. Include examples that demonstrate distinct branches, then recalculate their outputs."
                      : regenerationReason === "implementationHint"
                        ? "REPLACEMENT TASK REQUIREMENT: Describe only the required observable behavior. Do not reveal or prescribe an implementation technique, algorithm, data structure, or sequence of solution steps. Keep the task a complete, unambiguous programming problem with examples that follow its rules."
                        : regenerationReason === "emptyOutput"
                          ? "REPLACEMENT TASK REQUIREMENT: Every example and the output contract must use a concrete, non-empty stdout value. When the logical result is absence, define an explicit non-empty sentinel such as NONE and use it consistently. Recompute every example from the rules."
                      : regenerationReason === "publicExamples"
                        ? "REPLACEMENT TASK REQUIREMENT: The previous draft failed public-example validation. Generate a simple STDIN_STDOUT task using a compact, single-line input grammar. Each of its exactly three distinct examples must contain only the specified data tokens on one non-empty line—no labels, type names, comments, blank lines, or undeclared extra tokens/lines. Use multiple input lines only when the statement explicitly defines every line. Make outputs non-empty and deterministic; recalculate each example against the written rules and reference before returning. Do not make a no-input or constant-output task."
            : `REPLACEMENT TASK REQUIREMENT: The previous draft failed independent review of its task contract. Generate a substantially different task with a complete, unambiguous input/output contract. Prefer integer-only inputs and outputs; avoid weights, measurements, percentages, and floating-point calculations unless an assigned topic requires them. If a decimal output is required, state exact precision and the rounding rule in the learner-facing statement and examples. Recompute each example from the written rules and verify its output before returning it.`;
            const replacementContext = [
              taskContext,
              replacementRequirement,
              ...(validationIssues.length ? [`INDEPENDENT VALIDATOR FINDINGS TO FIX: ${validationIssues.map((issue) => JSON.stringify(issue)).join("; ")}`] : []),
              `Replacement variation token: ${groupSeed}-replacement-${packageAttempt}.`,
            ].join("\n\n");
            return generatePackage(replacementContext);
          },
          (error, nextAttempt) => {
            const regenerationReason = diagnosticTaskRegenerationReason(error);
            logger.warn("[learning/diagnostic] retrying practical task package after generation failure", {
              requestId,
              courseId: course.id,
              moduleId: topicGroup[0].moduleId,
              attempt: nextAttempt,
              reason: regenerationReason,
            });
          },
        );
      }, generationFailureState),
    ]);
    if (questionResult.status === "rejected") throw questionResult.reason;
    if (practicalResult.status === "rejected") throw practicalResult.reason;
    const generatedQuestions = questionResult.value;
    const practicals = practicalResult.value;
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
  const practicals = assessmentPracticals(payload);
  return payload.version >= 2
    && Array.isArray(payload.practicals)
    && practicals.length === 5
    && payload.questions.every((question) => question.options.length === 4)
    && practicals.every((practical) => practical.examples.length === 3 && practical.tests.length === 15);
}

function publicAssessment(assessment: CourseDiagnosticAssessment, course: Course) {
  const payload = assessment.assessmentData;
  const practicals = assessmentPracticals(payload);
  const publicPracticals = practicals.map(({ tests, ...practical }) => ({
    ...practical,
    publicTestCount: practical.examples.length,
    hiddenTestCount: tests.length,
  }));
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
    taskAttempts: taskAttemptData(assessment, practicals),
    result: assessment.resultData ?? null,
    reportStatus: assessment.reportStatus ?? "NOT_REQUESTED",
    mentorReport: assessment.mentorReport ?? null,
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
  const publicTests = practical.examples.map((test, index) => ({ id: `public-${index + 1}`, input: test.input, output: test.output, hidden: false, group: "diagnostic-public", weight: 1 }));
  const hiddenTests = practical.tests.map((test, index) => ({ id: `hidden-${index + 1}`, input: test.input, output: test.output, hidden: true, group: "diagnostic-hidden", weight: 1 }));
  const tests = [...publicTests, ...hiddenTests];
  if (publicTests.length !== 3 || hiddenTests.length !== 15) throw assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503);
  const result = await judgeWithSemaphore({
    submission_id: `diagnostic-${enrollmentId}-${assessmentId}-${practical.id}-${Date.now()}`,
    language: practical.runtime.toLowerCase() as JudgeLanguage,
    files: [{ path: practical.entryFile, content: code }],
    entry: practical.entryFile,
    tests,
    checker: { type: "exact" },
    limits: { time_limit_ms: 5_000, memory_limit_mb: 384, output_limit_kb: 32 },
    run_all: true,
    debug: false,
  }, { timeoutMs: 15_000 });
  const testsPassed = result.tests.filter((test) => test.verdict === "AC").length;
  const testsTotal = tests.length;
  return { testsPassed, testsTotal, score: Math.round(testsPassed / testsTotal * 100) };
}

function emptyTaskAttemptState(): CourseDiagnosticTaskAttemptState {
  return { attemptsUsed: 0, inFlight: 0, latestResult: null, bestResult: null };
}

function taskAttemptData(assessment: CourseDiagnosticAssessment, practicals: CourseDiagnosticPractical[]): CourseDiagnosticTaskAttempts {
  const saved = assessment.taskAttemptsData && typeof assessment.taskAttemptsData === "object" ? assessment.taskAttemptsData : {};
  return Object.fromEntries(practicals.map((practical) => {
    const current = saved[practical.id];
    return [practical.id, {
      ...emptyTaskAttemptState(),
      ...(current && typeof current === "object" ? current : {}),
    } satisfies CourseDiagnosticTaskAttemptState];
  }));
}

async function reserveTaskAttempt(assessmentId: number, enrollmentId: number, taskId: string) {
  return AppDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(CourseDiagnosticAssessment);
    const assessment = await repository.createQueryBuilder("assessment")
      .setLock("pessimistic_write")
      .where("assessment.id = :assessmentId", { assessmentId })
      .andWhere("assessment.enrollment_id = :enrollmentId", { enrollmentId })
      .getOne();
    if (!assessment) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
    if (assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
    const practicals = assessmentPracticals(assessment.assessmentData);
    const practical = practicals.find((item) => item.id === taskId);
    if (!practical) throw assessmentError("ASSESSMENT_PRACTICAL_INVALID", 400);
    const attempts = taskAttemptData(assessment, practicals);
    const state = attempts[taskId];
    if (state.attemptsUsed + state.inFlight >= 10) throw assessmentError("DIAGNOSTIC_ATTEMPT_LIMIT_REACHED", 429);
    state.inFlight += 1;
    assessment.taskAttemptsData = attempts;
    await repository.save(assessment);
    return { assessmentId: assessment.id, practical };
  });
}

async function completeTaskAttempt(assessmentId: number, enrollmentId: number, taskId: string, evaluation: { testsPassed: number; testsTotal: number; score: number }) {
  await AppDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(CourseDiagnosticAssessment);
    const assessment = await repository.createQueryBuilder("assessment")
      .setLock("pessimistic_write")
      .where("assessment.id = :assessmentId", { assessmentId })
      .andWhere("assessment.enrollment_id = :enrollmentId", { enrollmentId })
      .getOne();
    if (!assessment || assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
    const practicals = assessmentPracticals(assessment.assessmentData);
    const attempts = taskAttemptData(assessment, practicals);
    const state = attempts[taskId];
    if (!state || state.inFlight < 1) throw assessmentError("ASSESSMENT_SUBMISSION_INVALID", 409);
    state.inFlight -= 1;
    state.attemptsUsed += 1;
    state.latestResult = evaluation;
    if (!state.bestResult || evaluation.score >= state.bestResult.score) state.bestResult = evaluation;
    assessment.taskAttemptsData = attempts;
    await repository.save(assessment);
  });
}

async function releaseTaskAttempt(assessmentId: number, enrollmentId: number, taskId: string): Promise<void> {
  try {
    await AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CourseDiagnosticAssessment);
      const assessment = await repository.createQueryBuilder("assessment")
        .setLock("pessimistic_write")
        .where("assessment.id = :assessmentId", { assessmentId })
        .andWhere("assessment.enrollment_id = :enrollmentId", { enrollmentId })
        .getOne();
      if (!assessment) return;
      const practicals = assessmentPracticals(assessment.assessmentData);
      const attempts = taskAttemptData(assessment, practicals);
      const state = attempts[taskId];
      if (!state || state.inFlight < 1) return;
      state.inFlight -= 1;
      assessment.taskAttemptsData = attempts;
      await repository.save(assessment);
    });
  } catch (error) {
    logger.warn("[learning/diagnostic] could not release a failed Judge attempt reservation", { assessmentId, taskId, error });
  }
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

export async function submitCourseDiagnosticTask(userId: number, enrollmentId: number, rawTaskId: unknown, rawCode: unknown) {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const taskId = text(rawTaskId, 80);
  const code = text(rawCode, 100_000);
  if (!taskId || !code) throw assessmentError("PRACTICAL_CODE_REQUIRED", 400);
  const latest = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!latest) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
  const reserved = await reserveTaskAttempt(latest.id, enrollment.id, taskId);
  try {
    const evaluation = await runPractical(enrollment.id, reserved.assessmentId, reserved.practical, code);
    await completeTaskAttempt(reserved.assessmentId, enrollment.id, taskId, evaluation);
    const updated = await assessmentRepo().findOne({ where: { id: reserved.assessmentId } });
    const state = updated ? taskAttemptData(updated, assessmentPracticals(updated.assessmentData))[taskId] : emptyTaskAttemptState();
    return {
      taskId,
      ...evaluation,
      attemptsUsed: state.attemptsUsed,
      attemptsRemaining: Math.max(0, 10 - state.attemptsUsed),
      bestResult: state.bestResult,
    };
  } catch (error) {
    await releaseTaskAttempt(reserved.assessmentId, enrollment.id, taskId);
    if (recordOf(error)?.statusCode) throw error;
    throw assessmentError("JUDGE_UNAVAILABLE", 503);
  }
}

export async function submitCourseDiagnosticAssessment(userId: number, enrollmentId: number, rawAnswers: unknown) {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!assessment) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
  if (assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
  const payload = assessment.assessmentData;
  const answers = normalizeAnswers(rawAnswers, payload.questions);
  if (!answers) throw assessmentError("ASSESSMENT_ANSWERS_INVALID", 400);
  const practicals = assessmentPracticals(payload);
  const attempts = taskAttemptData(assessment, practicals);
  if (Object.values(attempts).some((state) => state.inFlight > 0)) throw assessmentError("DIAGNOSTIC_JUDGE_IN_PROGRESS", 409);
  if (practicals.some((practical) => attempts[practical.id].attemptsUsed < 1 || !attempts[practical.id].bestResult)) {
    throw assessmentError("DIAGNOSTIC_TASKS_NOT_SUBMITTED", 400);
  }
  const knowledge = gradeAnswers(payload.questions, answers);
  let submittedResult: CourseDiagnosticResult | null = null;
  await AppDataSource.transaction(async (manager) => {
    const assessmentRepository = manager.getRepository(CourseDiagnosticAssessment);
    const storedAssessment = await assessmentRepository.createQueryBuilder("assessment")
      .setLock("pessimistic_write")
      .where("assessment.id = :assessmentId", { assessmentId: assessment.id })
      .andWhere("assessment.enrollment_id = :enrollmentId", { enrollmentId: enrollment.id })
      .getOne();
    if (!storedAssessment || storedAssessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
    const finalAttempts = taskAttemptData(storedAssessment, practicals);
    if (Object.values(finalAttempts).some((state) => state.inFlight > 0)) throw assessmentError("DIAGNOSTIC_JUDGE_IN_PROGRESS", 409);
    if (practicals.some((practical) => finalAttempts[practical.id].attemptsUsed < 1 || !finalAttempts[practical.id].bestResult)) {
      throw assessmentError("DIAGNOSTIC_TASKS_NOT_SUBMITTED", 400);
    }
    const practicalResults = practicals.map((practical) => ({
      taskId: practical.id,
      title: practical.title,
      moduleTitle: practical.moduleTitle,
      topicIds: practical.topicIds,
      ...finalAttempts[practical.id].bestResult!,
      attemptsUsed: finalAttempts[practical.id].attemptsUsed,
    }));
    const testsPassed = practicalResults.reduce((total, task) => total + task.testsPassed, 0);
    const testsTotal = practicalResults.reduce((total, task) => total + task.testsTotal, 0);
    if (!testsTotal) throw assessmentError("JUDGE_UNAVAILABLE", 503);
    const practicalScore = Math.round(testsPassed / testsTotal * 100);
    const topicPracticeScores = new Map<number, number>();
    for (const task of practicalResults) {
      for (const topicId of task.topicIds) topicPracticeScores.set(topicId, task.score);
    }
    const hasTopicCoverage = practicals.some((practical) => practical.topicIds.length > 0);
    const score = Math.round((knowledge.score + practicalScore) / 2);
    const passed = score >= 75 && knowledge.score >= 70 && practicalScore >= 60;
    const resultData: CourseDiagnosticResult = {
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
    submittedResult = resultData;
    storedAssessment.status = "SUBMITTED";
    storedAssessment.resultData = resultData;
    storedAssessment.submittedAt = new Date(resultData.submittedAt);
    storedAssessment.reportStatus = "PENDING";
    storedAssessment.reportAttempts = 0;
    storedAssessment.reportNextAttemptAt = new Date();
    storedAssessment.reportEmailAttempts = 0;
    storedAssessment.reportEmailNextAttemptAt = new Date();
    await assessmentRepository.save(storedAssessment);

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

    for (const topicResult of resultData.topicResults) {
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

    if (resultData.passed) {
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
  if (!submittedResult) throw assessmentError("ASSESSMENT_SUBMISSION_FAILED", 503);
  return submittedResult;
}
