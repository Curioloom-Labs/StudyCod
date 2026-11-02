import type { MigrationInterface, QueryRunner } from "typeorm";

/** Let regular topic tasks be tagged as classwork and selected for a live session. */
export class AddClassworkTopicTaskTypeAndLiveSelection1794800000000 implements MigrationInterface {
  name = "AddClassworkTopicTaskTypeAndLiveSelection1794800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const topicTasks = await queryRunner.getTable("topic_tasks");
    if (!topicTasks?.findColumnByName("type")) throw new Error("Cannot add classwork without topic_tasks.type.");
    await queryRunner.query("ALTER TABLE topic_tasks MODIFY COLUMN type ENUM('PRACTICE','CLASSWORK','CONTROL') NOT NULL DEFAULT 'PRACTICE'");

    const sessions = await queryRunner.getTable("edu_live_sessions");
    if (!sessions) throw new Error("Cannot select classwork before edu_live_sessions exists.");
    if (!sessions.findColumnByName("topic_task_id")) {
      await queryRunner.query("ALTER TABLE edu_live_sessions ADD topic_task_id INT NULL");
    }
    const withColumn = await queryRunner.getTable("edu_live_sessions");
    if (!withColumn?.indices.some(index => index.name === "ix_edu_live_sessions_topic_task_id")) {
      await queryRunner.query("ALTER TABLE edu_live_sessions ADD INDEX ix_edu_live_sessions_topic_task_id (topic_task_id)");
    }
    const withIndex = await queryRunner.getTable("edu_live_sessions");
    if (!withIndex?.foreignKeys.some(key => key.name === "fk_edu_live_sessions_topic_task_id")) {
      await queryRunner.query("ALTER TABLE edu_live_sessions ADD CONSTRAINT fk_edu_live_sessions_topic_task_id FOREIGN KEY (topic_task_id) REFERENCES topic_tasks(id) ON DELETE SET NULL");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const sessions = await queryRunner.getTable("edu_live_sessions");
    if (sessions?.findColumnByName("topic_task_id")) {
      if (sessions.foreignKeys.some(key => key.name === "fk_edu_live_sessions_topic_task_id")) {
        await queryRunner.query("ALTER TABLE edu_live_sessions DROP FOREIGN KEY fk_edu_live_sessions_topic_task_id");
      }
      const refreshed = await queryRunner.getTable("edu_live_sessions");
      if (refreshed?.indices.some(index => index.name === "ix_edu_live_sessions_topic_task_id")) {
        await queryRunner.query("ALTER TABLE edu_live_sessions DROP INDEX ix_edu_live_sessions_topic_task_id");
      }
      await queryRunner.query("ALTER TABLE edu_live_sessions DROP COLUMN topic_task_id");
    }

    const topicTasks = await queryRunner.getTable("topic_tasks");
    if (topicTasks?.findColumnByName("type")) {
      await queryRunner.query("UPDATE topic_tasks SET type = 'PRACTICE' WHERE type = 'CLASSWORK'");
      await queryRunner.query("ALTER TABLE topic_tasks MODIFY COLUMN type ENUM('PRACTICE','CONTROL') NOT NULL DEFAULT 'PRACTICE'");
    }
  }
}
