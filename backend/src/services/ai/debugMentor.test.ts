import test from "node:test";
import assert from "node:assert/strict";
import {
  DEBUG_MENTOR_SYSTEM_PROMPT,
  mentorSystemPrompt,
  stripCodeFromMentorReply,
  deterministicReply,
  type DebugMentorContext,
} from "./debugMentor";

const baseCtx = (over: Partial<DebugMentorContext> = {}): DebugMentorContext => ({
  taskTitle: "T",
  taskText: "task",
  language: "PYTHON",
  code: "print(1)",
  ...over,
});

test("stripCodeFromMentorReply removes fenced code blocks", () => {
  const out = stripCodeFromMentorReply("Спробуй так:\n```python\nfor i in range(n):\n  print(i)\n```\nЩо думаєш?");
  assert.ok(!out.includes("```"), "no fences");
  assert.ok(!/for i in range/.test(out), "no leaked code");
  assert.ok(out.includes("Що думаєш?"));
});

test("stripCodeFromMentorReply collapses stray backticks and tilde fences", () => {
  assert.ok(!stripCodeFromMentorReply("a ~~~code~~~ b").includes("~~~"));
  assert.ok(!stripCodeFromMentorReply("```").includes("```"));
});

test("mentor prompt answers direct concept questions without giving the full solution", () => {
  assert.match(DEBUG_MENTOR_SYSTEM_PROMPT, /назву методу, функції чи оператора/);
  assert.match(DEBUG_MENTOR_SYSTEM_PROMPT, /короткий приклад у рядку/);
  assert.match(DEBUG_MENTOR_SYSTEM_PROMPT, /не продовжуй загадки/);
  assert.match(DEBUG_MENTOR_SYSTEM_PROMPT, /не відсилай шукати відповідь у документації/);
  assert.match(DEBUG_MENTOR_SYSTEM_PROMPT, /умова допускає кілька форматів вводу/);
  assert.match(DEBUG_MENTOR_SYSTEM_PROMPT, /повний код чи повне розв’язання задачі/);
});

test("deterministicReply gives a Socratic question per error kind", () => {
  const compile = deterministicReply(baseCtx({ verdict: "CE" }), []);
  const timeout = deterministicReply(baseCtx({ verdict: "TLE" }), []);
  const runtime = deterministicReply(baseCtx({ verdict: "RE" }), []);
  const wa = deterministicReply(baseCtx({ verdict: "WA" }), []);

  for (const r of [compile, timeout, runtime, wa]) {
    assert.ok(r.length > 0, "non-empty");
    assert.ok(r.includes("?"), "asks a question");
    assert.ok(!/```/.test(r), "no code");
  }
  assert.match(compile, /компіляц/i);
  assert.match(timeout, /час/i);
});

test("deterministicReply opener differs from follow-up for wrong answer", () => {
  const opener = deterministicReply(baseCtx({ verdict: "WA" }), []);
  const followUp = deterministicReply(baseCtx({ verdict: "WA" }), [
    { role: "student", content: "не знаю" },
    { role: "mentor", content: "а що каже перший тест?" },
  ]);
  assert.notEqual(opener, followUp);
});

test("English UI selects English mentor instructions without weakening teaching rules", () => {
  assert.equal(mentorSystemPrompt(), DEBUG_MENTOR_SYSTEM_PROMPT);
  const english = mentorSystemPrompt("en");
  assert.match(english, /Reply in clear English only/);
  assert.doesNotMatch(english, /Відповідай простою українською/);
  assert.match(english, /Не давай повний код чи повне розв’язання задачі/);
});

test("English fallback and code-removal messages stay English for all error kinds", () => {
  for (const verdict of ["CE", "TLE", "RE", "WA"]) {
    const reply = deterministicReply(baseCtx({ verdict, uiLocale: "en" }), []);
    assert.ok(reply.includes("?"));
    assert.doesNotMatch(reply, /[\u0400-\u04ff]/);
    assert.notEqual(reply, deterministicReply(baseCtx({ verdict }), []));
  }
  const filtered = stripCodeFromMentorReply("Try this: ```python\nprint(1)\n```", "en");
  assert.match(filtered, /code removed/);
  assert.doesNotMatch(filtered, /print\(1\)|[\u0400-\u04ff]/);
});
