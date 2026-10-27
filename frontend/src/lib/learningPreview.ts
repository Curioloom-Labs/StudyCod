import type {
  CatalogCourse,
  CatalogCourseSyllabus,
  CourseDiagnosticAssessment,
  CourseDiagnosticResult,
  CourseDiagnosticRunResult,
  LearningCourse,
  LearningCourseItem,
  LearningEnrollmentSummary,
  LearningMe,
} from "./api/learningCatalog";

const courseIds = [601, 602, 603] as const;
const PREVIEW_STATE_KEY = "studycod.preview.learning.v1";
type PersistedPreviewState = { currentCourseId?: number; completedItems?: number[] };

function readPersistedPreviewState(): PersistedPreviewState | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(PREVIEW_STATE_KEY) || "null") as unknown;
    return value && typeof value === "object" ? value as PersistedPreviewState : null;
  } catch {
    return null;
  }
}

function persistPreviewState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREVIEW_STATE_KEY, JSON.stringify({ currentCourseId, completedItems: [...completedItems] }));
  } catch {
    // The preview remains usable when browser storage is unavailable.
  }
}

const persistedPreviewState = readPersistedPreviewState();
let currentCourseId = courseIds.includes(persistedPreviewState?.currentCourseId as (typeof courseIds)[number])
  ? Number(persistedPreviewState?.currentCourseId)
  : 601;
const completedItems = new Set<number>([
  6101,
  ...(Array.isArray(persistedPreviewState?.completedItems)
    ? persistedPreviewState.completedItems.filter((id) => Number.isInteger(id) && id > 0)
    : []),
]);
const previewDiagnosticResults = new Map<number, CourseDiagnosticResult>();
const previewDiagnosticAttempts = new Map<number, number>();

const isEnglish = () => typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en");
const copy = (uk: string, en: string) => isEnglish() ? en : uk;
const courseMeta = (id: number) => id === 602
  ? { title: copy("Веброзробка: основи", "Web development: foundations"), description: copy("Структура сторінки, стилі та доступні компоненти.", "Page structure, styling, and accessible components."), key: "web-foundations", runtime: "PYTHON" as const, level: "FOUNDATION" as const, isBase: true, variantId: 702, enrollmentId: 802 }
  : id === 603
    ? { title: copy("Алгоритми та структури даних", "Algorithms and data structures"), description: copy("Розвивай системне мислення на послідовних задачах.", "Build systematic problem-solving skills through structured practice."), key: "algorithms", runtime: "PYTHON" as const, level: "SPECIALIZATION" as const, isBase: false, variantId: 703, enrollmentId: 803 }
    : { title: copy("Python: впевнена база", "Python: a confident foundation"), description: copy("Змінні, колекції, цикли й перші алгоритмічні рішення.", "Variables, collections, loops, and your first algorithmic solutions."), key: "python-foundations", runtime: "PYTHON" as const, level: "FOUNDATION" as const, isBase: true, variantId: 701, enrollmentId: 801 };

