import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spaced-repetition durable state per (principal, concept). Backs the SM-2
 * engine in services/learning/spacedRepetition so review schedules survive
 * across sessions. Idempotent: re-running on an existing table is a no-op.
 */
export class AddConceptReviewStates1748200000000 implements MigrationInterface {
  name = "AddConceptReviewStates1748200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'concept_review_states'");
    if (Array.isArray(tables) && tables.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE concept_review_states (
        id INT NOT NULL AUTO_INCREMENT,
        principal_type ENUM('USER','STUDENT') NOT NULL,
        principal_id INT NOT NULL,
        concept_key VARCHAR(191) NOT NULL,
        repetitions INT NOT NULL DEFAULT 0,
        ease_factor DECIMAL(5,3) NOT NULL DEFAULT 2.500,
        interval_days INT NOT NULL DEFAULT 0,
        due_at DATETIME NOT NULL,
        mastered TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_concept_review_principal_concept (principal_type, principal_id, concept_key),
        INDEX idx_concept_review_due (principal_type, principal_id, due_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'concept_review_states'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query("DROP TABLE `concept_review_states`");
  }
}
