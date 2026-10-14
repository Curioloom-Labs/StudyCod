import type { User } from "../types";
import { clearGetMeCache, getMe } from "./api/profile";
import { setActiveEduStudentId } from "./eduContext";

export function chooseEducationalContext(user: User): { allowed: boolean; studentId?: number } {
  if (user.studentId) return { allowed: true };
  const staff = user.role === "SYSTEM_ADMIN" || user.eduContexts?.organizations?.some(org => ["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(org.role));
  const parent = user.eduContexts?.hasParentAccess || user.eduContexts?.organizations?.some(org => org.role === "PARENT");
  if (staff || parent) return { allowed: true };
  const studentId = user.eduContexts?.students?.[0]?.studentId;
  if (studentId) return { allowed: true, studentId };
  return { allowed: user.userMode === "EDUCATIONAL" };
}

/** A personal User can own EDU roster profiles; select one before checking the mode. */
export async function selectEducationalContext(user: User): Promise<User> {
  const choice = chooseEducationalContext(user);
  if (choice.studentId == null) return user;
  setActiveEduStudentId(choice.studentId);
  clearGetMeCache();
  return getMe({ force: true, suppressAuthRedirect: true });
}
