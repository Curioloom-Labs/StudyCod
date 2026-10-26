import { describe, expect, it } from "vitest";
import { hasFailureHintContext } from "./FailureRecoveryCard";

describe("failure recovery hint context", () => {
  it("does not invent a hint when a check has no diagnostic details", () => {
    expect(hasFailureHintContext({})).toBe(false);
    expect(hasFailureHintContext({ firstFailure: { inputPreview: "  ", expectedPreview: "" } })).toBe(false);
  });

  it("uses available diagnostics or public test evidence as hint context", () => {
    expect(hasFailureHintContext({ failureCategory: "off_by_one" })).toBe(true);
    expect(hasFailureHintContext({ compileError: "SyntaxError" })).toBe(true);
    expect(hasFailureHintContext({ firstFailure: { inputPreview: "5", expectedPreview: "15", actualPreview: "10" } })).toBe(true);
  });
});
