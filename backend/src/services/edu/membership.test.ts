import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { Membership } from "../../entities/Membership";
import { normalizeOrgRole, isOrgRole, higherRole } from "../../types/OrgRole";
import { slugifyBase, setMembershipRole, removeMembership } from "./membership";

test("normalizeOrgRole accepts exact roles, rejects everything else", () => {
  assert.equal(normalizeOrgRole("ORG_ADMIN"), "ORG_ADMIN");
  assert.equal(normalizeOrgRole("STUDENT"), "STUDENT");
  assert.equal(normalizeOrgRole("teacher"), null, "case-sensitive");
  assert.equal(normalizeOrgRole("OWNER"), null);
  assert.equal(normalizeOrgRole(undefined), null);
  assert.equal(normalizeOrgRole(123), null);
});

test("isOrgRole is a correct type guard", () => {
  assert.equal(isOrgRole("PARENT"), true);
  assert.equal(isOrgRole("nope"), false);
});

test("higherRole returns the more privileged role", () => {
  assert.equal(higherRole("STUDENT", "TEACHER"), "TEACHER");
  assert.equal(higherRole("TEACHER", "STUDENT"), "TEACHER");
  assert.equal(higherRole("ORG_ADMIN", "PARENT"), "ORG_ADMIN");
  assert.equal(higherRole("ASSISTANT", "ASSISTANT"), "ASSISTANT");
  assert.equal(higherRole("PARENT", "STUDENT"), "STUDENT");
});

test("slugifyBase produces url-safe slugs and a fallback", () => {
  assert.equal(slugifyBase("My School"), "my-school");
  assert.equal(slugifyBase("Acme   Corp"), "acme-corp");
  assert.equal(slugifyBase("Café del Mar"), "cafe-del-mar");
  assert.equal(slugifyBase("--Trim--Me--"), "trim-me");
  assert.equal(slugifyBase(""), "org");
  assert.equal(slugifyBase("   ***   "), "org");
});

test("slugifyBase caps length at 60 chars", () => {
  const long = "a".repeat(120);
  assert.equal(slugifyBase(long).length, 60);
});

/**
 * Stub the transaction + Membership repo so setMembershipRole/removeMembership
 * run DB-free: `membership` is the row found for (orgId,userId), `adminCount` is
 * what the locked admin-count query (`manager.createQueryBuilder(...).getCount()`)
 * reports for the org's ORG_ADMINs.
 */
function makeMembershipHarness(opts: { membership: { role: string } | null; adminCount: number }) {
  let saved: { role: string } | null = null;
  let removed = false;
  let lockedForCount = false;
  const repo = {
    findOne: async () => opts.membership,
    save: async (m: any) => {
      saved = { role: m.role };
      return m;
    },
    remove: async () => {
      removed = true;
    }
  };
  const queryBuilder = {
    setLock: (mode: string) => {
      lockedForCount = mode === "pessimistic_write";
      return queryBuilder;
    },
    where: () => queryBuilder,
    getCount: async () => opts.adminCount
  };
  const orig = (AppDataSource as any).transaction;
  (AppDataSource as any).transaction = async (fn: any) =>
    fn({
      getRepository: (entity: unknown) => (entity === Membership ? repo : (() => { throw new Error("unexpected entity"); })()),
      createQueryBuilder: (entity: unknown) => (entity === Membership ? queryBuilder : (() => { throw new Error("unexpected entity"); })())
    });
  return {
    get saved() {
      return saved;
    },
    get removed() {
      return removed;
    },
    get lockedForCount() {
      return lockedForCount;
    },
    restore() {
      (AppDataSource as any).transaction = orig;
    }
  };
}

test("setMembershipRole: refuses to demote the org's last ORG_ADMIN", async () => {
  const h = makeMembershipHarness({ membership: { role: "ORG_ADMIN" }, adminCount: 1 });
  try {
    const result = await setMembershipRole(1, 1, "TEACHER");
    assert.deepEqual(result, { ok: false, reason: "LAST_ORG_ADMIN" });
    assert.equal(h.saved, null, "no write happened");
    assert.equal(h.lockedForCount, true, "admin count is taken under a row lock (race-safety)");
  } finally {
    h.restore();
  }
});

test("setMembershipRole: allows demoting an admin when another ORG_ADMIN remains", async () => {
  const h = makeMembershipHarness({ membership: { role: "ORG_ADMIN" }, adminCount: 2 });
  try {
    const result = await setMembershipRole(1, 1, "TEACHER");
    assert.deepEqual(result, { ok: true });
    assert.equal(h.saved?.role, "TEACHER");
  } finally {
    h.restore();
  }
});

test("setMembershipRole: no-op (still ok) when the role is unchanged", async () => {
  const h = makeMembershipHarness({ membership: { role: "TEACHER" }, adminCount: 0 });
  try {
    const result = await setMembershipRole(1, 1, "TEACHER");
    assert.deepEqual(result, { ok: true });
    assert.equal(h.saved, null, "no redundant write");
  } finally {
    h.restore();
  }
});

test("setMembershipRole: 404-equivalent when the user isn't a member", async () => {
  const h = makeMembershipHarness({ membership: null, adminCount: 0 });
  try {
    const result = await setMembershipRole(1, 1, "TEACHER");
    assert.deepEqual(result, { ok: false, reason: "NOT_A_MEMBER" });
  } finally {
    h.restore();
  }
});

test("removeMembership: refuses to remove the org's last ORG_ADMIN", async () => {
  const h = makeMembershipHarness({ membership: { role: "ORG_ADMIN" }, adminCount: 1 });
  try {
    const result = await removeMembership(1, 1);
    assert.deepEqual(result, { ok: false, reason: "LAST_ORG_ADMIN" });
    assert.equal(h.removed, false);
    assert.equal(h.lockedForCount, true, "admin count is taken under a row lock (race-safety)");
  } finally {
    h.restore();
  }
});

test("removeMembership: removes a non-admin member freely", async () => {
  const h = makeMembershipHarness({ membership: { role: "TEACHER" }, adminCount: 0 });
  try {
    const result = await removeMembership(1, 1);
    assert.deepEqual(result, { ok: true });
    assert.equal(h.removed, true);
  } finally {
    h.restore();
  }
});

test("removeMembership: removes an ORG_ADMIN when another admin remains", async () => {
  const h = makeMembershipHarness({ membership: { role: "ORG_ADMIN" }, adminCount: 2 });
  try {
    const result = await removeMembership(1, 1);
    assert.deepEqual(result, { ok: true });
    assert.equal(h.removed, true);
  } finally {
    h.restore();
  }
});
