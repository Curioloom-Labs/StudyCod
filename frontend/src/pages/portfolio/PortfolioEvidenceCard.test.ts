import { describe, expect, it } from "vitest";
import { isPortfolioAchievement, localizePortfolioEvidenceDetail } from "./PortfolioEvidenceCard";

describe("isPortfolioAchievement", () => {
  it("shows selected learning and official competition records as achievements", () => {
    expect(isPortfolioAchievement("LEARNING_ACTIVITY")).toBe(true);
    expect(isPortfolioAchievement("LEARNING_COURSE")).toBe(true);
    expect(isPortfolioAchievement("COMPETITION_RESULT")).toBe(true);
  });

  it("keeps work, Judge, and Assess evidence in the Skill Evidence section", () => {
    expect(isPortfolioAchievement("ONLINE_JUDGE")).toBe(false);
    expect(isPortfolioAchievement("PROJECT_PUBLICATION")).toBe(false);
    expect(isPortfolioAchievement("ASSESSMENT_FEEDBACK")).toBe(false);
    expect(isPortfolioAchievement("ASSESSMENT_TASK_RESULT")).toBe(false);
  });
});

describe("localizePortfolioEvidenceDetail", () => {
  it("keeps English source details unchanged", () => {
    expect(localizePortfolioEvidenceDetail("ASSESSMENT_TASK_RESULT", "Passed · 8/8 tests passed; reviewed by the company.", true))
      .toBe("Passed · 8/8 tests passed; reviewed by the company.");
  });

  it("localizes Judge test counts", () => {
    expect(localizePortfolioEvidenceDetail("ONLINE_JUDGE", "6/6 tests passed", false)).toBe("6/6 тестів пройдено");
  });

  it("localizes platform source details", () => {
    expect(localizePortfolioEvidenceDetail("LEARNING_ACTIVITY", "code task completed in Python Fundamentals.", false))
      .toBe("Завершення навчальної активності зафіксовано StudyCod.");
    expect(localizePortfolioEvidenceDetail("LEARNING_COURSE", "Course completion recorded by StudyCod.", false))
      .toBe("Завершення курсу зафіксовано StudyCod.");
    expect(localizePortfolioEvidenceDetail("ASSESSMENT_FEEDBACK", "2 interviewers released feedback to the candidate.", false))
      .toBe("2 інтерв'юери відкрили відгук кандидату.");
    expect(localizePortfolioEvidenceDetail("COMPETITION_RESULT", "3 problems accepted during the official contest window.", false))
      .toBe("3 задачі зараховано у межах офіційного змагання.");
    expect(localizePortfolioEvidenceDetail("COMPETITION_RESULT", "3 problems accepted during the official contest window. StudyCod award certificate confirms place 1.", false))
      .toBe("3 задачі зараховано у межах офіційного змагання. Диплом StudyCod підтверджує 1 місце.");
  });

  it("localizes reviewed Assess task results", () => {
    expect(localizePortfolioEvidenceDetail("ASSESSMENT_TASK_RESULT", "Passed · 8/8 tests passed; reviewed by the company.", false))
      .toBe("Залік · 8/8 тестів пройдено; результат перевірено компанією.");
  });

  it("preserves user-written project publication details", () => {
    expect(localizePortfolioEvidenceDetail("PROJECT_PUBLICATION", "Built a reusable query planner.", false))
      .toBe("Built a reusable query planner.");
  });
});
