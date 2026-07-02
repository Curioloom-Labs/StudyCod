import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { Class } from "../entities/Class";
import { Membership } from "../entities/Membership";
import { requireClassCapability } from "./orgContext";

function mockRes(): any {
  const res: any = { statusCode: 200, ended: false };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = () => {
    res.ended = true;
    return res;
  };
  return res;
}

async function run(mw: any, req: any): Promise<{ res: any; nextCalled: boolean }> {
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

// Entity-aware repo mock for requireClassCapability (via authorizeClassAction):
// Class.findOne returns `cls`, Membership.findOne returns `membership`, and the
// audit repo gets working create/save.
async function withClass<T>(cls: unknown, membership: unknown, fn: () => Promise<T>): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = (entity: unknown) => {
    if (entity === Class) return { findOne: async () => cls };
    if (entity === Membership) return { findOne: async () => membership };
    return { create: (o: any) => o, save: async (o: any) => o };
  };
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

test("requireClassCapability: owner with no membership is allowed (grandfathered)", async () => {
  await withClass({ id: 5, teacher: { id: 1 }, organizationId: null }, null, async () => {
    const req: any = { userId: 1, userType: "USER", params: { classId: "5" } };
    const { res, nextCalled } = await run(requireClassCapability("CLASS_EDIT"), req);
    assert.equal(nextCalled, true);
    assert.equal(res.ended, false);
    assert.equal(req.classAccess.cls.id, 5, "loaded class attached to req");
  });
});

test("requireClassCapability: non-owner ORG_ADMIN reaches a class in their org", async () => {
  await withClass({ id: 5, teacher: { id: 99 }, organizationId: 7 }, { role: "ORG_ADMIN" }, async () => {
    const req: any = { userId: 1, userType: "USER", params: { classId: "5" } };
    const { nextCalled } = await run(requireClassCapability("CLASS_DELETE"), req);
    assert.equal(nextCalled, true);
  });
});

test("requireClassCapability: non-owner non-member is denied 403", async () => {
  await withClass({ id: 5, teacher: { id: 99 }, organizationId: 7 }, null, async () => {
    const req: any = { userId: 1, userType: "USER", params: { classId: "5" } };
    const { res, nextCalled } = await run(requireClassCapability("CLASS_EDIT"), req);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

test("requireClassCapability: missing class is 404", async () => {
  await withClass(null, null, async () => {
    const req: any = { userId: 1, userType: "USER", params: { classId: "5" } };
    const { res, nextCalled } = await run(requireClassCapability("CLASS_EDIT"), req);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 404);
  });
});

test("requireClassCapability: student principal is denied 403", async () => {
  const req: any = { studentId: 3, userType: "STUDENT", params: { classId: "5" } };
  const { res, nextCalled } = await run(requireClassCapability("CLASS_EDIT"), req);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireClassCapability: SYSTEM_ADMIN bypasses org/owner checks", async () => {
  await withClass({ id: 5, teacher: { id: 99 }, organizationId: 7 }, null, async () => {
    const req: any = { userId: 1, userType: "USER", userRole: "SYSTEM_ADMIN", params: { classId: "5" } };
    const { nextCalled } = await run(requireClassCapability("CLASS_DELETE"), req);
    assert.equal(nextCalled, true);
  });
});
