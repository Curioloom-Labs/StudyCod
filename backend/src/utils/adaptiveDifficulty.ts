import {
  clampIad,
  getIadDeltaByGrade,
  getIadCeilingForTopic,
  getLastProcessedGradeIdForLang,
  getUserIadForLang,
  setLastProcessedGradeIdForLang,
  setUserIadForLang,
  type IadEvidence,
} from "./iad";
import { AppDataSource } from "../data-source";
import { UserCourseEnrollment } from "../entities/UserCourseEnrollment";
import { LearningEvidence } from "../entities/LearningEvidence";

/**
 * Backward-compatible helper for quick deterministic updates in tests/tools.
 */
export function calculateAdaptiveIad(currentIad: number, grade: number, evidence: IadEvidence = {}): number {
  return clampIad(Number(currentIad ?? 0) + getIadDeltaByGrade(Number(grade ?? 0), evidence));
}

export const calculateAdaptiveDifus = calculateAdaptiveIad;

function evidenceFromGrade(grade: any): IadEvidence {
  const task = grade?.task;
  const topicIndex = Number(task?.topicIndex);
  const numInTopic = Number(task?.numInTopic);
  return {
    topicIndex: Number.isFinite(topicIndex) ? topicIndex : null,
    taskType: task?.type ?? null,
    numInTopic: Number.isFinite(numInTopic) ? numInTopic : null,
    isMiniProject: String(task?.subtitle ?? "").startsWith("MPJ:"),
  };
}

function rebuildIadFromGrades(grades: any[]): { value: number; maxTopicIndex: number | null } {
  let value = 0;
  let maxTopicIndex: number | null = null;
  for (const grade of grades) {
    const evidence = evidenceFromGrade(grade);
    if (Number.isFinite(Number(evidence.topicIndex))) {
      maxTopicIndex = Math.max(maxTopicIndex ?? 0, Number(evidence.topicIndex));
    }
    value = calculateAdaptiveIad(value, Number(grade?.total ?? 0), evidence);
  }

  // Apply the curriculum ceiling after all evidence has been replayed. This
  // prevents revisiting an easy early topic from lowering a learner who has
  // already reached a later topic.
  const ceiling = getIadCeilingForTopic(maxTopicIndex);
  return { value: clampIad(Math.min(value, ceiling)), maxTopicIndex };
}

export async function getStableIad(
  userId: number,
  lang: "JAVA" | "PYTHON" | "CPP",
  _topicIndex: number,
  userRepo: () => any,
  gradeRepo: () => any
): Promise<number> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return 0;

  const storedIad = getUserIadForLang(user, lang);
  const grades = await gradeRepo()
    .createQueryBuilder("grade")
    .leftJoinAndSelect("grade.task", "task")
    .where("grade.user_id = :userId", { userId })
    .andWhere("task.lang = :lang", { lang })
    .andWhere("grade.total IS NOT NULL")
    .orderBy("grade.id", "ASC")
    .getMany();

  // Replaying the compact grade history makes the v2 reform apply to existing
  // accounts too; it also keeps the headline and event log on one formula.
  if (!Array.isArray(grades) || grades.length === 0) return storedIad;
  const rebuilt = rebuildIadFromGrades(grades);
  const latestGradeId = Number(grades[grades.length - 1]?.id ?? 0);
  const lastProcessedGradeId = getLastProcessedGradeIdForLang(user, lang);

  if (Math.abs(storedIad - rebuilt.value) > 0.0005 || lastProcessedGradeId !== latestGradeId) {
    setUserIadForLang(user, lang, rebuilt.value);
    setLastProcessedGradeIdForLang(user, lang, latestGradeId);
    (user as any).lastIadChange = new Date();
    (user as any).lastDifusChange = new Date();
    await userRepo().save(user);
  }

  // New catalog model: mirror the same deterministic result into the active
  // course enrollment. The legacy user columns above are only a migration
  // bridge; new UI and prerequisite checks read enrollment.masteryScore.
  const enrollment = await AppDataSource.getRepository(UserCourseEnrollment).findOne({
    where: { user: { id: userId }, variant: { runtime: lang } },
    relations: ["variant"],
    order: { updatedAt: "DESC" }
  });
  if (enrollment && Math.abs(Number(enrollment.masteryScore ?? 0) - rebuilt.value) > 0.0005) {
    enrollment.masteryScore = rebuilt.value;
    await AppDataSource.getRepository(UserCourseEnrollment).save(enrollment);
  }

  const evidenceRepo = AppDataSource.getRepository(LearningEvidence);
  if (enrollment) {
    for (const grade of grades) {
      const sourceId = `grade:${Number(grade?.id ?? 0)}`;
      if (sourceId === "grade:0") continue;
      const exists = await evidenceRepo.findOne({ where: { enrollmentId: enrollment.id, sourceId } });
      if (exists) continue;
      await evidenceRepo.save(evidenceRepo.create({
        enrollmentId: enrollment.id,
        sourceType: "GRADE",
        sourceId,
        score: clampIad(Number(grade?.total ?? 0) / 100),
        difficulty: clampIad(Number(grade?.task?.difus ?? 0) / 100),
        modelVersion: 2
      }));
    }
  }

  return rebuilt.value;
}

export const getStableDifus = getStableIad;
