import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOlympiadPracticeContract } from '../learning/learningContract';
import type { AiTaskGenerationResult } from './LLMOrchestrator';
import { ensureOlympiadCompleteProgramRequest, extractOlympiadDebuggingDraft, validateOlympiadDebuggingTask, validateOlympiadTaskExamples, validateOlympiadTaskNarrativeDomain } from './OlympiadTaskExamples';

const contract = buildOlympiadPracticeContract({
  courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle: 'Prefix sums',
  runtime: 'PYTHON', objective: 'Answer inclusive range-sum queries.', sequence: 3, total: 3,
});

function contractFor(topicKey: string, runtime: 'PYTHON' | 'JAVA' | 'CPP' = 'PYTHON') {
  return buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey, topicTitle: topicKey,
    runtime, objective: `Practice ${topicKey}.`, sequence: 2, total: 3,
  });
}

function task(input: string, output: string): AiTaskGenerationResult {
  return {
    title: 'Range sums', topic: 'Prefix sums', difficulty: 3, theoryMarkdown: 'Prefix sums.',
    practicalTask: 'Read an array and answer inclusive range sum queries.', ioType: 'STDIN_STDOUT',
    inputFormat: 'Read n, q, the array, then q ranges.',
    outputFormat: 'Print one sum per query.', constraints: '1 <= n, q <= 200000.',
    examples: [{ input, output, explanation: 'Calculate each range sum.' }], codeTemplate: '# TODO',
  };
}

test('Olympiad narrative validation rejects non-negative sales when the contract allows negative values', () => {
  const generated = {
    ...task('3 1\n4 8 2\n1 3', '14'),
    title: 'Daily ice cream sales',
    practicalTask: 'A shop records how many portions of ice cream it sells each day. Given the daily sales and inclusive date-range queries, print the total portions sold in each range.',
  };

  assert.throws(
    () => validateOlympiadTaskNarrativeDomain(contract, generated),
    /OLYMPIAD_NARRATIVE_DOMAIN_MISMATCH/,
  );
});

test('Olympiad EDGE_CASES requires a generated faulty-code draft for the course runtime', () => {
  const examples: Array<['PYTHON' | 'JAVA' | 'CPP', string]> = [
    ['PYTHON', '```python\nn = int(input())\na = list(map(int, input().split()))\nprint(a[0])\n```'],
    ['JAVA', '```java\nclass Main {\n  public static void main(String[] args) {\n    System.out.println(0);\n  }\n}\n```'],
    ['CPP', '```cpp\n#include <iostream>\nint main() {\n  std::cout << 0;\n}\n```'],
  ];

  for (const [runtime, draft] of examples) {
    const debuggingContract = contractFor('array-traversal', runtime);
    const generated = {
      ...task('1\n7', '7'),
      practicalTask: `This draft contains one logical bug. Identify and repair it, then submit a complete corrected program.\n\n${draft}`,
    };
    assert.doesNotThrow(() => validateOlympiadDebuggingTask(debuggingContract, generated), runtime);
    assert.equal(extractOlympiadDebuggingDraft(debuggingContract, generated.practicalTask), draft.split('\n').slice(1, -1).join('\n').trim(), runtime + ' editor starter');
  }
});

test('Olympiad EDGE_CASES recognizes Ukrainian inflections for submitting the full solution', () => {
  const debuggingContract = contractFor('array-traversal', 'PYTHON');
  const draft = '```python\nvalues = [1]\nprint(values[0])\nprint(len(values))\n```';
  const learnerRequests = [
    'Знайдіть логічну помилку, виправте її та подайте повну програму.',
    'Знайдіть логічну помилку, виправте її та надішліть повністю виправлений код.',
    'Діагностуйте баг, виправте його й надайте цілісний розв’язок.',
  ];

  for (const request of learnerRequests) {
    assert.doesNotThrow(() => validateOlympiadDebuggingTask(debuggingContract, {
      ...task('1\n7', '1 7'),
      practicalTask: `${request}\n\n${draft}`,
    }), request);
  }
});

test('Olympiad EDGE_CASES adds the complete-program request in English when the generated task omits it', () => {
  const debuggingContract = contractFor('array-traversal', 'PYTHON');
  const generated = {
    ...task('1\n7', '7'),
    practicalTask: [
      'This draft contains a logical bug. Identify it and repair the code.',
      '```python\nvalues = [1, 2, 3]\nprint(values[0])\nprint(values[-1])\n```',
    ].join('\n\n'),
  };

  ensureOlympiadCompleteProgramRequest(debuggingContract, generated);

  assert.match(generated.practicalTask, /Submit a complete corrected program/);
  assert.doesNotThrow(() => validateOlympiadDebuggingTask(debuggingContract, generated));
  assert.equal(extractOlympiadDebuggingDraft(debuggingContract, generated.practicalTask), 'values = [1, 2, 3]\nprint(values[0])\nprint(values[-1])');
});

