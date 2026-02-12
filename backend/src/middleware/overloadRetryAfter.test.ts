import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../utils/httpError";
import { setRetryAfterForOverload } from "./overloadRetryAfter";

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    res: {
      setHeader: (k: string, v: any) => {
        headers[String(k).toLowerCase()] = String(v);
      }
    } as any,
    headers,
  };
}

test("setRetryAfterForOverload: sets Retry-After for SYSTEM_BUSY 503", async () => {
  const err = new HttpError(503, "System busy", { code: "SYSTEM_BUSY", expose: true });
  const out = makeRes();

  const did = setRetryAfterForOverload(err, out.res);
  assert.equal(did, true);
  assert.ok(out.headers["retry-after"], "Retry-After should be present");

  const ra = Number(out.headers["retry-after"]);
  assert.ok(Number.isFinite(ra) && ra >= 1, `Retry-After must be >= 1, got ${out.headers["retry-after"]}`);
});

test("setRetryAfterForOverload: does not set header for other errors", async () => {
  const err = new HttpError(503, "Judge unavailable", { code: "JUDGE_UNAVAILABLE", expose: true });
  const out = makeRes();

  const did = setRetryAfterForOverload(err, out.res);
  assert.equal(did, false);
  assert.equal(out.headers["retry-after"], undefined);
});
