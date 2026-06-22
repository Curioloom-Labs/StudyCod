import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Class } from "../../entities/Class";
import { Membership } from "../../entities/Membership";
import { generatePassword, generateUsername, hashPassword } from "../studentCredentialsService";

/**
 * Teacher-add provisioning (Track B): new roster students are created as real
 * User-backed accounts so they boot straight into the student experience (B3)
 * and can use the full platform — no separate "claim" step needed.
 *
 * The generated credentials are kept identical to the legacy flow, so the same
 * username/password work on BOTH normal login and the legacy `/student-login`.
 * The route falls back to a legacy shell student if provisioning can't produce a
 * clean account (e.g. the email already belongs to a User), so teacher-add never
 * regresses.
 */

export interface StudentInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
}

export interface ProvisionedStudent {
  student: Student;
  username: string;
  password: string;
  userBacked: boolean;
}

/** Find a generated username free across both Users and roster Students. */
async function uniqueUsername(manager: EntityManager, input: StudentInput): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateUsername(input.firstName, input.lastName, input.middleName);
    const userClash = await manager.getRepository(User).findOne({ where: { username: candidate } });
    const studentClash = await manager.getRepository(Student).findOne({ where: { generatedUsername: candidate } });
    if (!userClash && !studentClash) return candidate;
  }
  return null;
}

/**
 * Create a User-backed roster student in a class, atomically. Throws when a
 * clean account can't be made (email already a User, or no free username) — the
 * caller then falls back to a legacy shell student.
 */
export async function provisionStudent(cls: Class, input: StudentInput): Promise<ProvisionedStudent> {
  return await AppDataSource.transaction(async (manager) => {
    const email = input.email.trim();

    // An email already owned by a User can't back a fresh generated-credential
    // account cleanly — fall back to a shell student (claimable later).
    const emailTaken = await manager.getRepository(User).findOne({ where: { email } });
    if (emailTaken) throw new Error("EMAIL_TAKEN");

    const username = await uniqueUsername(manager, input);
    if (!username) throw new Error("USERNAME_GENERATION_FAILED");

    const plainPassword = generatePassword();
    const hashed = await hashPassword(plainPassword);

    const user = manager.getRepository(User).create({ username, email, password: hashed });
    await manager.getRepository(User).save(user);

    const student = manager.getRepository(Student).create({
      class: cls,
      user,
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName,
      email,
      // Keep the generated columns identical to legacy so /student-login still
      // works with the same credentials handed to the teacher.
      generatedUsername: username,
      generatedPassword: hashed
    });
    await manager.getRepository(Student).save(student);

    const orgId = cls.organizationId ?? null;
    if (orgId != null) {
      const repo = manager.getRepository(Membership);
      const existing = await repo.findOne({ where: { user: { id: user.id }, organization: { id: orgId } } });
      if (!existing) {
        await repo.save(repo.create({ user: { id: user.id }, organization: { id: orgId }, role: "STUDENT" }));
      }
    }

    return { student, username, password: plainPassword, userBacked: true };
  });
}
