import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Close the Phase-1 tenant boundary for classes. This migration deliberately
 * fails before changing the schema when an orphan exists, so an operator must
 * resolve the ownership mapping instead of silently creating an unscoped class.
 * Courses remain nullable by design because the global catalog is a supported
 * system resource.
 */
export class EnforceClassOrgNotNull1752500000000 implements MigrationInterface {
  name = "EnforceClassOrgNotNull1752500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'org_id'");
    if (!Array.isArray(columns) || columns.length === 0) return;

    const orphanRows = await queryRunner.query("SELECT COUNT(*) AS `count` FROM `classes` WHERE `org_id` IS NULL");
    const orphanCount = Number(orphanRows?.[0]?.count ?? 0);
    if (orphanCount > 0) {
      throw new Error(`Cannot enforce classes.org_id NOT NULL: ${orphanCount} orphan class(es) remain`);
    }

    const constraints = await queryRunner.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'org_id' AND REFERENCED_TABLE_NAME = 'organizations'"
    );
    for (const row of Array.isArray(constraints) ? constraints : []) {
      const name = String(row.CONSTRAINT_NAME ?? "");
      if (name) await queryRunner.query(`ALTER TABLE \`classes\` DROP FOREIGN KEY \`${name}\``);
    }

    await queryRunner.query("ALTER TABLE `classes` MODIFY COLUMN `org_id` INT NOT NULL");
    await queryRunner.query(
      "ALTER TABLE `classes` ADD CONSTRAINT `fk_class_org` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'org_id'");
    if (!Array.isArray(columns) || columns.length === 0) return;
    const constraints = await queryRunner.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'org_id' AND REFERENCED_TABLE_NAME = 'organizations'"
    );
    for (const row of Array.isArray(constraints) ? constraints : []) {
      const name = String(row.CONSTRAINT_NAME ?? "");
      if (name) await queryRunner.query(`ALTER TABLE \`classes\` DROP FOREIGN KEY \`${name}\``);
    }
    await queryRunner.query("ALTER TABLE `classes` MODIFY COLUMN `org_id` INT NULL");
    await queryRunner.query(
      "ALTER TABLE `classes` ADD CONSTRAINT `fk_class_org` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL"
    );
  }
}
