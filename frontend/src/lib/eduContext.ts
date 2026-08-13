const EDU_STUDENT_CONTEXT_KEY = "studycod.edu.student-context";

export function getActiveEduStudentId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = Number(sessionStorage.getItem(EDU_STUDENT_CONTEXT_KEY) ?? 0);
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setActiveEduStudentId(studentId: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (studentId == null) sessionStorage.removeItem(EDU_STUDENT_CONTEXT_KEY);
    else sessionStorage.setItem(EDU_STUDENT_CONTEXT_KEY, String(studentId));
  } catch {
    // Private browsing/storage-disabled environments keep the staff default.
  }
  window.dispatchEvent(new CustomEvent("studycod:edu-context", { detail: { studentId } }));
}
