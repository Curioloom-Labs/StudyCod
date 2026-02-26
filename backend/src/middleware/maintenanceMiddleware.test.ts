import test from "node:test";
import assert from "node:assert/strict";

import { isMaintenanceBypassPath } from "./maintenanceMiddleware";

test("maintenance bypass allowlist includes maintenance status", () => {
  assert.equal(isMaintenanceBypassPath("/api/auth/maintenance"), true);
  assert.equal(isMaintenanceBypassPath("/auth/maintenance"), true);
});

test("maintenance bypass allowlist includes login", () => {
  assert.equal(isMaintenanceBypassPath("/api/auth/login"), true);
  assert.equal(isMaintenanceBypassPath("/auth/login"), true);
});

test("maintenance bypass allowlist includes admin routes", () => {
  assert.equal(isMaintenanceBypassPath("/api/admin"), true);
  assert.equal(isMaintenanceBypassPath("/api/admin/maintenance"), true);
  assert.equal(isMaintenanceBypassPath("/admin"), true);
  assert.equal(isMaintenanceBypassPath("/admin/maintenance"), true);
});

test("maintenance bypass allowlist includes health endpoints", () => {
  assert.equal(isMaintenanceBypassPath("/health"), true);
  assert.equal(isMaintenanceBypassPath("/api/health"), true);
});

test("maintenance bypass does not include generic auth routes", () => {
  assert.equal(isMaintenanceBypassPath("/api/auth/register"), false);
  assert.equal(isMaintenanceBypassPath("/api/auth/forgot-password"), false);
  assert.equal(isMaintenanceBypassPath("/auth/google/callback"), false);
});
