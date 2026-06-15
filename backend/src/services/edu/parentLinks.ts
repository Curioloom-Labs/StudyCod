import { AppDataSource } from "../../data-source";
import { ParentLink } from "../../entities/ParentLink";
import { Student } from "../../entities/Student";
import type { User } from "../../entities/User";

/**
 * Parent↔student links. A link grants a parent read access to that child's
 * progress; it exists only because a teacher/OrgAdmin invited them.
 */
const linkRepo = () => AppDataSource.getRepository(ParentLink);

export async function createParentLink(parentUserId: number, studentId: number): Promise<ParentLink> {
  const existing = await linkRepo().findOne({
    where: { parent: { id: parentUserId }, student: { id: studentId } }
  });
  if (existing) return existing;
  const link = linkRepo().create({
    parent: { id: parentUserId } as User,
    student: { id: studentId } as Student
  });
  return await linkRepo().save(link);
}

export async function listChildren(parentUserId: number): Promise<Student[]> {
  const links = await linkRepo().find({
    where: { parent: { id: parentUserId } },
    relations: ["student", "student.class"]
  });
  return links.map((l) => l.student).filter(Boolean);
}

/** Authorization helper: is this user a linked parent of this student? */
export async function isParentOf(parentUserId: number, studentId: number): Promise<boolean> {
  const link = await linkRepo().findOne({
    where: { parent: { id: parentUserId }, student: { id: studentId } }
  });
  return Boolean(link);
}
