import assert from "node:assert/strict";
import test from "node:test";
import { buildOlympiadPracticeContract, buildPracticeContract, courseItemScorePasses, olympiadPracticeContractIssues, practiceStageFor, projectAssessmentContract } from "./learningContract";

test("practice stages progress from foundation to edge cases to transfer", () => {
  assert.equal(practiceStageFor(1, 3), "FOUNDATION");
  assert.equal(practiceStageFor(2, 3), "EDGE_CASES");
  assert.equal(practiceStageFor(3, 3), "TRANSFER");
  assert.equal(practiceStageFor(1, 1), "FOUNDATION");
});

test("Judge final assessment requires a full score while regular practice keeps its mastery threshold", () => {
  assert.equal(courseItemScorePasses(null), true);
  assert.equal(courseItemScorePasses(60), true);
  assert.equal(courseItemScorePasses(59.99), false);
  assert.equal(courseItemScorePasses(null, true), false);
  assert.equal(courseItemScorePasses(99.99, true), false);
  assert.equal(courseItemScorePasses(100, true), true);
});

test("practice contract is explicit and deterministic", () => {
  const contract = buildPracticeContract({
    courseKey: "python-core",
    topicKey: "loops",
    topicTitle: "Цикли",
    exerciseFocus: "Порахувати статистику набору даних у циклі.",
    sequence: 2,
    total: 3,
  });
  assert.equal(contract.version, 2);
  assert.equal(contract.stage, "EDGE_CASES");
  assert.ok(contract.taskIntent.includes("Цикли"));
  assert.ok(contract.evidence.length >= 3);
  assert.ok(contract.minimumExamples >= 5);
});

test("Olympiad practice contracts keep generated Judge tasks on the lesson algorithm", () => {
  const foundation = buildOlympiadPracticeContract({
    courseKey: "olympiad-python",
    topicKey: "prefix-sums",
    topicTitle: "Префіксні суми в Python",
    runtime: "PYTHON",
    objective: "Відповісти на багато запитів сум відрізків.",
    sequence: 1,
    total: 3,
  });
  const edgeCases = buildOlympiadPracticeContract({
    courseKey: "olympiad-python",
    topicKey: "prefix-sums",
    topicTitle: "Префіксні суми в Python",
    runtime: "PYTHON",
    objective: "Відповісти на багато запитів сум відрізків.",
    sequence: 2,
    total: 3,
  });
  assert.equal(foundation.kind, "OLYMPIAD_ALGORITHMIC_PRACTICE");
  assert.equal(foundation.version, 3);
  assert.equal(foundation.ioType, "STDIN_STDOUT");
  assert.equal(foundation.stage, "FOUNDATION");
  assert.equal(edgeCases.stage, "EDGE_CASES");
  assert.equal(foundation.algorithm, edgeCases.algorithm);
  assert.match(foundation.variation, /Direct implementation/);
  assert.match(edgeCases.variation, /Boundary diagnosis/);
  assert.match(edgeCases.variation, /plausible boundary misconception/);
  assert.match(edgeCases.variation, /deliberately incorrect draft program/);
  assert.match(edgeCases.variation, /exactly one triple-backtick code block labelled python inside practicalTask/);
  assert.match(edgeCases.variation, /At least one public example and a required generated test/);
  assert.ok(edgeCases.requiredCases.includes("a valid input that exposes the single logical error in the supplied draft program"));
  assert.match(foundation.requiredInput, /1 ≤ l ≤ r ≤ n/);
  assert.match(foundation.constraints, /2·10\^14/);
  assert.ok(foundation.requiredCases.includes("repeated queries"));
  assert.match(edgeCases.variation, /meaningful boundaries/);
  assert.deepEqual(olympiadPracticeContractIssues(foundation, "PYTHON"), []);
  assert.ok(olympiadPracticeContractIssues({ ...foundation, requiredCases: [] }, "PYTHON").includes("AT_LEAST_THREE_REQUIRED_CASES"));
  assert.ok(olympiadPracticeContractIssues(foundation, "CPP").includes("RUNTIME_MISMATCH"));
});

