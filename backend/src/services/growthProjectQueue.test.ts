import assert from "node:assert/strict";
import test from "node:test";
import { ALL_JUDGE_LANGUAGES, ASSESS_RUNTIMES } from "../config/judgeLanguages";
import { GROWTH_PROJECT_RUNTIME_INFO } from "../data/growthProjects";
import { getLanguage } from "../../../judge/languages/registry";
import { growthJobJudgeTarget } from "./growthProjectQueue";

test("Assess runtime catalogue matches every enabled Judge family and its entry file", () => {
  assert.deepEqual(
    [...ASSESS_RUNTIMES].map(runtime => runtime.toLowerCase()).sort(),
    [...ALL_JUDGE_LANGUAGES].sort(),
  );
  for (const language of ALL_JUDGE_LANGUAGES) {
    assert.deepEqual(growthJobJudgeTarget(language.toUpperCase(), true), {
      language,
      entryFile: getLanguage(language).entryFile,
    });
  }
});

test("Portfolio project jobs retain their original three runtime targets", () => {
  for (const [runtime, target] of Object.entries(GROWTH_PROJECT_RUNTIME_INFO)) {
    assert.deepEqual(growthJobJudgeTarget(runtime, false), {
      language: target.judge,
      entryFile: target.entryFile,
    });
  }
  assert.throws(() => growthJobJudgeTarget("RUST", false), /GROWTH_PROJECT_RUNTIME_UNSUPPORTED/);
  assert.throws(() => growthJobJudgeTarget("NOT_A_LANGUAGE", true), /ASSESS_RUNTIME_UNSUPPORTED/);
});
