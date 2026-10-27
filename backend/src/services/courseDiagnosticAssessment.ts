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
const progressRepo = () => AppDataSource.getRepository(CourseItemProgress);
const courseRepo = () => AppDataSource.getRepository(Course);

type Runtime = "JAVA" | "PYTHON" | "CPP";
type UnknownRecord = Record<string, unknown>;
type CourseDiagnosticTopic = { id: number; title: string; context: string; itemIds: number[] };

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

function normalizeQuestions(rawQuiz: unknown, topicAssignments: CourseDiagnosticTopic[]): CourseDiagnosticQuestion[] {
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

    const correctOption = rawOptions[correct];
    const distractorIndexes = shuffled(rawOptions.map((_, optionIndex) => optionIndex).filter((optionIndex) => optionIndex !== correct)).slice(0, 3);
    const options = shuffled([correct, ...distractorIndexes].map((optionIndex) => ({ text: rawOptions[optionIndex], correct: optionIndex === correct })));
    questions.push({
      id: `q${index + 1}`,
      question: prompt,
      options: options.map((option) => option.text),
      correct: options.findIndex((option) => option.correct),
      topicId: topic.id,
      topicTitle: topic.title,
    });
    if (questions.length >= 10) break;
  }
  if (questions.length < 6) throw assessmentError("ASSESSMENT_QUESTIONS_INVALID", 503);
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
      topics.push({ id: -module.id, title, context: `Topic: ${title}`, itemIds: moduleItems.map((item) => item.id) });
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
        title: topicTitle,
        context: [topicTitle, sourceKey, detail].filter(Boolean).join("\n"),
        itemIds,
      });
    }
  }
  return topics;
}

