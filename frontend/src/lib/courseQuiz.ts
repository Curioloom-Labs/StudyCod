export interface CourseQuizQuestionDraft {
  question: string;
  options: string[];
  correct: number;
}

type RecordValue = Record<string, unknown>;

function recordOf(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function optionsOf(value: unknown): { labels: string[]; options: string[] } | null {
  if (Array.isArray(value)) {
    return { labels: value.map((_, index) => String.fromCharCode(65 + index)), options: value.map(option => typeof option === "string" ? option : "") };
  }
  const record = recordOf(value);
  if (!record) return null;
  const entries = Object.entries(record);
  return { labels: entries.map(([label]) => label), options: entries.map(([, option]) => typeof option === "string" ? option : "") };
}

export function normalizeCourseQuiz(value: unknown): CourseQuizQuestionDraft[] | null {
  const questions = Array.isArray(value)
    ? value
    : Array.isArray(recordOf(value)?.questions)
      ? recordOf(value)!.questions as unknown[]
      : null;
  if (!questions?.length) return null;

  const normalized: CourseQuizQuestionDraft[] = [];
  for (const rawQuestion of questions) {
    const question = recordOf(rawQuestion);
    const rawOptions = optionsOf(question?.options);
    if (!question || !rawOptions || rawOptions.options.length < 2 || rawOptions.options.length > 5) return null;
    const prompt = typeof question.question === "string"
      ? question.question
      : typeof question.q === "string"
        ? question.q
        : typeof question.prompt === "string" ? question.prompt : "";
    const correctValue = question.correct;
    let correct = -1;
    if (typeof correctValue === "number" && Number.isInteger(correctValue)) {
      correct = correctValue;
    } else if (typeof correctValue === "string") {
      const normalizedCorrect = correctValue.trim().toUpperCase();
      const englishLabels = ["A", "B", "C", "D", "E"];
      const ukrainianLabels = ["А", "Б", "В", "Г", "Д"];
      const aliasIndex = englishLabels.indexOf(normalizedCorrect) >= 0
        ? englishLabels.indexOf(normalizedCorrect)
        : ukrainianLabels.indexOf(normalizedCorrect);
      const storedLabelIndex = rawOptions.labels.findIndex(label => label.toUpperCase() === normalizedCorrect);
      correct = storedLabelIndex >= 0
        ? storedLabelIndex
        : aliasIndex >= 0 ? aliasIndex : rawOptions.options.findIndex(option => option.trim() === correctValue.trim());
    }
    if (correct < 0 || correct >= rawOptions.options.length) return null;
    normalized.push({ question: prompt, options: rawOptions.options, correct });
  }
  return normalized;
}

export function validateCourseQuiz(questions: CourseQuizQuestionDraft[]): string[] {
  const issues: string[] = [];
  if (questions.length === 0) return ["QUIZ_NEEDS_QUESTION"];
  questions.forEach((question, index) => {
    if (!question.question.trim()) issues.push(`QUESTION_${index + 1}_NEEDS_TEXT`);
    if (question.options.length < 2 || question.options.length > 5) issues.push(`QUESTION_${index + 1}_OPTION_COUNT_INVALID`);
    if (question.options.some(option => !option.trim())) issues.push(`QUESTION_${index + 1}_HAS_EMPTY_OPTION`);
    if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length) {
      issues.push(`QUESTION_${index + 1}_CORRECT_OPTION_INVALID`);
    }
  });
  return issues;
}

export function serializeCourseQuiz(questions: CourseQuizQuestionDraft[]): Array<{ question: string; options: string[]; correct: number }> {
  return questions.map(question => ({
    question: question.question.trim(),
    options: question.options.map(option => option.trim()),
    correct: question.correct,
  }));
}

export function emptyCourseQuizQuestion(): CourseQuizQuestionDraft {
  return { question: "", options: ["", ""], correct: 0 };
}
