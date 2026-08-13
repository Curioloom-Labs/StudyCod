import { MigrationInterface, QueryRunner } from "typeorm";

function parseJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Rebuild completion percentages after the legacy progress bridge. */
export class RecalculateLearningProgress1752100000000 implements MigrationInterface {
  name = "RecalculateLearningProgress1752100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const enrollments = await queryRunner.query(
      `SELECT id, course_id AS courseId, status
         FROM user_course_enrollments`,
    ) as Array<{ id: number; courseId: number; status: string }>;

    for (const enrollment of enrollments) {
      const items = await queryRunner.query(
        `SELECT i.id, i.content
           FROM course_items i
           INNER JOIN course_modules m ON m.id = i.module_id
          WHERE m.course_id = ? AND i.is_active = 1`,
        [enrollment.courseId],
      ) as Array<{ id: number; content: string | Record<string, unknown> | null }>;
      const requiredIds = new Set(items
        .filter((item) => parseJson(item.content).required !== false)
        .map((item) => Number(item.id)));
      const progress = await queryRunner.query(
        `SELECT item_id AS itemId
           FROM course_item_progress
          WHERE enrollment_id = ? AND status = 'COMPLETED'`,
        [enrollment.id],
      ) as Array<{ itemId: number }>;
      const completedCount = progress.filter((entry) => requiredIds.has(Number(entry.itemId))).length;
      const completionPercent = requiredIds.size > 0
        ? Math.min(100, Math.round((completedCount / requiredIds.size) * 10000) / 100)
        : 0;
      const nextStatus = enrollment.status === "COMPLETED"
        ? "COMPLETED"
        : completedCount > 0
          ? "IN_PROGRESS"
          : enrollment.status;
      await queryRunner.query(
        `UPDATE user_course_enrollments
            SET completion_percent = ?, status = ?
          WHERE id = ?`,
        [completionPercent, nextStatus, enrollment.id],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Recalculation is derived state; rolling it back would restore stale
    // percentages and could overwrite learner progress earned afterwards.
  }
}
