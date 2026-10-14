import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";
import { Organization } from "../../entities/Organization";
import { HttpError } from "../../utils/httpError";
import { roleCan, type Capability } from "./rbac";
import { lockClassActor, lockEduOrganization, lockEduUsers, requireFreshOrgActor, type EduLifecycleActor } from "./lifecycleAccess";

export async function assignClassTeachers(orgId: number, classId: number, teacherIds: number[], primaryTeacherId: number | undefined, actor: EduLifecycleActor) {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    await lockEduOrganization(manager, orgId);
    const repo = manager.getRepository(Class);
    const cls = await repo.findOne({ where: { id: classId, organization: { id: orgId } }, lock: { mode: "pessimistic_write" } });
    if (!cls) throw new HttpError(404, "CLASS_NOT_FOUND");
    const current = await repo.findOneOrFail({ where: { id: classId }, relations: ["teacher", "teachers"] });
    const desired = [...new Set(teacherIds)];
    if (!desired.length) throw new HttpError(400, "AT_LEAST_ONE_TEACHER_REQUIRED");
    const previous = [...new Set([current.teacher?.id, ...(current.teachers ?? []).map(user => user.id)].filter((id): id is number => id != null))];
    const users = await lockEduUsers(manager, [actor.userId, ...previous, ...desired]);
    await requireFreshOrgActor(manager, orgId, actor, users, "MEMBER_MANAGE");
    const roles = new Map<number, string>();
    for (const id of desired) {
      const member = await manager.getRepository(Membership).findOneBy({ user: { id }, organization: { id: orgId } });
      if (!users.has(id) || users.get(id)!.userMode === "CONTEST" || !member || !["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(member.role)) throw new HttpError(400, "TEACHER_NOT_IN_ORG");
      roles.set(id, member.role);
    }
    const eligible = (id: number) => ["ORG_ADMIN", "TEACHER"].includes(roles.get(id) ?? "");
    const primary = primaryTeacherId ?? (current.teacher?.id && desired.includes(current.teacher.id) && eligible(current.teacher.id) ? current.teacher.id : desired.find(eligible));
    if (primary == null || !desired.includes(primary) || !eligible(primary)) throw new HttpError(400, "PRIMARY_TEACHER_REQUIRED");
    const affected = new Set([...previous.filter(id => !desired.includes(id)), ...desired.filter(id => !previous.includes(id))]);
    if (current.teacher?.id !== primary) { if (current.teacher?.id) affected.add(current.teacher.id); affected.add(primary); }
    await repo.update(classId, { teacher: { id: primary } });
    const previousRelations = (current.teachers ?? []).map(user => user.id);
    const added = desired.filter(id => !previousRelations.includes(id)), removed = previousRelations.filter(id => !desired.includes(id));
    if (added.length || removed.length) await manager.createQueryBuilder().relation(Class, "teachers").of(classId).addAndRemove(added, removed);
    for (const id of [...affected].sort((a, b) => a - b)) await manager.getRepository(User).update(id, { eduSessionVersion: () => "edu_session_version + 1" });
    return { teacherIds: desired, primaryTeacherId: primary, sessionVersion: users.get(actor.userId)!.eduSessionVersion + (affected.has(actor.userId) ? 1 : 0) };
  });
}

export type CreateEduClassInput = Pick<Class, "name" | "gradingSystem" | "gradeScaleMode"> & { organizationId?: number };
export async function createClassForActor(input: CreateEduClassInput, actor: EduLifecycleActor): Promise<Class> {
  let orgId = input.organizationId;
  if (orgId == null) {
    const memberships = await AppDataSource.getRepository(Membership).find({ where: { user: { id: actor.userId } }, order: { createdAt: "ASC" } });
    orgId = memberships.find(member => roleCan(member.role, "CLASS_CREATE"))?.organizationId;
  }
  if (orgId == null) throw new HttpError(403, "ORGANIZATION_REQUIRED");
  const selectedOrgId = orgId;
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    await lockEduOrganization(manager, selectedOrgId);
    await requireFreshOrgActor(manager, selectedOrgId, actor, await lockEduUsers(manager, [actor.userId]), "CLASS_CREATE");
    const repo = manager.getRepository(Class);
    const cls = repo.create({ name: input.name, gradingSystem: input.gradingSystem, gradeScaleMode: input.gradeScaleMode,
      teacher: { id: actor.userId } as User, teachers: [{ id: actor.userId } as User], organization: { id: selectedOrgId } as Organization });
    return repo.save(cls);
  });
}

type ClassConfiguration = Partial<Pick<Class, "joinCode" | "thematicFormula" | "gradebookConfig">>;
export async function updateClassConfiguration(classId: number, actor: EduLifecycleActor, capability: Capability, changes: ClassConfiguration): Promise<void> {
  await AppDataSource.transaction("READ COMMITTED", async manager => {
    await lockClassActor(manager, classId, actor, capability);
    await manager.getRepository(Class).update(classId, changes);
  });
}
