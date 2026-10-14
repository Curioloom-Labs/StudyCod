import type { EntityManager } from "typeorm";
import { Organization } from "../../entities/Organization";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";
import { HttpError } from "../../utils/httpError";
import { matchesEduSessionVersion } from "./userSessions";
import { hasSchoolIssuedOwnership } from "./accountOwnership";
import { roleCan, type Capability } from "./rbac";
import { authorizeClassAction } from "./classAccess";

export type EduLifecycleActor = { userId: number; sessionVersion?: number };

export async function lockEduOrganization(manager: EntityManager, orgId: number): Promise<void> {
  const org = await manager.getRepository(Organization).findOne({ where: { id: orgId }, lock: { mode: "pessimistic_write" } });
  if (!org) throw new HttpError(404, "ORG_NOT_FOUND");
}

export async function lockEduUsers(manager: EntityManager, ids: number[]): Promise<Map<number, User>> {
  const users = new Map<number, User>();
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const user = await manager.getRepository(User).findOne({ where: { id }, lock: { mode: "pessimistic_write" },
      select: ["id", "role", "userMode", "email", "emailVerified", "eduSessionVersion", "eduAccountSetupRequired", "eduIssuerOrgId"] });
    if (user) users.set(id, user);
  }
  return users;
}

export async function requireFreshEduActor(manager: EntityManager, actor: EduLifecycleActor, users: Map<number, User>): Promise<User> {
  const user = users.get(actor.userId);
  if (!user || !matchesEduSessionVersion(actor.sessionVersion, user.eduSessionVersion)) throw new HttpError(401, "SESSION_CHANGED");
  if (user.userMode === "CONTEST") throw new HttpError(403, "CONTEST_ACCOUNT_NOT_SUPPORTED");
  if (await hasSchoolIssuedOwnership(user.id, manager)) throw new HttpError(409, "EDU_ACCOUNT_SETUP_REQUIRED");
  return user;
}

export async function requireFreshOrgActor(manager: EntityManager, orgId: number, actor: EduLifecycleActor, users: Map<number, User>, capability: Capability): Promise<User> {
  const user = await requireFreshEduActor(manager, actor, users);
  if (user.role !== "SYSTEM_ADMIN") {
    const membership = await manager.getRepository(Membership).findOneBy({ user: { id: user.id }, organization: { id: orgId } });
    if (!membership || !roleCan(membership.role, capability)) throw new HttpError(403, "FORBIDDEN");
  }
  return user;
}

/** Organization → Class → User; callers perform only column-scoped writes. */
export async function lockClassActor(manager: EntityManager, classId: number, actor: EduLifecycleActor, capability: Capability): Promise<Class> {
  const repo = manager.getRepository(Class);
  const snapshot = await repo.findOneBy({ id: classId });
  if (!snapshot) throw new HttpError(404, "CLASS_NOT_FOUND");
  await lockEduOrganization(manager, snapshot.organizationId);
  const cls = await repo.findOne({ where: { id: classId, organization: { id: snapshot.organizationId } }, lock: { mode: "pessimistic_write" } });
  if (!cls) throw new HttpError(404, "CLASS_NOT_FOUND");
  const user = await requireFreshEduActor(manager, actor, await lockEduUsers(manager, [actor.userId]));
  const access = await authorizeClassAction(user.id, cls.id, capability, { manager, isSystemAdmin: user.role === "SYSTEM_ADMIN" });
  if (!access?.allowed) throw new HttpError(403, "FORBIDDEN");
  return cls;
}

/** Organization → Class → Student → User, including archived learner records. */
export async function lockStudentActor(manager: EntityManager, studentId: number, actor: EduLifecycleActor, capability: Capability): Promise<Student> {
  const repo = manager.getRepository(Student);
  const snapshot = await repo.findOne({ where: { id: studentId }, withDeleted: true, relations: ["class"] });
  if (!snapshot) throw new HttpError(404, "STUDENT_NOT_FOUND");
  await lockEduOrganization(manager, snapshot.class.organizationId);
  const cls = await manager.getRepository(Class).findOne({ where: { id: snapshot.class.id, organization: { id: snapshot.class.organizationId } }, lock: { mode: "pessimistic_write" } });
  if (!cls) throw new HttpError(404, "CLASS_NOT_FOUND");
  const student = await repo.findOne({ where: { id: studentId, class: { id: cls.id } }, withDeleted: true, lock: { mode: "pessimistic_write" } });
  if (!student) throw new HttpError(404, "STUDENT_NOT_FOUND");
  const user = await requireFreshEduActor(manager, actor, await lockEduUsers(manager, [actor.userId]));
  if (!(await authorizeClassAction(user.id, cls.id, capability, { manager, isSystemAdmin: user.role === "SYSTEM_ADMIN" }))?.allowed) throw new HttpError(403, "FORBIDDEN");
  return student;
}
