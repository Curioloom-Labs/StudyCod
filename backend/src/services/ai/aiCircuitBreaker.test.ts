import test from "node:test";
import assert from "node:assert/strict";
import {
  isAiCircuitOpen,
  recordAiCircuitFailure,
  recordAiCircuitSuccess,
  CIRCUIT_FAILURES_TO_OPEN,
  __resetLocalAiCircuitForTests,
} from "./aiCircuitBreaker";

// In the test environment Redis is disabled, so these exercise the in-memory
// fallback path — which must keep the exact original breaker semantics.
test("breaker opens at the failure threshold and closes on success", async () => {
  __resetLocalAiCircuitForTests();
  const mode = "unit-test-mode";

  assert.equal(await isAiCircuitOpen(mode), false);

  // Stays closed until one short of the threshold.
  for (let i = 0; i < CIRCUIT_FAILURES_TO_OPEN - 1; i++) {
    await recordAiCircuitFailure(mode);
    assert.equal(await isAiCircuitOpen(mode), false, `should be closed before threshold (i=${i})`);
  }

  // The threshold failure opens it.
  await recordAiCircuitFailure(mode);
  assert.equal(await isAiCircuitOpen(mode), true);

  // A success resets it.
  await recordAiCircuitSuccess(mode);
  assert.equal(await isAiCircuitOpen(mode), false);
});

test("distinct modes have independent breakers", async () => {
  __resetLocalAiCircuitForTests();
  for (let i = 0; i < CIRCUIT_FAILURES_TO_OPEN; i++) {
    await recordAiCircuitFailure("mode-a");
  }
  assert.equal(await isAiCircuitOpen("mode-a"), true);
  assert.equal(await isAiCircuitOpen("mode-b"), false);
});
