import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import type { User } from "../../entities/User";
import { isClassIssuedAccountUser, classIssuedUserEligibilitySql } from "./classIssuedAccountPolicy";

/** School-managed learners default to their newest active class without a browser context header. */
export async function findDefaultClassIssuedStudent(userId: number): Promise<Student | null> {
  return AppDataSource.getRepository(Student).createQueryBuilder("student")
    .innerJoin("student.user", "user").innerJoinAndSelect("student.class", "class")
    .where("student.user_id = :userId", { userId }).andWhere("student.user_account_managed = 1")
    .andWhere(classIssuedUserEligibilitySql("user"))
    .orderBy("student.createdAt", "DESC").addOrderBy("student.id", "DESC").getOne();
}

/** Class staff issue credentials; this is separate from proof of inbox ownership. */
export async function hasClassIssuedUserLogin(user: Pick<User, "id" | "role" | "userMode">): Promise<boolean> {
  if (!isClassIssuedAccountUser(user)) return false;
  return AppDataSource.getRepository(Student).createQueryBuilder("student").innerJoin("student.user", "user")
    .where("student.user_id = :userId", { userId: user.id }).andWhere("student.user_account_managed = 1")
    .andWhere(classIssuedUserEligibilitySql("user")).getExists();
}

/** Offer the separate class principal without granting access to the User account. */
export async function hasUnmanagedClassLogin(user: Pick<User, "id" | "role" | "userMode">, username: string): Promise<boolean> {
  if (!isClassIssuedAccountUser(user)) return false;
  return AppDataSource.getRepository(Student).createQueryBuilder("student").innerJoin("student.user", "user")
    .where("student.user_id = :userId", { userId: user.id }).andWhere("student.generated_username = :username", { username })
    .andWhere("student.user_account_managed = 0").andWhere(classIssuedUserEligibilitySql("user")).getExists();
}
