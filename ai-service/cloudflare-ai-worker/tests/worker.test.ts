import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkAuth,
  isJSONMode,
  normalizeMode,
  resolveMaxTokens,
  secretsMatch,
} from "../src/index";

test("normalizes supported and unknown modes", () => {
  assert.equal(normalizeMode("generate_task"), "generate-task");
  assert.equal(normalizeMode("generate-task-condition"), "generate-task-condition");
  assert.equal(normalizeMode("unknown-mode"), "generate-text");
});

test("detects JSON modes and respects token limits", () => {
  assert.equal(isJSONMode("generate-json"), true);
  assert.equal(isJSONMode("generate-text"), false);
  assert.equal(isJSONMode("generate-text", {}), true);
  assert.equal(resolveMaxTokens("generate-theory"), 4000);
  assert.equal(resolveMaxTokens("generate-text", 9000), 4096);
});

test("compares internal secrets without accepting empty values", () => {
  assert.equal(secretsMatch("secret", "secret"), true);
  assert.equal(secretsMatch("secret", "other"), false);
  assert.equal(secretsMatch("", ""), false);
});

test("fails closed in production when the worker secret is missing", async () => {
  const response = checkAuth(
    new Request("https://worker.example.test"),
    { ENVIRONMENT: "production", AI: { run: async () => ({}) } },
    {},
  );

  assert.ok(response);
  assert.equal(response.status, 503);
});

test("rejects an invalid internal secret", () => {
  const response = checkAuth(
    new Request("https://worker.example.test", { headers: { "x-internal-secret": "wrong" } }),
    { ENVIRONMENT: "production", WORKER_SHARED_SECRET: "right", AI: { run: async () => ({}) } },
    {},
  );

  assert.ok(response);
  assert.equal(response.status, 403);
});
