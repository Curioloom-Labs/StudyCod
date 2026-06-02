import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Shareable code-playground snippets. Idempotent: re-running is a no-op.
 */
export class AddPlaygroundSnippets1748500000000 implements MigrationInterface {
  name = "AddPlaygroundSnippets1748500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'playground_snippets'");
    if (Array.isArray(tables) && tables.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE playground_snippets (
        id INT NOT NULL AUTO_INCREMENT,
        share_id VARCHAR(32) NOT NULL,
        language VARCHAR(16) NOT NULL,
        code MEDIUMTEXT NOT NULL,
        stdin TEXT NULL,
        title VARCHAR(120) NULL,
        principal_type ENUM('USER','STUDENT') NULL,
        principal_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_playground_snippets_share_id (share_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'playground_snippets'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query("DROP TABLE `playground_snippets`");
  }
}
