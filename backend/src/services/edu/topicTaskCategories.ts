export type TopicTaskCategory = { type?: string | null };

/** Keep Control Work tasks out of the topic's regular practice list. */
export function regularTopicPracticeTasks<T extends TopicTaskCategory>(
  tasks: readonly T[] | null | undefined,
): T[] {
  return (tasks ?? []).filter(task => task.type === "PRACTICE");
}
