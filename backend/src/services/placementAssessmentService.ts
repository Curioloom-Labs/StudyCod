import type { CourseRuntime as UserRuntime } from "../entities/CourseVariant";

export type PlacementAssessmentLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type PlacementAssessmentTrack = "INTERMEDIATE" | "ADVANCED" | "UNDECIDED";

export type PlacementQuizQuestion = {
  id: string;
  promptUk: string;
  promptEn: string;
  optionsUk: string[];
  optionsEn: string[];
  correctIndex: number;
};

export type PlacementAssessmentCase = {
  input: string;
  expectedTokens: string[];
};

export type PlacementAssessmentTask = {
  id: string;
  titleUk: string;
  titleEn: string;
  promptUk: string;
  promptEn: string;
  starterCodeJava: string;
  starterCodePython: string;
  starterCodeCpp: string;
  sampleInput: string;
  sampleOutput: string;
  tests: PlacementAssessmentCase[];
};

export type PlacementAssessmentPackInternal = {
  track: PlacementAssessmentTrack;
  language: UserRuntime;
  quizQuestions: PlacementQuizQuestion[];
  tasks: PlacementAssessmentTask[];
};

export type PlacementAssessmentPackPublic = {
  track: PlacementAssessmentTrack;
  language: UserRuntime;
  quizQuestions: Array<{
    id: string;
    promptUk: string;
    promptEn: string;
    optionsUk: string[];
    optionsEn: string[];
  }>;
  tasks: Array<{
    id: string;
    titleUk: string;
    titleEn: string;
    promptUk: string;
    promptEn: string;
    starterCode: string;
    language: UserRuntime;
    sampleInput: string;
    sampleOutput: string;
  }>;
};

const MAX_CROSS_LEVEL_OVERLAP = 2;

