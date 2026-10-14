import test from "node:test";
import assert from "node:assert/strict";
import { studentMarketingEnabled } from "./studentMarketingConsent";

test("a linked account opt-out cannot be bypassed by targeting its class mailbox", () => {
  assert.equal(studentMarketingEnabled({ email: "student@example.test", marketingEmailsEnabled: true,
    user: { email: "student@example.test", marketingEmailsEnabled: false } }), false);
});
test("same mailbox comparison ignores surrounding spaces and case", () => {
  assert.equal(studentMarketingEnabled({ email: " Student@Example.Test ", marketingEmailsEnabled: true,
    user: { email: "student@example.test", marketingEmailsEnabled: false } }), false);
});
test("class-specific opt-out remains effective even when the account is subscribed", () => {
  assert.equal(studentMarketingEnabled({ email: "student@example.test", marketingEmailsEnabled: false,
    user: { email: "student@example.test", marketingEmailsEnabled: true } }), false);
});
test("a separate guardian mailbox retains its own class preference", () => {
  assert.equal(studentMarketingEnabled({ email: "guardian@example.test", marketingEmailsEnabled: true,
    user: { email: "student@example.test", marketingEmailsEnabled: false } }), true);
});
test("legacy students without an account retain class preferences", () => {
  assert.equal(studentMarketingEnabled({ email: "legacy@example.test", marketingEmailsEnabled: true }), true);
  assert.equal(studentMarketingEnabled({ email: "legacy@example.test", marketingEmailsEnabled: false }), false);
});
test("an account without a mailbox does not suppress the class contact address", () => {
  assert.equal(studentMarketingEnabled({ email: "class@example.test", marketingEmailsEnabled: true,
    user: { email: null, marketingEmailsEnabled: false } }), true);
});
