import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enforce one certificate per (contest, participant).
 *
 * The render path does a SELECT-then-INSERT with no DB-level guard, so two
 * concurrent render jobs for the same participant could both insert, creating
 * duplicate certificates. This adds a UNIQUE(contest_id, participant_id) index
 * (after de-duplicating any existing rows) so the INSERT ... ON DUPLICATE KEY
 * UPDATE path is race-safe.
 *
 * Idempotent guards before each change.
 */
export class AddCertificateUniqueConstraint1748700300000 implements MigrationInterface {
  name = "AddCertificateUniqueConstraint1748700300000";

  private static readonly INDEX_NAME = "uq_certificates_contest_participant";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'certificates'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const idx = await queryRunner.query(
      "SHOW INDEX FROM `certificates` WHERE `Key_name` = ?",
      [AddCertificateUniqueConstraint1748700300000.INDEX_NAME]
    );
    if (Array.isArray(idx) && idx.length > 0) return; // already applied

    // De-duplicate: keep the highest id per (contest_id, participant_id),
    // delete the older duplicates so the unique index can be created.
    await queryRunner.query(
      "DELETE c1 FROM `certificates` c1 " +
        "JOIN `certificates` c2 " +
        "ON c1.`contest_id` = c2.`contest_id` " +
        "AND c1.`participant_id` = c2.`participant_id` " +
        "AND c1.`id` < c2.`id`"
    );

    await queryRunner.query(
      `ALTER TABLE \`certificates\` ADD UNIQUE INDEX \`${AddCertificateUniqueConstraint1748700300000.INDEX_NAME}\` (\`contest_id\`, \`participant_id\`)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'certificates'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const idx = await queryRunner.query(
      "SHOW INDEX FROM `certificates` WHERE `Key_name` = ?",
      [AddCertificateUniqueConstraint1748700300000.INDEX_NAME]
    );
    if (Array.isArray(idx) && idx.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`certificates\` DROP INDEX \`${AddCertificateUniqueConstraint1748700300000.INDEX_NAME}\``
      );
    }
  }
}
