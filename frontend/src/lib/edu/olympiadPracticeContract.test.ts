import { describe, expect, it } from "vitest";
import {
  createOlympiadPracticeContractDraft,
  olympiadPracticeStage,
  validateOlympiadPracticeContractDraft,
} from "./olympiadPracticeContract";

describe("Olympiad generated practice contract authoring", () => {
  it("creates a dynamic stdin/stdout contract draft for the course runtime", () => {
    const draft = createOlympiadPracticeContractDraft({
      courseKey: "olympiad-custom-42",
      topicKey: "prefix-sums",
      runtime: "cpp",
      objective: "Answer range sum queries.",
    });

    expect(draft).toMatchObject({
      version: 3,
      kind: "OLYMPIAD_ALGORITHMIC_PRACTICE",
      courseKey: "olympiad-custom-42",
      topicKey: "prefix-sums",
      runtime: "CPP",
      sequence: 1,
      total: 3,
      stage: "FOUNDATION",
      ioType: "STDIN_STDOUT",
    });
    expect(draft.objective).toBe("Answer range sum queries.");
    expect(draft.requiredCases).toEqual([]);
  });

  it("derives the learner stage from the variant sequence", () => {
    expect(olympiadPracticeStage(1, 3)).toBe("FOUNDATION");
    expect(olympiadPracticeStage(2, 3)).toBe("EDGE_CASES");
    expect(olympiadPracticeStage(3, 3)).toBe("TRANSFER");
  });

  it("rejects incomplete or contradictory generated-task contracts before saving", () => {
    const draft = createOlympiadPracticeContractDraft({
      courseKey: "olympiad-custom-42",
      topicKey: "prefix-sums",
      runtime: "JAVA",
    });
    expect(validateOlympiadPracticeContractDraft(draft, "JAVA")).toContain("ALGORITHM_REQUIRED");
    expect(validateOlympiadPracticeContractDraft(draft, "CPP")).toContain("RUNTIME_MISMATCH");

    const complete = {
      ...draft,
      algorithm: "Prefix sums",
      objective: "Answer range queries.",
      coreOperation: "Build a prefix array and answer sums.",
      requiredInput: "Read n values and q inclusive ranges.",
      requiredOutput: "Print each range sum.",
      constraints: "Use O(n+q) time and 64-bit sums.",
      requiredCases: ["single element", "whole array", "negative values"],
      allowedScope: ["prefix array", "range subtraction"],
      forbiddenScope: [],
    };
    expect(validateOlympiadPracticeContractDraft(complete, "JAVA")).toEqual([]);
    expect(validateOlympiadPracticeContractDraft({ ...complete, sequence: 3, stage: "FOUNDATION" })).toContain("PRACTICE_STAGE_MISMATCH");
  });
});
