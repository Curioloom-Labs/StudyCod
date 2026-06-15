import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { writeAudit, getAuditLogs } from "./auditLog";

// Stub AppDataSource.getRepository so these run without a database.
async function withRepo<T>(fakeRepo: unknown, fn: () => Promise<T>): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = () => fakeRepo;
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

test("writeAudit builds a row with defaults for omitted fields", async () => {
  let saved: any = null;
  const repo = {
    create: (o: any) => o,
    save: async (o: any) => {
      saved = o;
      return o;
    }
  };
  await withRepo(repo, () =>
    writeAudit({
      actorType: "USER",
      actorId: 7,
      action: "student.password.regenerate",
      targetType: "student",
      targetId: 42,
      metadata: { classId: 3 },
      requestId: "req-1",
      ip: "1.2.3.4"
    })
  );
  assert.equal(saved.actorType, "USER");
  assert.equal(saved.actorId, 7);
  assert.equal(saved.action, "student.password.regenerate");
  assert.equal(saved.targetId, 42);
  assert.deepEqual(saved.metadata, { classId: 3 });
  assert.equal(saved.orgId, null, "orgId defaults to null until orgs exist");
});

test("writeAudit is best-effort: a save failure never throws", async () => {
  const repo = {
    create: (o: any) => o,
    save: async () => {
      throw new Error("DB down");
    }
  };
  await withRepo(repo, async () => {
    await assert.doesNotReject(
      writeAudit({ actorType: "SYSTEM", action: "x.y" })
    );
  });
});

test("getAuditLogs clamps the row limit to [1, 500]", async () => {
  let captured = -1;
  const qb: any = {
    orderBy: () => qb,
    andWhere: () => qb,
    limit: (n: number) => {
      captured = n;
      return qb;
    },
    getMany: async () => []
  };
  const repo = { createQueryBuilder: () => qb };

  await withRepo(repo, async () => {
    await getAuditLogs({ limit: 9999 });
    assert.equal(captured, 500, "over-cap clamps to 500");
    await getAuditLogs({ limit: 0 });
    assert.equal(captured, 1, "zero/negative floors to 1");
    await getAuditLogs({});
    assert.equal(captured, 100, "default is 100");
  });
});
