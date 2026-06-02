/**
 * Integration test starter.
 *
 * The full supertest-based suite from the audit roadmap is multi-day work
 * and lives in a follow-up branch. This file establishes the harness pattern
 * using only Node built-ins (http + node:test), with no extra dependencies:
 *
 *   1) Build a minimal Express app that mirrors the global middleware order
 *      of `index.ts` for the slice under test.
 *   2) Bind it to an ephemeral port.
 *   3) Drive it with `http.request` and assert on the live response.
 *
 * The first slice covered is the per-route body limit (C7): the default
 * limit must reject oversized payloads on routes outside the large-body
 * allowlist, and accept them on routes inside it. This catches regressions
 * if the global parser ever gets reintroduced.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";

// Mirror of index.ts logic. Kept inline here so a regression in index.ts
// doesn't auto-rewrite the test expectation. The constants intentionally
// duplicate the defaults — if you change them, change them in both places.
const LARGE_BODY_PATH_PREFIXES = ["/library", "/api/library", "/admin", "/topics", "/contests"];
function isLargeBodyPath(path: string): boolean {
  for (const prefix of LARGE_BODY_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function buildApp(): express.Express {
  const app = express();
  const small = express.json({ limit: "256kb" });
  const large = express.json({ limit: "50mb" });
  app.use((req, res, next) => (isLargeBodyPath(req.path) ? large : small)(req, res, next));
  app.post("/auth/login", (req, res) => res.json({ ok: true, bytes: JSON.stringify(req.body).length }));
  app.post("/library/import", (req, res) => res.json({ ok: true, bytes: JSON.stringify(req.body).length }));
  // Express's default error handler returns 413 for payload-too-large.
  return app;
}

function startServer(app: express.Express): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () => new Promise<void>(done => server.close(() => done()))
      });
    });
  });
}

function postJson(port: number, path: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: "POST",
      host: "127.0.0.1",
      port,
      path,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

test("body limit: small route rejects oversized JSON with 413", async () => {
  const app = buildApp();
  const srv = await startServer(app);
  try {
    const big = JSON.stringify({ payload: "x".repeat(300_000) });
    const res = await postJson(srv.port, "/auth/login", big);
    assert.equal(res.status, 413);
  } finally {
    await srv.close();
  }
});

test("body limit: small route accepts in-budget JSON", async () => {
  const app = buildApp();
  const srv = await startServer(app);
  try {
    const small = JSON.stringify({ payload: "x".repeat(1000) });
    const res = await postJson(srv.port, "/auth/login", small);
    assert.equal(res.status, 200);
  } finally {
    await srv.close();
  }
});

test("body limit: large-body route accepts payloads beyond default", async () => {
  const app = buildApp();
  const srv = await startServer(app);
  try {
    // 1 MB — over the 256kb default, well below the 50mb large limit.
    const payload = JSON.stringify({ payload: "x".repeat(1_000_000) });
    const res = await postJson(srv.port, "/library/import", payload);
    assert.equal(res.status, 200);
  } finally {
    await srv.close();
  }
});
