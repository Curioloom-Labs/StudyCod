import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "../i18n";
import { FailureRecoveryCard, hasFailureHintContext } from "./FailureRecoveryCard";

describe("failure recovery hint context", () => {
  it("does not invent a hint when a check has no diagnostic details", () => {
    expect(hasFailureHintContext({})).toBe(false);
    expect(hasFailureHintContext({ firstFailure: { inputPreview: "  ", expectedPreview: "" } })).toBe(false);
  });

  it("uses available diagnostics or public test evidence as hint context", () => {
    expect(hasFailureHintContext({ failureCategory: "off_by_one" })).toBe(true);
    expect(hasFailureHintContext({ compileError: "SyntaxError" })).toBe(true);
    expect(hasFailureHintContext({ firstFailure: { inputPreview: "5", expectedPreview: "15", actualPreview: "10" } })).toBe(true);
    expect(hasFailureHintContext({ availableHints: ["Compare the expected and actual values."] })).toBe(true);
  });

  it("shows an honest no-hint state and keeps the return-to-code action available", async () => {
    const originalLanguage = i18n.language;
    await i18n.changeLanguage("uk");
    try {
      const markup = renderToStaticMarkup(React.createElement(FailureRecoveryCard, {
        verdict: "WA",
        testsPassed: 1,
        testsTotal: 2,
        onTryAgain: () => undefined,
      }));
      expect(markup).toContain("У результаті немає даних для змістовної підказки.");
      expect(markup).not.toContain("Показати ще одну підказку");
      expect(markup).toContain("До свого коду");
    } finally {
      await i18n.changeLanguage(originalLanguage);
    }
  });

  it("uses the task's supplied hint when one is available", async () => {
    const originalLanguage = i18n.language;
    await i18n.changeLanguage("uk");
    try {
      const markup = renderToStaticMarkup(React.createElement(FailureRecoveryCard, {
        verdict: "WA",
        testsPassed: 1,
        testsTotal: 2,
        availableHints: ["Порівняй очікуване значення з отриманим."],
        onTryAgain: () => undefined,
      }));
      expect(markup).toContain("Підказка 1 з 1");
      expect(markup).toContain("Порівняй очікуване значення з отриманим.");
      expect(markup).not.toContain("У результаті немає даних для змістовної підказки.");
    } finally {
      await i18n.changeLanguage(originalLanguage);
    }
  });
});
