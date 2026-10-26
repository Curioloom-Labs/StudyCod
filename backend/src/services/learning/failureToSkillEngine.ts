import type { Repository } from "typeorm";
import { AppDataSource } from "../../data-source";
import { LearningAttempt, type LearningOutcome, type LearningPrincipalType, type LearningTaskKind } from "../../entities/LearningAttempt";
import { LearningEvent, type LearningEventType } from "../../entities/LearningEvent";
import { Task } from "../../entities/Task";

export type LearningRepositories = {
  attempts: Repository<LearningAttempt>;
  events: Repository<LearningEvent>;
};

export type LearningOutcomeInput = {
  principalType: LearningPrincipalType;
  principalId: number;
  taskKind: LearningTaskKind;
  taskId: number;
  topicId?: number | null;
  topicLabel?: string | null;
  submissionId?: string | null;
  sourceAttemptId?: number | null;
  outcome: LearningOutcome;
  failureCategory?: string | null;
  firstFailedTestId?: number | null;
};

export type LearningEventInput = {
  principalType: LearningPrincipalType;
  principalId: number;
  eventType: LearningEventType;
  taskKind?: LearningTaskKind;
  taskId?: number | null;
  learningAttemptId?: number | null;
  failureCategory?: string | null;
  hintLevel?: number | null;
  dedupeKey: string;
};

export type SkillEvidence = {
  totalAttempts: number;
  practicedTasks: number;
  solvedTasks: number;
  solvedAfterFailure: number;
  revisitedSolved: number;
  hintedTasks: number;
  hintLevelCounts: Array<{ level: 1 | 2 | 3; tasks: number }>;
  overcomeCategories: Array<{ name: string; tasks: number }>;
  topics: Array<{ name: string; practiced: number; solved: number; improving: boolean }>;
  recentSkills: Array<{ taskId: number; topic: string | null; category: string | null; outcome: "Evidence collected"; createdAt: Date }>;
  practiceTimestamps: string[];
};

export function learningRepositories(): LearningRepositories {
  return {
    attempts: AppDataSource.getRepository(LearningAttempt),
    events: AppDataSource.getRepository(LearningEvent),
  };
}

function safeCategory(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64);
  return normalized || null;
}

function clampHintLevel(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0;
}

function defaultDedupeKey(input: LearningEventInput): string {
  return [
    input.eventType,
    input.principalType,
    input.principalId,
    input.taskKind ?? "UNKNOWN",
    input.taskId ?? "none",
    input.learningAttemptId ?? "none",
    input.hintLevel ?? "none",
  ].join(":");
}

export async function recordLearningEvent(input: LearningEventInput, repos = learningRepositories()): Promise<LearningEvent | null> {
  const dedupeKey = String(input.dedupeKey || defaultDedupeKey(input)).slice(0, 191);
  const existing = await repos.events.findOne({ where: { dedupeKey } });
  if (existing) return existing;

  const event = repos.events.create({
    principalType: input.principalType,
    principalId: input.principalId,
    eventType: input.eventType,
    taskKind: input.taskKind ?? "UNKNOWN",
    taskId: input.taskId ?? null,
    learningAttemptId: input.learningAttemptId ?? null,
    failureCategory: safeCategory(input.failureCategory),
    hintLevel: input.hintLevel == null ? null : clampHintLevel(input.hintLevel),
    dedupeKey,
  });

  let saved: LearningEvent;
  try {
    saved = await repos.events.save(event);
  } catch {
    // The unique key makes concurrent/retried client events idempotent.
    return repos.events.findOne({ where: { dedupeKey } });
  }

  if (saved.eventType === "hint_viewed" && saved.learningAttemptId && saved.hintLevel) {
    const attempt = await repos.attempts.findOne({ where: { id: saved.learningAttemptId } });
    if (attempt && saved.hintLevel > (attempt.highestHintLevelShown ?? 0)) {
      attempt.highestHintLevelShown = saved.hintLevel;
      await repos.attempts.save(attempt);
    }
  }
  return saved;
}

