import type { MigrationInterface, QueryRunner } from "typeorm";

/** Additive Portfolio profile/work storage. Existing growth-project records stay in place. */
export class CreatePortfolioFoundation1793200000000 implements MigrationInterface {
  name = "CreatePortfolioFoundation1793200000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE portfolio_profiles (
      owner_id INT NOT NULL PRIMARY KEY,
      display_name VARCHAR(120) NOT NULL DEFAULT '',
      headline VARCHAR(160) NOT NULL DEFAULT '',
      specialization VARCHAR(120) NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      github_url VARCHAR(500) NULL,
      website_url VARCHAR(500) NULL,
      visibility VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_portfolio_profile_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await q.query(`CREATE TABLE portfolio_works (
      id CHAR(36) NOT NULL PRIMARY KEY,
      owner_id INT NOT NULL,
      title VARCHAR(160) NOT NULL,
      problem TEXT NOT NULL,
      solution TEXT NOT NULL,
      role VARCHAR(120) NOT NULL DEFAULT '',
      technologies_json TEXT NOT NULL,
      repository_url VARCHAR(500) NULL,
      demo_url VARCHAR(500) NULL,
      source_publication_id CHAR(36) NULL,
      visibility VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
      sort_order INT NOT NULL DEFAULT 0,
      archived_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_portfolio_work_source (owner_id, source_publication_id),
      KEY ix_portfolio_work_owner (owner_id, archived_at, sort_order, created_at),
      CONSTRAINT fk_portfolio_work_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_portfolio_work_publication FOREIGN KEY (source_publication_id) REFERENCES growth_project_publications(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ["portfolio_works", "portfolio_profiles"]) {
      const rows = await q.query(`SELECT COUNT(*) AS row_count FROM ${table}`) as Array<{ row_count: number | string }>;
      if (Number(rows[0]?.row_count ?? 0) > 0) {
        throw new Error(`Rollback blocked: ${table} contains Portfolio data. Export or migrate it before removing this schema.`);
      }
    }
    await q.query("DROP TABLE portfolio_works");
    await q.query("DROP TABLE portfolio_profiles");
  }
}
