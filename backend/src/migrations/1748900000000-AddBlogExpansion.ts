import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Blog expansion: cover image + comment lock on posts, plus media, tags,
 * comments, reactions, comment reports and in-app notifications. Idempotent:
 * each step checks for existence before acting, so re-running is a no-op.
 */
export class AddBlogExpansion1748900000000 implements MigrationInterface {
  name = "AddBlogExpansion1748900000000";

  private async hasTable(qr: QueryRunner, name: string): Promise<boolean> {
    const rows = await qr.query("SHOW TABLES LIKE ?", [name]);
    return Array.isArray(rows) && rows.length > 0;
  }

  private async hasColumn(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await qr.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Extend blog_posts ---
    if (await this.hasTable(queryRunner, "blog_posts")) {
      if (!(await this.hasColumn(queryRunner, "blog_posts", "cover_image_key"))) {
        await queryRunner.query("ALTER TABLE blog_posts ADD COLUMN cover_image_key VARCHAR(64) NULL AFTER version");
      }
      if (!(await this.hasColumn(queryRunner, "blog_posts", "comments_locked"))) {
        await queryRunner.query(
          "ALTER TABLE blog_posts ADD COLUMN comments_locked TINYINT NOT NULL DEFAULT 0 AFTER cover_image_key"
        );
      }
    }

    // --- blog_media ---
    if (!(await this.hasTable(queryRunner, "blog_media"))) {
      await queryRunner.query(`
        CREATE TABLE blog_media (
          id INT NOT NULL AUTO_INCREMENT,
          media_key VARCHAR(64) NOT NULL,
          storage_key VARCHAR(300) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          size_bytes INT NOT NULL,
          uploader_type ENUM('USER','STUDENT') NULL,
          uploader_id INT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_blog_media_key (media_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    // --- blog_tags ---
    if (!(await this.hasTable(queryRunner, "blog_tags"))) {
      await queryRunner.query(`
        CREATE TABLE blog_tags (
          id INT NOT NULL AUTO_INCREMENT,
          slug VARCHAR(60) NOT NULL,
          name VARCHAR(60) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_blog_tags_slug (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    // --- blog_post_tags (join) ---
    if (!(await this.hasTable(queryRunner, "blog_post_tags"))) {
      await queryRunner.query(`
        CREATE TABLE blog_post_tags (
          post_id INT NOT NULL,
          tag_id INT NOT NULL,
          PRIMARY KEY (post_id, tag_id),
          KEY idx_blog_post_tags_tag (tag_id),
          CONSTRAINT fk_blog_post_tags_post FOREIGN KEY (post_id) REFERENCES blog_posts (id) ON DELETE CASCADE,
          CONSTRAINT fk_blog_post_tags_tag FOREIGN KEY (tag_id) REFERENCES blog_tags (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    // --- blog_comments ---
    if (!(await this.hasTable(queryRunner, "blog_comments"))) {
      await queryRunner.query(`
        CREATE TABLE blog_comments (
          id INT NOT NULL AUTO_INCREMENT,
          post_id INT NOT NULL,
          parent_id INT NULL,
          author_type ENUM('USER','STUDENT') NOT NULL,
          author_id INT NOT NULL,
          content TEXT NOT NULL,
          pinned TINYINT NOT NULL DEFAULT 0,
          edited_at DATETIME NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          KEY idx_blog_comments_post (post_id),
          CONSTRAINT fk_blog_comments_post FOREIGN KEY (post_id) REFERENCES blog_posts (id) ON DELETE CASCADE,
          CONSTRAINT fk_blog_comments_parent FOREIGN KEY (parent_id) REFERENCES blog_comments (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    // --- blog_reactions ---
    if (!(await this.hasTable(queryRunner, "blog_reactions"))) {
      await queryRunner.query(`
        CREATE TABLE blog_reactions (
          id INT NOT NULL AUTO_INCREMENT,
          target_type ENUM('POST','COMMENT') NOT NULL,
          target_id INT NOT NULL,
          principal_type ENUM('USER','STUDENT') NOT NULL,
          principal_id INT NOT NULL,
          emoji VARCHAR(16) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_blog_reaction_principal (target_type, target_id, principal_type, principal_id),
          KEY idx_blog_reactions_target (target_type, target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    // --- blog_comment_reports ---
    if (!(await this.hasTable(queryRunner, "blog_comment_reports"))) {
      await queryRunner.query(`
        CREATE TABLE blog_comment_reports (
          id INT NOT NULL AUTO_INCREMENT,
          comment_id INT NOT NULL,
          reporter_type ENUM('USER','STUDENT') NOT NULL,
          reporter_id INT NOT NULL,
          reason VARCHAR(300) NULL,
          status ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          KEY idx_blog_comment_reports_status (status),
          CONSTRAINT fk_blog_comment_reports_comment FOREIGN KEY (comment_id) REFERENCES blog_comments (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    // --- notifications ---
    if (!(await this.hasTable(queryRunner, "notifications"))) {
      await queryRunner.query(`
        CREATE TABLE notifications (
          id INT NOT NULL AUTO_INCREMENT,
          recipient_type ENUM('USER','STUDENT') NOT NULL,
          recipient_id INT NOT NULL,
          type ENUM('BLOG_COMMENT','BLOG_REPLY') NOT NULL,
          actor_name VARCHAR(200) NULL,
          post_slug VARCHAR(180) NULL,
          post_title VARCHAR(200) NULL,
          comment_id INT NULL,
          read_at DATETIME NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          KEY idx_notifications_recipient (recipient_type, recipient_id, read_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      "notifications",
      "blog_comment_reports",
      "blog_reactions",
      "blog_comments",
      "blog_post_tags",
      "blog_tags",
      "blog_media"
    ]) {
      if (await this.hasTable(queryRunner, table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
    if (await this.hasTable(queryRunner, "blog_posts")) {
      if (await this.hasColumn(queryRunner, "blog_posts", "comments_locked")) {
        await queryRunner.query("ALTER TABLE blog_posts DROP COLUMN comments_locked");
      }
      if (await this.hasColumn(queryRunner, "blog_posts", "cover_image_key")) {
        await queryRunner.query("ALTER TABLE blog_posts DROP COLUMN cover_image_key");
      }
    }
  }
}