export async function recordLearningOutcome(input: LearningOutcomeInput, repos = learningRepositories()): Promise<{ attempt: LearningAttempt; solvedAfterFailure: boolean }> {
  const previous = await repos.attempts.find({
    where: {
      principalType: input.principalType,
      principalId: input.principalId,
      taskKind: input.taskKind,
      taskId: input.taskId,
    },
    order: { createdAt: "ASC" },
  });
  const solvedAfterFailure = input.outcome === "SOLVED" && previous.some((row) => row.outcome === "FAILED");
  const attempt = repos.attempts.create({
    principalType: input.principalType,
    principalId: input.principalId,
    taskKind: input.taskKind,
    taskId: input.taskId,
    topicId: input.topicId ?? null,
    topicLabel: String(input.topicLabel ?? "").trim().slice(0, 160) || null,
    submissionId: String(input.submissionId ?? "").trim().slice(0, 128) || null,
    sourceAttemptId: input.sourceAttemptId ?? null,
    outcome: input.outcome,
    failureCategory: safeCategory(input.failureCategory),
    firstFailedTestId: input.firstFailedTestId ?? null,
    highestHintLevelShown: 0,
  });
  const saved = await repos.attempts.save(attempt);
  const eventBase = {
    principalType: input.principalType,
    principalId: input.principalId,
    taskKind: input.taskKind,
    taskId: input.taskId,
    learningAttemptId: saved.id,
    failureCategory: input.failureCategory,
  } as const;

  if (input.outcome === "FAILED") {
    await recordLearningEvent({
      ...eventBase,
      eventType: "coding_attempt_failed",
      dedupeKey: `coding_attempt_failed:${input.taskKind}:${input.principalType}:${input.principalId}:${saved.id}`,
    }, repos);
  } else if (solvedAfterFailure) {
    await recordLearningEvent({
      ...eventBase,
      eventType: "solved_after_failure",
      dedupeKey: `solved_after_failure:${input.taskKind}:${input.principalType}:${input.principalId}:${saved.id}`,
    }, repos);
  }

  return { attempt: saved, solvedAfterFailure };
}

