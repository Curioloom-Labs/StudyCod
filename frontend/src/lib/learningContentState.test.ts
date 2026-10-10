import { describe, expect, it } from "vitest";
import { getLearningContentState } from "./learningContentState";

describe("learning content states", () => {
  it("distinguishes the initial load, an empty response, and an initial failure", () => {
    expect(getLearningContentState({ loading: true, hasError: false, hasData: false })).toBe("loading");
    expect(getLearningContentState({ loading: false, hasError: false, hasData: false })).toBe("empty");
    expect(getLearningContentState({ loading: false, hasError: true, hasData: false })).toBe("error");
  });

  it("keeps usable data visible during refresh and after a failed refresh", () => {
    expect(getLearningContentState({ loading: true, hasError: false, hasData: true })).toBe("refreshing");
    expect(getLearningContentState({ loading: false, hasError: true, hasData: true })).toBe("stale");
    expect(getLearningContentState({ loading: false, hasError: false, hasData: true })).toBe("ready");
  });
});
