import { describe, expect, it } from "vitest";
import { buildTaskGenerationGuidance, defaultTaskGenerationProfile } from "./taskGenerationSettings";

describe("task generation clarification handling", () => {
  it("lets generation proceed with an explicit rule when a clarification is unanswered", () => {
    const profile = {
      ...defaultTaskGenerationProfile,
      clarifyingQuestions: ["What should happen when no temperature qualifies?"],
      clarificationAnswers: [""],
    };

    const ukrainian = buildTaskGenerationGuidance(profile, "", false);
    const english = buildTaskGenerationGuidance(profile, "", true);

    expect(ukrainian).toContain("Неотримане уточнення вчителя");
    expect(ukrainian).toContain("явно запиши його в учнівській умові");
    expect(english).toContain("Unanswered teacher clarification");
    expect(english).toContain("state it explicitly in the student-facing statement");
  });
});
