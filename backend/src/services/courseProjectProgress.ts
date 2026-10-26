import type { CourseProjectProgressData } from "../entities/CourseItemProgress";
import type { JudgeFile } from "./judgeWorker/types";

export function applyCourseProjectCheckData(
  previous: CourseProjectProgressData,
  files: JudgeFile[],
  entryFile: string,
  check: NonNullable<CourseProjectProgressData["lastCheck"]>,
): CourseProjectProgressData {
  const preserveCompletion = previous.status === "SUBMITTED" && Boolean(previous.submittedAt);
  const submissionHistory = [...(previous.submissionHistory ?? [])];
  if (preserveCompletion && submissionHistory.length === 0) {
    submissionHistory.push({
      milestoneIds: [...previous.milestoneIds],
      draft: previous.draft,
      files: previous.files?.map(file => ({ ...file })),
      lastCheck: previous.lastCheck ? { ...previous.lastCheck } : null,
      submittedAt: previous.submittedAt!,
    });
  }
  return {
    ...previous,
    draft: files.find(file => file.path === entryFile)?.content || previous.draft,
    files: files.map(file => ({ ...file })),
    lastCheck: { ...check },
    status: preserveCompletion ? "SUBMITTED" : "DRAFT",
    submittedAt: previous.submittedAt || null,
    submissionHistory,
  };
}
