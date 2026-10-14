import test from "node:test";
import assert from "node:assert/strict";
import { credentialRequestHash, encryptCredentialResponse, decryptCredentialResponse } from "./credentialOperationCrypto";
import { validCredentialOperationKey } from "./credentialOperations";

test("credential envelope roundtrips Unicode and special passwords without plaintext at rest", () => {
  const value = { credentials: [{ firstName: "Іван", password: "@БезЗмін123" }] };
  const a = encryptCredentialResponse(value, "actor/class/key/kind/hash", "fixture-secret"), b = encryptCredentialResponse(value, "actor/class/key/kind/hash", "fixture-secret");
  assert.notEqual(a, b); assert.equal(a.includes("@БезЗмін123"), false);
  assert.deepEqual(decryptCredentialResponse(a, "actor/class/key/kind/hash", "fixture-secret"), value);
});
test("credential envelope rejects a different owner/context, key rotation and tampered cipher/tag", () => {
  const envelope = encryptCredentialResponse({ password: "FixturePassword12" }, "owner-A", "fixture-secret");
  assert.throws(() => decryptCredentialResponse(envelope, "owner-B", "fixture-secret"));
  assert.throws(() => decryptCredentialResponse(envelope, "owner-A", "rotated-secret"));
  for (const index of [1, 2, 3]) {
    const parts = envelope.split("."); parts[index] = (parts[index][0] === "A" ? "B" : "A") + parts[index].slice(1);
    assert.throws(() => decryptCredentialResponse(parts.join("."), "owner-A", "fixture-secret"));
  }
  assert.throws(() => decryptCredentialResponse("v2.invalid", "owner-A", "fixture-secret"));
});
test("request fingerprints are canonical, secret-bound, sensitive to password and row order", () => {
  const a = { kind: "IMPORT", rows: [{ firstName: "A", password: "First123" }, { firstName: "B" }] };
  assert.equal(credentialRequestHash(a, "secret"), credentialRequestHash({ rows: a.rows.map(row => ({ password: row.password, firstName: row.firstName })), kind: "IMPORT" }, "secret"));
  assert.notEqual(credentialRequestHash(a, "secret"), credentialRequestHash(a, "other"));
  assert.notEqual(credentialRequestHash(a, "secret"), credentialRequestHash({ ...a, rows: [...a.rows].reverse() }, "secret"));
  assert.notEqual(credentialRequestHash(a, "secret"), credentialRequestHash({ ...a, rows: [{ firstName: "A", password: "Changed123" }, a.rows[1]] }, "secret"));
});
test("operation keys accept UUIDs only and reject unsafe path/input values", () => {
  assert.equal(validCredentialOperationKey("9b9cef30-7ff2-4d27-b121-6275d0803843"), true);
  for (const key of [undefined, 1, "", "../key", "x".repeat(100), "9b9cef30-7ff2-4d27-1121-6275d0803843"]) assert.equal(validCredentialOperationKey(key), false);
});
