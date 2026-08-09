import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCourseAssignmentUniqueIndex1751100000000 implements MigrationInterface {
  name = "AddCourseAssignmentUniqueIndex1751100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'course_assignments'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const indexes = await queryRunner.query("SHOW INDEX FROM `course_assignments` WHERE Key_name = 'uq_assignment_class_course'");
    if (Array.isArray(indexes) && indexes.length > 0) return;
    const duplicates = await queryRunner.query("SELECT class_id, course_id FROM course_assignments GROUP BY class_id, course_id HAVING COUNT(*) > 1");
    for (const duplicate of duplicates as Array<{ class_id: number; course_id: number }>) {
      const rows = await queryRunner.query("SELECT id FROM course_assignments WHERE class_id = ? AND course_id = ? ORDER BY id ASC", [duplicate.class_id, duplicate.course_id]);
      const staleIds = rows.slice(1).map((row: { id: number }) => Number(row.id)).filter(Number.isInteger);
      if (staleIds.length) await queryRunner.query(`DELETE FROM course_assignments WHERE id IN (${staleIds.map(() => "?").join(",")})`, staleIds);
    }
    await queryRunner.query("ALTER TABLE `course_assignments` ADD UNIQUE INDEX `uq_assignment_class_course` (`class_id`, `course_id`)");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'course_assignments'");
    if (Array.isArray(tables) && tables.length > 0) await queryRunner.query("ALTER TABLE `course_assignments` DROP INDEX `uq_assignment_class_course`");
  }
}
