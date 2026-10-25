import type { LibraryTaskListItem, LibraryTaskTest } from "./api/library";

export const LEARNING_BOUNDARY_DEMO = {
  id: 901,
  problemCode: "sum-1-to-n-boundary-demo",
  slug: "sum-1-to-n-boundary-demo",
  input: "5",
  expectedOutput: "15",
  failedOutput: "10",
  initialRange: "range(1, n)",
  correctedRange: "range(1, n + 1)",
  initialCode: "n = 5\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)\n",
  correctedCode: "n = 5\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n",
  title: { uk: "Сума від 1 до n", en: "Sum from 1 to n" },
  section: { uk: "Основи Python", en: "Python basics" },
  description: {
    uk: "Для заданого цілого n виведи суму чисел від 1 до n включно. Демонстраційний приклад використовує n = 5.",
    en: "Given an integer n, print the sum from 1 through n, inclusive. The demonstration uses n = 5.",
  },
  tags: {
    uk: ["цикли", "межі діапазону"],
    en: ["loops", "range boundary"],
  },
  hint: {
    uk: "Перевір, чи включає range верхню межу n.",
    en: "Check whether range includes the upper bound n.",
  },
} as const;

export const LEARNING_DEMO_PUBLIC_TESTS: LibraryTaskTest[] = [
  {
    id: 1,
    input: LEARNING_BOUNDARY_DEMO.input,
    expectedOutput: LEARNING_BOUNDARY_DEMO.expectedOutput,
    isHidden: false,
    kind: "SAMPLE",
    points: 100,
  },
];

export function makeLearningBoundaryDemoTask(language: "uk" | "en"): LibraryTaskListItem {
  return {
    id: LEARNING_BOUNDARY_DEMO.id,
    problemCode: LEARNING_BOUNDARY_DEMO.problemCode,
    slug: LEARNING_BOUNDARY_DEMO.slug,
    title: LEARNING_BOUNDARY_DEMO.title[language],
    description: LEARNING_BOUNDARY_DEMO.description[language],
    template: LEARNING_BOUNDARY_DEMO.initialCode,
    templatesByLanguage: null,
    lang: "PYTHON",
    difficulty: "EASY",
    tags: [...LEARNING_BOUNDARY_DEMO.tags[language]],
    section: LEARNING_BOUNDARY_DEMO.section[language],
    maxAttempts: 5,
    timeLimitMs: 1000,
    memoryLimitMb: 64,
    outputLimitKb: 64,
    checkerSpec: { type: "whitespace" },
    allowedLanguages: ["python"],
    status: "APPROVED",
    rejectionReason: null,
    submittedAt: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: 1, username: "studycod" },
  };
}

export function simulateLearningBoundaryDemo(code: string): { passed: boolean; output: string } | null {
  const compact = code.replace(/\s+/g, "").toLowerCase();
  const matches = compact.match(/^n=5total=0foriinrange\(1,n(\+1)?\):total\+=iprint\(total\)$/);
  if (!matches) return null;
  const passed = Boolean(matches[1]);
  return {
    passed,
    output: passed ? LEARNING_BOUNDARY_DEMO.expectedOutput : LEARNING_BOUNDARY_DEMO.failedOutput,
  };
}
