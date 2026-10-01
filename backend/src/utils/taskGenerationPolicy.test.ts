import test from "node:test";
import assert from "node:assert/strict";
import { canUseTaskExamplesAfterTestFailure, shouldUseGenericPersonalFallback } from "./taskGenerationPolicy";

test("catalog practice disables the generic fallback", () => {
  assert.equal(shouldUseGenericPersonalFallback("CATALOG_ITEM:42"), false);
});

test("personal practice keeps the generic fallback", () => {
  assert.equal(shouldUseGenericPersonalFallback("PERSONAL_TOPIC:python"), true);
  assert.equal(shouldUseGenericPersonalFallback(undefined), true);
});

test('rejected task/test contracts cannot be replaced with their own examples', () => {
  assert.equal(canUseTaskExamplesAfterTestFailure({ statusCode: 400 }), false);
  assert.equal(canUseTaskExamplesAfterTestFailure({ statusCode: 504, details: { validationError: 'Example 2: expected 10.0, got 12.0' } }), false);
  assert.equal(canUseTaskExamplesAfterTestFailure(undefined), false);
});

test('reviewed task examples remain available during genuine provider outages', () => {
  for (const statusCode of [429, 503, 504]) {
    assert.equal(canUseTaskExamplesAfterTestFailure({ statusCode }), true);
  }
});
