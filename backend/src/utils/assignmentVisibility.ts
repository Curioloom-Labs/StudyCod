export function normalizeAssignedStudentIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];

  const unique = new Set<number>();
  for (const value of raw) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    const id = Math.floor(parsed);
    if (id > 0) unique.add(id);
  }

  return [...unique].sort((a, b) => a - b);
}

export function parseAssignedStudentIds(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return normalizeAssignedStudentIds(raw);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeAssignedStudentIds(parsed);
    } catch {
      return normalizeAssignedStudentIds(trimmed.split(",").map(x => Number(x.trim())));
    }
  }

  return [];
}

export function isAssignedToStudent(
  isAssigned: boolean | null | undefined,
  assignedStudentIdsRaw: unknown,
  studentId: number
): boolean {
  if (!isAssigned) return false;

  const assignedIds = parseAssignedStudentIds(assignedStudentIdsRaw);
  if (assignedIds.length === 0) return true;

  return assignedIds.includes(studentId);
}

export function normalizeTargetedAssignmentForStorage(
  selectedStudentIdsRaw: unknown,
  allClassStudentIdsRaw: unknown
): number[] | null {
  const selectedIds = normalizeAssignedStudentIds(selectedStudentIdsRaw);
  const allClassStudentIds = normalizeAssignedStudentIds(allClassStudentIdsRaw);

  if (selectedIds.length === 0) return [];

  if (
    allClassStudentIds.length > 0 &&
    selectedIds.length === allClassStudentIds.length &&
    selectedIds.every((id, idx) => id === allClassStudentIds[idx])
  ) {
    return null;
  }

  return selectedIds;
}
