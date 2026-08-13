import type { MigrationInterface, QueryRunner } from "typeorm";

/** Removes the old global runtime columns after catalog enrollment backfill. */
export class RemoveLegacyGlobalRuntime1751700000000 implements MigrationInterface {
  name = "RemoveLegacyGlobalRuntime1751700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = async (table: string, column: string): Promise<boolean> => {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      return Array.isArray(rows) && rows.length > 0;
    };

    if (await hasColumn("courses", "language")) {
      await queryRunner.query("ALTER TABLE `courses` DROP COLUMN `language`");
    }
    if (await hasColumn("users", "lang")) {
      await queryRunner.query("ALTER TABLE `users` DROP COLUMN `lang`");
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // The old global runtime cannot be restored without reintroducing the
    // ambiguity this migration removes. Enrollment rows are the source of truth.
  }
}
