import type { MigrationInterface, QueryRunner } from "typeorm";

/** Preserve the server-side verification facts needed to create truthful evidence. */
export class AddPersonalSubmissionVerification1793300000000 implements MigrationInterface {
  name = "AddPersonalSubmissionVerification1793300000000";

  async up(q: QueryRunner): Promise<void> {
    const columns = [
      ["verification_method", "VARCHAR(24) NULL"],
      ["judge_verdict", "VARCHAR(8) NULL"],
      ["tests_passed", "INT NULL"],
      ["tests_total", "INT NULL"],
    ] as const;

    for (const [name, definition] of columns) {
      if (!(await q.hasColumn("grades", name))) {
        await q.query(`ALTER TABLE grades ADD COLUMN ${name} ${definition}`);
      }
    }

    const grades = await q.getTable("grades");
    if (!grades?.indices.some(index => index.name === "ix_grade_owner_verification")) {
      await q.query("ALTER TABLE grades ADD KEY ix_grade_owner_verification (user_id,verification_method,judge_verdict,created_at)");
    }
  }

  async down(_q: QueryRunner): Promise<void> {
    throw new Error(
      "Rollback blocked: this migration can reuse pre-existing grade columns. A down migration could remove legacy schema or user data; use a forward-only migration."
    );
  }
}
