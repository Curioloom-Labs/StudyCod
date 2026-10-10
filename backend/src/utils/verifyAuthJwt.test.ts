import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import { verifyAuthJwt } from "./verifyAuthJwt";

test("the same request validates an identical token once; separate requests validate independently", t => {
  const token = jwt.sign({ userId: 7 }, JWT_SECRET, { expiresIn: "1h" });
  const spy = t.mock.method(jwt, "verify");
  const request = {};
  assert.equal(verifyAuthJwt(request, token).userId, 7);
  assert.equal(verifyAuthJwt(request, token).userId, 7);
  assert.equal(spy.mock.callCount(), 1);
  assert.equal(verifyAuthJwt({}, token).userId, 7);
  assert.equal(spy.mock.callCount(), 2);
});
test("a changed token in the same request is checked again", t => {
  const first = jwt.sign({ userId: 7 }, JWT_SECRET), second = jwt.sign({ studentId: 8, type: "STUDENT" }, JWT_SECRET);
  const spy = t.mock.method(jwt, "verify"), request = {};
  assert.equal(verifyAuthJwt(request, first).userId, 7);
  assert.equal(verifyAuthJwt(request, second).studentId, 8);
  assert.equal(spy.mock.callCount(), 2);
});
test("tampering, another algorithm and string claims are rejected", () => {
  const token = jwt.sign({ userId: 7 }, JWT_SECRET);
  const [header, , signature] = token.split(".");
  assert.throws(() => verifyAuthJwt({}, `${header}.${Buffer.from('{"userId":8}').toString("base64url")}.${signature}`));
  assert.throws(() => verifyAuthJwt({}, jwt.sign({ userId: 7 }, JWT_SECRET, { algorithm: "HS384" })));
  assert.throws(() => verifyAuthJwt({}, jwt.sign("string claims", JWT_SECRET)));
});
test("expiration and not-before are checked again even within one request", t => {
  let now = 1700000000000;
  t.mock.method(Date, "now", () => now);
  const request = {}, token = jwt.sign({ userId: 7 }, JWT_SECRET, { expiresIn: 1, notBefore: 0 });
  assert.equal(verifyAuthJwt(request, token).userId, 7);
  now += 2000;
  assert.throws(() => verifyAuthJwt(request, token), /expired/);
  now -= 3000;
  assert.throws(() => verifyAuthJwt(request, token), /not active/);
});
