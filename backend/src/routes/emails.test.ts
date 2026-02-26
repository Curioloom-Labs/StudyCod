import { test, describe } from "node:test";
import assert from "node:assert";

import jwt from "jsonwebtoken";

describe("emails unsubscribe/subscribe token", () => {
  test("token contains expected shape", () => {
    const secret = "test-secret";
    const token = jwt.sign({
      t: "email-pref",
      action: "unsubscribe",
      kind: "user",
      id: 1,
      email: "a@example.com",
    }, secret, { expiresIn: "1h" });

    const decoded: any = jwt.verify(token, secret);
    assert.equal(decoded.t, "email-pref");
    assert.equal(decoded.action, "unsubscribe");
    assert.equal(decoded.kind, "user");
    assert.equal(decoded.id, 1);
    assert.equal(decoded.email, "a@example.com");
  });
});
