import {
  clampIad,
  getIadDeltaByGrade,
  getLastProcessedGradeIdForLang,
  getUserIadForLang,
  setLastProcessedGradeIdForLang,
  setUserIadForLang,
} from "./iad";

/**
 * Backward-compatible helper for quick deterministic updates in tests/tools.
 */
export function calculateAdaptiveIad(currentIad: number, grade: number): number {
  return clampIad(Number(currentIad ?? 0) + getIadDeltaByGrade(Number(grade ?? 0)));
}

export const calculateAdaptiveDifus = calculateAdaptiveIad;

export async function getStableIad(
  userId: number,
  lang: "JAVA" | "PYTHON" | "CPP",
  _topicIndex: number,
  userRepo: () => any,
  gradeRepo: () => any
): Promise<number> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return 0;

  let currentIad = getUserIadForLang(user, lang);
  let lastProcessedGradeId = getLastProcessedGradeIdForLang(user, lang);

  // Older accounts can have a zero IAD with a populated grade history and no
  // processing cursor. Rebuild that value once so the headline value and the
  // journal events cannot disagree.
  if (currentIad <= 0 && lastProcessedGradeId == null) {
    const historicGrades = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoin("grade.task", "task")
      .where("grade.user_id = :userId", { userId })
      .andWhere("task.lang = :lang", { lang })
      .andWhere("grade.total IS NOT NULL")
      .orderBy("grade.id", "ASC")
      .getMany();

    if (historicGrades.length > 0) {
      for (const grade of historicGrades) {
        currentIad = calculateAdaptiveIad(currentIad, Number((grade as any)?.total ?? 0));
      }
      setUserIadForLang(user, lang, currentIad);
      setLastProcessedGradeIdForLang(user, lang, Number(historicGrades[historicGrades.length - 1]?.id ?? 0));
      (user as any).lastIadChange = new Date();
      (user as any).lastDifusChange = new Date();
      await userRepo().save(user);
      return currentIad;
    }
  }

  // Compatibility bootstrap: do not replay all historic grades on first run.
  // Start from the current IAD and begin applying deltas only for new grades.
  if (lastProcessedGradeId == null) {
    const latestKnownGrade = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoin("grade.task", "task")
      .where("grade.user_id = :userId", { userId })
      .andWhere("task.lang = :lang", { lang })
      .andWhere("grade.total IS NOT NULL")
      .orderBy("grade.id", "DESC")
      .take(1)
      .getOne();

    if (latestKnownGrade?.id) {
      setLastProcessedGradeIdForLang(user, lang, Number(latestKnownGrade.id));
      await userRepo().save(user);
    }
    return currentIad;
  }

  const newGrades = await gradeRepo()
    .createQueryBuilder("grade")
    .leftJoin("grade.task", "task")
    .where("grade.user_id = :userId", { userId })
    .andWhere("task.lang = :lang", { lang })
    .andWhere("grade.total IS NOT NULL")
    .andWhere("grade.id > :lastProcessedGradeId", { lastProcessedGradeId })
    .orderBy("grade.id", "ASC")
    .getMany();

  if (!Array.isArray(newGrades) || newGrades.length === 0) return currentIad;

  for (const grade of newGrades) {
    const gradeValue = Number((grade as any)?.total ?? 0);
    currentIad = calculateAdaptiveIad(currentIad, gradeValue);
  }

  setUserIadForLang(user, lang, currentIad);
  setLastProcessedGradeIdForLang(user, lang, Number(newGrades[newGrades.length - 1]?.id ?? lastProcessedGradeId));
  (user as any).lastIadChange = new Date();
  (user as any).lastDifusChange = new Date();
  await userRepo().save(user);

  return currentIad;
}

export const getStableDifus = getStableIad;
