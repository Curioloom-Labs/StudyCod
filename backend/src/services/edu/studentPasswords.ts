import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { authorizeStudentAction } from "./classAccess";
import type { RosterActor } from "./studentProvisionBatch";
import { generatePassword, hashPassword } from "../studentCredentialsService";
import { canClassManageUserPassword, classIssuedUserEligibilitySql } from "./classIssuedAccountPolicy";
import { beginCredentialOperation, lockCredentialClass, recheckCredentialOperation, completeCredentialOperation, abandonCredentialOperation, type CredentialOperationOptions, type CredentialRow } from "./credentialOperations";

export async function resetStudentPasswords(ids: number[], actor: RosterActor, expectedClassId?: number, operation?: CredentialOperationOptions): Promise<CredentialRow[]> {
  const distinctIds = [...new Set(ids)].sort((a, b) => a - b);
  const clsId = expectedClassId ?? (distinctIds.length ? (await AppDataSource.getRepository(Student).findOne({ where: { id: distinctIds[0] }, relations: ["class"] }))?.class.id : undefined);
  if (!clsId) return [];
  const started = operation ? await beginCredentialOperation(actor, clsId, operation, distinctIds, distinctIds.length) : undefined;
  if (started?.credentials) return started.credentials;
  try {
    const prepared = await Promise.all(distinctIds.map(async id => { const password = generatePassword(); return { id, password, hashed: await hashPassword(password) }; }));
    return await AppDataSource.transaction("READ COMMITTED", async (manager: EntityManager) => {
      await lockCredentialClass(manager, actor, clsId);
      const cached = await recheckCredentialOperation(manager, started?.handle); if (cached) return cached;
      const students = manager.getRepository(Student);
      if (distinctIds.length) await students.createQueryBuilder("student").whereInIds(distinctIds)
        .andWhere("student.class_id = :classId", { classId: clsId }).orderBy("student.id", "ASC").setLock("pessimistic_write").getMany();
      const targets: Array<(typeof prepared)[number] & { student: Student }> = [];
      for (const item of prepared) {
        const access = await authorizeStudentAction(actor.userId, item.id, "STUDENT_MANAGE", { manager, isSystemAdmin: actor.isSystemAdmin });
        if (!access || !access.access.allowed || access.student.class.id !== clsId) throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });
        const student = await students.findOne({ where: { id: item.id }, relations: ["user"] });
        if (!student) throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });
        targets.push({ ...item, student });
      }
      // Recheck account eligibility while holding the User locks. Load all of
      // them in one stable order before writing any credentials in the batch.
      const userIds = [...new Set(targets.filter(item => item.student.userAccountManaged && item.student.user).map(item => item.student.user!.id))].sort((a, b) => a - b);
      const users = userIds.length ? await manager.getRepository(User).createQueryBuilder("user").whereInIds(userIds)
        .orderBy("user.id", "ASC").setLock("pessimistic_write").getMany() : [];
      const usersById = new Map(users.map(user => [user.id, user]));
      const accountCredentials = new Map<number, (typeof prepared)[number]>();
      const credentials: CredentialRow[] = [];
      for (const item of targets) {
        const user = item.student.user ? usersById.get(item.student.user.id) : undefined;
        const managesUser = !!user && canClassManageUserPassword(item.student, user);
        // Multiple selected profiles of the same managed User must not return
        // different passwords while overwriting that User in the same batch.
        const credential = managesUser ? accountCredentials.get(user!.id) ?? item : item;
        if (managesUser && !accountCredentials.has(user!.id)) {
          const updated = await manager.getRepository(User).createQueryBuilder().update(User)
            .set({ password: credential.hashed, passwordResetToken: null, passwordResetExpires: null, eduSessionVersion: () => "edu_session_version + 1" })
            .where("users.id = :userId", { userId: user!.id }).andWhere(classIssuedUserEligibilitySql("users")).execute();
          if (updated.affected === 1) accountCredentials.set(user!.id, credential);
        }
        await students.update(item.id, { generatedPassword: credential.hashed, credentialVersion: () => "credential_version + 1" });
        credentials.push({ id: item.id, firstName: item.student.firstName, lastName: item.student.lastName, middleName: item.student.middleName || "", email: item.student.email,
          username: item.student.generatedUsername, password: credential.password });
      }
      await completeCredentialOperation(manager, started?.handle, credentials);
      return credentials;
  });
  } catch (error) { await abandonCredentialOperation(started?.handle); throw error; }
}
