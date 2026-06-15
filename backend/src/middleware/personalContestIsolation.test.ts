import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { forbidContestModeUsers } from "./contestModeGuard";
import { placementGate } from "./placementGate";

/**
 * Regression safety net for the Personal/Contest isolation boundary.
 *
 * The upcoming EDU→SaaS retrofit (Organization/Membership/org-scoped RBAC, User
 * changes) must NOT alter how these guards gate the Personal and Contest modes.
 * These guards are that boundary, so we lock their contract here. Most branches
 * are DB-free and deterministic; the DB branches stub the User repository so the
 * test needs no live database.
 */

function mockRes(): any {
  const res: any = { statusCode: 200, body: undefined, ended: false };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    res.ended = true;
    return res;
  };
  return res;
}

async function run(mw: any, req: any): Promise<{ res: any; nextCalled: boolean }> {
  const res = mockRes();
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  await mw(req, res, next);
  return { res, nextCalled };
}

/** Temporarily stub AppDataSource.getRepository to return a fake User repo. */
async function withStubbedUser<T>(fakeUser: unknown, fn: () => Promise<T>): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = () => ({ findOne: async () => fakeUser });
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

// ---------------------------------------------------------------------------
// forbidContestModeUsers
// ---------------------------------------------------------------------------

test("forbidContestModeUsers: CONTEST user is blocked (no DB needed)", async () => {
  const { res, nextCalled } = await run(forbidContestModeUsers, {
    userId: 1,
    userType: "USER",
    userMode: "CONTEST"
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "CONTEST_MODE_RESTRICTED");
});

test("forbidContestModeUsers: PERSONAL user passes (no DB needed)", async () => {
  const { res, nextCalled } = await run(forbidContestModeUsers, {
    userId: 1,
    userType: "USER",
    userMode: "PERSONAL"
  });
  assert.equal(nextCalled, true);
  assert.equal(res.ended, false);
});

test("forbidContestModeUsers: non-USER type (e.g. STUDENT) is never blocked", async () => {
  const { nextCalled } = await run(forbidContestModeUsers, {
    userId: 1,
    userType: "STUDENT"
  });
  assert.equal(nextCalled, true);
});

test("forbidContestModeUsers: unauthenticated request passes through", async () => {
  const { nextCalled } = await run(forbidContestModeUsers, {});
  assert.equal(nextCalled, true);
});

test("forbidContestModeUsers: DB path blocks CONTEST, allows PERSONAL", async () => {
  await withStubbedUser({ id: 1, userMode: "CONTEST" }, async () => {
    const { res, nextCalled } = await run(forbidContestModeUsers, { userId: 1, userType: "USER" });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
  await withStubbedUser({ id: 1, userMode: "PERSONAL" }, async () => {
    const { nextCalled } = await run(forbidContestModeUsers, { userId: 1, userType: "USER" });
    assert.equal(nextCalled, true);
  });
});

// ---------------------------------------------------------------------------
// placementGate
// ---------------------------------------------------------------------------

test("placementGate: non-USER type (student/EDU) is never gated — key isolation invariant", async () => {
  const { nextCalled } = await run(placementGate, { userId: 5, userType: "STUDENT" });
  assert.equal(nextCalled, true);
});

test("placementGate: unauthenticated request passes through", async () => {
  const { nextCalled } = await run(placementGate, {});
  assert.equal(nextCalled, true);
});

test("placementGate: PERSONAL user without placement is blocked", async () => {
  await withStubbedUser({ id: 1, userMode: "PERSONAL", role: null, placementDone: false }, async () => {
    const { res, nextCalled } = await run(placementGate, { userId: 1, userType: "USER" });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, "PLACEMENT_REQUIRED");
  });
});

test("placementGate: PERSONAL user who finished placement passes", async () => {
  await withStubbedUser({ id: 1, userMode: "PERSONAL", role: null, placementDone: true }, async () => {
    const { nextCalled } = await run(placementGate, { userId: 1, userType: "USER" });
    assert.equal(nextCalled, true);
  });
});

test("placementGate: SYSTEM_ADMIN and non-PERSONAL modes bypass the gate", async () => {
  await withStubbedUser({ id: 1, userMode: "PERSONAL", role: "SYSTEM_ADMIN", placementDone: false }, async () => {
    const { nextCalled } = await run(placementGate, { userId: 1, userType: "USER" });
    assert.equal(nextCalled, true);
  });
  await withStubbedUser({ id: 1, userMode: "EDUCATIONAL", role: null, placementDone: false }, async () => {
    const { nextCalled } = await run(placementGate, { userId: 1, userType: "USER" });
    assert.equal(nextCalled, true);
  });
});
