import test from "node:test";
import assert from "node:assert/strict";
import { submissionRateLimitMiddleware } from "./submissionRateLimit";

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
    submissionRateLimitMiddleware(reqBase, res, next);
    assert.equal(statusCode, 200);
  }

  // 6th should be limited.
  const out = makeRes();
  submissionRateLimitMiddleware(reqBase, out.res, next);

  assert.equal(out.statusCode, 429);
  assert.deepEqual(out.body, { error: "Too many submissions", status: 429 });
  assert.ok(out.headers["retry-after"], "Retry-After header should be present");

  const ra = Number(out.headers["retry-after"]);
  assert.ok(Number.isFinite(ra) && ra >= 1, `Retry-After must be >= 1, got ${out.headers["retry-after"]}`);

  // next should have been called only for the allowed requests.
  assert.equal(nextCalls, 5);
});
