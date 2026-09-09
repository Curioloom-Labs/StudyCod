import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_JUDGE_LANGUAGES,
  CORE_JUDGE_LANGUAGES,
  filterEnabledJudgeLanguages,
  normalizeJudgeLanguage,
  parseDisabledJudgeLanguages,
} from "./judgeLanguages";

test("judge language config parses, normalizes, and filters one canonical list", () => {
  const disabled = parseDisabledJudgeLanguages(" PYTHON, rust unknown ");
  assert.deepEqual([...disabled], ["python", "rust"]);
  assert.equal(normalizeJudgeLanguage(" CPP "), "cpp");
  assert.equal(normalizeJudgeLanguage("brainfuck"), null);
  assert.deepEqual(
    filterEnabledJudgeLanguages(CORE_JUDGE_LANGUAGES, disabled),
    ["java", "cpp", "c", "csharp", "kotlin"],
  );
  assert.ok(ALL_JUDGE_LANGUAGES.includes("swift"));
});
