import { TableColumn, type MigrationInterface, type QueryRunner } from "typeorm";

export class AddStudentManagedAccount1791813000000 implements MigrationInterface {
  name = "AddStudentManagedAccount1791813000000";
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("students", "user_account_managed"))) {
      await queryRunner.addColumn("students", new TableColumn({ name: "user_account_managed", type: "tinyint", width: 1, default: "0" }));
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn("students", "user_account_managed")) await queryRunner.dropColumn("students", "user_account_managed");
  }
}
