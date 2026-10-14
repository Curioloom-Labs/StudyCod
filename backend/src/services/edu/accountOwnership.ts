import type { EntityManager } from "typeorm";
import { User } from "../../entities/User";

export function schoolIssuedOwnershipSql(): string {
  return `(user.edu_account_setup_required = 1 OR EXISTS (
    SELECT 1 FROM students owned_student WHERE owned_student.user_id = user.id AND owned_student.user_account_managed = 1))`;
}

export function educationalPrivilegedContextSql(): string {
  return `(user.role IS NOT NULL AND user.role <> 'USER'
    OR EXISTS (SELECT 1 FROM memberships privileged_member WHERE privileged_member.user_id = user.id AND privileged_member.role <> 'STUDENT')
    OR EXISTS (SELECT 1 FROM classes owned_class WHERE owned_class.teacher_id = user.id)
    OR EXISTS (SELECT 1 FROM class_teachers assigned_class WHERE assigned_class.teacher_id = user.id)
    OR EXISTS (SELECT 1 FROM parent_links private_parent WHERE private_parent.parent_user_id = user.id))`;
}

export async function hasSchoolIssuedOwnership(userId: number, manager: EntityManager): Promise<boolean> {
  return manager.getRepository(User).createQueryBuilder("user").where("user.id = :userId", { userId })
    .andWhere("user.user_mode <> 'CONTEST'").andWhere(schoolIssuedOwnershipSql()).getExists();
}
