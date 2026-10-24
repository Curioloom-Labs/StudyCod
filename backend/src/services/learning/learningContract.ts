/**
 * Versioned learning contract shared by curriculum sync, task generation and
 * project readiness.  Keeping this data deterministic is intentional: an AI
 * model may phrase a task, but it must not decide which learning stage the
 * learner is in or silently remove the evidence required for that stage.
 */

export type PracticeStage = "FOUNDATION" | "EDGE_CASES" | "TRANSFER";

export type PracticeEvidence = {
  id: string;
  label: string;
  description: string;
};

export type PracticeContract = {
  version: 2;
  stage: PracticeStage;
  objective: string;
  taskIntent: string;
  evidence: PracticeEvidence[];
  minimumExamples: number;
  forbiddenShortcuts: string[];
};

export type OlympiadPracticeContract = {
  version: 3;
  kind: "OLYMPIAD_ALGORITHMIC_PRACTICE";
  courseKey: string;
  topicKey: string;
  runtime: "PYTHON" | "JAVA" | "CPP";
  stage: PracticeStage;
  sequence: number;
  total: number;
  algorithm: string;
  objective: string;
  coreOperation: string;
  requiredInput: string;
  requiredOutput: string;
  constraints: string;
  requiredCases: string[];
  variation: string;
  allowedScope: string[];
  forbiddenScope: string[];
  ioType: "STDIN_STDOUT";
};

/** Validate the hidden authoring contract before it can drive task generation. */
export function olympiadPracticeContractIssues(value: unknown, expectedRuntime?: string): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["CONTRACT_OBJECT_REQUIRED"];
  const contract = value as Record<string, unknown>;
  const issues: string[] = [];
  if (contract.kind !== "OLYMPIAD_ALGORITHMIC_PRACTICE" || contract.version !== 3) issues.push("CONTRACT_KIND_OR_VERSION_INVALID");
  if (typeof contract.courseKey !== "string" || !contract.courseKey.startsWith("olympiad-")) issues.push("COURSE_KEY_REQUIRED");
  if (typeof contract.topicKey !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(contract.topicKey)) issues.push("TOPIC_KEY_INVALID");
  if (contract.runtime !== "PYTHON" && contract.runtime !== "JAVA" && contract.runtime !== "CPP") issues.push("RUNTIME_INVALID");
  if (expectedRuntime && contract.runtime !== expectedRuntime.toUpperCase()) issues.push("RUNTIME_MISMATCH");

  const sequence = Number(contract.sequence);
  const total = Number(contract.total);
  if (!Number.isInteger(sequence) || !Number.isInteger(total) || sequence < 1 || total < 1 || sequence > total) {
    issues.push("PRACTICE_SEQUENCE_INVALID");
  } else if (contract.stage !== practiceStageFor(sequence, total)) {
    issues.push("PRACTICE_STAGE_MISMATCH");
  }

  for (const field of ["algorithm", "objective", "coreOperation", "requiredInput", "requiredOutput", "constraints", "variation"]) {
    if (typeof contract[field] !== "string" || !contract[field].trim()) issues.push(`${field.toUpperCase()}_REQUIRED`);
  }
  const hasStringItems = (candidate: unknown): candidate is string[] => Array.isArray(candidate)
    && candidate.every((item) => typeof item === "string" && item.trim().length > 0);
  if (!hasStringItems(contract.requiredCases) || contract.requiredCases.length < 3) issues.push("AT_LEAST_THREE_REQUIRED_CASES");
  if (!hasStringItems(contract.allowedScope) || contract.allowedScope.length === 0) issues.push("ALLOWED_SCOPE_REQUIRED");
  if (!hasStringItems(contract.forbiddenScope)) issues.push("FORBIDDEN_SCOPE_INVALID");
  if (contract.ioType !== "STDIN_STDOUT") issues.push("STDIN_STDOUT_REQUIRED");
  return issues;
}

/** Read the hidden Olympiad contract embedded in the AI theory context. */
export function parseOlympiadPracticeContract(raw: string): OlympiadPracticeContract | null {
  const match = String(raw ?? "").match(/<!--\s*STUDYCOD_LEARNING_META_START([\s\S]*?)STUDYCOD_LEARNING_META_END\s*-->/i);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1].trim()) as Partial<OlympiadPracticeContract>;
    if (olympiadPracticeContractIssues(value).length > 0) return null;
    return value as OlympiadPracticeContract;
  } catch {
    return null;
  }
}

export type ProjectAssessmentMode = "EXACT_IO" | "WEB_BEHAVIOR" | "STATIC_REVIEW";

export type ProjectAssessmentContract = {
  version: 2;
  mode: ProjectAssessmentMode;
  requiredEvidence: PracticeEvidence[];
  checkBeforeSubmit: boolean;
};

/** A Judge-based course capstone passes only with full score; regular practice keeps the 60% mastery threshold. */
export function courseItemScorePasses(score: number | null | undefined, requiresFullScore = false): boolean {
  if (score == null) return !requiresFullScore;
  return Number.isFinite(score) && score >= (requiresFullScore ? 100 : 60);
}

function normalized(value: string, fallback: string): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

export function practiceStageFor(sequence: number, total: number): PracticeStage {
  if (total <= 1 || sequence <= 1) return "FOUNDATION";
  if (sequence >= total) return "TRANSFER";
  return "EDGE_CASES";
}

