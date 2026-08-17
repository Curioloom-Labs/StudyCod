import { AppDataSource } from "../data-source";

const DEFAULT_PASS_GRADE = 60;
const CLEANUP_BATCH_SIZE = 500;

/**
 * Personal tasks keep their judge cases in `test_data`. Once a generated task
 * has a passing grade, those cases can no longer be needed: the submission
 * and the grade snapshot remain available, while the large test payloads do
 * not have to stay in the database/cache forever.
 */
export async function cleanupCompletedPersonalTaskTests(params?: {
  taskId?: number;
  passGrade?: number;
}): Promise<number> {
  const passGrade = Number.isFinite(params?.passGrade)
    ? Math.max(0, Math.min(100, Math.floor(params!.passGrade!)))
    : DEFAULT_PASS_GRADE;
  const taskId = Number(params?.taskId);

  const where = Number.isInteger(taskId) && taskId > 0
    ? "td.personal_task_id = ? AND"
    : "";
  const args = Number.isInteger(taskId) && taskId > 0
    ? [taskId, passGrade]
    : [passGrade];

  // Keep each delete short so the startup sweep and post-submit cleanup do
  // not hold locks for seconds when a large batch of generated cases exists.
  // Repeating the same predicate is safe: deleted rows disappear from the
  // next batch, while the task/grade snapshot remains intact.
  let deleted = 0;
  while (true) {
    const rows = await AppDataSource.query(
      `SELECT td.id
         FROM test_data td
         INNER JOIN tasks t ON t.id = td.personal_task_id
         INNER JOIN grades g ON g.task_id = t.id AND g.user_id = t.user_id
        WHERE ${where}
              t.completed = 1
          AND g.total >= ?
        LIMIT ${CLEANUP_BATCH_SIZE}`,
      args
    );
    const ids = (rows as Array<{ id?: number }>).map(row => Number(row.id)).filter(id => Number.isInteger(id) && id > 0);
    if (ids.length === 0) break;

    const result = await AppDataSource.query(
      `DELETE FROM test_data WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    const affected = Number((result as any)?.affectedRows ?? 0);
    deleted += affected;
    if (ids.length < CLEANUP_BATCH_SIZE) break;
  }

  return deleted;
}
