import { MigrationInterface, QueryRunner } from "typeorm";

type Runtime = "JAVA" | "PYTHON" | "CPP";

type LegacyTaskRow = {
  id: number;
  topicIndex: number;
  topicTitle: string | null;
  numInTopic: number;
  completed: number;
  bestScore: number;
  createdAt: Date;
};

type CourseItemRow = {
  id: number;
  kind: string;
  title: string;
  content: string | Record<string, unknown> | null;
};

function normalizeTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
}

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

function practiceSequence(task: LegacyTaskRow): number {
  const match = String((task as any).title ?? "").match(/^\s*\((\d+)\//);
  const parsed = Number(match?.[1] ?? task.numInTopic ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function scoreForProgress(task: LegacyTaskRow): number {
  const score = Number(task.bestScore);
  if (Number.isFinite(score) && score >= 0) return Math.max(0, Math.min(100, score));
  return Number(task.completed) === 1 ? 100 : 0;
}

/**
 * The first catalog migration created enrollments as a compatibility bridge,
 * but it deliberately did not copy legacy tasks into the item-progress model.
 * This migration performs that missing, one-way bridge without touching task
 * history. It is safe to run once on every environment: progress and IAD
 * evidence use stable legacy task identifiers as their source keys.
 */
export class MigrateLegacyLearningProgress1752000000000 implements MigrationInterface {
  name = "MigrateLegacyLearningProgress1752000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const runtimes: Runtime[] = ["JAVA", "PYTHON", "CPP"];
    const variantByRuntime = new Map<Runtime, { courseId: number; variantId: number }>();
    for (const runtime of runtimes) {
      const rows = await queryRunner.query(
        `SELECT c.id AS courseId, v.id AS variantId
           FROM courses c
           INNER JOIN course_variants v ON v.course_id = c.id
          WHERE c.catalog_key = ? AND v.runtime = ?
          LIMIT 1`,
        [`${runtime.toLowerCase()}-core`, runtime],
      ) as Array<{ courseId: number; variantId: number }>;
      if (rows[0]) variantByRuntime.set(runtime, rows[0]);
    }

    const legacyUsers = await queryRunner.query(
      `SELECT DISTINCT t.user_id AS userId, t.lang AS runtime
         FROM tasks t
        WHERE t.lang IN ('JAVA', 'PYTHON', 'CPP')
          AND t.topic_id IS NOT NULL
          AND (t.subtitle IS NULL OR t.subtitle NOT LIKE 'CATALOG_ITEM:%')`,
    ) as Array<{ userId: number; runtime: Runtime }>;

    for (const legacyUser of legacyUsers) {
      const runtime = legacyUser.runtime;
      const base = variantByRuntime.get(runtime);
      if (!base) continue;

      let enrollmentRows = await queryRunner.query(
        `SELECT id, status
           FROM user_course_enrollments
          WHERE user_id = ? AND variant_id = ?
          LIMIT 1`,
        [legacyUser.userId, base.variantId],
      ) as Array<{ id: number; status: string }>;
      if (!enrollmentRows[0]) {
        await queryRunner.query(
          `INSERT INTO user_course_enrollments
            (user_id, course_id, variant_id, status, completion_percent, mastery_score, final_assessment_passed)
           VALUES (?, ?, ?, 'AVAILABLE', 0, 0, 0)`,
          [legacyUser.userId, base.courseId, base.variantId],
        );
        enrollmentRows = await queryRunner.query(
          `SELECT id, status
             FROM user_course_enrollments
            WHERE user_id = ? AND variant_id = ?
            LIMIT 1`,
          [legacyUser.userId, base.variantId],
        ) as Array<{ id: number; status: string }>;
      }
      const enrollment = enrollmentRows[0];
      if (!enrollment) continue;

      const items = await queryRunner.query(
        `SELECT i.id, i.kind, i.title, i.content
           FROM course_items i
           INNER JOIN course_modules m ON m.id = i.module_id
          WHERE m.course_id = ? AND i.is_active = 1
          ORDER BY i.id ASC`,
        [base.courseId],
      ) as CourseItemRow[];
      const topics = await queryRunner.query(
        `SELECT topic_index AS topicIndex, title
           FROM topics
          WHERE lang = ?
          ORDER BY topic_index ASC`,
        [runtime],
      ) as Array<{ topicIndex: number; title: string }>;
      const topicTitleByIndex = new Map(topics.map((topic) => [Number(topic.topicIndex), topic.title]));
      const theories = items.filter((item) => item.kind === "THEORY");
      const theoryByTitle = new Map(theories.map((item) => [normalizeTitle(item.title), item]));
      const theoryByIndex = new Map<number, CourseItemRow>();
      for (const topic of topics) {
        const theory = theoryByTitle.get(normalizeTitle(topic.title));
        if (theory) theoryByIndex.set(Number(topic.topicIndex), theory);
      }
      const practicesByTheory = new Map<number, CourseItemRow[]>();
      for (const item of items.filter((candidate) => candidate.kind === "CODE_TASK")) {
        const content = parseJson(item.content);
        const theoryId = Number(content.theoryItemId ?? 0);
        if (!theoryId) continue;
        const group = practicesByTheory.get(theoryId) ?? [];
        group.push(item);
        practicesByTheory.set(theoryId, group);
      }
      for (const group of practicesByTheory.values()) {
        group.sort((left, right) => {
          const leftSequence = Number(parseJson(left.content).exercise?.sequence ?? 0);
          const rightSequence = Number(parseJson(right.content).exercise?.sequence ?? 0);
          return leftSequence - rightSequence || left.id - right.id;
        });
      }

      const legacyTasks = await queryRunner.query(
        `SELECT t.id, t.topic_index AS topicIndex, t.num_in_topic AS numInTopic,
                t.completed, t.created_at AS createdAt, t.title,
                COALESCE(MAX(g.total), -1) AS bestScore,
                tp.title AS topicTitle
           FROM tasks t
           LEFT JOIN grades g ON g.task_id = t.id
           LEFT JOIN topics tp ON tp.id = t.topic_id
          WHERE t.user_id = ? AND t.lang = ? AND t.topic_id IS NOT NULL
            AND (t.subtitle IS NULL OR t.subtitle NOT LIKE 'CATALOG_ITEM:%')
            AND t.type IN ('INTRO', 'TOPIC')
          GROUP BY t.id, t.topic_index, t.num_in_topic, t.completed, t.created_at, t.title, tp.title
          ORDER BY t.created_at ASC, t.id ASC`,
        [legacyUser.userId, runtime],
      ) as LegacyTaskRow[];

      for (const task of legacyTasks) {
        const hasPassingEvidence = Number(task.completed) === 1 || Number(task.bestScore) >= 60;
        if (!hasPassingEvidence) continue;
        const topicTitle = task.topicTitle || topicTitleByIndex.get(Number(task.topicIndex));
        const theory = theoryByIndex.get(Number(task.topicIndex)) || theoryByTitle.get(normalizeTitle(topicTitle));
        if (!theory) continue;
        const score = scoreForProgress(task);

        await queryRunner.query(
          `INSERT INTO course_item_progress
            (enrollment_id, item_id, status, score, completed_at)
           VALUES (?, ?, 'COMPLETED', ?, ?)
           ON DUPLICATE KEY UPDATE
             status = 'COMPLETED',
             score = GREATEST(COALESCE(score, 0), VALUES(score)),
             completed_at = COALESCE(completed_at, VALUES(completed_at))`,
          [enrollment.id, theory.id, score, task.createdAt],
        );

        const practiceGroup = practicesByTheory.get(theory.id) ?? [];
        const practice = practiceGroup[practiceSequence(task) - 1] || practiceGroup[0];
        if (practice) {
          await queryRunner.query(
            `INSERT INTO course_item_progress
              (enrollment_id, item_id, status, score, completed_at)
             VALUES (?, ?, 'COMPLETED', ?, ?)
             ON DUPLICATE KEY UPDATE
               status = 'COMPLETED',
               score = GREATEST(COALESCE(score, 0), VALUES(score)),
               completed_at = COALESCE(completed_at, VALUES(completed_at))`,
            [enrollment.id, practice.id, score, task.createdAt],
          );
        }

        const sourceId = `legacy-task:${Number(task.id)}`;
        const evidenceExists = await queryRunner.query(
          `SELECT id FROM learning_evidence WHERE enrollment_id = ? AND source_id = ? LIMIT 1`,
          [enrollment.id, sourceId],
        ) as Array<{ id: number }>;
        if (!evidenceExists[0]) {
          await queryRunner.query(
            `INSERT INTO learning_evidence
              (enrollment_id, skill_key, source_type, source_id, score, difficulty, model_version)
             VALUES (?, ?, 'GRADE', ?, ?, NULL, 2)`,
            [enrollment.id, `${runtime.toLowerCase()}.topic.${Number(task.topicIndex)}`, sourceId, Math.max(0, Math.min(1, score / 100))],
          );
        }
      }

      const requiredCount = items.filter((item) => parseJson(item.content).required !== false).length;
      const requiredItemIds = items
        .filter((item) => parseJson(item.content).required !== false)
        .map((item) => Number(item.id))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0);
      const itemPlaceholders = requiredItemIds.map(() => "?").join(", ");
      const completedRows = await queryRunner.query(
        `SELECT COUNT(*) AS count
           FROM course_item_progress p
          WHERE p.enrollment_id = ? AND p.status = 'COMPLETED'
            AND p.item_id IN (${itemPlaceholders || "NULL"})`,
        [enrollment.id, ...requiredItemIds],
      ) as Array<{ count: number }>;
      const completedCount = Number(completedRows[0]?.count ?? 0);
      const completionPercent = requiredCount > 0 ? Math.min(100, Math.round((completedCount / requiredCount) * 10000) / 100) : 0;
      const nextStatus = enrollment.status === "COMPLETED" ? "COMPLETED" : completedCount > 0 ? "IN_PROGRESS" : enrollment.status;
      await queryRunner.query(
        `UPDATE user_course_enrollments
            SET completion_percent = ?, status = ?
          WHERE id = ?`,
        [completionPercent, nextStatus, enrollment.id],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // This is a data-preserving bridge. Removing migrated progress would be
    // destructive because a learner may have added newer progress afterwards.
  }
}
