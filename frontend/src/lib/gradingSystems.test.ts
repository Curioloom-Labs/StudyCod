import { describe, expect, it } from "vitest";
import {
  formatGradeForSystem,
  getGradeToneForSystem,
  normalizeGradingSystem,
  normalizeScaleMode,
} from "./gradingSystems";

describe("grading systems", () => {
  it("normalizes unknown values to the default system", () => {
    expect(normalizeGradingSystem("POINTS_12")).toBe("POINTS_12");
    expect(normalizeGradingSystem("unknown")).toBe("PERCENT_100");
    expect(normalizeScaleMode("MON")).toBe("MON");
    expect(normalizeScaleMode("unknown")).toBe("LINEAR");
  });

  it("formats every supported grade system", () => {
    expect(formatGradeForSystem(83, "PERCENT_100")).toBe("83");
    expect(formatGradeForSystem(74, "POINTS_12", "MON")).toBe("8");
    expect(formatGradeForSystem(80, "POINTS_10")).toBe("8");
    expect(formatGradeForSystem(90, "LETTER_AF")).toBe("A");
    expect(formatGradeForSystem(63, "ECTS_AF")).toBe("E");
    expect(formatGradeForSystem(90, "GPA_4")).toBe("3.6");
    expect(formatGradeForSystem(null, "PERCENT_100")).toBe("-");
  });

  it("assigns stable tones at score boundaries", () => {
    expect(getGradeToneForSystem(90, "PERCENT_100")).toBe("success");
    expect(getGradeToneForSystem(65, "PERCENT_100")).toBe("warn");
    expect(getGradeToneForSystem(40, "PERCENT_100")).toBe("warning");
    expect(getGradeToneForSystem(20, "PERCENT_100")).toBe("error");
    expect(getGradeToneForSystem(undefined, "PERCENT_100")).toBe("muted");
  });
});
