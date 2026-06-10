import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the configurable thematic-grade `thematic_formula` column to both
 * `classes` (class-level default) and `topics_new` (per-topic override).
 *
 * NULL means "use the inherited/built-in default" (class falls back to the
 * built-in smart default; topic falls back to its class). See
 * utils/thematicFormula.ts for the resolution order and variables.
 *
 * Idempotent: SHOW COLUMNS guard before each ALTER.
 */
export class AddThematicFormula1748700100000 implements MigrationInterface {
  name = "AddThematicFormula1748700100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const classes = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (Array.isArray(classes) && classes.length > 0) {
      const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'thematic_formula'");
      if (!Array.isArray(col) || col.length === 0) {
        await queryRunner.query(
          "ALTER TABLE `classes` ADD COLUMN `thematic_formula` VARCHAR(255) NULL AFTER `grade_scale_mode`"
        );
      }
    }

    const topics = await queryRunner.query("SHOW TABLES LIKE 'topics_new'");
    if (Array.isArray(topics) && topics.length > 0) {
      const col = await queryRunner.query("SHOW COLUMNS FROM `topics_new` LIKE 'thematic_formula'");
      if (!Array.isArray(col) || col.length === 0) {
        await queryRunner.query(
          "ALTER TABLE `topics_new` ADD COLUMN `thematic_formula` VARCHAR(255) NULL AFTER `language`"
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const classCol = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'thematic_formula'");
    if (Array.isArray(classCol) && classCol.length > 0) {
      await queryRunner.query("ALTER TABLE `classes` DROP COLUMN `thematic_formula`");
    }
    const topicCol = await queryRunner.query("SHOW COLUMNS FROM `topics_new` LIKE 'thematic_formula'");
    if (Array.isArray(topicCol) && topicCol.length > 0) {
      await queryRunner.query("ALTER TABLE `topics_new` DROP COLUMN `thematic_formula`");
    }
  }
}
