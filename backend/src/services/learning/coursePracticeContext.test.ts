import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOlympiadPracticeContract, parseOlympiadPracticeContract } from "./learningContract";
import { buildCoursePracticeTheoryForAi } from "./coursePracticeContext";

test("course practice AI context preserves the authored EDGE_CASES stage for all runtimes", () => {
  for (const runtime of ["PYTHON", "JAVA", "CPP"] as const) {
    const courseKey = `olympiad-${runtime.toLowerCase()}`;
    const contract = buildOlympiadPracticeContract({
      courseKey,
      topicKey: "maximum-subarray",
      topicTitle: "Maximum subarray",
      runtime,
      objective: "Find the greatest sum of a non-empty contiguous subarray.",
      sequence: 2,
      total: 3,
    });
    const context = buildCoursePracticeTheoryForAi({
      theoryMarkdown: "Lesson theory about non-empty contiguous intervals.",
      exercise: {
        prompt: "Generate a learner-specific Judge task from this lesson.",
        learningContract: contract,
      },
    });

    const parsed = parseOlympiadPracticeContract(context);
    const fence = runtime === "PYTHON" ? "python" : runtime === "JAVA" ? "java" : "cpp";
    assert.match(context, /Lesson theory about non-empty contiguous intervals/);
    assert.match(context, /Practice brief:\nGenerate a learner-specific Judge task/);
    assert.equal(parsed?.courseKey, courseKey);
    assert.equal(parsed?.topicKey, "maximum-subarray");
    assert.equal(parsed?.runtime, runtime);
    assert.equal(parsed?.sequence, 2);
    assert.equal(parsed?.stage, "EDGE_CASES");
    assert.match(parsed?.variation ?? "", /deliberately incorrect draft program/);
    assert.ok(parsed?.variation.includes(`labelled ${fence}`));
  }
});
