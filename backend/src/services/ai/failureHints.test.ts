import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeGeneratedHints } from "./failureHints";

test("sanitizeGeneratedHints removes solution leaks and bounds hint text", () => {
  const hints = sanitizeGeneratedHints([
    "Check the loop invariant.",
    "```python\nprint(answer)\n```",
    "Here is the complete solution: use this code",
    "1. Check the loop invariant.",
    "A".repeat(521)
  ], 4);

  assert.deepEqual(hints, ["Check the loop invariant."]);
});

test("sanitizeGeneratedHints deduplicates case-insensitively", () => {
  assert.deepEqual(
    sanitizeGeneratedHints(["Compare the accumulator", "compare the accumulator", "Check input shape"], 3),
    ["Compare the accumulator", "Check input shape"]
  );
});