function courseItems(): LearningCourseItem[] {
  return [
    { id: 6101, kind: "THEORY", title: copy("Лінійний пошук у послідовності", "Linear search in a sequence"), order: 1, content: { sourceKey: "python-basics.sequences.linear-search", description: copy("Знайди найменше значення одним проходом і збережи його позицію.", "Find the smallest value in one pass and keep its position."), markdown: copy("## Лінійний пошук у послідовності\n\nКоли потрібно знайти найменше значення, достатньо пройти список один раз. Зберігай його індекс і оновлюй відповідь лише тоді, коли знайшлося строго менше число.\n\n```python\nvalues = [12, 7, 7, 18, 9]\nbest = 0\nfor i in range(1, len(values)):\n    if values[i] < values[best]:\n        best = i\n```", "## Linear search in a sequence\n\nTo find the smallest value, one pass through the list is enough. Keep its index and update the answer only when a strictly smaller number appears.\n\n```python\nvalues = [12, 7, 7, 18, 9]\nbest = 0\nfor i in range(1, len(values)):\n    if values[i] < values[best]:\n        best = i\n```"), estimatedMinutes: 12 }, progress: { status: completedItems.has(6101) ? "COMPLETED" : "NOT_STARTED", score: completedItems.has(6101) ? 100 : null, completedAt: null } },
    { id: 6102, kind: "CODE_TASK", title: copy("Розумний розклад автобусів", "Smart bus schedule"), order: 2, content: { theoryItemId: 6101, required: true, statement: copy("Знайди номер автобуса з найменшим часом очікування. Якщо час однаковий, обери автобус із меншим номером.", "Find the bus with the shortest wait. If two waits are equal, choose the bus with the smaller number.") }, progress: { status: completedItems.has(6102) ? "COMPLETED" : "NOT_STARTED", score: completedItems.has(6102) ? 100 : null, completedAt: null } },
    { id: 6103, kind: "THEORY", title: copy("Цикли та умови", "Loops and conditions"), order: 3, content: { sourceKey: "python-basics.loops.theory", description: copy("Поєднуй повторення з умовами та перевірками.", "Combine repetition with conditions and checks."), markdown: copy("## Цикли та умови\n\nЦикл `for` проходить послідовність. Умова допомагає обробити лише потрібні значення.", "## Loops and conditions\n\nA `for` loop visits a sequence. A condition lets you process only the values you need."), estimatedMinutes: 15 }, progress: { status: "NOT_STARTED", score: null, completedAt: null } },
    { id: 6104, kind: "CODE_TASK", title: copy("Знайди найбільше число", "Find the largest number"), order: 4, content: { theoryItemId: 6103, required: true, statement: copy("Виведи найбільше число зі списку.", "Print the largest number in the list.") }, progress: { status: "NOT_STARTED", score: null, completedAt: null } },
  ];
}

export function getLearningPreviewCourse(id = currentCourseId): LearningCourse {
  const meta = courseMeta(id);
  const items = courseItems();
  const completed = items.filter((item) => item.progress.status === "COMPLETED").length;
  const completionPercent = Math.round(completed / items.length * 100);
  const next = items.find((item) => item.progress.status !== "COMPLETED");
  return {
    id, key: meta.key, title: meta.title, description: meta.description, level: meta.level, isBase: meta.isBase, runtime: meta.runtime,
    enrollment: { id: meta.enrollmentId, variantId: meta.variantId, status: completed === items.length ? "COMPLETED" : "IN_PROGRESS", completionPercent, masteryScore: completed ? 76 : 0, finalAssessmentPassed: Boolean(previewDiagnosticResults.get(meta.enrollmentId)?.passed) },
    nextAction: next ? { itemId: next.id, title: next.title, kind: next.kind, status: next.progress.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED" } : null,
    modules: [
      { id: id * 10 + 1, title: copy("Послідовності", "Sequences"), items: items.slice(0, 2) },
      { id: id * 10 + 2, title: copy("Керування потоком", "Control flow"), items: items.slice(2) },
    ],
  };
}

export function getLearningPreviewSyllabus(id: number): CatalogCourseSyllabus {
  if (!courseIds.includes(id as (typeof courseIds)[number])) throw new Error("COURSE_NOT_FOUND");
  const course = getLearningPreviewCourse(id);
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    level: course.level,
    isBase: course.isBase,
    variants: [{ runtime: course.runtime, runtimeLabel: "Python", title: "Python" }],
    modules: course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      items: module.items.map((item) => ({ kind: item.kind, title: item.title })),
    })),
  };
}

function summary(id: number): LearningEnrollmentSummary {
  const meta = courseMeta(id);
  const course = getLearningPreviewCourse(id);
  return { enrollmentId: meta.enrollmentId, courseId: id, courseKey: meta.key, title: meta.title, description: meta.description, runtime: meta.runtime, runtimeLabel: "Python", level: meta.level, status: course.enrollment.status, completionPercent: course.enrollment.completionPercent, finalAssessmentPassed: course.enrollment.finalAssessmentPassed, completedAt: null, gate: null };
}

export function getLearningPreviewMe(): LearningMe {
  const active = summary(currentCourseId);
  return { currentEnrollmentId: active.enrollmentId, current: active, enrollments: courseIds.filter((id) => id === currentCourseId).map(summary) };
}

