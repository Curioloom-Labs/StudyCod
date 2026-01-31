import type { CourseLanguage } from "../../types";

export type PlacementLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type PlacementQuestion = {
  id: string;
  course: CourseLanguage;
  topicIndex: number;
  promptUk: string;
  promptEn: string;
  optionsUk: string[];
  optionsEn: string[];
  correctIndex: number;
};

// MVP question set: small, safe, and deterministic.
// We can expand this later and/or move to backend.
export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: "java-t0-1",
    course: "JAVA",
    topicIndex: 0,
    promptUk: "Java: Що виведе цей код?\nSystem.out.println(2 + 3 * 4);",
    promptEn: "Java: What will this print?\nSystem.out.println(2 + 3 * 4);",
    optionsUk: ["14", "20", "24", "Помилка"],
    optionsEn: ["14", "20", "24", "Error"],
    correctIndex: 0
  },
  {
    id: "java-t0-2",
    course: "JAVA",
    topicIndex: 0,
    promptUk: "Java: Як правильно оголосити ціле число?",
    promptEn: "Java: How do you declare an integer variable?",
    optionsUk: ["int a = 10;", "integer a = 10;", "Int a = 10;", "num a = 10;"],
    optionsEn: ["int a = 10;", "integer a = 10;", "Int a = 10;", "num a = 10;"],
    correctIndex: 0
  },
  {
    id: "java-t1-1",
    course: "JAVA",
    topicIndex: 1,
    promptUk: "Java: Що виведе цей код?\nint a = 5;\nSystem.out.println(a++);",
    promptEn: "Java: What will this print?\nint a = 5;\nSystem.out.println(a++);",
    optionsUk: ["5", "6", "Помилка компіляції", "Нічого"],
    optionsEn: ["5", "6", "Compilation error", "Nothing"],
    correctIndex: 0
  },
  {
    id: "java-t1-2",
    course: "JAVA",
    topicIndex: 1,
    promptUk: "Java: Який тип даних підходить для true/false?",
    promptEn: "Java: Which type is used for true/false?",
    optionsUk: ["int", "String", "boolean", "char"],
    optionsEn: ["int", "String", "boolean", "char"],
    correctIndex: 2
  },
  {
    id: "java-t2-1",
    course: "JAVA",
    topicIndex: 2,
    promptUk: "Java: Яка умова істинна? (a = 3)",
    promptEn: "Java: Which condition is true? (a = 3)",
    optionsUk: ["a == 3", "a = 3", "a === 3", "a != 3"],
    optionsEn: ["a == 3", "a = 3", "a === 3", "a != 3"],
    correctIndex: 0
  },
  {
    id: "java-t2-2",
    course: "JAVA",
    topicIndex: 2,
    promptUk: "Java: Що виведе цей код?\nint a = 2;\nif (a > 3) System.out.println(\"A\"); else System.out.println(\"B\");",
    promptEn: "Java: What will this print?\nint a = 2;\nif (a > 3) System.out.println(\"A\"); else System.out.println(\"B\");",
    optionsUk: ["A", "B", "Нічого", "Помилка"],
    optionsEn: ["A", "B", "Nothing", "Error"],
    correctIndex: 1
  },
  {
    id: "java-t3-1",
    course: "JAVA",
    topicIndex: 3,
    promptUk: "Java: Скільки разів виконається цикл?\nfor (int i=0;i<3;i++) { }",
    promptEn: "Java: How many times will the loop run?\nfor (int i=0;i<3;i++) { }",
    optionsUk: ["2", "3", "4", "Нескінченно"],
    optionsEn: ["2", "3", "4", "Infinite"],
    correctIndex: 1
  },
  {
    id: "java-t3-2",
    course: "JAVA",
    topicIndex: 3,
    promptUk: "Java: Який результат?\nint sum = 0;\nfor (int i=1;i<=3;i++) sum += i;\nSystem.out.println(sum);",
    promptEn: "Java: What is the output?\nint sum = 0;\nfor (int i=1;i<=3;i++) sum += i;\nSystem.out.println(sum);",
    optionsUk: ["3", "6", "7", "Помилка"],
    optionsEn: ["3", "6", "7", "Error"],
    correctIndex: 1
  },
  {
    id: "py-t0-1",
    course: "PYTHON",
    topicIndex: 0,
    promptUk: "Python: Що виведе print(2 + 3 * 4)?",
    promptEn: "Python: What will print(2 + 3 * 4) output?",
    optionsUk: ["14", "20", "24", "Помилка"],
    optionsEn: ["14", "20", "24", "Error"],
    correctIndex: 0
  },
  {
    id: "py-t0-2",
    course: "PYTHON",
    topicIndex: 0,
    promptUk: "Python: Як створити змінну зі значенням 10?",
    promptEn: "Python: How do you create a variable with value 10?",
    optionsUk: ["x = 10", "int x = 10", "var x := 10", "x := 10"],
    optionsEn: ["x = 10", "int x = 10", "var x := 10", "x := 10"],
    correctIndex: 0
  },
  {
    id: "py-t1-1",
    course: "PYTHON",
    topicIndex: 1,
    promptUk: "Python: Що виведе print(type([])) ?",
    promptEn: "Python: What does print(type([])) output?",
    optionsUk: ["<class 'list'>", "<class 'dict'>", "<class 'tuple'>", "<class 'set'>"],
    optionsEn: ["<class 'list'>", "<class 'dict'>", "<class 'tuple'>", "<class 'set'>"],
    correctIndex: 0
  },
  {
    id: "py-t1-2",
    course: "PYTHON",
    topicIndex: 1,
    promptUk: "Python: Який оператор для цілочисельного ділення?",
    promptEn: "Python: Which operator is integer (floor) division?",
    optionsUk: ["/", "//", "%", "**"],
    optionsEn: ["/", "//", "%", "**"],
    correctIndex: 1
  },
  {
    id: "py-t2-1",
    course: "PYTHON",
    topicIndex: 2,
    promptUk: "Python: Який результат?\na = 3\nprint(a == 3)",
    promptEn: "Python: What is the output?\na = 3\nprint(a == 3)",
    optionsUk: ["True", "False", "3", "Помилка"],
    optionsEn: ["True", "False", "3", "Error"],
    correctIndex: 0
  },
  {
    id: "py-t2-2",
    course: "PYTHON",
    topicIndex: 2,
    promptUk: "Python: Що виведе?\na = 2\nprint('A' if a > 3 else 'B')",
    promptEn: "Python: What is the output?\na = 2\nprint('A' if a > 3 else 'B')",
    optionsUk: ["A", "B", "Нічого", "Помилка"],
    optionsEn: ["A", "B", "Nothing", "Error"],
    correctIndex: 1
  },
  {
    id: "py-t3-1",
    course: "PYTHON",
    topicIndex: 3,
    promptUk: "Python: Скільки разів виконається цикл?\nfor i in range(3):\n    pass",
    promptEn: "Python: How many iterations?\nfor i in range(3):\n    pass",
    optionsUk: ["2", "3", "4", "Нескінченно"],
    optionsEn: ["2", "3", "4", "Infinite"],
    correctIndex: 1
  },
  {
    id: "py-t3-2",
    course: "PYTHON",
    topicIndex: 3,
    promptUk: "Python: Який результат?\nsum = 0\nfor i in range(1, 4):\n    sum += i\nprint(sum)",
    promptEn: "Python: What is the output?\nsum = 0\nfor i in range(1, 4):\n    sum += i\nprint(sum)",
    optionsUk: ["3", "6", "7", "Помилка"],
    optionsEn: ["3", "6", "7", "Error"],
    correctIndex: 1
  }
];

