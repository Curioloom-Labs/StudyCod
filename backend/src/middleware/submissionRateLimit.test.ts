import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { submissionRateLimitMiddleware } from "./submissionRateLimit";
import { env } from "../env";

function makeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: any = undefined;

  const res = {
    setHeader: (k: string, v: any) => {
      headers[String(k).toLowerCase()] = String(v);
    },
    status: (n: number) => {
      statusCode = n;
      return res;
    },
    json: (v: any) => {
      body = v;
      return res;
    }
  } as any;

  return {
    res,
    get headers() {
      return headers;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    }
  };
}

function makeTrackedRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: any = undefined;
  const events = new EventEmitter();

  const res = {
    setHeader: (k: string, v: any) => {
      headers[String(k).toLowerCase()] = String(v);
    },
    status: (n: number) => {
      statusCode = n;
      return res;
    },
    json: (v: any) => {
      body = v;
      return res;
    },
    on: (event: string, cb: (...args: any[]) => void) => {
      events.on(event, cb);
      return res;
    },
  } as any;

  return {
    res,
    finish: () => {
      events.emit("finish");
    },
    close: () => {
      events.emit("close");
    },
    get headers() {
      return headers;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    }
  };
}

test("submissionRateLimitMiddleware: blocks after 5 submissions/10s with Retry-After", async () => {
  const principalId = Math.floor(Date.now() % 1_000_000_000);
  const reqBase: any = {
    principalId,
    ip: `127.0.0.${(principalId % 200) + 1}`,
    headers: {},
  };

  let nextCalls = 0;
  const next = () => {
    nextCalls++;
  };

  // First 5 should pass.
  for (let i = 0; i < 5; i++) {
    const { res, statusCode } = makeRes();
    await submissionRateLimitMiddleware(reqBase, res, next);
    assert.equal(statusCode, 200);
  }

  // 6th should be limited.
  const out = makeRes();
  await submissionRateLimitMiddleware(reqBase, out.res, next);

  assert.equal(out.statusCode, 429);
  assert.deepEqual(out.body, { error: "Too many submissions", status: 429 });
  assert.ok(out.headers["retry-after"], "Retry-After header should be present");

  const ra = Number(out.headers["retry-after"]);
  assert.ok(Number.isFinite(ra) && ra >= 1, `Retry-After must be >= 1, got ${out.headers["retry-after"]}`);

  // next should have been called only for the allowed requests.
  assert.equal(nextCalls, 5);
});

test("submissionRateLimitMiddleware: blocks when in-flight submissions exceed configured cap and releases after finish", async () => {
  const originalInFlightMax = (env as any).__rateLimitInFlightMax;
  const originalShortMax = (env as any).__rateLimitShortMax;
  const originalLongMax = (env as any).__rateLimitLongMax;
  const originalMaxQueue = (env as any).__maxExecutionQueueSize;

  (env as any).__rateLimitInFlightMax = 1;
  (env as any).__rateLimitShortMax = 100;
  (env as any).__rateLimitLongMax = 100;
  (env as any).__maxExecutionQueueSize = 100;

  try {
    const principalId = Math.floor((Date.now() + 12345) % 1_000_000_000);
    const reqBase: any = {
      principalId,
      ip: `127.0.0.${(principalId % 200) + 1}`,
      headers: {},
    };

    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };

    const first = makeTrackedRes();
    await submissionRateLimitMiddleware(reqBase, first.res, next);
    assert.equal(first.statusCode, 200);

    const second = makeTrackedRes();
    await submissionRateLimitMiddleware(reqBase, second.res, next);
    assert.equal(second.statusCode, 429);
    assert.deepEqual(second.body, { error: "Too many submissions", status: 429 });

    first.finish();

    const third = makeTrackedRes();
    await submissionRateLimitMiddleware(reqBase, third.res, next);
    assert.equal(third.statusCode, 200);

    assert.equal(nextCalls, 2);
  } finally {
    (env as any).__rateLimitInFlightMax = originalInFlightMax;
    (env as any).__rateLimitShortMax = originalShortMax;
    (env as any).__rateLimitLongMax = originalLongMax;
    (env as any).__maxExecutionQueueSize = originalMaxQueue;
  }
});
