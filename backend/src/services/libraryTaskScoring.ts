export type LibraryScoringTest = {
  id: number;
  isHidden?: boolean | null;
  subtask?: unknown;
};

/** True when at least one test explicitly belongs to a subtask group. */
export function hasLibrarySubtasks(tests: readonly LibraryScoringTest[]): boolean {
  return tests.some(test => String(test.subtask ?? "").trim().length > 0);
}

/**
 * Library subtasks use IOI-style binary scoring. Tests without an explicit
 * subtask stay together in a deterministic fallback group once subtasks are
 * present on the task.
 */
export function libraryTestGroup(test: LibraryScoringTest, hasSubtasks: boolean): string {
  if (hasSubtasks) {
    const subtask = String(test.subtask ?? "").trim();
    return subtask || `unassigned_${test.id}`;
  }
  return test.isHidden === true ? "hidden" : "public";
}

/** Keep dependent subtasks contiguous and in their natural order for the judge. */
export function compareLibraryJudgeGroups(a: unknown, b: unknown): number {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  const leftUnassigned = left.startsWith("unassigned_");
  const rightUnassigned = right.startsWith("unassigned_");
  if (leftUnassigned !== rightUnassigned) return leftUnassigned ? 1 : -1;
  return new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare(left, right);
}

export type LibraryGroupScore = {
  group: string;
  score: number;
  maxScore: number;
  status?: "PASSED" | "PARTIAL" | "FAILED" | "SKIPPED";
};

export function normalizeLibraryGroupScores(raw: unknown): LibraryGroupScore[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((group: any) => {
    const status = ["PASSED", "PARTIAL", "FAILED", "SKIPPED"].includes(String(group?.status))
      ? String(group.status) as LibraryGroupScore["status"]
      : undefined;
    return {
      group: String(group?.group ?? ""),
      score: Number.isFinite(Number(group?.score)) ? Number(group.score) : 0,
      maxScore: Number.isFinite(Number(group?.max_score)) ? Number(group.max_score) : 0,
      ...(status ? { status } : {}),
    };
  });
}
