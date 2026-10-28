import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

test("route limiter returns JSON 429 with Retry-After and charges an authenticated user across IPs", async () => {
  process.env.REDIS_ENABLED = "false";
  const { createRouteLimiter } = require("./routeRateLimit") as typeof import("./routeRateLimit");
  const app = express();
  app.set("trust proxy", true);
  app.use((req: express.Request & { userId?: number }, _res, next) => {
    req.userId = 274;
    next();
  });
  app.use(createRouteLimiter({
    enabled: true,
    windowMs: 60_000,
    limit: 1,
    namespace: `route-rate-limit-test-${randomUUID()}`,
  }));
  app.get("/limited", (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  try {
    const first = await fetch(`http://127.0.0.1:${address.port}/limited`, {
      headers: { "x-forwarded-for": "198.51.100.10" },
    });
    const second = await fetch(`http://127.0.0.1:${address.port}/limited`, {
      headers: { "x-forwarded-for": "198.51.100.11" },
    });

    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true });
    assert.equal(second.status, 429);
    const retryAfterSeconds = Number(second.headers.get("retry-after"));
    assert.deepEqual(await second.json(), {
      error: "RATE_LIMIT",
      status: 429,
      message: "RATE_LIMIT",
      retryAfterSeconds,
    });
    assert.ok(retryAfterSeconds >= 1, "429 response includes a positive Retry-After header");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