export function getPlacementQuestions(course: CourseLanguage): PlacementQuestion[] {
  return PLACEMENT_QUESTIONS.filter(q => q.course === course);
}

export function computeMasteredUntilTopicIndex(
  questions: PlacementQuestion[],
  answers: Record<string, number>
): number | null {
  if (!questions.length) return null;
  const byTopic = new Map<number, { correct: number; answered: number; total: number }>();
  for (const q of questions) {
    const prev = byTopic.get(q.topicIndex) ?? { correct: 0, answered: 0, total: 0 };
    prev.total += 1;
    const a = answers[q.id];
    if (typeof a === "number") {
      prev.answered += 1;
      if (a === q.correctIndex) prev.correct += 1;
    }
    byTopic.set(q.topicIndex, prev);
  }
  const topicIndexes = Array.from(byTopic.keys()).sort((a, b) => a - b);
  if (!topicIndexes.length) return null;

  let lastMastered: number | null = null;
  for (const ti of topicIndexes) {
    const stat = byTopic.get(ti)!;
    if (stat.answered <= 0) break;
    const ratio = stat.correct / Math.max(1, stat.total);
    const mastered = ratio >= 0.75;
    if (!mastered) break;
    lastMastered = ti;
  }
  return lastMastered;
}

export function recommendLevel(score: number, total: number): PlacementLevel {
  const correct = Math.max(0, Math.min(total, Math.round(score)));
  if (total <= 0) return "BEGINNER";
  const ratio = correct / total;
  if (ratio >= 0.83) return "ADVANCED";
  if (ratio >= 0.5) return "INTERMEDIATE";
  return "BEGINNER";
}
