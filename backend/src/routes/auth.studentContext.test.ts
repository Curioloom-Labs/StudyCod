import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { authRouter } from "./auth";
import { AppDataSource } from "../data-source";
import { maintenanceService } from "../services/maintenanceService";
import { env } from "../env";

const schoolAccounts = require("../services/edu/classIssuedAccount") as typeof import("../services/edu/classIssuedAccount");
const schoolSessions = require("../services/edu/userSessions") as typeof import("../services/edu/userSessions");
const accountTokens = require("../services/auth/accountToken") as typeof import("../services/auth/accountToken");

for (const managed of [true, false]) {
  test(`password login returns ${managed ? "EDU class" : "personal"} context for a PERSONAL database account`, async t => {
    const previousTurnstile = env.__turnstileEnforceAuth;
    env.__turnstileEnforceAuth = false;
    t.after(() => { env.__turnstileEnforceAuth = previousTurnstile; });
    const account = { id: 7, username: "learner", password: "hash", role: "USER", userMode: "PERSONAL", emailVerified: true };
    t.mock.method(AppDataSource, "getRepository", (() => ({ findOne: async () => account })) as any);
    t.mock.method(bcrypt, "compare", (async () => true) as any);
    t.mock.method(schoolAccounts, "hasClassIssuedUserLogin", async () => managed);
    const defaultClass = t.mock.method(schoolAccounts, "findDefaultClassIssuedStudent", async (id: number) => {
      assert.equal(id, 7);
      return { id: 41, class: { id: 3, name: "11 IT" } } as any;
    });
    t.mock.method(schoolSessions, "readEducationalUserSessionState", async () => null);
    t.mock.method(accountTokens, "signAccountUserToken", async () => "test-cookie");
    t.mock.method(maintenanceService, "getStateCached", async () => ({ enabled: false }) as any);
    const response: any = { code: 200, cookie() { return this; }, clearCookie() { return this; }, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    const layer = (authRouter as any).stack.find((entry: any) => entry.route?.path === "/login" && entry.route.methods.post);
    await layer.route.stack.at(-1).handle({ body: { username: "learner", password: "password" }, headers: {} }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.user.id, 7);
    assert.equal(response.body.user.userMode, managed ? "EDUCATIONAL" : "PERSONAL");
    assert.equal(response.body.user.studentId, managed ? 41 : undefined);
    assert.equal(response.body.user.className, managed ? "11 IT" : undefined);
    assert.equal(defaultClass.mock.callCount(), managed ? 1 : 0);
    assert.equal(account.userMode, "PERSONAL");
  });
}
