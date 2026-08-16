import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseGenericPersonalFallback } from "./taskGenerationPolicy";

test("catalog practice disables the generic fallback", () => {
  assert.equal(shouldUseGenericPersonalFallback("CATALOG_ITEM:42"), false);
});

test("personal practice keeps the generic fallback", () => {
  assert.equal(shouldUseGenericPersonalFallback("PERSONAL_TOPIC:python"), true);
  assert.equal(shouldUseGenericPersonalFallback(undefined), true);
});
