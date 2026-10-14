import type { Student } from "../../entities/Student";
import type { User } from "../../entities/User";

export function isClassIssuedAccountUser(user: Pick<User, "role" | "userMode">): boolean {
  return user.userMode !== "CONTEST" && (user.role == null || user.role === "USER");
}

/** A matching username/password is not consent to manage a personal account. */
export function canClassManageUserPassword(student: Pick<Student, "userAccountManaged">, user: Pick<User, "role" | "userMode">): boolean {
  return student.userAccountManaged === true && isClassIssuedAccountUser(user);
}

/** Use only internal table aliases. Org/class authority is independent of User.role. */
export function classIssuedUserEligibilitySql(userAlias: "user" | "users"): string {
  return `(${userAlias}.role IS NULL OR ${userAlias}.role = 'USER') AND ${userAlias}.user_mode <> 'CONTEST'
    AND NOT EXISTS (SELECT 1 FROM memberships edu_account_membership WHERE edu_account_membership.user_id = ${userAlias}.id AND edu_account_membership.role <> 'STUDENT')
    AND NOT EXISTS (SELECT 1 FROM classes edu_account_class WHERE edu_account_class.teacher_id = ${userAlias}.id)
    AND NOT EXISTS (SELECT 1 FROM class_teachers edu_account_assignment WHERE edu_account_assignment.teacher_id = ${userAlias}.id)
    AND NOT EXISTS (SELECT 1 FROM parent_links edu_account_parent WHERE edu_account_parent.parent_user_id = ${userAlias}.id)`;
}
