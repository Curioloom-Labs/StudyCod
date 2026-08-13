import { MigrationInterface, QueryRunner } from "typeorm";

type LegacyTask = {
  id: number;
  userId: number;
  runtime: "JAVA" | "PYTHON" | "CPP";
  topicIndex: number;
  completed: number;
  bestScore: number;
  createdAt: Date;
};

function parseJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Repairs state created before the catalog became the single source of truth.
 * The migration is deliberately idempotent: it only demotes duplicate active
 * enrollments, archives orphaned generated items and adds missing evidence.
 */
export class RepairLearningCatalogState1752200000000 implements MigrationInterface {
  name = "RepairLearningCatalogState1752200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const active = await queryRunner.query(
      `SELECT id, user_id AS userId, completion_percent AS completionPercent, updated_at AS updatedAt
         FROM user_course_enrollments
        WHERE status = 'IN_PROGRESS'
        ORDER BY user_id ASC, completion_percent DESC, updated_at DESC, id DESC`,
    ) as Array<{ id: number; userId: number; completionPercent: number; updatedAt: Date }>;
    const keptByUser = new Set<number>();
    for (const enrollment of active) {
      if (keptByUser.has(Number(enrollment.userId))) {
        await queryRunner.query(
          `UPDATE user_course_enrollments SET status = 'AVAILABLE' WHERE id = ? AND status = 'IN_PROGRESS'`,
          [enrollment.id],
        );
      } else {
        keptByUser.add(Number(enrollment.userId));
      }
    }

    const activeTheoryRows = await queryRunner.query(
      `SELECT id FROM course_items WHERE kind = 'THEORY' AND is_active = 1`,
    ) as Array<{ id: number }>;
    const activeTheoryIds = new Set(activeTheoryRows.map((row) => Number(row.id)));
    const generatedItems = await queryRunner.query(
      `SELECT id, content FROM course_items WHERE kind = 'CODE_TASK' AND is_active = 1`,
    ) as Array<{ id: number; content: unknown }>;
    for (const item of generatedItems) {
      const content = parseJson(item.content);
      if (content.generatedAfterTheory !== true) continue;
      const theoryItemId = Number(content.theoryItemId ?? 0);
      if (!theoryItemId || !activeTheoryIds.has(theoryItemId)) {
        await queryRunner.query(`UPDATE course_items SET is_active = 0 WHERE id = ?`, [item.id]);
      }
    }

    const variants = await queryRunner.query(
      `SELECT c.id AS courseId, v.id AS variantId, v.runtime
         FROM courses c INNER JOIN course_variants v ON v.course_id = c.id
        WHERE c.catalog_key IN ('java-core', 'python-core', 'cpp-core')`,
    ) as Array<{ courseId: number; variantId: number; runtime: "JAVA" | "PYTHON" | "CPP" }>;
    const variantByRuntime = new Map(variants.map((row) => [row.runtime, row]));
    const legacyTasks = await queryRunner.query(
      `SELECT t.id, t.user_id AS userId, t.lang AS runtime, t.topic_index AS topicIndex,
              t.completed, t.created_at AS createdAt, COALESCE(MAX(g.total), -1) AS bestScore
         FROM tasks t
         LEFT JOIN grades g ON g.task_id = t.id
        WHERE t.lang IN ('JAVA', 'PYTHON', 'CPP')
          AND t.topic_id IS NOT NULL
          AND (t.subtitle IS NULL OR t.subtitle NOT LIKE 'CATALOG_ITEM:%')
        GROUP BY t.id, t.user_id, t.lang, t.topic_index, t.completed, t.created_at
        ORDER BY t.id ASC`,
    ) as LegacyTask[];

    const enrollmentCache = new Map<string, number>();
    for (const task of legacyTasks) {
      const base = variantByRuntime.get(task.runtime);
      if (!base) continue;
      const cacheKey = `${task.userId}:${task.runtime}`;
      let enrollmentId = enrollmentCache.get(cacheKey);
      if (!enrollmentId) {
        const rows = await queryRunner.query(
          `SELECT id FROM user_course_enrollments WHERE user_id = ? AND variant_id = ? LIMIT 1`,
          [task.userId, base.variantId],
        ) as Array<{ id: number }>;
        enrollmentId = Number(rows[0]?.id ?? 0);
        if (!enrollmentId) continue;
        enrollmentCache.set(cacheKey, enrollmentId);
      }
      const score = Math.max(0, Math.min(100, Number(task.bestScore) >= 0 ? Number(task.bestScore) : Number(task.completed) === 1 ? 100 : 0));
      const sourceId = `legacy-task:${Number(task.id)}`;
      const exists = await queryRunner.query(
        `SELECT id FROM learning_evidence WHERE enrollment_id = ? AND source_id = ? LIMIT 1`,
        [enrollmentId, sourceId],
      ) as Array<{ id: number }>;
      if (exists[0]) continue;
      await queryRunner.query(
        `INSERT INTO learning_evidence
          (enrollment_id, skill_key, source_type, source_id, score, difficulty, model_version)
         VALUES (?, ?, 'GRADE', ?, ?, NULL, 2)`,
        [enrollmentId, `${task.runtime.toLowerCase()}.topic.${Number(task.topicIndex)}`, sourceId, Math.max(0, Math.min(1, score / 100))],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // This migration repairs derived state and adds append-only evidence.
  }
}
