import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { env } from "../env";
import { requireCapability, orgIdFromClassParam, orgIdFromStudentParam } from "./orgContext";

// One fake repo serves both listUserMemberships (.find) and writeAudit
// (.create/.save). Swap AppDataSource.getRepository so no DB is needed.
async function withMemberships<T>(memberships: unknown[], fn: () => Promise<T>): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = () => ({
    find: async () => memberships,
    create: (o: any) => o,
    save: async (o: any) => o
  });
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

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

test("allowed role proceeds", async () => {
  await withMemberships([{ organizationId: 1, role: "TEACHER" }], async () => {
    const { res, nextCalled } = await run(requireCapability("CLASS_CREATE"), {
      userId: 1,
      userType: "USER"
    });
    assert.equal(nextCalled, true);
    assert.equal(res.ended, false);
  });
});

test("shadow mode never blocks even when role lacks the capability", async () => {
  await withMemberships([], async () => {
    const { res, nextCalled } = await run(requireCapability("CLASS_CREATE"), {
      userId: 1,
      userType: "USER"
    });
    assert.equal(nextCalled, true, "shadow mode passes through");
    assert.equal(res.ended, false);
  });
});

test("non-USER principals are skipped", async () => {
  await withMemberships([], async () => {
    const { nextCalled } = await run(requireCapability("CLASS_CREATE"), {
      userId: 5,
      userType: "STUDENT"
    });
    assert.equal(nextCalled, true);
  });
});

test("enforce mode returns 403 on a real denial", async () => {
  const original = (env as any).__eduRbacEnforce;
  (env as any).__eduRbacEnforce = true;
  try {
    await withMemberships([{ organizationId: 1, role: "STUDENT" }], async () => {
      const { res, nextCalled } = await run(requireCapability("CLASS_CREATE"), {
        userId: 1,
        userType: "USER"
      });
      assert.equal(nextCalled, false, "enforce blocks");
      assert.equal(res.statusCode, 403);
      assert.equal(res.ended, true);
    });
  } finally {
    (env as any).__eduRbacEnforce = original;
  }
});

test("enforce mode still allows a permitted role", async () => {
  const original = (env as any).__eduRbacEnforce;
  (env as any).__eduRbacEnforce = true;
  try {
    await withMemberships([{ organizationId: 1, role: "ORG_ADMIN" }], async () => {
      const { nextCalled } = await run(requireCapability("CLASS_CREATE"), {
        userId: 1,
        userType: "USER"
      });
      assert.equal(nextCalled, true);
    });
  } finally {
    (env as any).__eduRbacEnforce = original;
  }
});

async function withFind<T>(found: unknown, fn: () => Promise<T>): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = () => ({ findOne: async () => found });
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

test("orgIdFromClassParam resolves the class's org or null", async () => {
  await withFind({ organizationId: 9 }, async () => {
    assert.equal(await orgIdFromClassParam()({ params: { classId: "5" } } as any), 9);
  });
  await withFind(null, async () => {
    assert.equal(await orgIdFromClassParam()({ params: { classId: "5" } } as any), null);
  });
  assert.equal(await orgIdFromClassParam()({ params: { classId: "x" } } as any), null);
});

test("orgIdFromStudentParam resolves the student's class org", async () => {
  await withFind({ class: { organizationId: 4 } }, async () => {
    assert.equal(await orgIdFromStudentParam()({ params: { studentId: "7" } } as any), 4);
  });
  await withFind({ class: null }, async () => {
    assert.equal(await orgIdFromStudentParam()({ params: { studentId: "7" } } as any), null);
  });
});