test("Olympiad stages have contracts for quadratic enumeration and Kadane", () => {
  const exhaustive = buildOlympiadPracticeContract({
    courseKey: "olympiad-java", topicKey: "maximum-subarray", topicTitle: "Максимальний підмасив у Java",
    runtime: "JAVA", objective: "Знайти максимум серед непорожніх підмасивів.", sequence: 1, total: 3,
  });
  const kadane = buildOlympiadPracticeContract({
    courseKey: "olympiad-cpp", topicKey: "kadane", topicTitle: "Кадане в C++",
    runtime: "CPP", objective: "Знайти суму та межі за лінійний час.", sequence: 3, total: 3,
  });
  assert.match(exhaustive.algorithm, /quadratic enumeration/);
  assert.match(exhaustive.requiredInput, /n ≤ 2000/);
  assert.match(kadane.algorithm, /Kadane/);
  assert.match(kadane.requiredInput, /n ≤ 200000/);
  assert.match(kadane.requiredOutput, /smallest right boundary/);
  assert.equal(kadane.stage, "TRANSFER");
  assert.match(kadane.variation, /Independent transfer/);
  assert.match(kadane.variation, /without naming it/);
});

test("Olympiad foundations generate Judgeable practice contracts instead of prose-only tasks", () => {
  const topics = [
    buildOlympiadPracticeContract({ courseKey: "olympiad-python", topicKey: "contest-workflow", topicTitle: "Judge workflow", runtime: "PYTHON", objective: "Understand verdicts.", sequence: 1, total: 3 }),
    buildOlympiadPracticeContract({ courseKey: "olympiad-java", topicKey: "constraints-and-complexity", topicTitle: "Complexity", runtime: "JAVA", objective: "Estimate operation counts.", sequence: 1, total: 3 }),
    buildOlympiadPracticeContract({ courseKey: "olympiad-cpp", topicKey: "language-runtime", topicTitle: "Runtime", runtime: "CPP", objective: "Use appropriate IO and numeric types.", sequence: 1, total: 3 }),
  ];
  assert.ok(topics.every((contract) => contract.ioType === "STDIN_STDOUT"));
  assert.match(topics[0].requiredOutput, /CE.*RE.*TLE.*MLE.*WA.*AC/);
  assert.match(topics[1].requiredOutput, /n² ≤ budget/);
  assert.match(topics[1].constraints, /signed 64-bit/);
  assert.match(topics[2].requiredInput, /2000000/);
  assert.ok(topics[2].requiredCases.includes("sum outside 32-bit range"));
});

test("Olympiad workshop practice keeps thematic, mixed, timed, review, and targeted goals distinct", () => {
  const topics = [
    buildOlympiadPracticeContract({ courseKey: "olympiad-python", topicKey: "thematic-sets", topicTitle: "Thematic", runtime: "PYTHON", objective: "Track one topic.", sequence: 1, total: 3 }),
    buildOlympiadPracticeContract({ courseKey: "olympiad-java", topicKey: "mixed-set", topicTitle: "Mixed", runtime: "JAVA", objective: "Aggregate topic coverage.", sequence: 1, total: 3 }),
    buildOlympiadPracticeContract({ courseKey: "olympiad-cpp", topicKey: "timed-mock", topicTitle: "Timed", runtime: "CPP", objective: "Score on-time work.", sequence: 1, total: 3 }),
    buildOlympiadPracticeContract({ courseKey: "olympiad-python", topicKey: "post-contest-review", topicTitle: "Review", runtime: "PYTHON", objective: "Group failures by topic.", sequence: 1, total: 3 }),
    buildOlympiadPracticeContract({ courseKey: "olympiad-java", topicKey: "targeted-review", topicTitle: "Targeted", runtime: "JAVA", objective: "Choose a review topic.", sequence: 1, total: 3 }),
  ];
  assert.ok(topics.every((topic) => topic.ioType === "STDIN_STDOUT" && topic.requiredCases.length >= 6));
  assert.match(topics[0].requiredOutput, /solved attempts.*total attempts/);
  assert.match(topics[1].algorithm, /set and aggregate/);
  assert.match(topics[2].constraints, /server/);
  assert.match(topics[3].requiredOutput, /0 0/);
  assert.match(topics[4].constraints, /signed 64-bit/);
});

test("array foundations have exact dynamic-practice IO and boundary contracts", () => {
  const cases = [
    ["array-traversal", "one-pass array traversal", /count of values greater than zero/, /no positive values/],
    ["extrema-and-counts", "single-pass minimum", /minimum value.*maximum value/, /all values negative/],
    ["interval-basics", "linear scan of one", /a\[l\].*a\[r\]/, /whole array/],
    ["boundary-debugging", "bounded adjacent-pair scan", /0 ≤ i < n-1/, /n equals one/],
  ] as const;
  for (const [topicKey, algorithm, output, edgeCase] of cases) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-java", topicKey, topicTitle: topicKey, runtime: "JAVA",
      objective: `Practice ${topicKey}`, sequence: 2, total: 3,
    });
    assert.match(contract.algorithm, new RegExp(algorithm));
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)), `${topicKey} has its boundary case`);
    assert.equal(contract.runtime, "JAVA");
    assert.equal(contract.ioType, "STDIN_STDOUT");
  }
});

