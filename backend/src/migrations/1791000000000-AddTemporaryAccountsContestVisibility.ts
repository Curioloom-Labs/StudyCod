import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddTemporaryAccountsContestVisibility1791000000000 implements MigrationInterface {
  name = "AddTemporaryAccountsContestVisibility1791000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table || !table.findColumnByName("visibility")) return;
    await queryRunner.query(
      "ALTER TABLE `contests` MODIFY COLUMN `visibility` ENUM('PUBLIC','PRIVATE_CODE','CLASS','TEMPORARY_ACCOUNTS') NOT NULL DEFAULT 'PUBLIC'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table || !table.findColumnByName("visibility")) return;
    await queryRunner.query("UPDATE `contests` SET `visibility` = 'PUBLIC' WHERE `visibility` = 'TEMPORARY_ACCOUNTS'");
    await queryRunner.query(
      "ALTER TABLE `contests` MODIFY COLUMN `visibility` ENUM('PUBLIC','PRIVATE_CODE','CLASS') NOT NULL DEFAULT 'PUBLIC'",
    );
  }
}
