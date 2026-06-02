import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the `scoring_mode` column to the `contests` table.
 *
 * The column was introduced on the `Contest` entity (IOI/ICPC ranking model)
 * and into the legacy `ensureContestsTable` patch, but the consolidating
 * `RunLegacyDbPatches1748000000000` migration had already been recorded as
 * applied on existing databases before that branch existed. TypeORM never
 * re-runs a recorded migration, so production tables created by the original
 * patch are missing the column, causing contest INSERTs to fail with
 * `ER_BAD_FIELD_ERROR: Unknown column 'scoring_mode' in 'field list'`.
 *
 * `allow_upsolve` is patched defensively under the same logic.
 *
 * Idempotent: every step does a `SHOW COLUMNS` check before altering, so
 * re-running against an already-patched database is a no-op.
 */
export class AddContestScoringMode1748600000000 implements MigrationInterface {
  name = "AddContestScoringMode1748600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'contests'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const allowUpsolve = await queryRunner.query(
      "SHOW COLUMNS FROM `contests` LIKE 'allow_upsolve'"
    );
    if (!Array.isArray(allowUpsolve) || allowUpsolve.length === 0) {
      await queryRunner.query(
        "ALTER TABLE `contests` ADD COLUMN `allow_upsolve` TINYINT(1) NOT NULL DEFAULT 1"
      );
    }

    const scoringMode = await queryRunner.query(
      "SHOW COLUMNS FROM `contests` LIKE 'scoring_mode'"
    );
    if (!Array.isArray(scoringMode) || scoringMode.length === 0) {
      await queryRunner.query(
        "ALTER TABLE `contests` ADD COLUMN `scoring_mode` ENUM('IOI','ICPC') NOT NULL DEFAULT 'IOI'"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const scoringMode = await queryRunner.query(
      "SHOW COLUMNS FROM `contests` LIKE 'scoring_mode'"
    );
    if (Array.isArray(scoringMode) && scoringMode.length > 0) {
      await queryRunner.query("ALTER TABLE `contests` DROP COLUMN `scoring_mode`");
    }
  }
}
