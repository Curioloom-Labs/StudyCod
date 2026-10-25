import { describe, expect, it } from "vitest";
import {
  LEARNING_BOUNDARY_DEMO,
  LEARNING_DEMO_PUBLIC_TESTS,
  makeLearningBoundaryDemoTask,
  simulateLearningBoundaryDemo,
} from "./learningDemo";

describe("learning boundary demo", () => {
  it("provides localized task content and only the visible sample test", () => {
    expect(makeLearningBoundaryDemoTask("uk").title).toBe("Сума від 1 до n");
    expect(makeLearningBoundaryDemoTask("en").title).toBe("Sum from 1 to n");
    expect(LEARNING_DEMO_PUBLIC_TESTS).toHaveLength(1);
    expect(LEARNING_DEMO_PUBLIC_TESTS[0]).toMatchObject({
      input: "5",
      expectedOutput: "15",
      isHidden: false,
    });
  });

  it("demonstrates the off-by-one result and its boundary correction", () => {
    expect(simulateLearningBoundaryDemo(LEARNING_BOUNDARY_DEMO.initialCode)).toEqual({
      passed: false,
      output: "10",
    });
    expect(simulateLearningBoundaryDemo(LEARNING_BOUNDARY_DEMO.correctedCode)).toEqual({
      passed: true,
      output: "15",
    });
  });

  it("does not invent a verdict for code outside the supported demo edit", () => {
    expect(simulateLearningBoundaryDemo("print('hello')")).toBeNull();
  });
});
