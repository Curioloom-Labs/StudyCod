import type { MigrationInterface, QueryRunner } from "typeorm";

/** Adds a least-privilege role for the support desk. */
export class AddSupportUserRole1751200000000 implements MigrationInterface {
  name = "AddSupportUserRole1751200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'users'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const columns = await queryRunner.query("SHOW COLUMNS FROM `users` LIKE 'role'");
    const column = Array.isArray(columns) ? columns[0] : null;
    const type = String(column?.Type || "").toLowerCase();
    if (!type.includes("enum")) return;
    if (type.includes("support")) return;

    await queryRunner.query(
      "ALTER TABLE `users` MODIFY COLUMN `role` ENUM('USER','TEACHER','SUPPORT','SYSTEM_ADMIN') NULL DEFAULT NULL"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'users'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query(
      "UPDATE `users` SET `role` = 'USER' WHERE `role` = 'SUPPORT'"
    );
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY COLUMN `role` ENUM('USER','TEACHER','SYSTEM_ADMIN') NULL DEFAULT NULL"
    );
  }
}
