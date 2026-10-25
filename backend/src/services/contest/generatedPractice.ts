export type DynamicOlympiadPractice = {
  courseKey: string;
  topicKey: string;
};

/** Only course-owned, dynamically generated Olympiad practice can enter a training contest. */
export function dynamicOlympiadPracticeMetadata(task: {
  type?: unknown;
  taskMode?: unknown;
  courseEnrollmentId?: unknown;
  courseItem?: { content?: unknown } | null;
}): DynamicOlympiadPractice | null {
  if (task.type !== "TOPIC" || task.taskMode !== "CODE" || !Number.isInteger(Number(task.courseEnrollmentId)) || Number(task.courseEnrollmentId) <= 0) return null;
  const content = task.courseItem?.content;
  if (!content || typeof content !== "object") return null;
  const exercise = (content as Record<string, unknown>).exercise;
  if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) return null;
  const contract = (exercise as Record<string, unknown>).learningContract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return null;
  const record = contract as Record<string, unknown>;
  const valid = record.kind === "OLYMPIAD_ALGORITHMIC_PRACTICE"
    && Number(record.version) >= 3
    && typeof record.topicKey === "string"
    && String(record.courseKey ?? "").startsWith("olympiad-");
  return valid ? { courseKey: String(record.courseKey), topicKey: String(record.topicKey) } : null;
}

export function isDynamicOlympiadPracticeTask(task: Parameters<typeof dynamicOlympiadPracticeMetadata>[0]): boolean {
  return dynamicOlympiadPracticeMetadata(task) !== null;
}

export type GeneratedPracticeSetMode = "THEMATIC" | "MIXED";
export type GeneratedPracticeSetEntry = DynamicOlympiadPractice & { runtime: string };

export function validateGeneratedPracticeSet(mode: GeneratedPracticeSetMode, entries: GeneratedPracticeSetEntry[]): string | null {
  if (entries.length < 2 || entries.length > 8) return "GENERATED_SET_SIZE_INVALID";
  if (new Set(entries.map((entry) => entry.courseKey)).size !== 1) return "GENERATED_SET_COURSE_MISMATCH";
  if (new Set(entries.map((entry) => entry.runtime)).size !== 1) return "GENERATED_SET_RUNTIME_MISMATCH";
  const topicCount = new Set(entries.map((entry) => entry.topicKey)).size;
  if (mode === "THEMATIC" && topicCount !== 1) return "GENERATED_SET_TOPIC_MISMATCH";
  if (mode === "MIXED" && topicCount < 2) return "GENERATED_SET_NEEDS_MULTIPLE_TOPICS";
  return null;
}