export function buildPracticeContract(input: {
  courseKey: string;
  topicKey: string;
  topicTitle: string;
  topicDescription?: string;
  exerciseFocus?: string;
  sequence: number;
  total: number;
}): PracticeContract {
  const stage = practiceStageFor(input.sequence, input.total);
  const topic = normalized(input.topicTitle, "поточну тему");
  const objective = normalized(
    input.exerciseFocus || input.topicDescription || "Закріпити ключову навичку теми через код.",
    `Закріпити навичку теми «${topic}».`,
  );

  if (stage === "FOUNDATION") {
    return {
      version: 2,
      stage,
      objective,
      taskIntent: `Реалізуйте базовий сценарій за темою «${topic}» із чітким вводом, обробкою та результатом. Спочатку доведіть, що основний випадок працює, а потім поясніть ключове рішення.`,
      evidence: [
        { id: "happy-path", label: "Основний сценарій", description: "Рішення працює на типовому валідному прикладі." },
        { id: "explanation", label: "Пояснення рішення", description: "Учень може пояснити роль основних конструкцій у коді." },
      ],
      minimumExamples: 3,
      forbiddenShortcuts: ["Не підставляйте очікуваний результат константою.", "Не копіюйте готове рішення без пояснення."],
    };
  }

  if (stage === "EDGE_CASES") {
    return {
      version: 2,
      stage,
      objective,
      taskIntent: `Розширте рішення за темою «${topic}» граничними, порожніми та помилковими даними. Перевірте, що програма не ламається і зберігає визначений контракт.`,
      evidence: [
        { id: "edge-cases", label: "Граничні випадки", description: "Рішення обробляє мінімальні, порожні або повторні дані." },
        { id: "invalid-input", label: "Помилкові дані", description: "Некоректний сценарій має контрольовану поведінку." },
        { id: "regression", label: "Регресійна перевірка", description: "Після додавання перевірок основний сценарій не зламаний." },
      ],
      minimumExamples: 5,
      forbiddenShortcuts: ["Не видаляйте обробку помилок заради проходження основного прикладу.", "Не використовуйте один і той самий приклад для всіх перевірок."],
    };
  }

  return {
    version: 2,
    stage,
    objective,
    taskIntent: `Застосуйте навичку «${topic}» у новому контексті: спроєктуйте невелике рішення, обґрунтуйте структуру та покажіть, як воно взаємодіє з іншими вивченими конструкціями.`,
    evidence: [
      { id: "transfer", label: "Новий контекст", description: "Рішення переносить навичку на сценарій, якого не було в теорії." },
      { id: "design-choice", label: "Проєктне рішення", description: "Є свідомо обране розбиття на кроки, функції або модулі." },
      { id: "verification", label: "Самоперевірка", description: "Учень додає власні перевірки та описує відоме обмеження." },
    ],
    minimumExamples: 4,
    forbiddenShortcuts: ["Не зводьте задачу до копіювання прикладу з теорії.", "Не вважайте компіляцію або запуск доказом коректності."],
  };
}

/**
 * Contract for generated Judge problems in the Olympiad track. The problem
 * statement and tests remain AI-generated; this contract keeps each generated
 * variant attached to the lesson's actual algorithm and input/output shape.
 */
type OlympiadPracticeContractInput = {
  courseKey: string;
  topicKey: string;
  topicTitle: string;
  runtime: "PYTHON" | "JAVA" | "CPP";
  objective: string;
  sequence: number;
  total: number;
};