test("prefix extensions keep transformation and fixed-window practice distinct", () => {
  const transformed = buildOlympiadPracticeContract({
    courseKey: "olympiad-python", topicKey: "prefix-transformations", topicTitle: "Prefix counts",
    runtime: "PYTHON", objective: "Count odd values in query ranges.", sequence: 1, total: 3,
  });
  const window = buildOlympiadPracticeContract({
    courseKey: "olympiad-cpp", topicKey: "fixed-window-sum", topicTitle: "Fixed window",
    runtime: "CPP", objective: "Find the maximum fixed-length range sum.", sequence: 3, total: 3,
  });
  assert.match(transformed.algorithm, /0\/1 indicator/);
  assert.match(transformed.requiredInput, /n and q/);
  assert.match(transformed.requiredOutput, /count of odd/);
  assert.ok(transformed.requiredCases.includes("negative odd values"));
  assert.match(window.algorithm, /rolling sum/);
  assert.match(window.requiredInput, /1 ≤ k ≤ n ≤ 200000/);
  assert.match(window.constraints, /O\(n\) time and O\(1\)/);
  assert.ok(window.requiredCases.includes("k equals n"));
  assert.equal(window.stage, "TRANSFER");
});

test("sorting and search lessons generate distinct algorithmic Judge contracts", () => {
  const expectations = [
    ["sorting-purpose", /comparison sorting/, /all n values/, /duplicate values/],
    ["binary-search", /binary search/, /1-based index/, /target at last position/],
    ["lower-upper-bound", /lower bound/, /L ≤ x ≤ R/, /duplicate boundary values/],
    ["answer-search", /monotone capacity predicate/, /minimum possible maximum/, /k equals n/],
  ] as const;
  for (const [topicKey, algorithm, output, requiredCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-cpp", topicKey, topicTitle: topicKey, runtime: "CPP",
      objective: `Practice ${topicKey}`, sequence: 1, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => requiredCase.test(item)));
    assert.match(contract.constraints, /O\(/);
    assert.equal(contract.ioType, "STDIN_STDOUT");
  }
});

test("linear data structures generate separate map, stack, queue, and deque contracts", () => {
  const expectations = [
    ["maps-and-sets", /frequency map/, /distinct values.*maximum frequency/, /all values equal/],
    ["stack-patterns", /stack-based validation/, /YES.*balanced.*NO/, /crossed bracket types/],
    ["queue-patterns", /FIFO queue/, /service order/, /no service commands/],
    ["deque-selection", /double-ended queue/, /values removed/, /mixed operations at both ends/],
  ] as const;
  for (const [topicKey, algorithm, output, edgeCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-java", topicKey, topicTitle: topicKey, runtime: "JAVA",
      objective: `Practice ${topicKey}`, sequence: 2, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)));
    assert.match(contract.constraints, /O\(/);
    assert.equal(contract.ioType, "STDIN_STDOUT");
  }
});

test("two-pointer contracts state monotonicity assumptions and exact tie rules", () => {
  const expectations = [
    ["two-pointers-sorted", /two pointers moving inward/, /two distinct 1-based indices/, /pair uses both endpoints/],
    ["sliding-window", /variable-size sliding window/, /number of non-empty/, /all zero values/],
    ["longest-valid-window", /longest positive-value subarray/, /smallest left index/, /budget below every value/],
    ["shortest-valid-window", /shortest positive-value subarray/, /print -1/, /no interval reaches target/],
  ] as const;
  for (const [topicKey, algorithm, output, edgeCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-python", topicKey, topicTitle: topicKey, runtime: "PYTHON",
      objective: `Practice ${topicKey}`, sequence: 1, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)));
    assert.match(contract.constraints, /O\(n\)/);
    assert.equal(contract.ioType, "STDIN_STDOUT");
  }
});

