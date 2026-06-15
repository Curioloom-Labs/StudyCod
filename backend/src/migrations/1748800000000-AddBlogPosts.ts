import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Devblog / changelog posts. Idempotent: re-running is a no-op.
 */
export class AddBlogPosts1748800000000 implements MigrationInterface {
  name = "AddBlogPosts1748800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'blog_posts'");
    if (Array.isArray(tables) && tables.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE blog_posts (
        id INT NOT NULL AUTO_INCREMENT,
        slug VARCHAR(180) NOT NULL,
        title VARCHAR(200) NOT NULL,
        excerpt VARCHAR(320) NULL,
        content MEDIUMTEXT NOT NULL,
        category ENUM('NEWS','ANNOUNCEMENT','FEATURE','FIX','IMPROVEMENT') NOT NULL DEFAULT 'NEWS',
        version VARCHAR(40) NULL,
        pinned TINYINT NOT NULL DEFAULT 0,
        status ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
        author_id INT NULL,
        published_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_blog_posts_slug (slug),
        KEY idx_blog_posts_status_published (status, published_at),
        CONSTRAINT fk_blog_posts_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'blog_posts'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query("DROP TABLE `blog_posts`");
  }
}