export function getLearningPreviewCatalog(): CatalogCourse[] {
  return courseIds.map((id) => {
    const meta = courseMeta(id);
    const selected = id === currentCourseId;
    const prereq = id === 603 ? [{ courseId: 601, title: courseMeta(601).title, requiredCompletionPercent: 80, completionPercent: getLearningPreviewCourse(601).enrollment.completionPercent, status: "IN_PROGRESS" as const }] : [];
    return {
      id, key: meta.key, title: meta.title, description: meta.description, level: meta.level, isBase: meta.isBase, status: "PUBLISHED", prerequisites: prereq,
      variants: [{ id: meta.variantId, runtime: meta.runtime, runtimeLabel: "Python", title: "Python", status: "PUBLISHED", enrollment: selected ? { id: meta.enrollmentId, status: "IN_PROGRESS", completionPercent: getLearningPreviewCourse(id).enrollment.completionPercent, masteryScore: 76, finalAssessmentPassed: false, completedAt: null } : null, gate: prereq.length ? { code: "PREREQUISITES_INCOMPLETE", prerequisites: prereq } : null }],
    };
  });
}

export function enrollLearningPreviewCourse(courseId: number): void {
  currentCourseId = courseIds.includes(courseId as (typeof courseIds)[number]) ? courseId : 601;
  persistPreviewState();
}

export function setCurrentLearningPreviewCourse(enrollmentId: number): void {
  const match = courseIds.find((id) => courseMeta(id).enrollmentId === enrollmentId);
  if (match) {
    currentCourseId = match;
    persistPreviewState();
  }
}

export function completeLearningPreviewItem(itemId: number): void {
  completedItems.add(itemId);
  persistPreviewState();
}

const previewDiagnosticQuestions = () => [
  { id: "q1", topicId: 6101, topicTitle: copy("Лінійний пошук у послідовності", "Linear search in a sequence"), question: copy("Що зберігає змінна після присвоєння?", "What does a variable store after assignment?"), options: [copy("Значення", "A value"), copy("Назву файлу", "A file name"), copy("Коментар", "A comment"), copy("Колір тексту", "A text color")] },
  { id: "q2", topicId: 6103, topicTitle: copy("Цикли та умови", "Loops and conditions"), question: copy("Яка конструкція повторює дії для кожного елемента списку?", "Which construct repeats work for each list item?"), options: ["for", "if", "return", "class"] },
  { id: "q3", topicId: 6101, topicTitle: copy("Лінійний пошук у послідовності", "Linear search in a sequence"), question: copy("Як знайти найменше число за один прохід?", "How do you find the smallest number in one pass?"), options: [copy("Порівнювати з поточним мінімумом", "Compare with the current minimum"), copy("Складати всі числа", "Add all values"), copy("Зупинитися на першому елементі", "Stop at the first item"), copy("Помножити числа", "Multiply the values")] },
  { id: "q4", topicId: 6103, topicTitle: copy("Цикли та умови", "Loops and conditions"), question: copy("Коли спрацьовує гілка else?", "When does an else branch run?"), options: [copy("Коли умова if хибна", "When the if condition is false"), copy("Завжди перед if", "Always before if"), copy("Лише один раз у програмі", "Only once in a program"), copy("Після кожної змінної", "After every variable")] },
  { id: "q5", topicId: 6101, topicTitle: copy("Лінійний пошук у послідовності", "Linear search in a sequence"), question: copy("Що таке індекс першого елемента списку Python?", "What is the index of the first Python list item?"), options: ["0", "1", "-1", "10"] },
  { id: "q6", topicId: 6103, topicTitle: copy("Цикли та умови", "Loops and conditions"), question: copy("Що робить оператор return у функції?", "What does return do in a function?"), options: [copy("Повертає результат виклику", "Returns the call's result"), copy("Повторює цикл", "Repeats a loop"), copy("Видаляє список", "Deletes a list"), copy("Виводить коментар", "Prints a comment")] },
];

