import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseInteractiveSpec } from "./InteractiveBlock";

describe("Olympiad theory visualization blocks", () => {
  it("accepts every interactive block authored in all six course theory files", () => {
    const languages = ["python", "java", "cpp"];
    const requiredAlgorithms = new Set([
      "prefix-sums",
      "enumerate-subarrays",
      "kadane",
      "insertion-sort",
      "binary-search",
      "two-pointers",
      "sliding-window",
      "sieve",
      "dp-counting",
    ]);
    let blockCount = 0;

    for (const language of languages) {
      for (const locale of ["uk", "en"]) {
        const relativePath = locale === "en"
          ? `../../../../theories/en/olympiad_${language}_theory.yml`
          : `../../../../theories/olympiad_${language}_theory.yml`;
        const fileUrl = new URL(relativePath, import.meta.url);
        const document = yaml.load(readFileSync(fileUrl, "utf8"));
        const algorithms = new Set();
        let hasRangeSumExample = false;

        for (const topic of document.topics ?? []) {
          const blocks = String(topic.theory ?? "").matchAll(/```interactive\s*([\s\S]*?)```/g);
          for (const block of blocks) {
            const parsed = parseInteractiveSpec(block[1].trim());
            expect(parsed, `${fileUrl.pathname} topic ${topic.key ?? "(unknown)"}`).not.toBeNull();
            blockCount += 1;
            if (parsed?.type === "algorithm") {
              expect(parsed.examples.length, `${topic.key} selectable algorithm examples`).toBeGreaterThan(1);
              algorithms.add(parsed.algorithm);
              if (parsed.algorithm === "prefix-sums" && parsed.examples.some((example) => example.queries?.length)) {
                hasRangeSumExample = true;
              }
            }
          }
        }

        expect(algorithms, `${fileUrl.pathname} algorithm coverage`).toEqual(requiredAlgorithms);
        expect(hasRangeSumExample, `${fileUrl.pathname} prefix range-sum example`).toBe(true);
      }
    }

    expect(blockCount).toBeGreaterThan(0);
  });
});
