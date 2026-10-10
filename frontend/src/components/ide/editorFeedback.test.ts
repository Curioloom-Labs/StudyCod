import { describe, expect, it } from "vitest";
import { getIdeSaveStatusLabel, reconcileMobilePaneAfterResult } from "./editorFeedback";

describe("IDE feedback states", () => {
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
