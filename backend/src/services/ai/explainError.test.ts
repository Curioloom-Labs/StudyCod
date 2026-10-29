import test from "node:test";
import assert from "node:assert/strict";
import { classifyErrorKind, deterministicExplanation, explainSubmissionError } from "./failureHints";
import { getLLMProvider, setLLMProvider } from "../llm/provider";
import type { LLMGenerateOptions } from "../llm/LLMProvider";

test("classifyErrorKind detects compile errors by verdict and stderr", () => {
  assert.equal(classifyErrorKind("CE", ""), "compile");
  assert.equal(classifyErrorKind("", "error: expected ';' before '}'"), "compile");
  assert.equal(classifyErrorKind("", "javac: cannot find symbol"), "compile");
});

test("classifyErrorKind detects timeout", () => {
  assert.equal(classifyErrorKind("TLE", ""), "timeout");
  assert.equal(classifyErrorKind("", "Process killed: time limit exceeded"), "timeout");
});

test("classifyErrorKind detects runtime errors", () => {
  assert.equal(classifyErrorKind("RE", ""), "runtime");
  assert.equal(classifyErrorKind("", "Traceback (most recent call last): IndexError"), "runtime");
});

test("classifyErrorKind defaults to wrong_answer", () => {
  assert.equal(classifyErrorKind("WA", ""), "wrong_answer");
  assert.equal(classifyErrorKind("", ""), "wrong_answer");
});

test("deterministicExplanation returns a non-empty, language-aware string", () => {
  const py = deterministicExplanation("compile", "PYTHON");
  const cpp = deterministicExplanation("compile", "CPP");
  assert.ok(py.length > 0 && cpp.length > 0);
  assert.notEqual(py, cpp); // python vs compiled languages differ
  assert.match(deterministicExplanation("timeout", "JAVA"), /ліміт часу/i);
  assert.match(deterministicExplanation("wrong_answer", "JAVA"), /очікуван/i);
  // Never leaks a ready solution.
  for (const kind of ["compile", "timeout", "runtime", "wrong_answer"] as const) {
    const s = deterministicExplanation(kind, "PYTHON");
    assert.ok(!/```/.test(s), "must not contain code fences");
  }
});

test("English fallback explanations cover every failure kind and programming language", () => {
  for (const language of ["PYTHON", "JAVA", "CPP"] as const) {
    for (const kind of ["compile", "timeout", "runtime", "wrong_answer"] as const) {
      const explanation = deterministicExplanation(kind, language, "en");
      assert.ok(explanation.length > 0);
      assert.doesNotMatch(explanation, /[\u0400-\u04FF]|```/u);
      assert.notEqual(explanation, deterministicExplanation(kind, language, "uk"));
    }
  }
  assert.match(deterministicExplanation("compile", "PYTHON", "en"), /indentation/);
  assert.match(deterministicExplanation("compile", "JAVA", "en"), /compile/);
});

test("AI explanations request the interface language even for a Ukrainian task", async (t) => {
  const original = getLLMProvider();
  t.after(() => setLLMProvider(original));
  for (const uiLanguage of ["en", "uk"] as const) {
    setLLMProvider({
      async generateText() { throw new Error("Unexpected text generation"); },
      async generateJSON<T>(prompt: string, _schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> {
        assert.equal(options?.language, uiLanguage);
        if (uiLanguage === "en") {
          assert.match(systemPrompt ?? "", /simple English/);
          assert.match(systemPrompt ?? "", /NEVER provide ready-to-copy code/);
          assert.match(prompt, /Explain in simple English/);
          assert.doesNotMatch(prompt, /Поясни простою українською/);
        } else {
          assert.match(systemPrompt ?? "", /ПРОСТОЮ українською/);
          assert.match(prompt, /Поясни простою українською/);
        }
        return { explanation: uiLanguage === "en" ? "Check the output format." : "Перевір формат виводу." } as T;
      },
    });
    const result = await explainSubmissionError({
      taskTitle: "Сума чисел", taskText: "Виведи суму чисел.",
      language: "JAVA", code: "class Main {}", verdict: "WA", uiLanguage,
    });
    assert.equal(result.source, "ai");
    assert.equal(result.explanation, uiLanguage === "en" ? "Check the output format." : "Перевір формат виводу.");
  }
});

test("unavailable or empty AI responses fall back in the interface language", async (t) => {
  const original = getLLMProvider();
  t.after(() => setLLMProvider(original));
  for (const failure of ["outage", "empty"] as const) {
    setLLMProvider({
      async generateText() { throw new Error("Unexpected text generation"); },
      async generateJSON<T>(): Promise<T> {
        if (failure === "outage") throw new Error("Simulated outage");
        return { explanation: " " } as T;
      },
    });
    for (const uiLanguage of ["en", "uk", undefined] as const) {
      const result = await explainSubmissionError({
        taskTitle: "Task", taskText: "", language: "JAVA", code: "class Main {}", verdict: "CE", uiLanguage,
      });
      assert.equal(result.source, "deterministic");
      assert.equal(result.explanation, deterministicExplanation("compile", "JAVA", uiLanguage));
    }
  }
});