test('Olympiad EDGE_CASES rejects a missing or wrong-runtime debugging draft', () => {
  const debuggingContract = contractFor('array-traversal', 'CPP');
  const wrongRuntime = {
    ...task('1\n7', '7'),
    practicalTask: 'Find the logical bug and repair the complete program.\n\n```python\nprint(0)\nprint(1)\nprint(2)\n```',
  };
  const diagnosisOnly = {
    ...task('1\n7', '7'),
    practicalTask: 'Find the logical bug in this draft and submit a complete program.\n\n```cpp\nint a = 1;\nint b = 2;\nint c = 3;\n```',
  };
  const repairWithoutCompleteProgram = {
    ...task('1\n7', '7'),
    practicalTask: 'Repair the logical error in the draft.\n\n```cpp\nint a = 1;\nint b = 2;\nint c = 3;\n```',
  };
  const multipleDrafts = {
    ...task('1\n7', '7'),
    practicalTask: 'Repair the logical error and submit a complete program.\n\n```cpp\nint a = 1;\nint b = 2;\nint c = 3;\n```\n\n```cpp\nint x = 4;\nint y = 5;\nint z = 6;\n```',
  };

  assert.throws(() => validateOlympiadDebuggingTask(debuggingContract, wrongRuntime), /OLYMPIAD_DEBUG_TASK_REQUIRED/);
  assert.throws(() => validateOlympiadDebuggingTask(debuggingContract, diagnosisOnly), /OLYMPIAD_DEBUG_TASK_REQUIRED/);
  assert.throws(() => validateOlympiadDebuggingTask(debuggingContract, repairWithoutCompleteProgram), /OLYMPIAD_DEBUG_TASK_REQUIRED/);
  assert.throws(() => validateOlympiadDebuggingTask(debuggingContract, multipleDrafts), /OLYMPIAD_DEBUG_TASK_REQUIRED/);
  assert.throws(() => validateOlympiadDebuggingTask(debuggingContract, task('1\n7', '7')), /OLYMPIAD_DEBUG_TASK_REQUIRED/);
});

test('Olympiad narrative validation accepts signed sales when negative values mean refunds', () => {
  const generated = {
    ...task('3 1\n4 -2 8\n1 3', '10'),
    title: 'Daily net ice cream sales',
    practicalTask: 'A shop records the net change in portions sold each day. Negative values represent refunds or returned portions. Given the daily values and inclusive date-range queries, print the net total for each range.',
  };

  assert.doesNotThrow(() => validateOlympiadTaskNarrativeDomain(contract, generated));
});

test('Olympiad narrative validation accepts neutral signed change contexts', () => {
  const generated = {
    ...task('3 1\n4 -2 8\n1 3', '10'),
    title: 'Daily net income changes',
    practicalTask: 'A monitoring system records signed integer changes to daily net income. Each value is a net change and may be negative. Given the values and inclusive range queries, print the sum for every range.',
  };

  assert.doesNotThrow(() => validateOlympiadTaskNarrativeDomain(contract, generated));
});

test('Olympiad narrative validation does not require negative semantics for non-negative contracts', () => {
  const nonNegativeContract = contractFor('sliding-window');
  const generated = {
    ...task('3 1\n4 2 8\n1 3', '14'),
    title: 'Daily ice cream sales',
    practicalTask: 'A shop records how many portions of ice cream it sells each day and asks for totals over ranges.',
  };

  assert.doesNotThrow(() => validateOlympiadTaskNarrativeDomain(nonNegativeContract, generated));
});

test('Olympiad prefix-sum examples match their complete input and all query answers', () => {
  validateOlympiadTaskExamples(contract, task('4 2\n-1 5 -2 8\n2 3\n1 4', '3\n10'));
});

test('Olympiad prefix-sum examples reject an omitted answer line with actionable feedback', () => {
  assert.throws(
    () => validateOlympiadTaskExamples(contract, task('4 2\n-1 5 -2 8\n2 3\n1 4', '1')),
    /Example 1 must contain exactly 2 output lines for q=2; got 1/,
  );
});

test('Olympiad prefix-sum examples reject malformed input and incorrect computed sums', () => {
  assert.throws(
    () => validateOlympiadTaskExamples(contract, task('4 2\n-1 5 -2 8\n2 3', '3\n10')),
    /expected 10 for n=4 and q=2/,
  );
  assert.throws(
    () => validateOlympiadTaskExamples(contract, task('4 1\n-1 5 -2 8\n2 3', '4')),
    /expected 3/,
  );
});

