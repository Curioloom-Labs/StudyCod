import { describe, it, expect } from "vitest";
import { manualGradeInput } from "./eduManualGrade";

describe("manual grade input distinguishes rubric points from journal percentages", () => {
  it("uses stored points only for the current denominator", () => {
    expect(manualGradeInput({ total: 50, score: 15, maxScore: 30 }, 30)).toBe("15");
    expect(manualGradeInput({ total: 20, score: 20, maxScore: 100 }, 30)).toBe("6");
    expect(manualGradeInput({ total: 0, score: 0, maxScore: 30 }, 30)).toBe("0");
  });
  it("prefills a percentage only when the points preserve its value", () => {
    expect(manualGradeInput({ total: 80 }, 30)).toBe("24");
    expect(manualGradeInput({ total: 33 }, 30)).toBe("10");
    expect(manualGradeInput({ total: 66 }, 30)).toBe("");
    expect(manualGradeInput({ total: 2 }, 30)).toBe("");
  });
  it("does not invent a zero for missing or invalid grades", () => {
    expect(manualGradeInput(null, 30)).toBe("");
    expect(manualGradeInput({ total: null }, 30)).toBe("");
    expect(manualGradeInput({ total: NaN }, 30)).toBe("");
    expect(manualGradeInput({ total: 101 }, 30)).toBe("");
  });
});
