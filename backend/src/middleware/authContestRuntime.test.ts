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
const schoolPassword = require("../services/edu/studentCredentialVersion") as typeof import("../services/edu/studentCredentialVersion");
const schoolSessions = require("../services/edu/userSessions") as typeof import("../services/edu/userSessions");

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
    const issuedPassword = t.mock.method(schoolPassword, "readClassIssuedPasswordState", async () => null);
    const sessionState = t.mock.method(schoolSessions, "readEducationalUserSessionState", async () =>
      scenario.mode === "EDUCATIONAL" ? ({ id: 7, role: "USER", userMode: scenario.mode,
        currentCourseEnrollmentId: scenario.enrollmentId, eduSessionVersion: 0 } as any) : null);
    const repository = t.mock.method(AppDataSource, "getRepository", (() => ({
      findOne: async () => ({ variant: { runtime: "CPP" } }),
    })) as unknown as typeof AppDataSource.getRepository);
    const token = jwt.sign({ userId: 7, userMode: scenario.mode, jti: "test-jti" }, JWT_SECRET, { expiresIn: "1h" });
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest;
    const res = { status: () => { throw new Error("Unexpected authentication failure"); } } as unknown as Response;
    let next = 0;
    await authRequired(req, res, () => { next++; });
    assert.equal(next, 1);assert.equal(req.userId, 7);assert.equal(req.userType, "USER");
    assert.equal(req.userMode, scenario.mode);assert.equal(req.learningRuntime, scenario.runtime);
    assert.equal(repository.mock.callCount(), scenario.reads);
    assert.equal(issuedPassword.mock.callCount(), scenario.mode === "EDUCATIONAL" ? 1 : 0);
    assert.equal(sessionState.mock.callCount(), scenario.mode === "CONTEST" ? 0 : 1);
  });
}

const schoolAccounts = require("../services/edu/classIssuedAccount") as typeof import("../services/edu/classIssuedAccount");

for (const scenario of [
  { name: "new cookie on the app root", claims: { eduPasswordVersion: "current", eduSessionVersion: 0 }, managed: true, header: undefined, allowed: true, student: 41 },
  { name: "legacy cookie without browser context", claims: {}, managed: true, header: undefined, allowed: true, student: 41 },
  { name: "private account with EDU membership", claims: {}, managed: false, header: undefined, allowed: true, student: undefined },
  { name: "revoked class password", claims: { eduPasswordVersion: "old" }, managed: true, header: undefined, allowed: false, student: undefined },
  { name: "foreign explicit class", claims: {}, managed: true, header: "999", allowed: true, student: undefined },
  { name: "explicit own class overrides default", claims: {}, managed: true, header: "42", allowed: true, student: 42 },
  { name: "malformed explicit class", claims: {}, managed: true, header: "invalid", allowed: true, student: undefined },
]) {
  test(`managed learner context: ${scenario.name}`, async t => {
    t.mock.method(cache, "getCachedUser", async () => ({ id: 7, role: "USER", userMode: "PERSONAL", currentCourseEnrollmentId: null }) as CachedUser);
    t.mock.method(revocation, "isJtiRevoked", async () => false);
    t.mock.method(revocation, "wasTokenIssuedBeforeRevocation", async () => false);
    t.mock.method(schoolSessions, "readEducationalUserSessionState", async () => ({ id: 7, role: "USER", userMode: "PERSONAL", eduSessionVersion: 0 } as any));
    t.mock.method(schoolPassword, "readClassIssuedPasswordState", async () => scenario.managed ? { passwordVersion: "current", credentialVersion: 0 } : null);
    const defaultClass = t.mock.method(schoolAccounts, "findDefaultClassIssuedStudent", async (userId: number) => {
      assert.equal(userId, 7);
      return { id: 41, class: { id: 3 }, credentialVersion: 0 } as any;
    });
    t.mock.method(AppDataSource, "getRepository", (() => ({ findOne: async (query: any) => {
      if (query.where.id === 42 && query.where.user.id === 7) return { id: 42, class: { id: 4 }, credentialVersion: 0, userAccountManaged: true };
      return null;
    } })) as any);
    const token = jwt.sign({ userId: 7, userMode: "PERSONAL", jti: "test-jti", ...scenario.claims }, JWT_SECRET, { expiresIn: "1h" });
    const req = { headers: { authorization: `Bearer ${token}`, ...(scenario.header === undefined ? {} : { "x-studycod-edu-student": scenario.header }) } } as AuthRequest;
    const res = { status() { return this; }, json() { return this; } } as unknown as Response;
    let next = 0;
    await authRequired(req, res, () => { next++; });
    assert.equal(next, scenario.allowed ? 1 : 0);
    assert.equal(req.studentId, scenario.student);
    if (scenario.allowed) {
      assert.equal(req.userId, 7);
      assert.equal(req.principalId, 7);
      assert.equal(req.userType, scenario.student ? "STUDENT" : "USER");
      assert.equal(req.userMode, scenario.student ? "EDUCATIONAL" : "PERSONAL");
    }
    assert.equal(defaultClass.mock.callCount(), scenario.allowed && scenario.managed && scenario.header === undefined ? 1 : 0);
  });
}
