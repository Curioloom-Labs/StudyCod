import { describe, expect, it } from "vitest";
import { getAssistantFailures, getIdeSaveStatusLabel, reconcileMobilePaneAfterResult } from "./editorFeedback";

describe("IDE feedback states", () => {
  it("gives the mentor only failed public test details and bounds the context", () => {
    expect(getAssistantFailures([
      { testId: 1, passed: true, input: "public pass" },
      { testId: 2, passed: false, input: "x", expectedOutput: "2", actualOutput: "3", verdict: "WA" },
      { testId: 3, passed: false, stderr: "runtime error" },
      { testId: 4, passed: false },
      { testId: 6, passed: false, skipped: true, input: "was not run" },
      { testId: 5, passed: false, input: "outside limit" },
    ])).toEqual([
      { testId: 2, input: "x", expected: "2", actual: "3", verdict: "WA", stderr: null },
      { testId: 3, input: "", expected: "", actual: "", verdict: undefined, stderr: "runtime error" },
      { testId: 4, input: "", expected: "", actual: "", verdict: undefined, stderr: null },
    ]);
  });

  it("shows a completed result only when the learner was still coding", () => {
    expect(reconcileMobilePaneAfterResult("code")).toEqual({ pane: "result", unread: false });
    expect(reconcileMobilePaneAfterResult("condition")).toEqual({ pane: "condition", unread: true });
    expect(reconcileMobilePaneAfterResult("result")).toEqual({ pane: "result", unread: false });
  });

  it("announces each save state and includes the time only after a successful save", () => {
    const labels = { saved: "Збережено", dirty: "Є зміни", saving: "Збереження…", error: "Помилка збереження" };
    const formatTimestamp = (timestamp: string) => `at ${timestamp}`;
    expect(getIdeSaveStatusLabel("saving", null, labels, formatTimestamp)).toBe("Збереження…");
    expect(getIdeSaveStatusLabel("dirty", null, labels, formatTimestamp)).toBe("Є зміни");
    expect(getIdeSaveStatusLabel("error", null, labels, formatTimestamp)).toBe("Помилка збереження");
    expect(getIdeSaveStatusLabel("saved", "10:30", labels, formatTimestamp)).toBe("Збережено at 10:30");
    expect(getIdeSaveStatusLabel(undefined, null, labels, formatTimestamp)).toBeNull();
  });
});
