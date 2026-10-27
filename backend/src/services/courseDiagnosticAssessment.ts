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
import { judgeWithSemaphore } from "./judgeWorker";
import type { JudgeLanguage } from "./judgeWorker/types";
import { projectEntryFile } from "./learningCatalogProjectFiles";
import { localizeCourseItem, localizedCourseDescription, localizedCourseTitle, localizedModuleTitle, type CurriculumLocale } from "./curriculumLocalization";

const assessmentRepo = () => AppDataSource.getRepository(CourseDiagnosticAssessment);
const enrollmentRepo = () => AppDataSource.getRepository(UserCourseEnrollment);
const courseRepo = () => AppDataSource.getRepository(Course);

type Runtime = "JAVA" | "PYTHON" | "CPP";
type UnknownRecord = Record<string, unknown>;
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

function courseContext(course: Course, locale: CurriculumLocale, seed: string): string {
  const modules = [...(course.modules || [])].sort((a, b) => a.order - b.order || a.id - b.id);
  const sections = modules.map((module) => {
    const title = localizedModuleTitle(module.contentKey, locale, module.title);
    const items = [...(module.items || [])]
      .filter((item) => item.isActive !== false && item.content?.required !== false)
      .sort((a, b) => a.order - b.order || a.id - b.id)
      .map((item) => {
        const localized = localizeCourseItem(item, locale);
        const content = localized.content || {};
        const details = [content.markdown, content.statement, content.description, content.objective, content.outcome]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join("\n")
          .slice(0, 1_000);
        return `- ${localized.title}${details ? `\n${details}` : ""}`;
      });
    return `${title}\n${items.join("\n")}`;
  });
  return [
    `Course: ${localizedCourseTitle(course, locale)}. ${localizedCourseDescription(course, locale) || ""}`,
    "Create a learner-specific diagnostic assessment. Use only the curriculum below.",
    `Variation token (never include it in question text): ${seed}`,
    ...sections,
  ].join("\n\n").slice(0, 16_000);
}

async function generateAssessment(course: Course, runtime: Runtime, userId: number, locale: CurriculumLocale, courseTopics: CourseDiagnosticTopic[]): Promise<CourseDiagnosticPayload> {
  const seed = crypto.randomBytes(16).toString("hex");
  const context = courseContext(course, locale, seed);
  const topics = [...courseTopics];
  if (!topics.length) throw assessmentError("ASSESSMENT_TOPICS_INVALID", 503);
  const llm = getLLMOrchestrator();
  const language = locale === "en" ? "en" : "uk";
  try {
    const questionAssignments = topics.flatMap((topic) => Array.from({ length: 2 }, () => topic));
    const questionBatches = chunks(questionAssignments, 8);
    const generatedQuestions = await mapWithConcurrency(questionBatches, 2, async (topicAssignments, batchIndex) => {
      const questionPlan = [
        "QUESTION COVERAGE PLAN. Generate exactly one question for each listed assignment, in order. Prefix q with [topic:ID].",
        ...topicAssignments.map((topic, index) => `Question ${index + 1}: [topic:${topic.id}] ${topic.title}. Test this topic only. ${topic.context}`),
        "When the same topic appears twice, assess two different skills. The [topic:ID] marker is metadata and must be at the beginning of q.",
      ].join("\n");
      const quiz = await llm.generateQuizWithAI({
        lang: runtime,
        prevTopics: `${context}\n\n${questionPlan}`,
        count: topicAssignments.length,
        userId,
        language,
      });
      return normalizeQuestions(quiz.quizJson, topicAssignments, topicAssignments.length, batchIndex * 8);
    });
    const questions = generatedQuestions.flat();

    const practicalGroups: CourseDiagnosticTopic[][] = [];
    for (const topic of topics) {
      const currentGroup = practicalGroups[practicalGroups.length - 1];
      if (!currentGroup || currentGroup[0].moduleId !== topic.moduleId || currentGroup.length >= 4) {
        practicalGroups.push([topic]);
      } else {
        currentGroup.push(topic);
      }
    }
    const practicals = await mapWithConcurrency(practicalGroups, 2, async (topicGroup, taskIndex) => {
      const topicList = topicGroup.map((topic) => `- [topic:${topic.id}] ${topic.title}: ${topic.context}`).join("\n");
      const groupSeed = `${seed}-task-${taskIndex + 1}`;
      const topicTitle = topicGroup[0].moduleTitle.slice(0, 255);
      const taskContext = [
        context,
        `PRACTICAL ASSESSMENT ${taskIndex + 1}/${practicalGroups.length}. This task covers the following course topics:`,
        topicList,
        `Variation token: ${groupSeed}. Generate a fresh integrated programming task that requires applying the listed topics. Do not use concepts outside the course. Include standard input/output, clear constraints, examples, and a concise starter template with TODO markers.`,
      ].join("\n\n");
      const generatedTask = await llm.generateTaskWithAI({
        topicTitle,
        theory: taskContext,
        lang: runtime,
        topicIndex: taskIndex + 1,
        numInTopic: practicalGroups.length,
        isFirstTask: false,
        isControl: true,
        difus: 0.5,
        prevTopics: context,
        userId,
        topicId: topicGroup[0].id > 0 ? topicGroup[0].id : undefined,
        language,
      });
      const taskDescription = [
        generatedTask.practicalTask,
        `Input format: ${generatedTask.inputFormat}`,
        `Output format: ${generatedTask.outputFormat}`,
        `Constraints: ${generatedTask.constraints}`,
        `Examples: ${generatedTask.examples.map((example) => `Input:\n${example.input}\nOutput:\n${example.output}`).join("\n")}`,
      ].join("\n\n");
      const tests = await llm.generateTestDataWithAI({
        taskTitle: generatedTask.title,
        taskDescription,
        lang: runtime,
        count: 5,
        language,
        userId,
        publicExamples: generatedTask.examples,
        requiredCases: ["minimum valid input", "typical input", "boundary input defined by the statement"],
      });
      const cleanTests = tests
        .map((test) => ({ input: text(test.input, 10_000), output: text(test.output, 10_000) }))
        .filter((test) => test.input.length > 0 && test.output.length > 0)
        .slice(0, 8);
      if (!text(generatedTask.practicalTask) || cleanTests.length < 3) throw assessmentError("ASSESSMENT_PRACTICAL_INVALID", 503);
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
        tests: cleanTests,
      };
      return practical;
    });
    return { version: 2, seed, questions, practicals };
  } catch (error) {
    if (recordOf(error)?.statusCode) throw error;
    throw assessmentError("ASSESSMENT_GENERATION_FAILED", 503);
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
