import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { AppDataSource } from "../../data-source";
import { User } from "../../entities/User";
import type { EntityManager } from "typeorm";
import { EduRegistrationIntent } from "../../entities/EduRegistrationIntent";
import { HttpError } from "../../utils/httpError";

export async function hasEducationalAccountContext(user: Pick<User, "id" | "userMode">, manager: EntityManager = AppDataSource.manager): Promise<boolean> {
  if (user.userMode === "CONTEST") return false;
  if (user.userMode === "EDUCATIONAL") return true;
  return manager.getRepository(User).createQueryBuilder("user")
    .where("user.id = :userId", { userId: user.id }).andWhere(educationalUserContextSql()).getExists();
}

/** Archived links and prior revocations keep the account inside EDU security. */
export function educationalUserContextSql(): string {
  return `(user.user_mode <> 'CONTEST' AND (user.user_mode = 'EDUCATIONAL' OR user.edu_session_version > 0 OR user.edu_account_setup_required = 1
    OR EXISTS (SELECT 1 FROM students s WHERE s.user_id = user.id)
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = user.id)
    OR EXISTS (SELECT 1 FROM classes c WHERE c.teacher_id = user.id)
    OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.teacher_id = user.id)
    OR EXISTS (SELECT 1 FROM parent_links p WHERE p.parent_user_id = user.id)
    OR EXISTS (SELECT 1 FROM org_invitations pending_invite WHERE pending_invite.email = CONVERT(user.email USING utf8mb4) COLLATE utf8mb4_unicode_ci AND pending_invite.status = 'PENDING')))`;
}

/** Preserve password changes committed after an EDU account was read. */
export async function saveEducationalAccountMetadata(user: User, fields: QueryDeepPartialEntity<User>): Promise<User> {
  if (!(await hasEducationalAccountContext(user))) return AppDataSource.getRepository(User).save(user);
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const repo = manager.getRepository(User);
    const current = await repo.findOne({ where: { id: user.id }, lock: { mode: "pessimistic_write" } });
    if (!current) throw new Error("USER_NOT_FOUND");
    // Proofs must be issued to the same mailbox that was read before the lock.
    // A concurrent institutional contact repair clears older proofs; a delayed
    // request must not reinstall a usable proof for the previous recipient.
    if ((typeof fields.passwordResetToken === "string" || typeof fields.emailVerificationToken === "string") &&
      current.email?.trim().toLowerCase() !== user.email?.trim().toLowerCase()) throw new HttpError(409, "ACCOUNT_CONTACT_CHANGED");
    if (typeof fields.emailVerificationToken === "string" && current.emailVerified) throw new HttpError(400, "EMAIL_ALREADY_VERIFIED");
    await repo.update(user.id, fields);
    // A renewed administrator verification link renews the pending school data.
    if (typeof fields.emailVerificationToken === "string" && fields.emailVerificationExpires instanceof Date) {
      await manager.getRepository(EduRegistrationIntent).update({ userId: user.id }, { expiresAt: fields.emailVerificationExpires });
    }
    return repo.findOneByOrFail({ id: user.id });
  });
}
