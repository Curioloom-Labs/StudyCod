import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Indexes used by the course gradebook and latest-attempt lookups.
 * Idempotent so it is safe against databases created before these entities
 * declared their indexes.
 */
export class HardenCourseSystemIndexes1752400000000 implements MigrationInterface {
  name = "HardenCourseSystemIndexes1752400000000";

  private async hasIndex(queryRunner: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await queryRunner.query(
      "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
      [table, name]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async addIndex(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    columns: string
  ): Promise<void> {
    if (await this.hasIndex(queryRunner, table, name)) return;
    await queryRunner.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${columns})`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addIndex(
      queryRunner,
      "edu_grades",
      "idx_edu_grades_student_task_created",
      "`student_id`, `task_id`, `created_at`"
    );
    await this.addIndex(
      queryRunner,
      "edu_grades",
      "idx_edu_grades_student_topic_created",
      "`student_id`, `topic_task_id`, `created_at`"
    );
    await this.addIndex(
      queryRunner,
      "summary_grades",
      "idx_summary_grades_student_created",
      "`student_id`, `created_at`"
    );
    await this.addIndex(
      queryRunner,
      "summary_grades",
      "idx_summary_grades_class_student_created",
      "`class_id`, `student_id`, `created_at`"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, name] of [
      ["edu_grades", "idx_edu_grades_student_task_created"],
      ["edu_grades", "idx_edu_grades_student_topic_created"],
      ["summary_grades", "idx_summary_grades_student_created"],
      ["summary_grades", "idx_summary_grades_class_student_created"]
    ] as const) {
      if (await this.hasIndex(queryRunner, table, name)) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
      }
    }
  }
}