export function getLearningPreviewDiagnostic(enrollmentId: number): CourseDiagnosticAssessment {
  const courseId = courseIds.find((id) => courseMeta(id).enrollmentId === enrollmentId) ?? currentCourseId;
  const meta = courseMeta(courseId);
  const attemptNumber = previewDiagnosticAttempts.get(enrollmentId) ?? 1;
  return {
    id: enrollmentId * 10 + attemptNumber,
    enrollmentId,
    attemptNumber,
    courseTitle: meta.title,
    status: previewDiagnosticResults.has(enrollmentId) ? "SUBMITTED" : "READY",
    passing: { totalScore: 75, knowledgeScore: 70, practicalScore: 60 },
    questions: previewDiagnosticQuestions(),
    practical: {
      title: copy("Знайди найменше значення", "Find the smallest value"),
      statement: copy("Прочитай цілі числа з одного рядка та виведи найменше. Числа розділені пробілами.", "Read integers from one line and print the smallest. Values are separated by spaces."),
      inputFormat: copy("Один рядок цілих чисел.", "One line of integers."),
      outputFormat: copy("Одне ціле число — мінімум.", "One integer: the minimum."),
      constraints: copy("У рядку є щонайменше одне число.", "The line contains at least one number."),
      examples: [{ input: "7 3 9", output: "3", explanation: copy("Мінімальне число — 3.", "The minimum value is 3.") }],
      codeTemplate: "values = list(map(int, input().split()))\n# TODO: find and print the minimum",
      runtime: meta.runtime,
      entryFile: "main.py",
    },
    result: previewDiagnosticResults.get(enrollmentId) ?? null,
  };
}

export async function runLearningPreviewDiagnostic(_enrollmentId: number, _code: string, input: string): Promise<CourseDiagnosticRunResult> {
  const numbers = input.trim().split(/\s+/).map(Number).filter(Number.isFinite);
  return { stdout: numbers.length ? `${Math.min(...numbers)}\n` : "", stderr: "", exitCode: 0, success: numbers.length > 0 };
}

export function retryLearningPreviewDiagnostic(enrollmentId: number): CourseDiagnosticAssessment {
  const previous = previewDiagnosticResults.get(enrollmentId);
  if (!previous || previous.passed) return getLearningPreviewDiagnostic(enrollmentId);
  previewDiagnosticResults.delete(enrollmentId);
  previewDiagnosticAttempts.set(enrollmentId, (previewDiagnosticAttempts.get(enrollmentId) ?? 1) + 1);
  return getLearningPreviewDiagnostic(enrollmentId);
}

export async function submitLearningPreviewDiagnostic(
  enrollmentId: number,
  answers: Array<{ questionId: string; selectedIndex: number }>,
  code: string,
): Promise<CourseDiagnosticResult> {
  const questions = previewDiagnosticQuestions();
  const correctIndexes = [0, 0, 0, 0, 0, 0];
  const answerById = new Map(answers.map((answer) => [answer.questionId, answer.selectedIndex]));
  const review = questions.map((question, index) => ({
    questionId: question.id,
    question: question.question,
    options: question.options,
    selectedIndex: answerById.get(question.id) ?? -1,
    correctIndex: correctIndexes[index],
    topicTitle: question.topicTitle,
  }));
  const correctCount = review.filter((item) => item.selectedIndex === item.correctIndex).length;
  const knowledgeScore = Math.round(correctCount / questions.length * 100);
  const practicalScore = code.includes("min(") ? 100 : 40;
  const score = Math.round((knowledgeScore + practicalScore) / 2);
  const passed = score >= 75 && knowledgeScore >= 70 && practicalScore >= 60;
  const topicResults = [6101, 6103].map((topicId) => {
    const topicQuestions = questions.map((question, index) => ({ question, index })).filter(({ question }) => question.topicId === topicId);
    const topicCorrect = topicQuestions.filter(({ index }) => review[index].selectedIndex === correctIndexes[index]).length;
    const topicScore = Math.round(topicCorrect / topicQuestions.length * 100);
    const theoryCredited = topicScore >= 80;
    return {
      topicId,
      topicTitle: topicQuestions[0]?.question.topicTitle || "",
      correctCount: topicCorrect,
      totalQuestions: topicQuestions.length,
      score: topicScore,
      theoryCredited,
      practiceCredited: theoryCredited && practicalScore >= 60,
    };
  });
  const result: CourseDiagnosticResult = {
    score,
    knowledgeScore,
    practicalScore,
    correctCount,
    totalQuestions: questions.length,
    testsPassed: 4,
    testsTotal: 5,
    passed,
    answers,
    topicResults,
    review,
    submittedAt: new Date().toISOString(),
  };
  previewDiagnosticResults.set(enrollmentId, result);
  if (passed) {
    courseItems().forEach((item) => { if (item.content.required !== false) completedItems.add(item.id); });
    persistPreviewState();
  } else {
    for (const topic of topicResults) {
      if (!topic.theoryCredited) continue;
      completedItems.add(topic.topicId);
      if (topic.practiceCredited) completedItems.add(topic.topicId + 1);
    }
    persistPreviewState();
  }
  return result;
}
