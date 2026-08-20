import type { MigrationInterface, QueryRunner } from "typeorm";

/** Allow several teaching staff members to work with one class. */
export class AddClassTeachers1760100000000 implements MigrationInterface {
  name = "AddClassTeachers1760100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`class_teachers\` (
        \`class_id\` INT NOT NULL,
        \`teacher_id\` INT NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`class_id\`, \`teacher_id\`),
        INDEX \`idx_class_teachers_teacher\` (\`teacher_id\`),
        CONSTRAINT \`fk_class_teachers_class\`
          FOREIGN KEY (\`class_id\`) REFERENCES \`classes\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_class_teachers_teacher\`
          FOREIGN KEY (\`teacher_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Preserve every existing class owner as an assigned teacher.
    await queryRunner.query(`
      INSERT IGNORE INTO \`class_teachers\` (\`class_id\`, \`teacher_id\`)
      SELECT \`id\`, \`teacher_id\` FROM \`classes\` WHERE \`teacher_id\` IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `class_teachers`");
  }
}
