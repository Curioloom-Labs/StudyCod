import test from "node:test";
import assert from "node:assert/strict";
import { buildEnglishFallbackHints, generateAlgorithmicHints, sanitizeFailuresForHintContext, sanitizeGeneratedHints } from "./failureHints";
import { getLLMProvider, setLLMProvider } from "../llm/provider";

test("English deterministic fallback hints stay localized for generated-task failures", () => {
  const cases = [
    {
      language: "PYTHON" as const,
      failures: [{ input: "", expected: "", actual: "", verdict: "TLE" }],
      expected: /largest input size/i,
    },
    {
      language: "JAVA" as const,
      failures: [{ input: "", expected: "", actual: "", verdict: "CE", stderr: "cannot find symbol" }],
      expected: /undeclared or misspelled/i,
    },
    {
      language: "CPP" as const,
      failures: [{ input: "1", expected: "YES", actual: "yes", verdict: "WA" }],
      expected: /letter case/i,
    },
  ];

  for (const example of cases) {
    const hints = buildEnglishFallbackHints({
      language: example.language,
      failures: example.failures,
      maxHints: 4,
    });
    assert.ok(hints.length > 0);
    assert.match(hints.join(" "), example.expected);
    assert.doesNotMatch(hints.join(" "), /[\u0400-\u04FF]/u);
  }
});

test("English deterministic fallback respects the hint count", () => {
  const hints = buildEnglishFallbackHints({
    language: "PYTHON",
    failures: [{ input: "", expected: "", actual: "", verdict: "TLE" }],
    maxHints: 2,
  });

  assert.equal(hints.length, 2);
});

test("sanitizeGeneratedHints removes solution leaks and bounds hint text", () => {
  const hints = sanitizeGeneratedHints([
    "Check the loop invariant.",
    "```python\nprint(answer)\n```",
    "Here is the complete solution: use this code",
    "1. Check the loop invariant.",
    "A".repeat(521)
  ], 4);

  assert.deepEqual(hints, ["Check the loop invariant."]);
});

test("sanitizeGeneratedHints deduplicates case-insensitively", () => {
  assert.deepEqual(
    sanitizeGeneratedHints(["Compare the accumulator", "compare the accumulator", "Check input shape"], 3),
    ["Compare the accumulator", "Check input shape"]
  );
});

test("hidden failure details are redacted before hints are built", () => {
  const [hidden] = sanitizeFailuresForHintContext([{
    testId: 91,
    isPublic: false,
    input: "secret hidden input",
    expected: "secret expected value",
    actual: "secret actual value",
    verdict: "WA",
    stderr: "secret stderr",
  }]);

  assert.equal(hidden.testId, "hidden");
  assert.equal(hidden.input, "[hidden test input withheld]");
  assert.equal(hidden.expected, "[hidden expected output withheld]");
  assert.equal(hidden.actual, "[hidden actual output withheld]");
  assert.equal(hidden.stderr, null);
  assert.doesNotMatch(JSON.stringify(hidden), /secret|91/);
});

test("the hint-generation prompt never receives hidden judge input or output", async (t) => {
  const previousProvider = getLLMProvider();
  t.after(() => setLLMProvider(previousProvider));
  let prompt = "";
  setLLMProvider({
    async generateText() { throw new Error("Unexpected text generation"); },
    async generateJSON<T>(value: string): Promise<T> {
      prompt = value;
      return { hints: ["Check how the algorithm handles boundary cases."] } as T;
    },
  });

  const hints = await generateAlgorithmicHints({
    taskTitle: "Range sums",
    taskText: "Read an array and answer each range query.",
    language: "PYTHON",
    code: "print(0)",
    failures: [{
      testId: 91,
      isPublic: false,
      input: "secret hidden input",
      expected: "secret expected value",
      actual: "secret actual value",
      verdict: "WA",
      stderr: "secret stderr",
    }],
    uiLanguage: "en",
  });

  assert.deepEqual(hints, ["Check how the algorithm handles boundary cases."]);
  assert.match(prompt, /hidden test input withheld/);
  assert.doesNotMatch(prompt, /secret|91/);
});
