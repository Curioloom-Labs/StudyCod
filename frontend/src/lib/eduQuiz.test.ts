import { describe, expect, it } from "vitest";
import { isEduQuizAnswered, type EduQuizQuestion } from "./eduQuiz";

describe("EDU quiz completion", () => {
  it("counts choice zero and boolean false as answered", () => {
    expect(isEduQuizAnswered({ id: "q", type: "SINGLE_CHOICE", options: ["A", "B"] }, 0)).toBe(true);
    expect(isEduQuizAnswered({ id: "q", type: "TRUE_FALSE" }, false)).toBe(true);
    expect(isEduQuizAnswered({ id: "q", type: "TRUE_FALSE" }, "false")).toBe(false);
  });
  it("requires every blank or pair without treating an empty slot as zero", () => {
    const blank: EduQuizQuestion = { id: "q", type: "FILL_BLANK", blanks: [{}, {}] };
    expect(isEduQuizAnswered(blank, ["first", " "])).toBe(false);
    expect(isEduQuizAnswered(blank, ["first", "second"])).toBe(true);
    const matching: EduQuizQuestion = { id: "q", type: "MATCHING", pairCount: 2 };
    expect(isEduQuizAnswered(matching, [null, 1])).toBe(false);
    expect(isEduQuizAnswered(matching, [0, 1])).toBe(true);
    expect(isEduQuizAnswered(matching, [0])).toBe(false);
  });
  it("requires nonempty text and actual choice indexes", () => {
    expect(isEduQuizAnswered({ id: "q", type: "OPEN_TEXT" }, " ")).toBe(false);
    expect(isEduQuizAnswered({ id: "q", type: "MULTIPLE_CHOICE", options: ["A", "B"] }, [0, 1])).toBe(true);
    expect(isEduQuizAnswered({ id: "q", type: "MULTIPLE_CHOICE", options: ["A", "B"] }, ["A"])).toBe(false);
  });
});
