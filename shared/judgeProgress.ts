/** Public execution metadata only; never include test contents or verdicts. */
export type JudgeProgress = {
  phase: "preparing" | "compiling" | "testing" | "finishing";
  testsTotal: number;
  testsCompleted: number;
  groupsTotal: number;
  groupIndex: number | null;
  group: string | null;
  groupTest: number | null;
  groupTestsTotal: number | null;
};

export const JUDGE_PROGRESS_PREFIX = "__SC_JUDGE_PROGRESS__";

export function isJudgeProgress(value: unknown): value is JudgeProgress {
  if (!value || typeof value !== "object") return false;
  const p = value as JudgeProgress;
  const count = (n: unknown): n is number =>
    typeof n === "number" &&
    Number.isSafeInteger(n) &&
    n >= 0 &&
    n <= 1_000_000;
  const optionalCount = (n: unknown) => n === null || count(n);
  return (
    ["preparing", "compiling", "testing", "finishing"].includes(p.phase) &&
    count(p.testsTotal) &&
    count(p.testsCompleted) &&
    p.testsCompleted <= p.testsTotal &&
    count(p.groupsTotal) &&
    optionalCount(p.groupIndex) &&
    (p.groupIndex === null ||
      (p.groupIndex > 0 && p.groupIndex <= p.groupsTotal)) &&
    (p.group === null ||
      (typeof p.group === "string" && p.group.length <= 96)) &&
    optionalCount(p.groupTest) &&
    optionalCount(p.groupTestsTotal) &&
    (p.groupTest === null ||
      (p.groupTest > 0 &&
        p.groupTestsTotal !== null &&
        p.groupTest <= p.groupTestsTotal))
  );
}