export function deriveSkillEvidence(attempts: LearningAttempt[]): SkillEvidence {
  const taskStates = new Map<number, { topic: string | null; practiced: boolean; solved: boolean; failed: boolean; failedAttempts: number; solvedAfterFailure: boolean; solvedAfterTwoFailures: boolean; categories: Set<string>; lastSolved: LearningAttempt | null; highestHintLevelShown: number }>();
  for (const attempt of [...attempts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    const state = taskStates.get(attempt.taskId) ?? {
      topic: attempt.topicLabel || (attempt.topicId ? `topic:${attempt.topicId}` : null),
      practiced: false,
      solved: false,
      failed: false,
      failedAttempts: 0,
      solvedAfterFailure: false,
      solvedAfterTwoFailures: false,
      categories: new Set<string>(),
      lastSolved: null,
      highestHintLevelShown: 0,
    };
    state.practiced = true;
    state.highestHintLevelShown = Math.max(state.highestHintLevelShown, Math.max(0, Math.min(3, Number(attempt.highestHintLevelShown) || 0)));
    if (attempt.topicLabel) state.topic = attempt.topicLabel;
    if (attempt.outcome === "FAILED") {
      state.failed = true;
      state.failedAttempts += 1;
      const category = safeCategory(attempt.failureCategory);
      if (category) state.categories.add(category);
    } else {
      state.solved = true;
      state.solvedAfterFailure = state.solvedAfterFailure || state.failed;
      state.solvedAfterTwoFailures = state.solvedAfterTwoFailures || state.failedAttempts >= 2;
      state.lastSolved = attempt;
    }
    taskStates.set(attempt.taskId, state);
  }

  const practicedTasks = taskStates.size;
  const solvedTasks = Array.from(taskStates.values()).filter((s) => s.solved).length;
  const solvedAfterFailure = Array.from(taskStates.values()).filter((s) => s.solvedAfterFailure).length;
  const revisitedSolved = Array.from(taskStates.values()).filter((s) => s.solvedAfterTwoFailures).length;
  const hintLevelCounts = ([1, 2, 3] as const).map((level) => ({
    level,
    tasks: Array.from(taskStates.values()).filter((state) => state.highestHintLevelShown === level).length,
  }));
  const categoryTaskSets = new Map<string, Set<number>>();
  for (const [taskId, state] of taskStates) {
    if (!state.solvedAfterFailure) continue;
    for (const category of state.categories) {
      const set = categoryTaskSets.get(category) ?? new Set<number>();
      set.add(taskId);
      categoryTaskSets.set(category, set);
    }
  }

  const topics = new Map<string, { practiced: Set<number>; solved: Set<number>; improving: Set<number> }>();
  for (const [taskId, state] of taskStates) {
    if (!state.topic) continue;
    const topic = topics.get(state.topic) ?? { practiced: new Set<number>(), solved: new Set<number>(), improving: new Set<number>() };
    topic.practiced.add(taskId);
    if (state.solved) topic.solved.add(taskId);
    if (state.solvedAfterFailure) topic.improving.add(taskId);
    topics.set(state.topic, topic);
  }

  const recentSkills = Array.from(taskStates.entries())
    .filter(([, state]) => state.solvedAfterFailure && state.lastSolved)
    .map(([taskId, state]) => ({
      taskId,
      topic: state.topic,
      category: Array.from(state.categories)[0] ?? null,
      outcome: "Evidence collected" as const,
      createdAt: state.lastSolved!.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return {
    totalAttempts: attempts.length,
    practicedTasks,
    solvedTasks,
    solvedAfterFailure,
    revisitedSolved,
    hintedTasks: Array.from(taskStates.values()).filter((state) => state.highestHintLevelShown > 0).length,
    hintLevelCounts,
    overcomeCategories: Array.from(categoryTaskSets.entries())
      .map(([name, taskIds]) => ({ name, tasks: taskIds.size }))
      .sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name)),
    topics: Array.from(topics.entries())
      .map(([name, value]) => ({ name, practiced: value.practiced.size, solved: value.solved.size, improving: value.improving.size > 0 }))
      .sort((a, b) => Number(b.improving) - Number(a.improving) || b.solved - a.solved || a.name.localeCompare(b.name)),
    recentSkills,
    practiceTimestamps: attempts
      .map((attempt) => new Date(attempt.createdAt).toISOString())
      .filter((timestamp) => Number.isFinite(new Date(timestamp).getTime())),
  };
}

export async function getSkillEvidence(principalType: LearningPrincipalType, principalId: number, repos = learningRepositories()): Promise<SkillEvidence> {
  const attempts = await repos.attempts.find({
    where: { principalType, principalId },
    order: { createdAt: "ASC" },
  });
  // Library exercises are independent practice and must not become lesson skill evidence.
  return deriveSkillEvidence(attempts.filter((attempt) => attempt.taskKind !== "LIBRARY"));
}

export async function getLibrarySkillEvidence(principalType: LearningPrincipalType, principalId: number, repos = learningRepositories()): Promise<SkillEvidence> {
  const attempts = await repos.attempts.find({
    where: { principalType, principalId },
    order: { createdAt: "ASC" },
  });
  return deriveSkillEvidence(attempts.filter((attempt) => attempt.taskKind === "LIBRARY"));
}

export async function getCourseSkillEvidence(principalId: number, courseEnrollmentId: number, repos = learningRepositories()): Promise<SkillEvidence> {
  const tasks = await AppDataSource.getRepository(Task).find({
    where: { user: { id: principalId }, courseEnrollment: { id: courseEnrollmentId }, type: "TOPIC", taskMode: "CODE" },
    select: { id: true },
  });
  const taskIds = new Set(tasks.map((task) => task.id));
  if (taskIds.size === 0) return deriveSkillEvidence([]);
  const attempts = await repos.attempts.find({
    where: { principalType: "USER", principalId, taskKind: "PERSONAL" },
    order: { createdAt: "ASC" },
  });
  return deriveSkillEvidence(attempts.filter((attempt) => taskIds.has(attempt.taskId)));
}
