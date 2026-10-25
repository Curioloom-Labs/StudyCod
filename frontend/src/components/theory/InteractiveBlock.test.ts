import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { algorithmFrames, parseInteractiveSpec } from "./InteractiveBlock";

const parseAlgorithm = (algorithm: string, example: Record<string, unknown>) => parseInteractiveSpec(JSON.stringify({
  type: "algorithm",
  algorithm,
  examples: [example],
}));

describe("algorithm visualization input validation", () => {
  it("accepts valid inclusive range queries and rejects invalid indexes", () => {
    expect(parseAlgorithm("prefix-sums", {
      title: "Whole array",
      values: [4, -2, 7],
      queries: [[0, 2], [1, 1]],
    })?.type).toBe("algorithm");
    expect(parseAlgorithm("prefix-sums", {
      title: "Out of bounds",
      values: [4, -2, 7],
      queries: [[0, 3]],
    })).toBeNull();
  });

  it("only accepts sorted inputs for binary search and two pointers", () => {
    expect(parseAlgorithm("binary-search", { title: "Sorted", values: [1, 3, 3, 7], target: 3 })?.type).toBe("algorithm");
    expect(parseAlgorithm("binary-search", { title: "Unsorted", values: [1, 7, 3], target: 3 })).toBeNull();
    expect(parseAlgorithm("two-pointers", { title: "Unsorted", values: [1, 7, 3], target: 8 })).toBeNull();
  });

  it("rejects negative values for the sliding-window sum visualizer", () => {
    expect(parseAlgorithm("sliding-window", { title: "Invalid domain", values: [2, -1, 3], threshold: 4 })).toBeNull();
    expect(parseAlgorithm("sliding-window", { title: "Valid domain", values: [2, 0, 3], threshold: 4 })?.type).toBe("algorithm");
  });

  it("bounds expensive or oversized visualizations and accepts small DP edge cases", () => {
    expect(parseAlgorithm("enumerate-subarrays", { title: "Too many", values: Array(21).fill(1) })).toBeNull();
    expect(parseAlgorithm("insertion-sort", { title: "Too many", values: Array(31).fill(1) })).toBeNull();
    expect(parseAlgorithm("sieve", { title: "One", values: [1], size: 1 })?.type).toBe("algorithm");
    expect(parseAlgorithm("dp-counting", { title: "Zero stairs", values: [0], size: 0 })?.type).toBe("algorithm");
    expect(parseAlgorithm("dp-counting", { title: "Too many", values: [21], size: 21 })).toBeNull();
  });

});

describe("algorithm visualization localization", () => {
  it("localizes generated narration with the selected interface language", async () => {
    const examples = [
      { algorithm: "prefix-sums", values: [1, -1], queries: [[0, 1]] },
      { algorithm: "enumerate-subarrays", values: [1, -2, 3] },
      { algorithm: "kadane", values: [-1, 2] },
      { algorithm: "insertion-sort", values: [2, 1] },
      { algorithm: "binary-search", values: [1, 2], target: 3 },
      { algorithm: "two-pointers", values: [1, 3, 5], target: 7 },
      { algorithm: "sliding-window", values: [1, 0, 3], threshold: 1 },
      { algorithm: "sieve", values: [7], size: 7 },
      { algorithm: "dp-counting", values: [3], size: 3 },
    ];

    try {
      await i18n.changeLanguage("en");
      const englishLines = examples.flatMap(({ algorithm, ...example }) => {
        const parsed = parseInteractiveSpec(JSON.stringify({
          type: "algorithm",
          algorithm,
          examples: [{ title: "Example", ...example }],
        }));
        if (!parsed || parsed.type !== "algorithm") throw new Error(`Expected a valid ${algorithm} block`);
        return algorithmFrames(parsed, parsed.examples[0]).map((frame) => frame.line);
      });
      expect(englishLines).toContain("The search interval is empty: the value is absent.");
      expect(englishLines.every((line) => !/[\u0400-\u04FF]/.test(line))).toBe(true);

      const binarySearch = parseInteractiveSpec(JSON.stringify({
        type: "algorithm",
        algorithm: "binary-search",
        examples: [{ title: "Example", values: [1, 3, 5], target: 5 }],
      }));
      if (!binarySearch || binarySearch.type !== "algorithm") throw new Error("Expected a valid binary-search block");
      expect(algorithmFrames(binarySearch, binarySearch.examples[0])[0].line).toBe("Search for 5 in the sorted array.");

      await i18n.changeLanguage("uk");
      expect(algorithmFrames(binarySearch, binarySearch.examples[0])[0].line).toBe("Шукаємо 5 у відсортованому масиві.");
    } finally {
      await i18n.changeLanguage("uk");
    }
  });

  it("marks only strict new subarray maxima and localizes the marker", async () => {
    const parsed = parseAlgorithm("enumerate-subarrays", {
      title: "Tie and improvement",
      values: [1, 0, 1],
    });
    if (!parsed || parsed.type !== "algorithm") throw new Error("Expected a valid subarray visualization");

    try {
      await i18n.changeLanguage("en");
      const englishFrames = algorithmFrames(parsed, parsed.examples[0]);
      const firstMaximum = englishFrames.find((frame) => frame.line.startsWith("l=0, r=0:"));
      const tiedMaximum = englishFrames.find((frame) => frame.line.startsWith("l=0, r=1:"));
      const laterImprovement = englishFrames.find((frame) => frame.line.startsWith("l=0, r=2:"));
      expect(firstMaximum?.line).toContain("new maximum");
      expect(tiedMaximum?.line).not.toContain("new maximum");
      expect(laterImprovement?.line).toContain("new maximum");
      expect(englishFrames.every((frame) => !frame.line.includes("новий максимум"))).toBe(true);

      await i18n.changeLanguage("uk");
      const ukrainianFrames = algorithmFrames(parsed, parsed.examples[0]);
      expect(ukrainianFrames.find((frame) => frame.line.startsWith("l=0, r=0:"))?.line).toContain("новий максимум");
      expect(ukrainianFrames.find((frame) => frame.line.startsWith("l=0, r=1:"))?.line).not.toContain("новий максимум");
    } finally {
      await i18n.changeLanguage("uk");
    }
  });
});
