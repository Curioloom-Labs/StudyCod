import { AppDataSource } from "../../data-source";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { Class } from "../../entities/Class";
import bcrypt from "bcryptjs";
import { educationalPrivilegedContextSql, schoolIssuedOwnershipSql, hasSchoolIssuedOwnership } from "./accountOwnership";
import { matchesStudentCredentialVersion } from "./studentCredentialVersion";
import { HttpError } from "../../utils/httpError";
import { educationalUserContextSql, hasEducationalAccountContext } from "./accountMetadata";

export function matchesEduSessionVersion(claim: unknown, version: number): boolean {
  if (!Number.isInteger(version) || version < 0 || version > 0xffffffff) return false;
  return claim === undefined ? version === 0
    : typeof claim === "number" && Number.isInteger(claim) && claim >= 0 && claim === version;
}

/** Read security state directly from MySQL, independently of the Redis cache. */
export async function readEducationalUserSessionState(userId: number): Promise<(User & { requiresPrivateSetup: boolean }) | null> {
  const { entities, raw } = await AppDataSource.getRepository(User).createQueryBuilder("user")
    .select(["user.id", "user.role", "user.userMode", "user.currentCourseEnrollmentId", "user.eduSessionVersion"])
    .addSelect(`(${schoolIssuedOwnershipSql()} AND ${educationalPrivilegedContextSql()})`, "private_setup_required")
    .where("user.id = :userId", { userId })
    .andWhere(educationalUserContextSql())
    .getRawAndEntities();
  return entities[0] ? Object.assign(entities[0], { requiresPrivateSetup: Boolean(Number(raw[0].private_setup_required)) }) : null;
}

/** Never mint a current session after proving an earlier password snapshot. */
export async function educationalUserTokenVersion(user: User): Promise<number | undefined> {
  if (user.userMode === "CONTEST") return undefined;
  const state = await readEducationalUserSessionState(user.id);
  if (!state) return undefined;
  if (state.requiresPrivateSetup) throw new HttpError(403, "EDU_ACCOUNT_SETUP_REQUIRED");
  const current = await AppDataSource.getRepository(User).findOne({
    where: { id: user.id }, select: ["id", "password", "eduSessionVersion"]
  });
  if (!current || current.password !== user.password) throw new HttpError(401, "INVALID_CREDENTIALS");
  return current.eduSessionVersion;
}

/** Consume the proof and revoke sessions in the same locked write. */
export async function resetEducationalUserPassword(userId: number, tokenHash: string, passwordHash: string, newPassword: string): Promise<boolean> {
  const linked = await AppDataSource.getRepository(Student).find({ withDeleted: true,
    select: { id: true, class: { id: true } }, where: { user: { id: userId }, userAccountManaged: true }, relations: ["class"] });
  const ids = linked.map(student => student.id).sort((a, b) => a - b);
  const classIds = [...new Set(linked.map(student => student.class.id))].sort((a, b) => a - b);
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    if (classIds.length) await manager.getRepository(Class).createQueryBuilder("class").whereInIds(classIds)
      .orderBy("class.id", "ASC").setLock("pessimistic_write").getMany();
    if (ids.length) await manager.getRepository(Student).createQueryBuilder("student").withDeleted().whereInIds(ids)
      .orderBy("student.id", "ASC").setLock("pessimistic_write").getMany();
    const repo = manager.getRepository(User);
    const user = await repo.findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });
    if (!user || user.passwordResetToken !== tokenHash || !user.passwordResetExpires || user.passwordResetExpires <= new Date()) return false;
    if (!(await hasEducationalAccountContext(user, manager))) throw new HttpError(409, "PASSWORD_STATE_CHANGED");
    const current = await manager.getRepository(Student).find({ withDeleted: true,
      where: { user: { id: userId }, userAccountManaged: true }, order: { id: "ASC" } });
    if (current.length !== ids.length || current.some((student, index) => student.id !== ids[index])) throw new HttpError(409, "PASSWORD_STATE_CHANGED");
    const adopting = await hasSchoolIssuedOwnership(userId, manager);
    if (adopting) {
      const hashes = new Set([user.password, ...current.map(student => student.generatedPassword)]);
      for (const hash of hashes) if (await bcrypt.compare(newPassword, hash)) throw new HttpError(400, "EDU_PRIVATE_PASSWORD_REQUIRED");
      if (!user.email) throw new HttpError(409, "EDU_ACCOUNT_CONTACT_REQUIRED");
      // The mailbox proof establishes the private User account. Class secrets
      // stay scoped to Student; a future teacher reset cannot change User.
      if (ids.length) await manager.getRepository(Student).createQueryBuilder().update(Student)
        .set({ userAccountManaged: false }).whereInIds(ids).execute();
    }
    await repo.update(user.id, { password: passwordHash, passwordResetToken: null, passwordResetExpires: null,
      eduSessionVersion: () => "edu_session_version + 1", ...(adopting ? {
        eduAccountSetupRequired: false, emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null
      } : {}) });
    return true;
  });
}

/** Replayed logout tokens must not revoke sessions created after that logout. */
export async function revokeEducationalUserSessions(userId: number, claim: unknown): Promise<boolean> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const repo = manager.getRepository(User);
    const user = await repo.findOne({ where: { id: userId },
      select: ["id", "userMode", "eduSessionVersion"], lock: { mode: "pessimistic_write" } });
    if (!user || user.userMode === "CONTEST") return false;
    if (!user.eduSessionVersion && !(await hasEducationalAccountContext(user, manager))) return false;
    if (!matchesEduSessionVersion(claim, user.eduSessionVersion)) return true;
    await repo.update(user.id, { eduSessionVersion: () => "edu_session_version + 1" });
    return true;
  });
}

/** Class-only sessions have an independent principal and revocation counter. */
export async function revokeEducationalStudentSessions(studentId: number, claim: unknown): Promise<void> {
  await AppDataSource.transaction("READ COMMITTED", async manager => {
    const repo = manager.getRepository(Student);
    const student = await repo.findOne({ where: { id: studentId }, lock: { mode: "pessimistic_write" } });
    if (!student || !matchesStudentCredentialVersion(claim, student.credentialVersion)) return;
    await repo.update(student.id, { credentialVersion: () => "credential_version + 1" });
  });
}
