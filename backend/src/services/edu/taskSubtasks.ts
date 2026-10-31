export interface TaskSubtaskDefinition {
  name: string;
  description: string;
  weightPercent: number;
}

/** Read only the canonical learner-facing subtask section emitted by condition generation. */
export function parseTaskSubtasks(description: string): TaskSubtaskDefinition[] {
  const sectionHeading = /^##\s*(?:subtasks|підзадачі)\s*$/im.exec(description);
  if (!sectionHeading || sectionHeading.index === undefined) return [];

  const afterHeading = description.slice(sectionHeading.index + sectionHeading[0].length);
  const section = afterHeading.split(/^##\s+/m, 1)[0] ?? "";
  const headings = [...section.matchAll(/^###\s+(?:(?:\d+)[.)]\s*)?(.+?)\s+[—–-]\s+(\d{1,3})\s*%\s*$/gm)];
  if (headings.length < 2 || headings.length > 5) return [];

  const subtasks = headings.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? section.length;
    return {
      name: String(match[1] ?? "").trim().slice(0, 64),
      description: section.slice(start, end).trim().slice(0, 500),
      weightPercent: Number(match[2]),
    };
  });
  const names = subtasks.map(item => item.name.toLocaleLowerCase());
  if (subtasks.some(item => !item.name || !item.description || item.weightPercent < 1 || item.weightPercent > 100)) return [];
  if (new Set(names).size !== names.length) return [];
  if (subtasks.reduce((sum, item) => sum + item.weightPercent, 0) !== 100) return [];
  return subtasks;
}

/** Allocate the requested total proportionally while guaranteeing at least one test per subtask. */
export function allocateSubtaskTestCounts(count: number, subtasks: TaskSubtaskDefinition[]): number[] | null {
  if (subtasks.length < 2) return null;
  if (!Number.isInteger(count) || count < subtasks.length) return null;

  const remaining = count - subtasks.length;
  const shares = subtasks.map(subtask => remaining * subtask.weightPercent / 100);
  const counts = shares.map(share => 1 + Math.floor(share));
  let unassigned = count - counts.reduce((sum, value) => sum + value, 0);
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < unassigned; index += 1) counts[byRemainder[index % byRemainder.length].index] += 1;
  return counts;
}
