import type { MigrationInterface, QueryRunner } from "typeorm";

/** Persist per-subtask scoring mode and its optional share of the task maximum. */
export class AddTestDataSubtaskScoring1794500000000 implements MigrationInterface {
  name = "AddTestDataSubtaskScoring1794500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("test_data"))) return;
    if (!(await queryRunner.hasColumn("test_data", "subtask_scoring_mode"))) {
      await queryRunner.query(
        "ALTER TABLE `test_data` ADD COLUMN `subtask_scoring_mode` ENUM('ABSOLUTE','PARTIAL') NOT NULL DEFAULT 'ABSOLUTE' AFTER `subtask`",
      );
    }
    if (!(await queryRunner.hasColumn("test_data", "subtask_weight_percent"))) {
      await queryRunner.query(
        "ALTER TABLE `test_data` ADD COLUMN `subtask_weight_percent` INT NULL AFTER `subtask_scoring_mode`",
      );
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      "Rollback blocked: subtask scoring settings are authoring data. Preserve them with a forward-only migration.",
    );
  }
}
