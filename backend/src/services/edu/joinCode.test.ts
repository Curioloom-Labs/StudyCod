import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";
import { generateJoinCode, normalizeJoinCode, enrollViaJoinCode } from "./joinCode";

test("generateJoinCode: correct length and unambiguous alphabet only", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateJoinCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    assert.equal(/[01OIL]/.test(code), false, "no ambiguous characters");
  }
  assert.equal(generateJoinCode(8).length, 8);
});

test("normalizeJoinCode trims and uppercases", () => {
  assert.equal(normalizeJoinCode("  abc12 "), "ABC12");
  assert.equal(normalizeJoinCode(null), "");
});

/** Stub the transaction + per-entity repos so enrollViaJoinCode runs DB-free. */
function makeEnrollHarness(opts: { cls: any; user: any; existingStudent: any; existingMembership: any }) {
  const saved: any = { students: [], memberships: [] };
  const managerRepo = (entity: unknown): any => {
    if (entity === Class) return { findOne: async () => opts.cls };
    if (entity === User) return { findOne: async () => opts.user };
    if (entity === Student) {
      return {
        findOne: async () => opts.existingStudent,
        create: (o: any) => o,
        save: async (o: any) => {
          o.id = o.id ?? 777;
          saved.students.push(o);
          return o;
        }
      };
    }
    if (entity === Membership) {
      return {
        findOne: async () => opts.existingMembership,
        create: (o: any) => o,
        save: async (o: any) => {
          saved.memberships.push(o);
          return o;
        }
      };
    }
    throw new Error("unexpected entity");
  };
  const orig = (AppDataSource as any).transaction;
  (AppDataSource as any).transaction = async (fn: any) => fn({ getRepository: managerRepo });
  return {
    saved,
    restore() {
      (AppDataSource as any).transaction = orig;
    }
  };
}

test("enrollViaJoinCode creates a linked roster profile and a STUDENT membership", async () => {
  const h = makeEnrollHarness({
    cls: { id: 3, organizationId: 9, joinCode: "ABC123" },
    user: { id: 42, username: "alice", firstName: "Alice", lastName: "K", email: "a@x.com" },
    existingStudent: null,
    existingMembership: null
  });
  try {
    const result = await enrollViaJoinCode(42, "abc123");
    assert.equal(result.alreadyEnrolled, false);
    assert.equal(result.classId, 3);
    const student = h.saved.students[0];
    assert.equal(student.user.id, 42);
    assert.equal(student.firstName, "Alice");
    assert.equal(student.generatedUsername, "u42-c3");
    assert.equal(h.saved.memberships[0].role, "STUDENT");
  } finally {
    h.restore();
  }
});

test("enrollViaJoinCode is idempotent for an already-enrolled user", async () => {
  const h = makeEnrollHarness({
    cls: { id: 3, organizationId: 9, joinCode: "ABC123" },
    user: { id: 42, username: "alice" },
    existingStudent: { id: 555 },
    existingMembership: { id: 1, role: "STUDENT" }
  });
  try {
    const result = await enrollViaJoinCode(42, "ABC123");
    assert.equal(result.alreadyEnrolled, true);
    assert.equal(result.studentId, 555);
    assert.equal(h.saved.students.length, 0, "no duplicate roster profile");
  } finally {
    h.restore();
  }
});

test("enrollViaJoinCode rejects an unknown code", async () => {
  const h = makeEnrollHarness({ cls: null, user: { id: 1 }, existingStudent: null, existingMembership: null });
  try {
    await assert.rejects(enrollViaJoinCode(1, "NOPE12"), /INVALID_CODE/);
  } finally {
    h.restore();
  }
});

test("enrollViaJoinCode rejects an empty code before any DB work", async () => {
  await assert.rejects(enrollViaJoinCode(1, "   "), /INVALID_CODE/);
});
