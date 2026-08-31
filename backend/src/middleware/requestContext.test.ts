import test from "node:test";
import assert from "node:assert/strict";
import { requestContextMiddleware } from "./requestContext";

function runWithHeader(header: unknown): { requestId: string; echoed: string } {
  const req = { headers: header === undefined ? {} : { "x-request-id": header } } as any;
  const response = {
    locals: {} as Record<string, unknown>,
    setHeader(name: string, value: string) {
      if (name === "X-Request-Id") this.echoed = value;
    },
    echoed: ""
  } as any;

  requestContextMiddleware(req, response, () => undefined);
  return { requestId: String(req.requestId), echoed: response.echoed };
}

test("request context preserves bounded safe correlation ids", () => {
  const result = runWithHeader("proxy-req_123:abc");
  assert.equal(result.requestId, "proxy-req_123:abc");
  assert.equal(result.echoed, result.requestId);
});

test("request context replaces invalid, repeated, and oversized ids", () => {
  for (const header of ["bad id", "bad\r\nX-Injected: yes", ["first", "second"], "x".repeat(129)]) {
    const result = runWithHeader(header);
    assert.notEqual(result.requestId, String(header));
    assert.match(result.requestId, /^[A-Za-z0-9-]+$/);
    assert.equal(result.echoed, result.requestId);
  }
});