test("number-theory lessons keep their limits, definitions, and modular edge cases explicit", () => {
  const expectations = [
    ["divisors-and-gcd", /paired divisor enumeration/, /number of positive divisors.*sum/, /perfect square/],
    ["euclidean-algorithm", /iterative Euclidean algorithm/, /greatest common divisor of all n values/, /all values zero/],
    ["prime-sieve", /Eratosthenes sieve/, /all primes p/, /n equals one/],
    ["factorization", /trial division/, /pairs p e/, /prime power/],
    ["modular-arithmetic", /binary exponentiation/, /unique residue/, /zero exponent/],
  ] as const;
  for (const [topicKey, algorithm, output, edgeCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-cpp", topicKey, topicTitle: topicKey, runtime: "CPP",
      objective: `Practice ${topicKey}`, sequence: 3, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)));
    assert.match(contract.constraints, /O\(/);
    assert.equal(contract.stage, "TRANSFER");
  }
});

test("greedy lessons generate separate interval, scheduling, and counterexample contracts", () => {
  const expectations = [
    ["activity-selection", /earliest-finish-time/, /selected count.*input IDs/, /activities touch at an endpoint/],
    ["interval-stabbing", /right-endpoint greedy placement/, /minimum point count.*selected integer points/, /singleton intervals/],
    ["deadline-ordering", /earliest-due-date ordering/, /maximum lateness.*signed integer/, /all jobs finish before deadlines/],
    ["greedy-simulation", /descending-denomination simulation/, /number of coins.*remaining amount/, /non-canonical system/],
  ] as const;
  for (const [topicKey, algorithm, output, edgeCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-java", topicKey, topicTitle: topicKey, runtime: "JAVA",
      objective: "Practice generated greedy lesson", sequence: 3, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)));
    assert.match(contract.constraints, /O\(/);
    assert.equal(contract.ioType, "STDIN_STDOUT");
    assert.equal(contract.stage, "TRANSFER");
  }
});

test("dynamic-programming lessons state their states, transitions, bounds, and recovery rules", () => {
  const expectations = [
    ["dp-min-cost-stairs", /minimum-cost path DP/, /minimum total landing cost/, /one step/],
    ["one-dimensional-counting", /counting DP partitioned by the final jump/, /modulo 1000000007/, /n equals zero/],
    ["dp-max-nonadjacent", /maximum DP choosing between skipping/, /selecting no values is allowed/, /all values negative/],
    ["reconstruct-answer", /unbounded minimum-coin DP/, /non-decreasing order/, /unreachable target/],
    ["memory-optimized-counting", /sliding sum and a k\+1 circular buffer/, /routes modulo/, /window removes a state/],
  ] as const;
  for (const [topicKey, algorithm, output, edgeCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-cpp", topicKey, topicTitle: topicKey, runtime: "CPP",
      objective: "Practice dynamic programming", sequence: 3, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.requiredOutput, output);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)));
    assert.match(contract.constraints, /O\(/);
    assert.equal(contract.ioType, "STDIN_STDOUT");
    assert.equal(contract.stage, "TRANSFER");
  }
});

test("combined-problem lessons keep a distinct, constraint-backed algorithm contract", () => {
  const expectations = [
    ["read-constraints-first", /prefix sums over repeated scans/, /inclusive range-sum queries/, /maximum n and q/],
    ["choose-representation", /event-sweep representation/, /earliest day attaining that maximum/, /multiple days tied/],
    ["combine-techniques", /binary search on the answer/, /minimizing the maximum daily load/, /zero weights/],
    ["compare-solutions", /frequency-map aggregation/, /number of distinct values/, /all values distinct/],
  ] as const;
  for (const [topicKey, algorithm, operation, edgeCase] of expectations) {
    const contract = buildOlympiadPracticeContract({
      courseKey: "olympiad-python", topicKey, topicTitle: topicKey, runtime: "PYTHON",
      objective: `Practice ${topicKey}`, sequence: 3, total: 3,
    });
    assert.match(contract.algorithm, algorithm);
    assert.match(contract.coreOperation, operation);
    assert.ok(contract.requiredCases.some((item) => edgeCase.test(item)));
    assert.match(contract.constraints, /O\(/);
    assert.equal(contract.stage, "TRANSFER");
    assert.equal(contract.ioType, "STDIN_STDOUT");
  }
});

test("projects receive a separate assessment mode", () => {
  const contract = projectAssessmentContract({
    hasAuthoredTests: false,
    hasWebHarness: false,
    milestones: [{ id: "model", title: "Модель", description: "Опиши модель." }],
  });
  assert.equal(contract.mode, "STATIC_REVIEW");
  assert.equal(contract.checkBeforeSubmit, false);
  assert.equal(contract.requiredEvidence[0]?.id, "model");
});

