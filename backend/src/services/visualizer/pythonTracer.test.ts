import test from "node:test";
import assert from "node:assert/strict";
import { buildPythonTracerScript, parseTraceOutput, TRACE_BEGIN, TRACE_END } from "./pythonTracer";

test("tracer script embeds code as base64 and includes sentinels + cap", () => {
  const script = buildPythonTracerScript("print(1)", 500);
  assert.match(script, /import sys, json, base64/);
  assert.match(script, /_MAX = 500/);
  assert.match(script, /sys\.settrace\(_tracer\)/);
  assert.ok(script.includes(TRACE_BEGIN) && script.includes(TRACE_END));
  // base64 of the user code is present.
  const b64 = Buffer.from("print(1)", "utf8").toString("base64");
  assert.ok(script.includes(b64));
});

test("maxSteps is clamped", () => {
  assert.match(buildPythonTracerScript("x=1", 0), /_MAX = 1/);
  assert.match(buildPythonTracerScript("x=1", 999999), /_MAX = 5000/);
});

test("parseTraceOutput extracts program output + steps", () => {
  const trace = JSON.stringify({ steps: [{ line: 1, locals: { i: 0 } }, { line: 2, locals: { i: 1 } }], truncated: false });
  const stdout = `hello\nworld\n${TRACE_BEGIN}\n${trace}\n${TRACE_END}\n`;
  const res = parseTraceOutput(stdout);
  assert.ok(res);
  assert.equal(res!.programOutput, "hello\nworld");
  assert.equal(res!.steps.length, 2);
  assert.equal(res!.steps[1].locals.i, 1);
  assert.equal(res!.truncated, false);
});

test("parseTraceOutput returns null without sentinels", () => {
  assert.equal(parseTraceOutput("just output, no trace"), null);
});

test("parseTraceOutput tolerates malformed JSON", () => {
  const stdout = `${TRACE_BEGIN}\n{not json\n${TRACE_END}`;
  assert.equal(parseTraceOutput(stdout), null);
});

test("parseTraceOutput filters malformed steps", () => {
  const trace = JSON.stringify({ steps: [{ line: 3, locals: {} }, { nope: true }, { line: "x" }], truncated: true });
  const stdout = `${TRACE_BEGIN}\n${trace}\n${TRACE_END}`;
  const res = parseTraceOutput(stdout)!;
  assert.equal(res.steps.length, 1);
  assert.equal(res.steps[0].line, 3);
  assert.equal(res.truncated, true);
});
