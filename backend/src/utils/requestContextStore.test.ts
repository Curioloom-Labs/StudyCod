import test from "node:test";
import assert from "node:assert/strict";
import { logger } from "./logger";
import { runWithRequestContext, setRequestContextFields } from "./requestContextStore";

function captureLog(fn: () => void): any[] {
  const calls: any[] = [];
  const orig = console.log;
  console.log = (...args: any[]) => { calls.push(args); };
  try { fn(); } finally { console.log = orig; }
  return calls;
}

test("auto-injects requestId from the active context into object meta", () => {
  const calls = captureLog(() => {
    runWithRequestContext({ requestId: "req-123" }, () => {
      logger.info("hello", { foo: "bar" });
    });
  });
  assert.equal(calls.length, 1);
  const payload = calls[0][2];
  assert.equal(payload.requestId, "req-123");
  assert.equal(payload.foo, "bar");
});

test("adds requestId even when no meta is passed", () => {
  const calls = captureLog(() => {
    runWithRequestContext({ requestId: "req-xyz" }, () => logger.info("hi"));
  });
  assert.equal(calls[0][2].requestId, "req-xyz");
});

test("does not add requestId outside a request context", () => {
  const calls = captureLog(() => logger.info("hello", { foo: "bar" }));
  const payload = calls[0][2];
  assert.equal(payload.requestId, undefined);
  assert.equal(payload.foo, "bar");
});

test("explicit meta.requestId wins over the ambient one", () => {
  const calls = captureLog(() => {
    runWithRequestContext({ requestId: "ambient" }, () => {
      logger.info("x", { requestId: "explicit" });
    });
  });
  assert.equal(calls[0][2].requestId, "explicit");
});

test("includes principalId once set on the context", () => {
  const calls = captureLog(() => {
    runWithRequestContext({ requestId: "r" }, () => {
      setRequestContextFields({ principalId: 42 });
      logger.info("x");
    });
  });
  assert.equal(calls[0][2].requestId, "r");
  assert.equal(calls[0][2].principalId, 42);
});

test("context propagates across awaits (deep call simulation)", async () => {
  const deepLog = async () => {
    await Promise.resolve();
    const calls = captureLog(() => logger.info("deep"));
    return calls[0][2];
  };
  const payload = await runWithRequestContext({ requestId: "deep-req" }, () => deepLog());
  assert.equal(payload.requestId, "deep-req");
});
