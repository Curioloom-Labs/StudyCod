import { In } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { isClassIssuedAccountUser, classIssuedUserEligibilitySql } from "./classIssuedAccountPolicy";

/** Match the class → Student → User lock order used by staff password resets. */
export async function resetClassIssuedUserPassword(userId: number, tokenHash: string, passwordHash: string): Promise<boolean> {
  const linked = await AppDataSource.getRepository(Student).find({ withDeleted: true,
    select: { id: true, class: { id: true } }, where: { user: { id: userId }, userAccountManaged: true }, relations: ["class"] });
  if (!linked.length) throw Object.assign(new Error("PASSWORD_STATE_CHANGED"), { statusCode: 409 });
  const ids = linked.map(student => student.id).sort((a, b) => a - b), classIds = [...new Set(linked.map(student => student.class.id))].sort((a, b) => a - b);
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    await manager.getRepository(Class).createQueryBuilder("class").whereInIds(classIds).orderBy("class.id", "ASC").setLock("pessimistic_write").getMany();
    await manager.getRepository(Student).createQueryBuilder("student").withDeleted().whereInIds(ids).orderBy("student.id", "ASC").setLock("pessimistic_write").getMany();
    const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });
    if (!user || user.passwordResetToken !== tokenHash || !user.passwordResetExpires || user.passwordResetExpires <= new Date()) return false;
    if (!isClassIssuedAccountUser(user)) throw Object.assign(new Error("PASSWORD_STATE_CHANGED"), { statusCode: 409 });
    const current = await manager.getRepository(Student).find({ withDeleted: true, select: { id: true }, where: { user: { id: userId }, userAccountManaged: true }, order: { id: "ASC" } });
    if (current.length !== ids.length || current.some((student, index) => student.id !== ids[index])) throw Object.assign(new Error("PASSWORD_STATE_CHANGED"), { statusCode: 409 });
    const updated = await manager.getRepository(User).createQueryBuilder().update(User)
      .set({ password: passwordHash, passwordResetToken: null, passwordResetExpires: null, eduSessionVersion: () => "edu_session_version + 1" })
      .where("users.id = :userId", { userId }).andWhere(classIssuedUserEligibilitySql("users")).execute();
    if (updated.affected !== 1) throw Object.assign(new Error("PASSWORD_STATE_CHANGED"), { statusCode: 409 });
    await manager.getRepository(Student).update({ id: In(ids) }, { generatedPassword: passwordHash, credentialVersion: () => "credential_version + 1" });
    return true;
  });
}
