import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { OrgInvitation } from "../../entities/OrgInvitation";
import { Membership } from "../../entities/Membership";
import { ParentLink } from "../../entities/ParentLink";
import { isInvitationUsable, normalizeEmail, acceptInvitation } from "./invitations";

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

test("isInvitationUsable: only PENDING and unexpired", () => {
  assert.equal(isInvitationUsable({ status: "PENDING", expiresAt: future() }), true);
  assert.equal(isInvitationUsable({ status: "PENDING", expiresAt: past() }), false);
  assert.equal(isInvitationUsable({ status: "ACCEPTED", expiresAt: future() }), false);
  assert.equal(isInvitationUsable({ status: "REVOKED", expiresAt: future() }), false);
});

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(normalizeEmail(""), "");
});

/**
 * Stub getRepository to return different fakes per entity, so acceptInvitation
 * (OrgInvitation) and the ensureMembership it calls (Membership) both work.
 */
async function withRepos<T>(
  fakes: { invite: any; membership: any; parentLink?: any },
  fn: () => Promise<T>
): Promise<T> {
  const orig = AppDataSource.getRepository.bind(AppDataSource);
  (AppDataSource as any).getRepository = (entity: unknown) => {
    if (entity === OrgInvitation) return fakes.invite;
    if (entity === Membership) return fakes.membership;
    if (entity === ParentLink) return fakes.parentLink ?? { findOne: async () => null, create: (o: any) => o, save: async (o: any) => o };
    throw new Error("unexpected entity");
  };
  try {
    return await fn();
  } finally {
    (AppDataSource as any).getRepository = orig;
  }
}

test("acceptInvitation creates membership and marks the invite accepted", async () => {
  const invite: any = {
    organizationId: 9,
    role: "TEACHER",
    status: "PENDING",
    expiresAt: future()
  };
  let savedInvite: any = null;
  let createdMembership: any = null;
  const fakes = {
    invite: {
      findOne: async () => invite,
      save: async (o: any) => {
        savedInvite = o;
        return o;
      }
    },
    membership: {
      findOne: async () => null,
      create: (o: any) => {
        createdMembership = o;
        return o;
      },
      save: async (o: any) => o
    }
  };

  const result = await withRepos(fakes, () => acceptInvitation("tok", 42));
  assert.deepEqual(result, { orgId: 9, role: "TEACHER", studentId: null });
  assert.equal(savedInvite.status, "ACCEPTED");
  assert.equal(savedInvite.acceptedByUserId, 42);
  assert.equal(createdMembership.role, "TEACHER");
});

test("acceptInvitation for a PARENT invite creates the parent↔student link", async () => {
  const invite: any = {
    organizationId: 3,
    role: "PARENT",
    studentId: 77,
    status: "PENDING",
    expiresAt: future()
  };
  let createdLink: any = null;
  const fakes = {
    invite: { findOne: async () => invite, save: async (o: any) => o },
    membership: { findOne: async () => null, create: (o: any) => o, save: async (o: any) => o },
    parentLink: {
      findOne: async () => null,
      create: (o: any) => {
        createdLink = o;
        return o;
      },
      save: async (o: any) => o
    }
  };
  const result = await withRepos(fakes, () => acceptInvitation("tok", 42));
  assert.equal(result.studentId, 77);
  assert.equal(createdLink.parent.id, 42);
  assert.equal(createdLink.student.id, 77);
});

test("acceptInvitation rejects unknown or expired tokens", async () => {
  const missing = {
    invite: { findOne: async () => null, save: async (o: any) => o },
    membership: { findOne: async () => null, create: (o: any) => o, save: async (o: any) => o }
  };
  await withRepos(missing, async () => {
    await assert.rejects(acceptInvitation("nope", 1), /INVALID_INVITE/);
  });

  const expired = {
    invite: {
      findOne: async () => ({ organizationId: 1, role: "STUDENT", status: "PENDING", expiresAt: past() }),
      save: async (o: any) => o
    },
    membership: { findOne: async () => null, create: (o: any) => o, save: async (o: any) => o }
  };
  await withRepos(expired, async () => {
    await assert.rejects(acceptInvitation("old", 1), /INVALID_INVITE/);
  });
});
