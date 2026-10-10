import { describe, expect, it } from "vitest";
import { getLearningContentState } from "./learningContentState";

describe("learning content load states", () => {
  it("keeps initial loading separate from an empty success", () => {
    expect(getLearningContentState({ loading: true, hasError: false, hasData: false })).toBe("loading");
    expect(getLearningContentState({ loading: false, hasError: false, hasData: false })).toBe("empty");
  });

  it("does not turn a first request failure into an empty state", () => {
    expect(getLearningContentState({ loading: false, hasError: true, hasData: false })).toBe("error");
  });

  it("preserves existing content while refreshing and after a refresh failure", () => {
    expect(getLearningContentState({ loading: true, hasError: false, hasData: true })).toBe("refreshing");
    expect(getLearningContentState({ loading: false, hasError: true, hasData: true })).toBe("stale");
    expect(getLearningContentState({ loading: false, hasError: false, hasData: true })).toBe("ready");
  });
});
