import { createHash } from "crypto";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { classIssuedUserEligibilitySql } from "./classIssuedAccountPolicy";

export const eduUserPasswordVersion = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex");

/** Pre-migration student sessions remain valid only until their first password change. */
export function matchesStudentCredentialVersion(claim: unknown, currentVersion: number): boolean {
  return claim === undefined ? currentVersion === 0 : typeof claim === "number" && Number.isSafeInteger(claim) && claim >= 0 && claim === currentVersion;
}

export function matchesEduUserPasswordVersion(claim: unknown, state: { passwordVersion: string; credentialVersion: number }): boolean {
  return claim === undefined ? state.credentialVersion === 0 : typeof claim === "string" && claim === state.passwordVersion;
}

/** One consistent read includes archived profiles so restoring them cannot restore an old login. */
export async function readClassIssuedPasswordState(userId: number) {
  const row = await AppDataSource.getRepository(Student).createQueryBuilder("student").withDeleted()
    .innerJoin("student.user", "user")
    .select("user.password", "passwordHash").addSelect("MAX(student.credentialVersion)", "credentialVersion")
    .where("student.user_id = :userId", { userId }).andWhere("student.user_account_managed = 1")
    .andWhere(classIssuedUserEligibilitySql("user"))
    .groupBy("user.id").addGroupBy("user.password")
    .getRawOne<{ passwordHash: string; credentialVersion: string | number }>();
  return row ? { passwordVersion: eduUserPasswordVersion(row.passwordHash), credentialVersion: Number(row.credentialVersion) } : null;
}
