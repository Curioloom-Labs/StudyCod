import assert from "node:assert/strict";
import test from "node:test";
import { tryFixJsonResponse, validateTaskGenerationResponse } from "./taskValidator";

const validTask = {
  title: "Example",
  topic: "Conditions",
  difficulty: 1,
  theoryMarkdown: "Theory",
  practicalTask: "Print the result.",
  ioType: "NO_INPUT_FIXED_OUTPUT",
  inputFormat: "No input.",
  outputFormat: "Print one line.",
  constraints: "None.",
  examples: [{ input: "", output: "OK", explanation: "Example" }],
  codeTemplate: "// TODO",
};

test("validates and normalizes a task generation payload", () => {
  const result = validateTaskGenerationResponse(validTask);
  assert.equal(result.title, "Example");
  assert.equal(result.ioType, "NO_INPUT_FIXED_OUTPUT");
  assert.deepEqual(result.examples[0], { input: "", output: "OK", explanation: "Example" });
});

test("rejects malformed task generation payloads", () => {
  assert.throws(() => validateTaskGenerationResponse({}), /missing required field 'title'/);
  assert.throws(() => validateTaskGenerationResponse({ ...validTask, examples: [{ input: 1 }] }), /example 0\.input/);
});

test("repairs fenced JSON responses without accepting arbitrary values", () => {
  assert.deepEqual(tryFixJsonResponse("```json\n{\"ok\":true,}\n```"), { ok: true });
  assert.throws(() => tryFixJsonResponse("not json"), /No JSON object found/);
});

test("repairs unescaped LaTeX backslashes inside JSON strings", () => {
  const result = tryFixJsonResponse('{"statement":"$1 \\le n \\le 1000$"}') as { statement: string };
  assert.equal(result.statement, "$1 \\le n \\le 1000$");
});

test("preserves valid JSON escapes while repairing invalid string backslashes", () => {
  const result = tryFixJsonResponse('{"text":"quote: \\" and newline: \\n; latex: \\frac{1}{2}; text: \\text{n}; path: C:\\\\temp"}') as { text: string };
  assert.ok(result.text.includes('quote: "'));
  assert.ok(result.text.includes("and newline: \n"));
  assert.equal(result.text.split("latex: ")[1].split(";")[0], String.fromCharCode(92) + "frac{1}{2}");
  assert.ok(result.text.includes(String.fromCharCode(92) + "text{n}"));
  assert.equal(result.text.split("path: ")[1], "C:" + String.fromCharCode(92) + "temp");
});

test("preserves valid Unicode escapes and turns malformed ones into literal text", () => {
  const result = tryFixJsonResponse('{"text":"valid: \\u03B1; literal: \\u12xz"}') as { text: string };
  assert.equal(result.text, "valid: α; literal: \\u12xz");
});