function buildOlympiadPracticeContractBase(input: OlympiadPracticeContractInput): OlympiadPracticeContract {
  const stage = practiceStageFor(input.sequence, input.total);
  const objective = normalized(input.objective, `Розв'язати задачу з теми «${input.topicTitle}».`);
  const shared = {
    version: 3 as const,
    kind: "OLYMPIAD_ALGORITHMIC_PRACTICE" as const,
    courseKey: input.courseKey,
    topicKey: input.topicKey,
    runtime: input.runtime,
    stage,
    sequence: input.sequence,
    total: input.total,
    objective,
    ioType: "STDIN_STDOUT" as const,
    variation: stage === "FOUNDATION"
      ? "Direct implementation: use a canonical input shape and ordinary valid data so the learner can focus on implementing the target operation correctly."
      : stage === "EDGE_CASES"
        ? "Boundary diagnosis: use a distinct valid problem context that emphasizes meaningful boundaries of the target algorithm, such as one-element, negative, repeated, or boundary ranges where relevant. Include required cases that make a plausible boundary misconception produce a wrong answer; keep the exercise Judgeable and do not ask for an explanation instead of a program."
        : "Independent transfer: use a fresh, realistic, non-obvious context that asks the learner to infer and choose the relevant taught approach without naming it in the statement. Keep the input/output contract and algorithmic scope unchanged; do not add an unlearned technique.",
    allowedScope: [
      "one complete program for the selected runtime",
      "the target algorithm and prerequisite language constructs already used in the lesson",
      "stdin/stdout with deterministic output",
    ],
    forbiddenScope: [
      "function-only or project-only submissions",
      "invalid-input behavior unless the lesson objective explicitly requires it",
      "unrelated algorithms or data structures not required by the lesson objective",
      "explanation-only output, multiple independent tasks, or non-deterministic answers",
    ],
  };

  if (input.topicKey === "contest-workflow") {
    return {
      ...shared,
      algorithm: "apply an explicit Judge-verdict precedence to one submission report",
      coreOperation: "Read the compilation flag, runtime flag, measured time and memory, their limits, and the output-match flag; print exactly one Judge verdict.",
      requiredInput: "Read seven space-separated values: compileOk, runtimeOk, timeMs, timeLimitMs, memoryMb, memoryLimitMb, outputMatches. Flags are 0 or 1; resource measurements are non-negative integers and limits are positive integers.",
      requiredOutput: "Print one verdict using this priority: CE if compilation failed; otherwise RE if runtime failed; otherwise TLE if timeMs > timeLimitMs; otherwise MLE if memoryMb > memoryLimitMb; otherwise WA if outputs differ; otherwise AC.",
      constraints: "All flags are in {0,1}; 0 ≤ timeMs,memoryMb ≤ 10^9 and 1 ≤ timeLimitMs,memoryLimitMb ≤ 10^9. Equality with a limit is within the limit. outputMatches is 1 exactly when output is correct.",
      requiredCases: ["each verdict", "priority when multiple failures are present", "time exactly at its limit", "memory exactly at its limit", "all checks pass"],
    };
  }
  if (input.topicKey === "constraints-and-complexity") {
    return {
      ...shared,
      algorithm: "compare the n² operation estimate with a stated operation budget using a wide integer calculation",
      coreOperation: "Read a problem size n and an operation budget, then report whether n² operations fit the budget.",
      requiredInput: "Read two integers n and budget on one line, where 1 ≤ n ≤ 10^9 and 1 ≤ budget ≤ 10^18.",
      requiredOutput: "Print SAFE when n² ≤ budget; otherwise print TOO_SLOW. Equality is SAFE.",
      constraints: "The comparison must be exact for all valid inputs. n² is at most 10^18 and fits a signed 64-bit integer; use a 64-bit type in Java and C++.",
      requiredCases: ["small n", "n² exactly equals the budget", "budget one below n²", "budget above n²", "maximum n"],
    };
  }
  if (input.topicKey === "language-runtime") {
    return {
      ...shared,
      algorithm: "process a large whitespace-separated numeric input with the selected runtime's suitable fast input/output and accumulate a sum",
      coreOperation: "Read n integer measurements and print their total.",
      requiredInput: "Read n (1 ≤ n ≤ 2000000), followed by n integers x with |x| ≤ 10^9; values may be separated by any whitespace.",
      requiredOutput: "Print one integer equal to the sum of all n measurements.",
      constraints: "The input may contain two million values, so use an efficient runtime-appropriate input path and avoid unnecessary copies. The absolute sum is at most 2·10^15 and fits a signed 64-bit integer.",
      requiredCases: ["one measurement", "all zeros", "negative measurements", "mixed signs", "large input", "sum outside 32-bit range"],
    };
  }
  if (input.topicKey === "array-traversal") {
    return {
      ...shared,
      algorithm: "one-pass array traversal that counts and sums positive values",
      coreOperation: "Read an integer array and print the number of positive values and their sum.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integers a[i] with |a[i]| ≤ 10^9.",
      requiredOutput: "Print two integers: the count of values greater than zero, then the sum of those positive values. If there are none, print 0 0.",
      constraints: "Visit each array element once and keep only two accumulators. The sum is at most 2·10^14 and fits a signed 64-bit integer.",
      requiredCases: ["one value", "no positive values", "all positive values", "zeros are not positive", "positive values at both endpoints", "large positive sum"],
    };
  }
  if (input.topicKey === "extrema-and-counts") {
    return {
      ...shared,
      algorithm: "single-pass minimum and maximum tracking with a frequency count for the maximum",
      coreOperation: "Read a non-empty integer array and print its minimum, maximum, and the number of occurrences of that maximum.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integers a[i] with |a[i]| ≤ 10^9.",
      requiredOutput: "Print three integers: the minimum value, the maximum value, and how many array elements equal the maximum.",
      constraints: "Use O(n) time and O(1) extra space. Initialize extrema from the first value (or an equivalent valid sentinel strategy); do not assume values are non-negative.",
      requiredCases: ["one value", "all values equal", "all values negative", "maximum occurs once", "maximum occurs repeatedly", "minimum and maximum at endpoints"],
    };
  }
  if (input.topicKey === "interval-basics") {
    return {
      ...shared,
      algorithm: "linear scan of one 1-based inclusive array interval",
      coreOperation: "Read an integer array and inclusive bounds l and r, then sum exactly the elements at positions l through r.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), then n integers a[i] with |a[i]| ≤ 10^9, then l and r with 1 ≤ l ≤ r ≤ n.",
      requiredOutput: "Print one integer: a[l] + a[l+1] + … + a[r] using the statement's 1-based positions.",
      constraints: "The interval contains r-l+1 elements. A direct scan in O(r-l+1) time is intended; the answer fits a signed 64-bit integer. The interval is contiguous and includes both endpoints.",
      requiredCases: ["single-element interval", "whole array", "first position included", "last position included", "negative values", "interval strictly inside the array"],
    };
  }
  if (input.topicKey === "boundary-debugging") {
    return {
      ...shared,
      algorithm: "bounded adjacent-pair scan over indices 0 through n-2",
      coreOperation: "Count equal neighboring pairs in the array without reading outside its valid index range.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integers a[i] with |a[i]| ≤ 10^9.",
      requiredOutput: "Print the number of indices i for which 0 ≤ i < n-1 and a[i] = a[i+1].",
      constraints: "Use a loop whose last compared pair is (n-2,n-1). When n=1 there are no neighboring pairs and the answer is 0. Do not inspect a[n] or skip the final valid pair.",
      requiredCases: ["n equals one", "no equal neighbors", "every neighbor is equal", "only the first pair is equal", "only the last pair is equal", "repeated values separated by another value"],
    };
  }
  if (input.topicKey === "prefix-transformations") {
    return {
      ...shared,
      algorithm: "prefix sums over a 0/1 indicator that marks odd array values",
      coreOperation: "Transform each value into 1 when it is odd and 0 when it is even, then answer how many odd values occur in each inclusive range.",
      requiredInput: "Read n and q (1 ≤ n,q ≤ 200000), then n integers a[i] with |a[i]| ≤ 10^9, followed by q pairs of 1-based inclusive bounds l r with 1 ≤ l ≤ r ≤ n.",
      requiredOutput: "Print q lines; each line is the count of odd original values in that query's range.",
      constraints: "Build a prefix sum of the indicator value (a[i] is odd ? 1 : 0), then answer each query in O(1) as P[r]-P[l-1]. Handle negative odd values correctly. The total complexity is O(n+q) time and O(n) memory.",
      requiredCases: ["single-element range", "whole array", "all even values", "all odd values", "negative odd values", "first and last positions", "repeated queries"],
    };
  }
  if (input.topicKey === "fixed-window-sum") {
    return {
      ...shared,
      algorithm: "rolling sum for every contiguous window of a fixed length k",
      coreOperation: "Find the greatest sum among all contiguous subarrays containing exactly k elements.",
      requiredInput: "Read n and k (1 ≤ k ≤ n ≤ 200000), followed by n integers a[i] with |a[i]| ≤ 10^9.",
      requiredOutput: "Print one integer: the maximum sum of any length-k contiguous window.",
      constraints: "Compute the first window once; for each next position subtract the departing value and add the entering value. Use O(n) time and O(1) extra algorithm space. The answer fits a signed 64-bit integer.",
      requiredCases: ["k equals one", "k equals n", "all negative values", "negative values mixed with positive values", "optimal window at the beginning", "optimal window at the end", "equal best windows"],
    };
  }
  if (input.topicKey === "sorting-purpose") {
    return {
      ...shared,
      algorithm: "comparison sorting of all input values in non-decreasing order",
      coreOperation: "Read an integer array, sort its values, and print the complete sorted sequence.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integers a[i] with |a[i]| ≤ 10^9.",
      requiredOutput: "Print all n values in non-decreasing order on one line, separated by single spaces.",
      constraints: "The output must contain every input value with its original multiplicity. Use an O(n log n) comparison sort or a runtime library sort; do not modify counts or omit duplicate values.",
      requiredCases: ["one value", "already sorted", "reverse sorted", "duplicate values", "negative and positive values", "all values equal"],
    };
  }
  if (input.topicKey === "binary-search") {
    return {
      ...shared,
      algorithm: "iterative binary search with a shrinking inclusive candidate interval",
      coreOperation: "Search a sorted array for a target and return one 1-based position where it occurs, or -1 when absent.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), then n integers in non-decreasing order, followed by target x; values satisfy |a[i]|,|x| ≤ 10^9.",
      requiredOutput: "Print any 1-based index whose value equals x, or -1 if no array value equals x.",
      constraints: "Each comparison must discard at least half of the remaining candidate positions; use O(log n) search time after reading the array. Duplicate targets may return any matching index.",
      requiredCases: ["target at first position", "target at last position", "target absent below minimum", "target absent above maximum", "duplicate target values", "one-element array"],
    };
  }
  if (input.topicKey === "lower-upper-bound") {
    return {
      ...shared,
      algorithm: "lower bound for the first value ≥ L and upper bound for the first value > R",
      coreOperation: "For each value range [L,R], count elements of a sorted array whose values lie in that inclusive range.",
      requiredInput: "Read n and q (1 ≤ n,q ≤ 200000), then n integers in non-decreasing order with |a[i]| ≤ 10^9, followed by q pairs L R with -10^9 ≤ L ≤ R ≤ 10^9.",
      requiredOutput: "Print q lines; each is the number of array elements x satisfying L ≤ x ≤ R for that query.",
      constraints: "For each query compute lower_bound(L) and upper_bound(R); their index difference is the answer. The total query work is O(q log n), not a scan of each range.",
      requiredCases: ["empty value range", "all values included", "duplicate boundary values", "range below all values", "range above all values", "L equals R", "repeated queries"],
    };
  }
  if (input.topicKey === "answer-search") {
    return {
      ...shared,
      algorithm: "binary search over a monotone capacity predicate with greedy contiguous grouping",
      coreOperation: "Partition the ordered positive job sizes into at most k contiguous groups while minimizing the largest group sum.",
      requiredInput: "Read n and k (1 ≤ k ≤ n ≤ 200000), followed by n positive job sizes a[i] with 1 ≤ a[i] ≤ 10^9.",
      requiredOutput: "Print the minimum possible maximum group sum when jobs must stay in input order and each group is non-empty.",
      constraints: "For a candidate capacity C, greedily start a new group when adding the next job would exceed C. Feasibility is monotone; binary search C from max(a[i]) through sum(a[i]). Use 64-bit sums. Overall target complexity is O(n log(sum(a))).",
      requiredCases: ["k equals one", "k equals n", "one job dominates the sum", "optimal answer equals a job size", "a capacity just below feasibility", "many equal job sizes"],
    };
  }
  if (input.topicKey === "maps-and-sets") {
    return {
      ...shared,
      algorithm: "frequency map keyed by input value, tracking distinct keys and the greatest frequency",
      coreOperation: "Count each integer's occurrences and print the number of distinct values and the largest frequency.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integers x with |x| ≤ 10^9.",
      requiredOutput: "Print two integers: the number of distinct values and the maximum frequency of any one value.",
      constraints: "Update one frequency per input value using a hash map or ordered map. Expected hash-map time is O(n); memory is O(d), where d is the number of distinct values.",
      requiredCases: ["all values distinct", "all values equal", "negative keys", "one value", "maximum frequency tied", "large number of distinct keys"],
    };
  }
  if (input.topicKey === "stack-patterns") {
    return {
      ...shared,
      algorithm: "stack-based validation of properly nested parentheses, square brackets, and braces",
      coreOperation: "Determine whether every opening bracket is closed by the same bracket type in last-opened-first-closed order.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), then a string of exactly n characters drawn from (), [], and {}.",
      requiredOutput: "Print YES if the bracket string is properly balanced and nested; otherwise print NO.",
      constraints: "Push opening brackets. On a closing bracket, the stack must be non-empty and its top must be the matching opener. At the end the stack must be empty. Use O(n) time and O(n) worst-case space.",
      requiredCases: ["proper nesting", "crossed bracket types", "closing bracket first", "opening bracket left unmatched", "odd length", "repeated nested pairs"],
    };
  }
  if (input.topicKey === "queue-patterns") {
    return {
      ...shared,
      algorithm: "FIFO queue simulation for enqueue and serve commands",
      coreOperation: "Append arriving integer IDs to a queue and serve the oldest waiting ID for each service command.",
      requiredInput: "Read q (1 ≤ q ≤ 200000), followed by q commands: ADD x with |x| ≤ 10^9, or SERVE. Every SERVE command is guaranteed to have a waiting ID.",
      requiredOutput: "Print each served ID on its own line in service order; if there is no SERVE command, print EMPTY.",
      constraints: "Use a FIFO queue with amortized O(1) append and removal from the front. Do not sort IDs or remove the newest arrival.",
      requiredCases: ["one arrival and one service", "multiple waiting IDs", "interleaved arrivals and services", "negative IDs", "no service commands", "service after previous queue empties"],
    };
  }
  if (input.topicKey === "deque-selection") {
    return {
      ...shared,
      algorithm: "double-ended queue simulation with constant-time insertion and removal at either end",
      coreOperation: "Execute push-front, push-back, pop-front, and pop-back commands and report removed values in command order.",
      requiredInput: "Read q (1 ≤ q ≤ 200000), followed by q commands: PF x, PB x, OF, or OB. Values satisfy |x| ≤ 10^9; every removal is guaranteed to have an element available.",
      requiredOutput: "Print values removed by OF and OB in command order, separated by spaces; print EMPTY if there were no removal commands.",
      constraints: "Use a deque that supports both ends in amortized O(1). Preserve order among elements that remain between end operations; do not emulate front removal by shifting an array.",
      requiredCases: ["push and pop at the front", "push and pop at the back", "mixed operations at both ends", "one remaining element", "negative values", "no pop commands"],
    };
  }
  if (input.topicKey === "two-pointers-sorted") {
    return {
      ...shared,
      algorithm: "two pointers moving inward over a non-decreasing array to find a pair with a target sum",
      coreOperation: "Find two distinct positions whose values sum to target, or report that no pair exists.",
      requiredInput: "Read n (2 ≤ n ≤ 200000), then n integers in non-decreasing order with |a[i]| ≤ 10^9, followed by target x with |x| ≤ 2·10^9.",
      requiredOutput: "Print two distinct 1-based indices i j with a[i]+a[j]=x; print -1 -1 if no such pair exists. Any valid pair is accepted.",
      constraints: "Start at both ends. If the sum is too small move the left pointer right; if too large move the right pointer left. Each move discards pairs that cannot work. Use O(n) time and O(1) extra space.",
      requiredCases: ["pair uses both endpoints", "no pair exists", "duplicate values at different positions", "negative values", "target below all pairs", "target above all pairs"],
    };
  }
  if (input.topicKey === "sliding-window") {
    return {
      ...shared,
      algorithm: "variable-size sliding window counting subarrays with sum at most a budget",
      coreOperation: "Count all non-empty contiguous subarrays whose sum does not exceed a given budget.",
      requiredInput: "Read n and budget S (1 ≤ n ≤ 200000, 0 ≤ S ≤ 10^18), followed by n non-negative integers a[i] with 0 ≤ a[i] ≤ 10^9.",
      requiredOutput: "Print the number of non-empty contiguous subarrays with sum ≤ S.",
      constraints: "For each right endpoint, extend the window and move left while its sum exceeds S. Non-negative values make validity monotone as the left endpoint moves. Add right-left+1 valid windows per step. Use a 64-bit answer; total work is O(n).",
      requiredCases: ["all zero values", "budget zero", "one-element array", "every window valid", "no one-element window fits", "left pointer moves repeatedly", "answer exceeds 32-bit range"],
    };
  }
  if (input.topicKey === "longest-valid-window") {
    return {
      ...shared,
      algorithm: "sliding window for the longest positive-value subarray with sum at most a budget",
      coreOperation: "Find the longest non-empty contiguous interval whose sum is at most the budget; break ties by smallest left index.",
      requiredInput: "Read n and budget S (1 ≤ n ≤ 200000, 0 ≤ S ≤ 2·10^14), followed by n positive integers 1 ≤ a[i] ≤ 10^9.",
      requiredOutput: "Print length, left index, and right index as 1-based integers; print 0 0 0 if no non-empty interval is valid. On equal lengths choose the smallest left index.",
      constraints: "Maintain a window with sum ≤ S by advancing the left pointer while needed. Positivity ensures removing left values never increases the sum. Use O(n) time and O(1) extra algorithm space; sums need 64-bit storage.",
      requiredCases: ["budget below every value", "whole array fits", "optimal window begins at first position", "optimal window ends at last position", "equal-length optimal windows", "large sums"],
    };
  }
  if (input.topicKey === "shortest-valid-window") {
    return {
      ...shared,
      algorithm: "two-pointer shrinking window for the shortest positive-value subarray with sum at least a target",
      coreOperation: "Find a shortest non-empty contiguous interval whose sum is at least target; break ties by smallest left index.",
      requiredInput: "Read n and target T (1 ≤ n ≤ 200000, 1 ≤ T ≤ 10^18), followed by n positive integers 1 ≤ a[i] ≤ 10^9.",
      requiredOutput: "Print length, left index, and right index as 1-based integers; print -1 if no interval reaches T. On equal lengths choose the smallest left index.",
      constraints: "Extend the right end until sum ≥ T, then repeatedly record and shrink from the left while the condition remains true. Positivity makes this safe. Use O(n) time and O(1) extra algorithm space with 64-bit sums.",
      requiredCases: ["one element reaches target", "whole array is the only valid interval", "no interval reaches target", "shortest interval lies inside", "multiple shortest intervals", "target equals an interval sum"],
    };
  }
  if (input.topicKey === "divisors-and-gcd") {
    return {
      ...shared,
      algorithm: "paired divisor enumeration up to sqrt(n), counting each divisor and its complementary partner once",
      coreOperation: "Count all positive divisors of n and compute their sum.",
      requiredInput: "Read one integer n with 1 ≤ n ≤ 10^12.",
      requiredOutput: "Print two integers: the number of positive divisors of n and the sum of those divisors.",
      constraints: "Check divisors d while d ≤ n/d to avoid overflow in d*d. If d divides n, count d and also n/d when they differ. Target O(sqrt(n)) time and O(1) extra space; the divisor sum fits signed 64-bit for this bound.",
      requiredCases: ["n equals one", "prime n", "perfect square", "two complementary divisors", "many divisors", "maximum n"],
    };
  }
  if (input.topicKey === "euclidean-algorithm") {
    return {
      ...shared,
      algorithm: "iterative Euclidean algorithm applied across a sequence of non-negative integers",
      coreOperation: "Compute the greatest common divisor shared by every value in the input sequence.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n non-negative integers x with 0 ≤ x ≤ 10^18.",
      requiredOutput: "Print the greatest common divisor of all n values; gcd(0,0,…,0) is defined as 0.",
      constraints: "Fold gcd over the sequence; each pair uses the invariant gcd(a,b)=gcd(b,a mod b) until the second value is zero. Target O(n log A) time and O(1) extra space.",
      requiredCases: ["one value", "all values zero", "one zero and one positive", "coprime values", "shared non-trivial factor", "large values"],
    };
  }
  if (input.topicKey === "prime-sieve") {
    return {
      ...shared,
      algorithm: "Eratosthenes sieve that marks composite multiples starting at p*p",
      coreOperation: "Print every prime number from 2 through the inclusive limit n.",
      requiredInput: "Read one integer n with 1 ≤ n ≤ 2000000.",
      requiredOutput: "Print all primes p with 2 ≤ p ≤ n in ascending order separated by spaces; print EMPTY if the list is empty.",
      constraints: "Initially treat values as prime; for each unmarked p with p*p ≤ n, mark p*p, p*p+p, … as composite. Target O(n log log n) time and O(n) memory.",
      requiredCases: ["n equals one", "n equals two", "small prime limit", "perfect-square boundary", "prime and composite neighbors", "maximum n"],
    };
  }
  if (input.topicKey === "factorization") {
    return {
      ...shared,
      algorithm: "trial division by candidate prime factors, recording each factor and its multiplicity",
      coreOperation: "Express n as prime factors with exponents in ascending prime order.",
      requiredInput: "Read one integer n with 1 ≤ n ≤ 10^12.",
      requiredOutput: "Print k, the number of distinct prime factors, followed by k pairs p e where p^e divides n and p is prime. For n=1 print only 0.",
      constraints: "Try 2, then odd candidates while p ≤ remaining/p; divide out each factor completely before continuing. Any final remaining value greater than one is prime. Target O(sqrt(n)) trial divisions and O(log n) output space.",
      requiredCases: ["n equals one", "prime n", "prime power", "product of distinct primes", "repeated factors with a remaining large prime", "maximum n"],
    };
  }
  if (input.topicKey === "modular-arithmetic") {
    return {
      ...shared,
      algorithm: "binary exponentiation with normalized base and multiplication modulo m",
      coreOperation: "Compute a^b modulo m for a possibly negative base and a non-negative exponent.",
      requiredInput: "Read integers a, b, m where -10^18 ≤ a ≤ 10^18, 0 ≤ b ≤ 10^18, and 1 ≤ m ≤ 10^9.",
      requiredOutput: "Print the unique residue r with 0 ≤ r < m and r congruent to a^b modulo m.",
      constraints: "Normalize a into [0,m), then use repeated squaring and reduce after each multiplication. For m ≤ 10^9, products of residues fit signed 64-bit. Target O(log b) time and O(1) extra space; define the result for b=0 as 1 mod m.",
      requiredCases: ["zero exponent", "modulus one", "negative base", "base divisible by modulus", "large exponent", "small prime modulus"],
    };
  }
  if (input.topicKey === "activity-selection") {
    return {
      ...shared,
      algorithm: "earliest-finish-time greedy selection of pairwise compatible half-open intervals",
      coreOperation: "Select a maximum-size subset of activities that can be performed without overlap.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n pairs start finish with -10^9 ≤ start < finish ≤ 10^9.",
      requiredOutput: "Print the selected count, then the 1-based input IDs in selection order. Sort ties by finish, start, then ID for deterministic output.",
      constraints: "Sort by finish time and accept an activity when start ≥ the finish of the last selected activity. This is an O(n log n) algorithm with O(n) storage; adjacent half-open intervals are compatible.",
      requiredCases: ["all activities overlap", "activities touch at an endpoint", "negative start times", "equal finish times", "already compatible activities", "maximum n"],
    };
  }
  if (input.topicKey === "interval-stabbing") {
    return {
      ...shared,
      algorithm: "right-endpoint greedy placement for a minimum point cover of closed intervals",
      coreOperation: "Find a minimum set of integer points that intersects every closed interval.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integer pairs l r with -10^9 ≤ l ≤ r ≤ 10^9.",
      requiredOutput: "Print the minimum point count, then the selected integer points in ascending order.",
      constraints: "Sort intervals by r then l. If the last selected point is outside the current closed interval [l,r], add r. The greedy scan takes O(n log n) time and O(n) storage.",
      requiredCases: ["nested intervals", "intervals touching at one endpoint", "disjoint intervals", "singleton intervals", "equal right endpoints", "negative coordinates"],
    };
  }
  if (input.topicKey === "deadline-ordering") {
    return {
      ...shared,
      algorithm: "earliest-due-date ordering to minimize maximum lateness on one non-preemptive machine",
      coreOperation: "Compute the minimum possible maximum lateness max(completionTime - deadline) for all jobs.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n pairs duration deadline with 1 ≤ duration ≤ 10^9 and 0 ≤ deadline ≤ 10^14.",
      requiredOutput: "Print the minimum possible maximum lateness as a signed integer; the answer may be negative if every job finishes early.",
      constraints: "Order jobs by non-decreasing deadline, breaking ties by input order, accumulate completion times, and maximize completionTime-deadline. Total processing time is at most 2·10^14; use signed 64-bit values. Target O(n log n) time and O(n) storage.",
      requiredCases: ["all jobs finish before deadlines", "a job is late", "equal deadlines", "duration order differs from deadline order", "large total duration", "one job"],
    };
  }
  if (input.topicKey === "greedy-simulation") {
    return {
      ...shared,
      algorithm: "descending-denomination simulation of the largest-fitting-coin greedy rule",
      coreOperation: "Report the number of coins selected by the greedy rule and the amount left over.",
      requiredInput: "Read k and amount (1 ≤ k ≤ 100, 0 ≤ amount ≤ 10^12), then k distinct positive integer denominations, each at most 10^9.",
      requiredOutput: "Print two integers: the total number of coins selected and the remaining amount after the greedy simulation.",
      constraints: "Sort denominations in descending order. For each coin c, take amount/c coins and replace amount by amount%c. This only simulates the stated rule and does not assert minimum coin count. Target O(k log k) time and O(k) storage.",
      requiredCases: ["non-canonical system where greedy is not optimal", "amount zero", "amount below the smallest denomination", "exactly divisible amount", "largest denomination exceeds amount", "large amount"],
    };
  }
  if (input.topicKey === "dp-min-cost-stairs") {
    return {
      ...shared,
      algorithm: "one-dimensional minimum-cost path DP with transitions from the previous one or two positions",
      coreOperation: "Find the minimum landing cost to reach position n from position 0 using jumps of length one or two.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), then n signed landing costs with |cost[i]| ≤ 10^9.",
      requiredOutput: "Print the minimum total landing cost from position 0 to n; position 0 is a free start and is not charged.",
      constraints: "Define dp[0]=0; dp[1]=cost[1]; for i≥2 use dp[i]=cost[i]+min(dp[i-1],dp[i-2]). Use signed 64-bit values. Target O(n) time and O(n) state storage.",
      requiredCases: ["one step", "two steps", "negative landing costs", "best route uses a two-step jump", "equal predecessor costs", "maximum n"],
    };
  }
  if (input.topicKey === "one-dimensional-counting") {
    return {
      ...shared,
      algorithm: "one-dimensional counting DP partitioned by the final jump of length one or two",
      coreOperation: "Count routes to step n when each move advances one or two positions.",
      requiredInput: "Read n with 0 ≤ n ≤ 2000000.",
      requiredOutput: "Print the number of routes modulo 1000000007; for n=0 count the empty route as one way.",
      constraints: "Set dp[0]=1 and add dp[i-1] plus dp[i-2] when i≥2, reducing modulo 1000000007 after each addition. Target O(n) time and O(n) memory.",
      requiredCases: ["n equals zero", "n equals one", "small even and odd n", "modular reduction", "maximum n"],
    };
  }
  if (input.topicKey === "dp-max-nonadjacent") {
    return {
      ...shared,
      algorithm: "one-dimensional maximum DP choosing between skipping an element and taking it after the previous position",
      coreOperation: "Find the maximum sum of selected array values with no two selected positions adjacent; the empty set is allowed.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), then n signed integers a[i] with |a[i]| ≤ 10^9.",
      requiredOutput: "Print the maximum achievable sum; selecting no values is allowed and yields zero.",
      constraints: "For each value compare the previous best with the best two positions back plus a[i]. Keep two states for O(n) time and O(1) extra space. Use signed 64-bit sums.",
      requiredCases: ["all values negative", "one positive value", "two adjacent large values", "alternating positive values", "equal take-or-skip choices", "maximum n"],
    };
  }
  if (input.topicKey === "reconstruct-answer") {
    return {
      ...shared,
      algorithm: "unbounded minimum-coin DP over target amounts with a predecessor denomination for reconstruction",
      coreOperation: "Find a minimum-size multiset of unlimited coins whose denominations sum to the target, or report that it is impossible.",
      requiredInput: "Read k and target (1 ≤ k ≤ 100, 0 ≤ target ≤ 100000), followed by k distinct positive denominations c with 1 ≤ c ≤ 100000.",
      requiredOutput: "If reachable, print the minimum coin count and then one optimal set of denominations in non-decreasing order; print -1 if unreachable. For target=0 print 0 and an empty second line.",
      constraints: "Initialize dp[0]=0 and other amounts as unreachable. For each coin, scan amounts upward so it may be reused; save the last coin on every strict improvement. Follow predecessors to reconstruct. Target O(k·target) time and O(target) memory.",
      requiredCases: ["target equals zero", "exactly one coin", "multiple optimal sets", "unreachable target", "coin larger than target", "minimum uses a repeated coin"],
    };
  }
  if (input.topicKey === "memory-optimized-counting") {
    return {
      ...shared,
      algorithm: "route-counting DP with a sliding sum and a k+1 circular buffer",
      coreOperation: "Count routes to n when each jump advances from one through k positions using only O(k) stored states.",
      requiredInput: "Read n and k with 0 ≤ n ≤ 2000000 and 1 ≤ k ≤ 200000.",
      requiredOutput: "Print the number of routes modulo 1000000007; for n=0 count the empty route as one way.",
      constraints: "Each dp[i] is the sum of the previous k states. Add the new state to the window and subtract dp[i-k] when it leaves; store states in a circular buffer of length k+1. Target O(n) time and O(k) memory.",
      requiredCases: ["n equals zero", "k equals one", "k is at least n", "window removes a state", "modular subtraction", "maximum n and k"],
    };
  }
  if (input.topicKey === "read-constraints-first") {
    return {
      ...shared,
      algorithm: "choose prefix sums over repeated scans after comparing n, q, and the operation budget",
      coreOperation: "Answer many inclusive range-sum queries on one array while meeting the stated operation budget.",
      requiredInput: "Read n and q (1 ≤ n,q ≤ 200000), then n signed integers a[i] with |a[i]| ≤ 10^9, followed by q 1-based inclusive query pairs l r.",
      requiredOutput: "Print q lines; each line contains the sum of a[l] through a[r] for that query.",
      constraints: "The total input size is O(n+q), but scanning every queried range can require O(nq) work and exceeds the 2·10^8 operation budget. Build prefix sums once and answer each query in O(1), for O(n+q) total time and O(n) memory. Use signed 64-bit sums outside Python.",
      requiredCases: ["one-element query", "whole-array query", "repeated and overlapping queries", "negative values", "first and last index", "maximum n and q"],
    };
  }
  if (input.topicKey === "choose-representation") {
    return {
      ...shared,
      algorithm: "event-sweep representation of inclusive integer intervals using ordered coordinate-delta pairs",
      coreOperation: "Find the largest number of active reservations on any integer day and the earliest day attaining that maximum.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), then n inclusive integer intervals l r with -10^9 ≤ l ≤ r ≤ 10^9.",
      requiredOutput: "Print two integers: the maximum number of intervals covering one day and the earliest day when that maximum occurs.",
      constraints: "Represent each interval by +1 at l and -1 at r+1, sort events by coordinate, combine all deltas at the same coordinate, then update the active count. The sweep takes O(n log n) time and O(n) memory; r+1 fits a signed 64-bit integer. A dense array indexed by the coordinate range is not viable.",
      requiredCases: ["one interval", "nested intervals", "intervals touching at one day", "negative coordinates", "equal start and end coordinates", "multiple days tied for the maximum"],
    };
  }
  if (input.topicKey === "combine-techniques") {
    return {
      ...shared,
      algorithm: "binary search on the answer with a greedy feasibility scan for contiguous capacity-limited groups",
      coreOperation: "Partition an ordered sequence of non-negative package weights into at most k non-empty consecutive days while minimizing the maximum daily load.",
      requiredInput: "Read n and k (1 ≤ k ≤ n ≤ 200000), followed by n non-negative weights w[i] with 0 ≤ w[i] ≤ 10^9.",
      requiredOutput: "Print the minimum possible maximum sum assigned to any one day.",
      constraints: "The answer lies between max(w) and sum(w). For a candidate capacity C, greedily append each next weight unless it would exceed C, then start a new day; feasibility is monotone in C. Binary search and one O(n) check per step take O(n log(sum(w)+1)) time and O(1) extra space. Use a signed 64-bit sum in Java and C++.",
      requiredCases: ["one day", "one package per day", "zero weights", "all weights equal", "greedy split exactly at capacity", "sum exceeds 32-bit range"],
    };
  }
  if (input.topicKey === "compare-solutions") {
    return {
      ...shared,
      algorithm: "compare pairwise duplicate detection with one-pass frequency-map aggregation",
      coreOperation: "Print the number of distinct values and the highest frequency in an integer sequence.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n integers a[i] with -10^9 ≤ a[i] ≤ 10^9.",
      requiredOutput: "Print two integers: the number of distinct values and the greatest frequency of any one value.",
      constraints: "A pairwise comparison solution takes O(n²) time and is too slow at the upper bound. Count values in a hash map in one pass for expected O(n) time and O(d) memory, where d is the number of distinct values. Do not assume the values are non-negative or densely indexed.",
      requiredCases: ["all values equal", "all values distinct", "negative values", "ties for greatest frequency", "one value", "maximum n"],
    };
  }
  if (input.topicKey === "thematic-sets") {
    return {
      ...shared,
      algorithm: "single-pass filtering and aggregation for one selected topic",
      coreOperation: "Read a selected topic and a log of generated-problem outcomes; print the solved count and attempt count for that topic.",
      requiredInput: "Read n and target (1 ≤ n ≤ 200000, 1 ≤ target ≤ 10^9), then n pairs topic result where topic is a positive integer and result is 0 or 1.",
      requiredOutput: "Print two integers: the number of solved attempts for target and the total attempts logged for target.",
      constraints: "Scan the log once, updating counters only when topic equals target. Target O(n) time and O(1) extra space; all outcomes are Judge-confirmed values, not AI judgments.",
      requiredCases: ["no attempts for target", "all target attempts solved", "none solved", "records for other topics are ignored", "first and last record target", "maximum n"],
    };
  }
  if (input.topicKey === "mixed-set") {
    return {
      ...shared,
      algorithm: "one-pass set and aggregate over records from several completed topics",
      coreOperation: "Count the distinct topic identifiers represented in a mixed practice set and sum all awarded points.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n pairs topic points with 1 ≤ topic ≤ 10^9 and 0 ≤ points ≤ 10^6.",
      requiredOutput: "Print two integers: the number of distinct topics and the sum of points across all records.",
      constraints: "Use a set or map to track distinct topic identifiers and a wide accumulator for the point sum. Target expected O(n) time and O(d) memory, where d is the number of distinct topics.",
      requiredCases: ["all records share one topic", "every record has a different topic", "repeated topic with different scores", "zero points", "large total score", "maximum n"],
    };
  }
  if (input.topicKey === "timed-mock") {
    return {
      ...shared,
      algorithm: "single-pass scoring of problems finished no later than a fixed contest deadline",
      coreOperation: "Sum points for generated contest problems completed within the deadline and count those on-time completions.",
      requiredInput: "Read n and deadline (1 ≤ n ≤ 200000, 1 ≤ deadline ≤ 10^9), then n pairs finishMinute points with 0 ≤ finishMinute ≤ 10^9 and 0 ≤ points ≤ 10^6.",
      requiredOutput: "Print two integers: total points from records with finishMinute ≤ deadline, and the number of those records.",
      constraints: "Equality with the deadline is on time. The server-side contest service, not learner code or the browser, owns the real timer and Judge timestamps. Target O(n) time and O(1) extra space; the point sum fits signed 64-bit.",
      requiredCases: ["finish exactly at deadline", "all finish before deadline", "all finish after deadline", "zero-point on-time task", "multiple tasks at the same time", "maximum n and score sum"],
    };
  }
  if (input.topicKey === "post-contest-review") {
    return {
      ...shared,
      algorithm: "frequency-map aggregation of non-Accepted outcomes by topic with deterministic tie-breaking",
      coreOperation: "Find the topic with the most failed Judge outcomes; if no failures exist print 0 0, and break ties by smallest topic identifier.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n pairs topic status, where topic is positive and status is 0 for Accepted or a non-zero code for a non-Accepted result.",
      requiredOutput: "Print the selected topic identifier and its failure count, or 0 0 if every outcome is Accepted.",
      constraints: "Aggregate every non-zero status by topic. Use a map for expected O(n) time and O(d) memory, or an ordered map for O(n log d); select the smallest topic on equal counts. Verdict categories should remain available to the real review even though this small exercise groups failures.",
      requiredCases: ["all outcomes accepted", "one failed outcome", "several failure statuses in one topic", "failures across topics", "equal failure counts", "maximum n"],
    };
  }
  if (input.topicKey === "targeted-review") {
    return {
      ...shared,
      algorithm: "linear maximum-priority selection with a deterministic smallest-topic tie rule",
      coreOperation: "Select the review topic maximizing 2·wrongAttempts + daysSinceLastSuccess.",
      requiredInput: "Read n (1 ≤ n ≤ 200000), followed by n unique topic records: topic wrongAttempts daysSinceLastSuccess, with positive topic IDs and non-negative counts up to 10^9.",
      requiredOutput: "Print the topic identifier with greatest priority and that priority value; equal priorities select the smaller topic identifier.",
      constraints: "Compute each priority with a signed 64-bit integer in Java and C++. Scan once for O(n) time and O(1) extra space. This explicit teaching score is a deterministic example; real mastery recommendations must explain their evidence and allow the learner to choose another topic.",
      requiredCases: ["one topic", "no wrong attempts", "largest delay wins", "wrong attempts outweigh a shorter delay", "equal priorities", "maximum priority value"],
    };
  }

  if (input.topicKey === "prefix-sums") {
    return {
      ...shared,
      algorithm: "prefix-sum array for range queries",
      coreOperation: "Read an integer array and multiple inclusive range queries, then print the sum for each query in input order.",
      requiredInput: "Read n and q (1 ≤ n,q ≤ 200000), then n integer values with |a[i]| ≤ 10^9, then q pairs of 1-based inclusive bounds l r with 1 ≤ l ≤ r ≤ n.",
      requiredOutput: "Print exactly q lines; line i is the sum of values from l through r for query i.",
      constraints: "Use exactly the stated upper bounds so scanning each query range is unsuitable. Every answer has magnitude at most 2·10^14 and fits a signed 64-bit integer.",
      requiredCases: ["single-element range", "whole-array range", "negative values", "first and last positions", "repeated queries"],
    };
  }
  if (input.topicKey === "maximum-subarray") {
    return {
      ...shared,
      algorithm: "quadratic enumeration of all non-empty contiguous subarrays with an incrementally maintained sum",
      coreOperation: "Read an integer array and print the maximum sum among all non-empty contiguous subarrays.",
      requiredInput: "Read n (1 ≤ n ≤ 2000) followed by n integers with |a[i]| ≤ 10^9; the array is non-empty.",
      requiredOutput: "Print one integer: the greatest sum of any non-empty contiguous subarray. No indices are required.",
      constraints: "Use exactly these bounds to make the quadratic enumeration appropriate. Every answer has magnitude at most 2·10^12 and fits a signed 64-bit integer.",
      requiredCases: ["one element", "all-negative array", "best interval inside the array", "zero values", "best interval touches an endpoint"],
    };
  }
  if (input.topicKey === "kadane") {
    return {
      ...shared,
      algorithm: "Kadane's linear scan with recovery of the chosen interval boundaries",
      coreOperation: "Read an integer array and print the maximum non-empty contiguous-subarray sum and its 1-based boundaries.",
      requiredInput: "Read n (1 ≤ n ≤ 200000) followed by n integers with |a[i]| ≤ 10^9; the array is non-empty.",
      requiredOutput: "Print the maximum sum, left boundary, and right boundary as three space-separated values. On equal sums choose the smallest right boundary, then the smallest left boundary.",
      constraints: "Use exactly these bounds so a quadratic scan is unsuitable. Every answer has magnitude at most 2·10^14 and fits a signed 64-bit integer; use the runtime's 64-bit integer type where needed.",
      requiredCases: ["one element", "all-negative array", "multiple optimal intervals", "zero values", "optimal interval starts or ends at a boundary"],
    };
  }

  return {
    ...shared,
    algorithm: input.topicKey,
    coreOperation: objective,
    requiredInput: "Define one unambiguous, valid stdin format that directly exercises the lesson objective.",
    requiredOutput: "Define deterministic stdout whose values and formatting follow from the statement for every valid input.",
    constraints: "Choose numeric and size limits that make the lesson's target algorithm appropriate and all required values representable.",
    requiredCases: ["minimum valid size", "boundary values", "ordinary case", "a case that distinguishes the target algorithm from a superficial shortcut"],
  };
}

