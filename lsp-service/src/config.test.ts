import assert from "node:assert/strict";
import test from "node:test";
import { childProcessEnvironment, readLspConfig } from "./config";

const originalEnvironment = { ...process.env };

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    process.env[key] = value;
  }
});

test("uses bounded defaults for the LSP runtime", () => {
  delete process.env.LSP_PORT;
  delete process.env.LSP_MAX_BODY_BYTES;
  delete process.env.LSP_DEBUG;

  const config = readLspConfig();
  assert.equal(config.port, 4010);
  assert.equal(config.maxBodyBytes, 2 * 1024 * 1024);
  assert.equal(config.debug, false);
});

test("normalizes configured paths and keeps HOME scoped to child processes", () => {
  process.env.LSP_DATA_DIR = "./workspace";
  process.env.LSP_HOME = "/srv/lsp-home";
  process.env.LSP_DEBUG = "1";

  const config = readLspConfig();
  const childEnv = childProcessEnvironment(config);

  assert.equal(config.root.endsWith("workspace"), true);
  assert.equal(config.home, "/srv/lsp-home");
  assert.equal(config.debug, true);
  assert.equal(childEnv.HOME, "/srv/lsp-home");
});

test("enforces minimum request body and session limits", () => {
  process.env.LSP_MAX_BODY_BYTES = "1";
  process.env.LSP_MAX_SESSIONS = "0";
  process.env.LSP_MAX_PENDING_REQUESTS = "-5";

  const config = readLspConfig();
  assert.equal(config.maxBodyBytes, 64 * 1024);
  assert.equal(config.maxSessions, 16);
  assert.equal(config.maxPendingRequests, 64);
});
