export type TopicTaskCategory = { type?: string | null };

/** Keep assessment-owned tasks out of the topic's regular task list. */
export function regularTopicPracticeTasks<T extends TopicTaskCategory>(
  tasks: readonly T[] | null | undefined,
): T[] {
  return (tasks ?? []).filter(task => task.type !== "CONTROL");
}
