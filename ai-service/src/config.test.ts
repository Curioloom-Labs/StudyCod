import assert from "node:assert/strict";
import test from "node:test";
import { readAIServiceConfig } from "./config";

const originalEnvironment = { ...process.env };

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    process.env[key] = value;
  }
});

test("uses a safe development default for the port and CORS", () => {
  delete process.env.AI_SERVICE_PORT;
  delete process.env.CORS_ORIGIN;
  process.env.NODE_ENV = "development";

  assert.deepEqual(readAIServiceConfig(), {
    port: 3001,
    isProduction: false,
    corsOrigins: ["http://localhost:5173"]
  });
});

test("parses and trims multiple CORS origins", () => {
  process.env.AI_SERVICE_PORT = " 4010 ";
  process.env.CORS_ORIGIN = "https://one.example, https://two.example ,,";
  process.env.NODE_ENV = "production";

  assert.deepEqual(readAIServiceConfig(), {
    port: 4010,
    isProduction: true,
    corsOrigins: ["https://one.example", "https://two.example"]
  });
});

test("falls back when the configured port is outside the valid range", () => {
  process.env.AI_SERVICE_PORT = "70000";
  process.env.CORS_ORIGIN = "https://app.example";

  assert.equal(readAIServiceConfig().port, 3001);
});