function unmasteredTopics(topics: CourseDiagnosticTopic[], progress: CourseItemProgress[]): CourseDiagnosticTopic[] {
  const progressByItem = new Map(progress.map((item) => [item.itemId, item]));
  const remaining = topics.filter((topic) => topic.itemIds.some((itemId) => progressByItem.get(itemId)?.status !== "COMPLETED"));
  return remaining.length ? remaining : topics;
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

async function generateAssessment(course: Course, runtime: Runtime, userId: number, locale: CurriculumLocale, availableTopics: CourseDiagnosticTopic[]): Promise<CourseDiagnosticPayload> {
  const seed = crypto.randomBytes(16).toString("hex");
  const context = courseContext(course, locale, seed);
  const selectedTopics = shuffled(availableTopics).slice(0, 8);
  if (!selectedTopics.length) throw assessmentError("ASSESSMENT_TOPICS_INVALID", 503);
  const topicAssignments = Array.from({ length: 8 }, (_, index) => selectedTopics[index % selectedTopics.length]);
  const questionPlan = [
    "QUESTION COVERAGE PLAN. Keep this exact order, use one topic per question, and prefix each q with [topic:ID] using the topic ID shown below.",
    ...topicAssignments.map((topic, index) => `Question ${index + 1}: [topic:${topic.id}] ${topic.title}. Assess only this topic. ${topic.context}`),
    "The [topic:ID] marker is metadata and must be at the beginning of the q value.",
  ].join("\n");
  const assessmentContext = `${context}\n\n${questionPlan}`;
  const llm = getLLMOrchestrator();
  const language = locale === "en" ? "en" : "uk";
  try {
    const quiz = await llm.generateQuizWithAI({
      lang: runtime,
      prevTopics: assessmentContext,
      count: 8,
      userId,
      language,
    });
    const questions = normalizeQuestions(quiz.quizJson, topicAssignments);
    const generatedTask = await llm.generateTaskWithAI({
      topicTitle: localizedCourseTitle(course, locale),
      theory: `${assessmentContext}\n\nGenerate a fresh practical coding task for this learner. Variation token: ${seed}. It must assess application of the selected course concepts, use standard input/output, and include a concise starter template with TODO markers.`,
      lang: runtime,
      topicIndex: 1,
      numInTopic: 1,
      isFirstTask: false,
      isControl: true,
      difus: 0.5,
      prevTopics: assessmentContext,
      userId,
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
    const practical: CourseDiagnosticPractical = {
      title: text(generatedTask.title, 255) || (locale === "en" ? "Practical task" : "Практичне завдання"),
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
    return { version: 1, seed, questions, practical };
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

function publicAssessment(assessment: CourseDiagnosticAssessment, course: Course) {
  const payload = assessment.assessmentData;
  return {
    id: assessment.id,
    enrollmentId: assessment.enrollmentId,
    attemptNumber: assessment.attemptNumber,
    courseTitle: course.title,
    status: assessment.status,
    passing: { totalScore: 75, knowledgeScore: 70, practicalScore: 60 },
    questions: payload.questions.map(({ id, question, options, topicId, topicTitle }) => ({ id, question, options, topicId, topicTitle })),
    practical: {
      title: payload.practical.title,
      statement: payload.practical.statement,
      inputFormat: payload.practical.inputFormat,
      outputFormat: payload.practical.outputFormat,
      constraints: payload.practical.constraints,
      examples: payload.practical.examples,
      codeTemplate: payload.practical.codeTemplate,
      runtime: payload.practical.runtime,
      entryFile: payload.practical.entryFile,
    },
    result: assessment.resultData ?? null,
  };
}

export async function getCourseDiagnosticAssessment(userId: number, enrollmentId: number, locale: CurriculumLocale = "uk") {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  let assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  const course = await courseRepo().findOne({
    where: { id: enrollment.courseId },
    relations: ["modules", "modules.items"],
  });
  if (!course) throw assessmentError("COURSE_NOT_FOUND", 404);
  if (assessment) return publicAssessment(assessment, course);
  if (enrollment.finalAssessmentPassed || enrollment.status === "COMPLETED") throw assessmentError("COURSE_ALREADY_COMPLETED", 409);

  const runtime = enrollment.variant.runtime === "JAVA" || enrollment.variant.runtime === "CPP" ? enrollment.variant.runtime : "PYTHON";
  const currentProgress = await progressRepo().find({ where: { enrollment: { id: enrollment.id } } });
  const availableTopics = unmasteredTopics(courseDiagnosticTopics(course, locale), currentProgress);
  const assessmentData = await generateAssessment(course, runtime, userId, locale, availableTopics);
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
  const currentProgress = await progressRepo().find({ where: { enrollment: { id: enrollment.id } } });
  const availableTopics = unmasteredTopics(courseDiagnosticTopics(course, locale), currentProgress);
  const assessmentData = await generateAssessment(course, runtime, userId, locale, availableTopics);
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
    submission_id: `diagnostic-${enrollmentId}-${assessmentId}-${Date.now()}`,
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

export async function runCourseDiagnosticSample(userId: number, enrollmentId: number, rawCode: unknown, rawInput: unknown) {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!assessment) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
  if (assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
  const code = text(rawCode, 100_000);
  if (!code) throw assessmentError("PRACTICAL_CODE_REQUIRED", 400);
  const input = text(rawInput, 20_000);
  const practical = assessment.assessmentData.practical;
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
  rawCode: unknown,
) {
  const enrollment = await ownedEnrollment(userId, enrollmentId);
  const assessment = await assessmentRepo().findOne({ where: { enrollment: { id: enrollment.id } }, order: { attemptNumber: "DESC", id: "DESC" } });
  if (!assessment) throw assessmentError("ASSESSMENT_NOT_FOUND", 404);
  if (assessment.status === "SUBMITTED") throw assessmentError("ASSESSMENT_ALREADY_SUBMITTED", 409);
  const payload = assessment.assessmentData;
  const answers = normalizeAnswers(rawAnswers, payload.questions);
  if (!answers) throw assessmentError("ASSESSMENT_ANSWERS_INVALID", 400);
  const code = text(rawCode, 100_000);
  if (!code) throw assessmentError("PRACTICAL_CODE_REQUIRED", 400);

  let practicalResult: { testsPassed: number; testsTotal: number; score: number };
  try {
    practicalResult = await runPractical(enrollment.id, assessment.id, payload.practical, code);
  } catch (error) {
    if (recordOf(error)?.statusCode) throw error;
    throw assessmentError("JUDGE_UNAVAILABLE", 503);
  }
  const knowledge = gradeAnswers(payload.questions, answers);
  const score = Math.round((knowledge.score + practicalResult.score) / 2);
  const passed = score >= 75 && knowledge.score >= 70 && practicalResult.score >= 60;
  const result: CourseDiagnosticResult = {
    score,
    knowledgeScore: knowledge.score,
    practicalScore: practicalResult.score,
    correctCount: knowledge.correctCount,
    totalQuestions: payload.questions.length,
    testsPassed: practicalResult.testsPassed,
    testsTotal: practicalResult.testsTotal,
    passed,
    answers,
    topicResults: knowledge.topicResults.map((topic) => ({
      ...topic,
      practiceCredited: topic.theoryCredited && practicalResult.score >= 60,
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
