type RecordValue = Record<string, unknown>;

export type CourseQuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correct: number;
};

export type CourseQuizAnswer = {
  questionId: string;
  selectedIndex: number;
};

export type CourseQuizResult = {
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  review: Array<{
    questionId: string;
    question: string;
    options: string[];
    selectedIndex: number;
    correctIndex: number;
  }>;
};

export const COURSE_QUIZ_PASSING_SCORE = 60;
const MAX_QUESTIONS = 100;
const MAX_QUESTION_LENGTH = 4000;
const MAX_OPTION_LENGTH = 1000;

function recordOf(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function parseQuizValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeOptions(value: unknown): { labels: string[]; options: string[] } | null {
  if (Array.isArray(value)) {
    return { labels: value.map((_, index) => String.fromCharCode(65 + index)), options: value.map((entry) => typeof entry === "string" ? entry : "") };
  }
  const record = recordOf(value);
  if (!record) return null;
  const entries = Object.entries(record);
  return { labels: entries.map(([label]) => label), options: entries.map(([, entry]) => typeof entry === "string" ? entry : "") };
}

function correctIndex(value: unknown, labels: string[], options: string[]): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string") return -1;
  const raw = value.trim();
  const normalized = raw.toLocaleUpperCase("uk-UA");
  const labelIndex = labels.findIndex((label) => label.toLocaleUpperCase("uk-UA") === normalized);
  if (labelIndex >= 0) return labelIndex;
  const aliases = ["A", "B", "C", "D", "E"];
  const ukrainianAliases = ["А", "Б", "В", "Г", "Д"];
  const aliasIndex = aliases.indexOf(normalized) >= 0 ? aliases.indexOf(normalized) : ukrainianAliases.indexOf(normalized);
  if (aliasIndex >= 0) return aliasIndex;
  const matchingOptions = options.flatMap((option, index) => option.trim() === raw ? [index] : []);
  return matchingOptions.length === 1 ? matchingOptions[0] : -1;
}

/** Parse authoring data into a bounded quiz contract shared by publishing and grading. */
export function parseCourseQuiz(rawContent: unknown): CourseQuizQuestion[] | null {
  const content = recordOf(rawContent);
  const quizValue = parseQuizValue(content?.quiz ?? rawContent);
  const quizRecord = recordOf(quizValue);
  const rawQuestions = Array.isArray(quizValue)
    ? quizValue
    : Array.isArray(quizRecord?.questions)
      ? quizRecord.questions
      : null;
  if (!rawQuestions?.length || rawQuestions.length > MAX_QUESTIONS) return null;

  const parsed: CourseQuizQuestion[] = [];
  for (const [index, rawQuestion] of rawQuestions.entries()) {
    const question = recordOf(rawQuestion);
    const normalizedOptions = normalizeOptions(question?.options);
    const promptValue = question?.question ?? question?.q ?? question?.prompt;
    const prompt = typeof promptValue === "string" ? promptValue.trim() : "";
    if (!question || !normalizedOptions || prompt.length === 0 || prompt.length > MAX_QUESTION_LENGTH) return null;
    if (normalizedOptions.options.length < 2 || normalizedOptions.options.length > 5) return null;
    if (normalizedOptions.options.some((option) => !option.trim() || option.length > MAX_OPTION_LENGTH)) return null;
    const correct = correctIndex(question.correct ?? question.correctIndex, normalizedOptions.labels, normalizedOptions.options);
    if (correct < 0 || correct >= normalizedOptions.options.length) return null;
    parsed.push({ id: `question-${index + 1}`, question: prompt, options: normalizedOptions.options, correct });
  }
  return parsed;
}

/** Grade exactly one answer per question and return answer keys only for post-submit review. */
export function gradeCourseQuiz(questions: CourseQuizQuestion[], rawAnswers: unknown): CourseQuizResult | null {
  if (!Array.isArray(rawAnswers) || rawAnswers.length !== questions.length) return null;
  const answers = new Map<string, number>();
  for (const rawAnswer of rawAnswers) {
    const answer = recordOf(rawAnswer);
    if (typeof answer?.questionId !== "string" || !Number.isInteger(answer.selectedIndex)) return null;
    if (answers.has(answer.questionId)) return null;
    answers.set(answer.questionId, Number(answer.selectedIndex));
  }

  let correctCount = 0;
  const review: CourseQuizResult["review"] = [];
  for (const question of questions) {
    const selectedIndex = answers.get(question.id);
    if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= question.options.length) return null;
    if (selectedIndex === question.correct) correctCount += 1;
    review.push({
      questionId: question.id,
      question: question.question,
      options: question.options,
      selectedIndex,
      correctIndex: question.correct,
    });
  }
  if (answers.size !== questions.length) return null;
  const score = Math.round(correctCount / questions.length * 100);
  return {
    score,
    correctCount,
    total: questions.length,
    passed: score >= COURSE_QUIZ_PASSING_SCORE,
    review,
  };
}

/** Keep answer keys out of the general course response; grading reads the original server-side content. */
export function learnerSafeCourseQuizContent(rawContent: unknown): RecordValue {
  const content = recordOf(rawContent) ?? {};
  const questions = parseCourseQuiz(content);
  if (!questions) return {};
  return {
    quiz: questions.map(({ id, question, options }) => ({ id, question, options })),
  };
}