test('Olympiad public examples are checked against the generated topic contract for core array and search tasks', () => {
  const cases: Array<[string, string, string]> = [
    ['constraints-and-complexity', '10 100', 'SAFE'],
    ['array-traversal', '5\n-2 0 4 7 -1', '2 11'],
    ['extrema-and-counts', '6\n-7 -2 -2 -9 -3 -2', '-9 -2 3'],
    ['interval-basics', '5\n4 -3 8 2 9\n2 4', '7'],
    ['boundary-debugging', '7\n1 1 2 3 3 3 4', '3'],
    ['prefix-transformations', '6 3\n-3 2 5 8 -1 0\n1 6\n2 4\n3 3', '3\n1\n1'],
    ['fixed-window-sum', '5 3\n-4 5 2 -1 7', '8'],
    ['sorting-purpose', '6\n4 -1 4 0 -8 0', '-8 -1 0 0 4 4'],
    ['binary-search', '6\n-5 -2 0 4 4 9\n4', '4'],
    ['lower-upper-bound', '7 3\n-4 -1 -1 2 2 2 8\n-1 2\n0 1\n9 10', '5\n0\n0'],
    ['maps-and-sets', '8\n-1 3 -1 4 3 3 7 -1', '4 3'],
    ['two-pointers-sorted', '6\n-5 -1 0 2 4 7\n3', '2 5'],
    ['sliding-window', '5 3\n2 0 1 4 1', '7'],
    ['longest-valid-window', '6 8\n2 2 3 1 4 1', '4 1 4'],
  ];

  for (const [topicKey, input, output] of cases) {
    validateOlympiadTaskExamples(contractFor(topicKey), task(input, output));
  }
});

test('Olympiad public examples reject wrong answers and invalid contract-shaped input', () => {
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('array-traversal'), task('4\n1 0 -2 5', '1 5')),
    /expected 2 6/,
  );
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('prefix-transformations'), task('3 1\n1 2 3\n0 2', '1')),
    /invalid 1-based inclusive range/,
  );
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('two-pointers-sorted'), task('4\n1 2 5 8\n7', '-1 -1')),
    /even though a valid pair exists/,
  );
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('sliding-window'), task('3 2\n1 -1 1', '6')),
    /negative value although the contract requires non-negative values/,
  );
});

test('Olympiad examples outside the deterministic integer-topic validators keep their generated input format', () => {
  assert.doesNotThrow(() => validateOlympiadTaskExamples(contractFor('stack-patterns'), task('4\n([])', 'YES')));
  assert.doesNotThrow(() => validateOlympiadTaskExamples(contractFor('queue-patterns'), task('3\nADD 8\nADD -2\nSERVE', '8')));
});

test('Olympiad number-theory, complexity, and dynamic-programming examples are checked deterministically', () => {
  const cases: Array<[string, string, string]> = [
    ['contest-workflow', '0 0 99 10 99 10 0', 'CE'],
    ['contest-workflow', '1 1 10 10 10 10 1', 'AC'],
    ['language-runtime', '5\n10 -5 0 7 -2', '10'],
    ['answer-search', '5 2\n7 2 5 10 8', '18'],
    ['divisors-and-gcd', '12', '6 28'],
    ['euclidean-algorithm', '4\n0 18 24 30', '6'],
    ['prime-sieve', '10', '2 3 5 7'],
    ['prime-sieve', '1', 'EMPTY'],
    ['factorization', '360', '3 2 3 3 2 5 1'],
    ['factorization', '1', '0'],
    ['modular-arithmetic', '-2 5 13', '7'],
    ['one-dimensional-counting', '8', '34'],
    ['dp-max-nonadjacent', '5\n-4 8 3 9 -2', '17'],
    ['maximum-subarray', '9\n-2 1 -3 4 -1 2 1 -5 4', '6'],
    ['kadane', '3\n1 -1 1', '1 1 1'],
  ];

  for (const [topicKey, input, output] of cases) {
    validateOlympiadTaskExamples(contractFor(topicKey), task(input, output));
  }
});

test('generated maximum-subarray examples reject unrequested interval boundaries', () => {
  assert.throws(
    () => validateOlympiadTaskExamples(
      contractFor('maximum-subarray'),
      task('9\n-2 1 -3 4 -1 2 1 -5 4', '6 4 7'),
    ),
    /expected 6/,
  );
});

test('Olympiad deterministic checks reject wrong verdicts, number-theory results, and array optima', () => {
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('contest-workflow'), task('1 1 11 10 5 10 1', 'AC')),
    /expected TLE/,
  );
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('modular-arithmetic'), task('-2 5 13', '6')),
    /expected 7/,
  );
  assert.throws(
    () => validateOlympiadTaskExamples(contractFor('kadane'), task('3\n1 -1 1', '1 3 3')),
    /expected 1 1 1/,
  );
});
