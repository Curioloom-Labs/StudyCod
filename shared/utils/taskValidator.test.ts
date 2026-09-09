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