/** Make the middle generated task practice debugging while retaining its Judge contract. */
export function buildOlympiadPracticeContract(input: OlympiadPracticeContractInput): OlympiadPracticeContract {
  const contract = buildOlympiadPracticeContractBase(input);
  if (contract.stage !== "EDGE_CASES") return contract;

  const runtimeFence = input.runtime === "PYTHON" ? "python" : input.runtime === "JAVA" ? "java" : "cpp";
  contract.variation = `Boundary diagnosis plus logical-error repair: use a distinct valid problem context and emphasize meaningful boundaries; include required cases where a plausible boundary misconception changes the answer. Also include a short, deliberately incorrect draft program in the selected runtime with exactly one lesson-relevant logical bug. Put it in exactly one triple-backtick code block labelled ${runtimeFence} inside practicalTask. Ask the learner to identify the bug, repair it, and submit a complete corrected program. At least one public example and a required generated test must each use valid input that makes the supplied draft produce the wrong answer. Keep the exercise Judgeable and do not ask for an explanation instead of a program.`;
  contract.requiredCases = [
    ...contract.requiredCases,
    "a valid input that exposes the single logical error in the supplied draft program",
  ];
  return contract;
}

export function projectAssessmentContract(input: {
  hasAuthoredTests: boolean;
  hasWebHarness: boolean;
  milestones: Array<{ id: string; title: string; description: string }>;
}): ProjectAssessmentContract {
  const mode: ProjectAssessmentMode = input.hasWebHarness
    ? "WEB_BEHAVIOR"
    : input.hasAuthoredTests
      ? "EXACT_IO"
      : "STATIC_REVIEW";
  const requiredEvidence = input.milestones.slice(0, 6).map((milestone) => ({
    id: String(milestone.id),
    label: String(milestone.title),
    description: String(milestone.description),
  }));
  return { version: 2, mode, requiredEvidence, checkBeforeSubmit: mode !== "STATIC_REVIEW" };
}

