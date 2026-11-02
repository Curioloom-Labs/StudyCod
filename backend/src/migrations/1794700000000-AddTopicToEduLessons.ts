import type { MigrationInterface, QueryRunner } from "typeorm";

/** Keep classwork attached to its topic in the class learning path. */
export class AddTopicToEduLessons1794700000000 implements MigrationInterface {
  name = "AddTopicToEduLessons1794700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("edu_lessons");
    if (!table) throw new Error("Cannot attach classwork before edu_lessons exists.");
    if (!table.findColumnByName("topic_id")) {
      await queryRunner.query("ALTER TABLE edu_lessons ADD topic_id INT NULL");
    }
    const refreshed = await queryRunner.getTable("edu_lessons");
    if (!refreshed?.indices.some(index => index.name === "ix_edu_lessons_topic_id")) {
      await queryRunner.query("ALTER TABLE edu_lessons ADD INDEX ix_edu_lessons_topic_id (topic_id)");
    }
    const withIndex = await queryRunner.getTable("edu_lessons");
    if (!withIndex?.foreignKeys.some(key => key.name === "fk_edu_lessons_topic_id")) {
      await queryRunner.query("ALTER TABLE edu_lessons ADD CONSTRAINT fk_edu_lessons_topic_id FOREIGN KEY (topic_id) REFERENCES topics_new(id) ON DELETE SET NULL");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("edu_lessons");
    if (!table?.findColumnByName("topic_id")) return;
    if (table.foreignKeys.some(key => key.name === "fk_edu_lessons_topic_id")) {
      await queryRunner.query("ALTER TABLE edu_lessons DROP FOREIGN KEY fk_edu_lessons_topic_id");
    }
    const refreshed = await queryRunner.getTable("edu_lessons");
    if (refreshed?.indices.some(index => index.name === "ix_edu_lessons_topic_id")) {
      await queryRunner.query("ALTER TABLE edu_lessons DROP INDEX ix_edu_lessons_topic_id");
    }
    await queryRunner.query("ALTER TABLE edu_lessons DROP COLUMN topic_id");
  }
}
