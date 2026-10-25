import { describe, expect, it } from "vitest";
import { interactiveLessonToMarkdown, type InteractiveLesson } from "./lessonBlocks";

const labels = {
  objectives: "Objectives",
  summary: "Summary",
  callout: { info: "Note", tip: "Tip", warning: "Warning" },
  correctAnswer: "Correct answer",
};

describe("interactiveLessonToMarkdown", () => {
  it("keeps examples, hints, checks, and their explanation readable", () => {
    const lesson: InteractiveLesson = {
      objectives: ["Trace a loop"],
      sections: [{
        heading: "Walkthrough",
        blocks: [
          { type: "callout", variant: "tip", markdown: "Check the loop bound.\nThen test the last item." },
          { type: "code", language: "python", caption: "A short example", code: "print(1)\n```\nprint(2)" },
          { type: "check", question: "What is printed?", options: ["1", "2"], correct: 0, explanation: "The first statement runs first." },
        ],
      }],
      summary: ["One pass takes O(n)."],
    };

    const markdown = interactiveLessonToMarkdown(lesson, labels);

    expect(markdown).toContain("## Objectives\n\n- Trace a loop");
    expect(markdown).toContain("> **Tip**\n> Check the loop bound.\n> Then test the last item.");
    expect(markdown).toContain("````python\nprint(1)\n```\nprint(2)\n````");
    expect(markdown).toContain("**What is printed?**\n\n- **✓** 1\n- 2");
    expect(markdown).toContain("> Correct answer: 1\n> The first statement runs first.");
    expect(markdown).toContain("## Summary\n\n- One pass takes O(n).");
  });
});
