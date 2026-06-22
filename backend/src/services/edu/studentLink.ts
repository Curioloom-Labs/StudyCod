import bcrypt from "bcryptjs";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";

/**
 * Student↔User unification (Track B, incremental). Two ends of the same model:
 *  - join code (services/edu/joinCode.ts) creates a fresh User-backed roster
 *    profile,
 *  - **claim** (here) lets an existing User adopt a LEGACY generated-credential
 *    Student profile, after which they are a normal User-backed student.
 *
 * Plus the read-side resolution used by `/profile/me`: a User that owns a roster
 * Student profile is surfaced as an EDU student so the frontend shows the
 * student experience. No schema change — `Student.user` already exists.
 */

const studentRepo = () => AppDataSource.getRepository(Student);

/** Minimal class shape needed to project a roster profile into a user DTO. */
interface ClassLike {
  id: number;
  name: string;
  language: string;
}
interface StudentLike {
  id: number;
  class: ClassLike;
}

/**
 * Pure: overlay the student-in-class view onto a base user DTO so a User-backed
 * student boots into the EDU student experience (`userMode` + `studentId` are
 * what the frontend gates on). Base fields (id/username/email/avatar…) are kept.
 */
export function applyStudentViewToUserDto<T extends object>(dto: T, student: StudentLike) {
  return {
    ...dto,
    userMode: "EDUCATIONAL" as const,
    studentId: student.id,
    classId: student.class.id,
    className: student.class.name,
    course: student.class.language,
    lang: student.class.language
  };
}

/** Pure: validate/normalize claim credentials. Throws "INVALID_INPUT" if empty. */
export function validateClaimInput(rawUsername: unknown, rawPassword: unknown): { username: string; password: string } {
  const username = String(rawUsername ?? "").trim();
  const password = String(rawPassword ?? "");
  if (!username || !password) throw new Error("INVALID_INPUT");
  return { username, password };
}

/**
 * The "active" roster profile for a User (most recent enrolment), or null. Used
 * by `/profile/me` to decide whether to render the student experience. Multi-
 * class students resolve to their latest class for now.
 */
export async function findActiveStudentForUser(userId: number): Promise<Student | null> {
  return await studentRepo().findOne({
    where: { user: { id: userId } },
    relations: ["class"],
    order: { createdAt: "DESC" }
  });
}

export interface ClaimResult {
  studentId: number;
  classId: number;
  alreadyClaimed: boolean;
}

/**
 * Link a legacy generated-credential Student profile to an existing User, after
 * verifying its generated credentials. Idempotent for the same user; refuses a
 * profile already owned by someone else. Adds a STUDENT membership in the
 * profile's org, atomically.
 */
export async function claimStudentProfile(userId: number, rawUsername: string, rawPassword: string): Promise<ClaimResult> {
  const { username, password } = validateClaimInput(rawUsername, rawPassword);

  return await AppDataSource.transaction(async (manager) => {
    const student = await manager.getRepository(Student).findOne({
      where: { generatedUsername: username },
      relations: ["class", "user"]
    });
    // Same opaque error for "no such profile" and "wrong password" — never reveal
    // which generated usernames exist.
    if (!student) throw new Error("INVALID_CREDENTIALS");
    const ok = await bcrypt.compare(password, student.generatedPassword);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    if (student.user) {
      if (student.user.id === userId) {
        return { studentId: student.id, classId: student.class.id, alreadyClaimed: true };
      }
      throw new Error("ALREADY_CLAIMED");
    }

    const user = await manager.getRepository(User).findOne({ where: { id: userId } });
    if (!user) throw new Error("USER_NOT_FOUND");

    student.user = user;
    await manager.getRepository(Student).save(student);

    const orgId = student.class.organizationId ?? null;
    if (orgId != null) {
      const repo = manager.getRepository(Membership);
      const existing = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
      if (!existing) {
        await repo.save(repo.create({ user: { id: userId }, organization: { id: orgId }, role: "STUDENT" }));
      }
    }

    return { studentId: student.id, classId: student.class.id, alreadyClaimed: false };
  });
}