function normalizeTokens(out: string): string[] {
  return String(out ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

function seedFor(userId: number, track: PlacementAssessmentTrack): number {
  const s = `${userId}:${track}:placement-complex:v1`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function q(
  id: string,
  promptUk: string,
  promptEn: string,
  optionsUk: string[],
  optionsEn: string[],
  correctIndex: number
): PlacementQuizQuestion {
  return { id, promptUk, promptEn, optionsUk, optionsEn, correctIndex };
}

const MIN_QUIZ_PER_TRACK = 17;

const SHARED_NON_BEGINNER_QUIZ: PlacementQuizQuestion[] = [
  q(
    "s-q1",
    "Яка структура найкраща для знаходження мінімуму/максимуму на потоці з додаваннями?",
    "Which structure is best to keep min/max online with incremental inserts?",
    ["Stack", "Heap / Priority Queue", "LinkedList", "Prefix sum array"],
    ["Stack", "Heap / Priority Queue", "LinkedList", "Prefix sum array"],
    1
  ),
  q(
    "s-q2",
    "Яка асимптотика ітерації по всім ребрам графа зі списком суміжності?",
    "What is complexity of iterating through all edges using adjacency list?",
    ["O(N)", "O(M)", "O(N+M)", "O(N*M)"],
    ["O(N)", "O(M)", "O(N+M)", "O(N*M)"],
    2
  ),
];

const QUIZ_BANK: Record<PlacementAssessmentTrack, PlacementQuizQuestion[]> = {
  INTERMEDIATE: [
    q("i-q1", "Яка асимптотика двох вкладених циклів for (0..n-1)?", "What is the complexity of two nested loops for (0..n-1)?", ["O(n)", "O(log n)", "O(n²)", "O(n log n)"], ["O(n)", "O(log n)", "O(n²)", "O(n log n)"], 2),
    q("i-q2", "Що робить префіксна сума?", "What does a prefix sum do?", ["Сортує масив", "Дає суму елементів на префіксах", "Шукає максимум", "Прибирає дублікати"], ["Sorts the array", "Gives sums on prefixes", "Finds maximum", "Removes duplicates"], 1),
    q("i-q3", "Яка структура підходить для підрахунку частот?", "Which structure is suitable for counting frequencies?", ["Queue", "Stack", "Map/Dictionary", "Deque"], ["Queue", "Stack", "Map/Dictionary", "Deque"], 2),
    q("i-q4", "Для перевірки унікальності елементів найпростіше використати...", "To check uniqueness of elements, the simplest is to use...", ["Set", "Vector", "LinkedList", "PriorityQueue"], ["Set", "Vector", "LinkedList", "PriorityQueue"], 0),
    q("i-q5", "Що повертає x % 2 == 0?", "What does x % 2 == 0 check?", ["x ділиться на 3", "x парне", "x непарне", "x просте"], ["x divisible by 3", "x is even", "x is odd", "x is prime"], 1),
    q("i-q6", "Яка складність пошуку в відсортованому масиві бінпошуком?", "What is binary search complexity on sorted array?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 1),
    q("i-q7", "Що повертає lower_bound?", "What does lower_bound return?", ["Перший елемент > x", "Перший елемент >= x", "Останній елемент <= x", "Індекс максимуму"], ["First element > x", "First element >= x", "Last element <= x", "Index of maximum"], 1),
    q("i-q8", "Queue зазвичай працює за принципом...", "Queue usually works by...", ["LIFO", "FIFO", "Random", "Priority only"], ["LIFO", "FIFO", "Random", "Priority only"], 1),
    q("i-q9", "Що правильно для BFS в неваговому графі?", "What is true for BFS in unweighted graph?", ["Знаходить найкоротші шляхи за кількістю ребер", "Працює лише для DAG", "Потребує сортування ребер", "Дає топологічний порядок"], ["Finds shortest paths by edge count", "Works only for DAG", "Requires edge sorting", "Returns topological order"], 0),
    q("i-q10", "Як перевірити, чи граф неорієнтований за списком ребер (u,v)?", "How to treat undirected graph edges (u,v)?", ["Додати тільки u->v", "Додати тільки v->u", "Додати і u->v, і v->u", "Не додавати жодне"], ["Add only u->v", "Add only v->u", "Add both u->v and v->u", "Add none"], 2),
    q("i-q11", "Kadane алгоритм знаходить...", "Kadane algorithm finds...", ["Кількість інверсій", "Максимальну суму підмасиву", "Медіану", "Найдовший palindrome"], ["Inversion count", "Maximum subarray sum", "Median", "Longest palindrome"], 1),
    q("i-q12", "Що найчастіше є правильною структурою для BFS?", "What structure is typically used in BFS?", ["Stack", "Queue", "Priority queue", "Set only"], ["Stack", "Queue", "Priority queue", "Set only"], 1),
    q("i-q13", "Що повертає upper_bound(x)?", "What does upper_bound(x) return?", ["Перший елемент >= x", "Перший елемент > x", "Останній <= x", "Кількість x"], ["First element >= x", "First element > x", "Last <= x", "Count of x"], 1),
    q("i-q14", "Яка асимптотика вставки в set/map (tree-based)?", "What is insertion complexity for tree-based set/map?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 1),
    q("i-q15", "Якщо потрібні всі суми префіксів масиву за O(n), що робимо?", "If you need all prefix sums in O(n), what do you do?", ["Сортуємо", "Один прохід з накопиченням", "BFS", "Вкладені цикли"], ["Sort", "Single pass accumulation", "BFS", "Nested loops"], 1),
    ...SHARED_NON_BEGINNER_QUIZ,
  ],
  ADVANCED: [
    q("a-q1", "Яка складність сортування порівняннями у загальному випадку?", "What is the general lower bound for comparison sorting?", ["O(n)", "O(log n)", "O(n log n)", "O(n²)"], ["O(n)", "O(log n)", "O(n log n)", "O(n²)"], 2),
    q("a-q2", "Що робить двовказівниковий метод для масивів із додатними числами при умові суми <= K?", "What does two-pointers method do for positive arrays with sum <= K?", ["Завжди O(n²)", "Може знайти макс. довжину за O(n)", "Працює лише з відсортованими", "Не працює для K"], ["Always O(n²)", "Can find max length in O(n)", "Works only for sorted", "Doesn't work with K"], 1),
    q("a-q3", "Для BFS у графі з N вершинами і M ребрами складність...", "BFS complexity in graph with N vertices and M edges is...", ["O(N)", "O(M)", "O(N+M)", "O(N*M)"], ["O(N)", "O(M)", "O(N+M)", "O(N*M)"], 2),
    q("a-q4", "Якщо потрібно багато запитів на суми відрізків статичного масиву, що краще?", "For many range-sum queries on static array, what's best?", ["Перерахунок щоразу", "Префіксні суми", "BFS", "DFS"], ["Recompute every time", "Prefix sums", "BFS", "DFS"], 1),
    q("a-q5", "Що істинно для unordered_map / hash map?", "What is true for unordered_map / hash map?", ["Гарантовано O(log n)", "Середньо O(1), гірше у колізіях", "Завжди O(1)", "Завжди O(n log n)"], ["Guaranteed O(log n)", "Average O(1), worse on collisions", "Always O(1)", "Always O(n log n)"], 1),
    q("a-q6", "lower_bound у відсортованому масиві повертає...", "lower_bound in sorted array returns...", ["індекс останнього < x", "перший індекс >= x", "перший індекс > x", "індекс максимуму"], ["last index < x", "first index >= x", "first index > x", "max index"], 1),
    q("a-q7", "Для невагового графа найкоротші відстані від джерела знаходить...", "For unweighted graph shortest distances from source are found by...", ["Dijkstra", "Bellman-Ford", "BFS", "Floyd-Warshall"], ["Dijkstra", "Bellman-Ford", "BFS", "Floyd-Warshall"], 2),
    q("a-q8", "Який інваріант Kadane?", "What is Kadane invariant?", ["cur = max сума підмасиву, що закінчується в i", "cur = глобальний максимум", "cur = префіксна сума", "cur = середнє"], ["cur = max subarray sum ending at i", "cur = global maximum", "cur = prefix sum", "cur = average"], 0),
    q("a-q9", "Як обробити граф із вершинами 1..N в масиві adjacency?", "How to build adjacency for graph vertices 1..N?", ["size N", "size N+1", "size 2N", "size M"], ["size N", "size N+1", "size 2N", "size M"], 1),
    q("a-q10", "Якщо при рівній частоті треба менше число, то оновлення best робимо коли...", "If tie on frequency should pick smaller number, update best when...", ["cnt > bestCnt", "cnt >= bestCnt", "cnt > bestCnt або (cnt==bestCnt && x<bestX)", "тільки x<bestX"], ["cnt > bestCnt", "cnt >= bestCnt", "cnt > bestCnt or (cnt==bestCnt && x<bestX)", "only x<bestX"], 2),
    q("a-q11", "Для q запитів пошуку позиції у відсортованому масиві найкраще...", "For q position-search queries in sorted array best is...", ["лінійний пошук", "бінарний пошук для кожного", "DFS", "heap"], ["linear search", "binary search each query", "DFS", "heap"], 1),
    q("a-q12", "Що зміниться в BFS, якщо граф орієнтований?", "What changes in BFS for directed graph?", ["нічого", "у adjacency додаємо лише напрямні ребра", "потрібен heap", "потрібне сортування"], ["nothing", "adjacency stores directed edges only", "need heap", "need sorting"], 1),
    q("a-q13", "Для L..R range updates та point query у простому варіанті зручно використовувати...", "For L..R range updates and point query, simple approach uses...", ["difference array", "DFS", "stack", "multiset"], ["difference array", "DFS", "stack", "multiset"], 0),
    q("a-q14", "Який алгоритм для shortest path у графі з невід’ємними вагами?", "Which algorithm finds shortest paths in non-negative weighted graph?", ["BFS", "Dijkstra", "KMP", "Topological sort only"], ["BFS", "Dijkstra", "KMP", "Topological sort only"], 1),
    q("a-q15", "Що дає техніка coordinate compression?", "What does coordinate compression provide?", ["Зменшує значення до щільного діапазону індексів", "Сортує за спаданням", "Видаляє дублікати без мапінгу", "Знаходить shortest path"], ["Maps values to dense index range", "Sorts descending", "Removes duplicates without mapping", "Finds shortest path"], 0),
    ...SHARED_NON_BEGINNER_QUIZ,
  ],
  UNDECIDED: [],
};

QUIZ_BANK.UNDECIDED = [
  ...QUIZ_BANK.INTERMEDIATE.slice(0, 10),
  ...QUIZ_BANK.ADVANCED.slice(0, 10),
];

function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function selectQuizQuestions(track: PlacementAssessmentTrack, seed: number): PlacementQuizQuestion[] {
  const shuffled = deterministicShuffle(QUIZ_BANK[track], seed + 101);
  const selected = shuffled.slice(0, Math.max(MIN_QUIZ_PER_TRACK, 17));
  return selected;
}

function intersectionSize(a: string[], b: string[]): number {
  const setA = new Set(a);
  let size = 0;
  for (const x of b) {
    if (setA.has(x)) size++;
  }
  return size;
}

function normalizeTaskTemplateId(taskId: string): string {
  const hashIndex = taskId.indexOf("#");
  return hashIndex >= 0 ? taskId.slice(0, hashIndex) : taskId;
}

function assertNonBeginnerOverlapPolicy(
  intermediate: PlacementAssessmentPackInternal,
  advanced: PlacementAssessmentPackInternal
): void {
  const quizOverlap = intersectionSize(
    intermediate.quizQuestions.map((q) => q.id),
    advanced.quizQuestions.map((q) => q.id)
  );

  if (quizOverlap > MAX_CROSS_LEVEL_OVERLAP) {
    throw new Error(
      `[placement-assessment] quiz overlap too high: ${quizOverlap} > ${MAX_CROSS_LEVEL_OVERLAP}`
    );
  }

  const taskOverlap = intersectionSize(
    intermediate.tasks.map((t) => normalizeTaskTemplateId(t.id)),
    advanced.tasks.map((t) => normalizeTaskTemplateId(t.id))
  );

  if (taskOverlap > MAX_CROSS_LEVEL_OVERLAP) {
    throw new Error(
      `[placement-assessment] task overlap too high: ${taskOverlap} > ${MAX_CROSS_LEVEL_OVERLAP}`
    );
  }
}

function starterForTask(taskName: string) {
  return {
    java:
`import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    // TODO: ${taskName}
  }
}
`,
    python:
`# TODO: ${taskName}
`,
    cpp:
`#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  // TODO: ${taskName}
  return 0;
}
`,
  };
}

/* function taskEvenStats(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);
  const solve = (arr: number[]) => {
    let c = 0;
    let s = 0;
    for (const x of arr) {
      if (x % 2 === 0) {
        c++;
        s += x;
      }
    }
    return `${c}\n${s}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 6, 14);
    const arr = Array.from({ length: n }, () => pickInt(rng, -20, 40));
    const input = `${n}\n${arr.join(" ")}\n`;
    const out = solve(arr);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({
    input: x.input,
    expectedTokens: x.expectedTokens,
  }));
  const starter = starterForTask("count/sum even numbers");

  return {
    id: "task-even-stats",
    titleUk: "Парні числа: кількість і сума",
    titleEn: "Even numbers: count and sum",
    promptUk: "Зчитай N та N цілих чисел. Виведи на окремих рядках: (1) кількість парних, (2) суму парних.",
    promptEn: "Read N and N integers. Print on separate lines: (1) count of even numbers, (2) sum of even numbers.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
} */

function taskDistinctSort(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);
  const solve = (arr: number[]) => `${Array.from(new Set(arr)).sort((a, b) => a - b).join(" ")}\n`;
  const makeCase = () => {
    const n = pickInt(rng, 8, 18);
    const arr = Array.from({ length: n }, () => pickInt(rng, -15, 15));
    const input = `${n}\n${arr.join(" ")}\n`;
    const out = solve(arr);
    return { input, expectedTokens: normalizeTokens(out), out };
  };
  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({ input: x.input, expectedTokens: x.expectedTokens }));
  const starter = starterForTask("print unique sorted values");

  return {
    id: "task-distinct-sort",
    titleUk: "Унікальні елементи по зростанню",
    titleEn: "Distinct elements in ascending order",
    promptUk: "Зчитай N та масив. Виведи всі різні елементи у зростаючому порядку в один рядок через пробіл.",
    promptEn: "Read N and an array. Print all distinct elements in ascending order on one line separated by spaces.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskMaxSubarray(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);
  const solve = (arr: number[]) => {
    let best = -1e18;
    let cur = 0;
    for (const x of arr) {
      cur = Math.max(x, cur + x);
      best = Math.max(best, cur);
    }
    return `${best}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 8, 20);
    const arr = Array.from({ length: n }, () => pickInt(rng, -30, 30));
    const input = `${n}\n${arr.join(" ")}\n`;
    const out = solve(arr);
    return { input, expectedTokens: normalizeTokens(out), out };
  };
  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({ input: x.input, expectedTokens: x.expectedTokens }));
  const starter = starterForTask("maximum subarray sum (Kadane)");

  return {
    id: "task-max-subarray",
    titleUk: "Максимальна сума підмасиву",
    titleEn: "Maximum subarray sum",
    promptUk: "Зчитай N та масив цілих. Знайди максимальну суму непорожнього підмасиву.",
    promptEn: "Read N and an integer array. Find the maximum sum of a non-empty subarray.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskRangeSum(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);
  const solve = (arr: number[], queries: Array<[number, number]>) => {
    const pref = [0];
    for (const x of arr) pref.push(pref[pref.length - 1] + x);
    const lines = queries.map(([l, r]) => String(pref[r + 1] - pref[l]));
    return `${lines.join("\n")}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 8, 16);
    const q = pickInt(rng, 3, 6);
    const arr = Array.from({ length: n }, () => pickInt(rng, -20, 25));
    const queries: Array<[number, number]> = Array.from({ length: q }, () => {
      const l = pickInt(rng, 0, n - 1);
      const r = pickInt(rng, l, n - 1);
      return [l, r];
    });
    const input = `${n} ${q}\n${arr.join(" ")}\n${queries.map(([l, r]) => `${l} ${r}`).join("\n")}\n`;
    const out = solve(arr, queries);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({ input: x.input, expectedTokens: x.expectedTokens }));
  const starter = starterForTask("range sum queries with prefix sums");

  return {
    id: "task-range-sum",
    titleUk: "Суми на відрізках",
    titleEn: "Range sum queries",
    promptUk: "Зчитай n, q, масив і q запитів [l, r]. Для кожного запиту виведи суму елементів на відрізку.",
    promptEn: "Read n, q, array and q queries [l, r]. For each query print the segment sum.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskMostFrequent(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);
  const solve = (arr: number[]) => {
    const m = new Map<number, number>();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    let bestNum = 0;
    let bestCount = -1;
    for (const [num, cnt] of m.entries()) {
      if (cnt > bestCount || (cnt === bestCount && num < bestNum)) {
        bestCount = cnt;
        bestNum = num;
      }
    }
    return `${bestNum}\n${bestCount}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 8, 18);
    const arr = Array.from({ length: n }, () => pickInt(rng, -8, 8));
    const input = `${n}\n${arr.join(" ")}\n`;
    const out = solve(arr);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({ input: x.input, expectedTokens: x.expectedTokens }));
  const starter = starterForTask("most frequent number and its frequency");

  return {
    id: "task-most-frequent",
    titleUk: "Найчастіше число",
    titleEn: "Most frequent number",
    promptUk: "Зчитай масив. Виведи число з найбільшою частотою та його кількість. При нічиї — менше число.",
    promptEn: "Read an array. Print number with highest frequency and its count. On ties choose the smaller number.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskBinarySearchQueries(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);

  const solve = (arr: number[], queries: number[]) => {
    const out: number[] = [];
    for (const x of queries) {
      let l = 0;
      let r = arr.length;
      while (l < r) {
        const m = (l + r) >> 1;
        if (arr[m] >= x) r = m;
        else l = m + 1;
      }
      out.push(l === arr.length ? -1 : l + 1); // 1-based
    }
    return `${out.join("\n")}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 10, 20);
    const q = pickInt(rng, 4, 8);
    const arr = Array.from({ length: n }, () => pickInt(rng, -40, 60)).sort((a, b) => a - b);
    const queries = Array.from({ length: q }, () => pickInt(rng, -45, 65));
    const input = `${n} ${q}\n${arr.join(" ")}\n${queries.join(" ")}\n`;
    const out = solve(arr, queries);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({
    input: x.input,
    expectedTokens: x.expectedTokens,
  }));

  const starter = starterForTask("binary search first index with a[i] >= x for each query");
  return {
    id: "task-binary-search-queries",
    titleUk: "Бінпошук: перший >= x",
    titleEn: "Binary search: first >= x",
    promptUk: "Є відсортований масив a (n) і q запитів x. Для кожного x виведи 1-based індекс першого a[i] >= x, або -1 якщо такого немає.",
    promptEn: "Given sorted array a (n) and q queries x. For each x print 1-based index of first a[i] >= x, or -1 if none.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskBfsShortestPath(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);

  const solve = (n: number, edges: Array<[number, number]>) => {
    const g: number[][] = Array.from({ length: n + 1 }, () => []);
    for (const [u, v] of edges) {
      g[u].push(v);
      g[v].push(u);
    }
    const dist = Array(n + 1).fill(-1);
    const q: number[] = [1];
    dist[1] = 0;
    for (let head = 0; head < q.length; head++) {
      const u = q[head];
      for (const v of g[u]) {
        if (dist[v] === -1) {
          dist[v] = dist[u] + 1;
          q.push(v);
        }
      }
    }
    return `${dist[n]}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 6, 12);
    const m = pickInt(rng, n - 1, Math.min(n * (n - 1) / 2, n + 8));
    const set = new Set<string>();
    const edges: Array<[number, number]> = [];

    // Make graph connected via chain
    for (let i = 1; i < n; i++) {
      const key = `${i}-${i + 1}`;
      set.add(key);
      edges.push([i, i + 1]);
    }

    while (edges.length < m) {
      let u = pickInt(rng, 1, n);
      let v = pickInt(rng, 1, n);
      if (u === v) continue;
      if (u > v) [u, v] = [v, u];
      const key = `${u}-${v}`;
      if (set.has(key)) continue;
      set.add(key);
      edges.push([u, v]);
    }

    const input = `${n} ${edges.length}\n${edges.map(([u, v]) => `${u} ${v}`).join("\n")}\n`;
    const out = solve(n, edges);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({
    input: x.input,
    expectedTokens: x.expectedTokens,
  }));
  const starter = starterForTask("BFS shortest path in unweighted undirected graph from 1 to n");

  return {
    id: "task-bfs-shortest-path",
    titleUk: "BFS: найкоротший шлях 1 -> n",
    titleEn: "BFS: shortest path 1 -> n",
    promptUk: "Дано неваговий неорієнтований граф (n, m). Знайди довжину найкоротшого шляху від 1 до n (кількість ребер), або -1 якщо недосяжно.",
    promptEn: "Given an unweighted undirected graph (n, m). Find shortest path length from 1 to n (edge count), or -1 if unreachable.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskGraphComponents(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);

  const solve = (n: number, edges: Array<[number, number]>) => {
    const g: number[][] = Array.from({ length: n + 1 }, () => []);
    for (const [u, v] of edges) {
      g[u].push(v);
      g[v].push(u);
    }

    const used = Array(n + 1).fill(false);
    let comps = 0;
    for (let s = 1; s <= n; s++) {
      if (used[s]) continue;
      comps++;
      const st = [s];
      used[s] = true;
      while (st.length) {
        const u = st.pop()!;
        for (const v of g[u]) {
          if (!used[v]) {
            used[v] = true;
            st.push(v);
          }
        }
      }
    }
    return `${comps}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 7, 14);
    const m = pickInt(rng, n - 2, n + 6);
    const set = new Set<string>();
    const edges: Array<[number, number]> = [];
    while (edges.length < m) {
      let u = pickInt(rng, 1, n);
      let v = pickInt(rng, 1, n);
      if (u === v) continue;
      if (u > v) [u, v] = [v, u];
      const key = `${u}-${v}`;
      if (set.has(key)) continue;
      set.add(key);
      edges.push([u, v]);
    }
    const input = `${n} ${edges.length}\n${edges.map(([u, v]) => `${u} ${v}`).join("\n")}\n`;
    const out = solve(n, edges);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({
    input: x.input,
    expectedTokens: x.expectedTokens,
  }));
  const starter = starterForTask("count connected components in an undirected graph");

  return {
    id: "task-graph-components",
    titleUk: "Кількість компонент зв’язності",
    titleEn: "Connected components count",
    promptUk: "Дано неорієнтований граф. Виведи кількість компонент зв’язності.",
    promptEn: "Given an undirected graph. Print number of connected components.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function taskMinWindowAtLeastK(seed: number): PlacementAssessmentTask {
  const rng = mulberry32(seed);

  const solve = (arr: number[], k: number) => {
    let l = 0;
    let sum = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let r = 0; r < arr.length; r++) {
      sum += arr[r];
      while (sum >= k) {
        best = Math.min(best, r - l + 1);
        sum -= arr[l++];
      }
    }
    return `${Number.isFinite(best) ? best : 0}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 8, 18);
    const arr = Array.from({ length: n }, () => pickInt(rng, 1, 15));
    const k = pickInt(rng, 12, 45);
    const input = `${n} ${k}\n${arr.join(" ")}\n`;
    const out = solve(arr, k);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const tests = [sample, makeCase(), makeCase(), makeCase(), makeCase()].map((x) => ({
    input: x.input,
    expectedTokens: x.expectedTokens,
  }));
  const starter = starterForTask("minimum length subarray with sum >= k (positive integers)");

  return {
    id: "task-min-window-at-least-k",
    titleUk: "Мінімальна довжина підмасиву із сумою >= K",
    titleEn: "Minimum subarray length with sum >= K",
    promptUk: "Дано масив додатних чисел та K. Знайди мінімальну довжину непорожнього підмасиву із сумою не менше K, або 0 якщо не існує.",
    promptEn: "Given array of positive integers and K. Find minimum length of non-empty subarray with sum at least K, or 0 if none.",
    starterCodeJava: starter.java,
    starterCodePython: starter.python,
    starterCodeCpp: starter.cpp,
    sampleInput: sample.input,
    sampleOutput: sample.out,
    tests,
  };
}

function buildPlacementAssessmentPackUnchecked(track: PlacementAssessmentTrack, language: UserRuntime, userId: number): PlacementAssessmentPackInternal {
  const seed = seedFor(userId, track);

  const tasks = track === "INTERMEDIATE"
    ? [
      taskDistinctSort(seed + 23),
      taskRangeSum(seed + 47),
      taskMostFrequent(seed + 59),
      taskBinarySearchQueries(seed + 53),
      taskMaxSubarray(seed + 31),
    ]
    : track === "ADVANCED"
      ? [
        taskBfsShortestPath(seed + 67),
        taskGraphComponents(seed + 71),
        taskMinWindowAtLeastK(seed + 73),
        taskBinarySearchQueries(seed + 53),
        taskMaxSubarray(seed + 31),
      ]
      : [
        taskRangeSum(seed + 47),
        taskMostFrequent(seed + 59),
        taskBfsShortestPath(seed + 67),
        taskGraphComponents(seed + 71),
        taskMinWindowAtLeastK(seed + 73),
      ];

  // ensure stable unique ids for repeated templates
  const stableTasks = tasks.map((task, idx) => ({
    ...task,
    id: `${task.id}#${idx + 1}`,
  }));

  return {
    track,
    language,
    quizQuestions: selectQuizQuestions(track, seed),
    tasks: stableTasks,
  };
}

export function buildPlacementAssessmentPack(track: PlacementAssessmentTrack, language: UserRuntime, userId: number): PlacementAssessmentPackInternal {
  const pack = buildPlacementAssessmentPackUnchecked(track, language, userId);

  // Runtime guard: INTERMEDIATE and ADVANCED should be mostly different
  // (allowed overlap is up to 2 for quiz and up to 2 for practical tasks).
  const intermediatePack = buildPlacementAssessmentPackUnchecked("INTERMEDIATE", language, userId);
  const advancedPack = buildPlacementAssessmentPackUnchecked("ADVANCED", language, userId);
  assertNonBeginnerOverlapPolicy(intermediatePack, advancedPack);

  return pack;
}

export function toPublicPlacementAssessmentPack(pack: PlacementAssessmentPackInternal): PlacementAssessmentPackPublic {
  return {
    track: pack.track,
    language: pack.language,
    quizQuestions: pack.quizQuestions.map((q) => ({
      id: q.id,
      promptUk: q.promptUk,
      promptEn: q.promptEn,
      optionsUk: q.optionsUk,
      optionsEn: q.optionsEn,
    })),
    tasks: pack.tasks.map((t) => ({
      id: t.id,
      titleUk: t.titleUk,
      titleEn: t.titleEn,
      promptUk: t.promptUk,
      promptEn: t.promptEn,
      starterCode: pack.language === "JAVA" ? t.starterCodeJava : pack.language === "CPP" ? t.starterCodeCpp : t.starterCodePython,
      language: pack.language,
      sampleInput: t.sampleInput,
      sampleOutput: t.sampleOutput,
    })),
  };
}

export function computePlacementLevelFromAssessment(track: PlacementAssessmentTrack, quizPct: number, practicalPassed: number, practicalTotal: number): PlacementAssessmentLevel {
  const practicalPct = practicalTotal > 0 ? (practicalPassed / practicalTotal) * 100 : 0;
  const overall = Math.round(quizPct * 0.4 + practicalPct * 0.6);

  if (track === "INTERMEDIATE") {
    return overall >= 65 && practicalPassed >= 3 ? "INTERMEDIATE" : "BEGINNER";
  }
  if (track === "ADVANCED") {
    if (overall >= 85 && practicalPassed >= 4) return "ADVANCED";
    if (overall >= 70 && practicalPassed >= 3) return "INTERMEDIATE";
    return "BEGINNER";
  }

  if (overall >= 85 && practicalPassed >= 4) return "ADVANCED";
  if (overall >= 70 && practicalPassed >= 3) return "INTERMEDIATE";
  return "BEGINNER";
}
