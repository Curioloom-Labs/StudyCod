/**
 * Personal curriculum milestones are based on regular thematic topics.
 * Topic 0 is an introductory lesson and intentionally does not count toward
 * project or control-work milestones, even though it only needs one task.
 */
export const PERSONAL_INTRO_TOPIC_INDEX = 0;
export const PERSONAL_FIRST_THEMATIC_TOPIC_INDEX = PERSONAL_INTRO_TOPIC_INDEX + 1;
export const PERSONAL_REGULAR_TOPIC_TASK_COUNT = 3;

export function getPersonalThematicStartTopicIndex(masteredUntilTopicIndex: number): number {
  const normalized = Number.isFinite(Number(masteredUntilTopicIndex))
    ? Math.floor(Number(masteredUntilTopicIndex)) + 1
    : PERSONAL_FIRST_THEMATIC_TOPIC_INDEX;

  return Math.max(PERSONAL_FIRST_THEMATIC_TOPIC_INDEX, normalized);
}

export function getSequentialCompletedThematicTopicCount(params: {
  topics: Array<{ topicIndex: number }>;
  countByTopicIndex: Map<number, number>;
  baseStartTopicIndex: number;
}): number {
  const thematicStartTopicIndex = Math.max(
    PERSONAL_FIRST_THEMATIC_TOPIC_INDEX,
    Number.isFinite(Number(params.baseStartTopicIndex))
      ? Math.floor(Number(params.baseStartTopicIndex))
      : PERSONAL_FIRST_THEMATIC_TOPIC_INDEX
  );

  let completed = 0;
  for (const topic of params.topics) {
    if (topic.topicIndex < thematicStartTopicIndex) continue;

    const count = params.countByTopicIndex.get(topic.topicIndex) ?? 0;
    if (count >= PERSONAL_REGULAR_TOPIC_TASK_COUNT) completed++;
    else break;
  }
  return completed;
}
