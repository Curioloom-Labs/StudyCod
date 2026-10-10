import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { JWT_SECRET } from "../config";
import { AppDataSource } from "../data-source";
import { authRequired, type AuthRequest } from "./authMiddleware";
import type { CachedUser } from "../services/auth/userCache";

const cache = require("../services/auth/userCache") as typeof import("../services/auth/userCache");
const revocation = require("../services/auth/jwtRevocation") as typeof import("../services/auth/jwtRevocation");

for (const scenario of [
  { mode: "CONTEST", enrollmentId: null, reads: 0, runtime: "PYTHON" },
  { mode: "PERSONAL", enrollmentId: null, reads: 1, runtime: "CPP" },
  { mode: "EDUCATIONAL", enrollmentId: null, reads: 1, runtime: "CPP" },
  { mode: "CONTEST", enrollmentId: 99, reads: 1, runtime: "CPP" },
] as const) {
  test(`auth preserves ${scenario.mode} course selection ${scenario.enrollmentId}`, async t => {
    t.mock.method(cache, "getCachedUser", async () => ({ id: 7, role: "USER", userMode: scenario.mode,
      currentCourseEnrollmentId: scenario.enrollmentId }) as CachedUser);
    t.mock.method(revocation, "isJtiRevoked", async () => false);
    t.mock.method(revocation, "wasTokenIssuedBeforeRevocation", async () => false);
    const repository = t.mock.method(AppDataSource, "getRepository", (() => ({
      findOne: async () => ({ variant: { runtime: "CPP" } }),
    })) as unknown as typeof AppDataSource.getRepository);
    const token = jwt.sign({ userId: 7, jti: "test-jti" }, JWT_SECRET, { expiresIn: "1h" });
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest;
    const res = { status: () => { throw new Error("Unexpected authentication failure"); } } as unknown as Response;
    let next = 0;
    await authRequired(req, res, () => { next++; });
    assert.equal(next, 1);assert.equal(req.userId, 7);assert.equal(req.userType, "USER");
    assert.equal(req.userMode, scenario.mode);assert.equal(req.learningRuntime, scenario.runtime);
    assert.equal(repository.mock.callCount(), scenario.reads);
  });
}
