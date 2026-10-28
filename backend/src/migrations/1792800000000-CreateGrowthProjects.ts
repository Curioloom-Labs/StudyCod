import type { MigrationInterface, QueryRunner } from "typeorm";

/** Additive schema for the independent personal project portfolio. */
export class CreateGrowthProjects1792800000000 implements MigrationInterface {
  name = "CreateGrowthProjects1792800000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE growth_project_queue_guard (
      id TINYINT NOT NULL PRIMARY KEY, lock_version INT NOT NULL DEFAULT 0,
      lease_owner CHAR(36) NULL, lease_until DATETIME(3) NULL
    ) ENGINE=InnoDB`);
    await q.query("INSERT INTO growth_project_queue_guard (id,lock_version) VALUES (1,0)");
    await q.query(`CREATE TABLE growth_projects (
      id CHAR(36) NOT NULL PRIMARY KEY, owner_id INT NOT NULL,
      family_key VARCHAR(32) NOT NULL, runtime VARCHAR(8) NOT NULL,
      blueprint_revision VARCHAR(32) NOT NULL, current_stage VARCHAR(8) NOT NULL DEFAULT 'V1',
      draft_json LONGTEXT NOT NULL, draft_revision INT NOT NULL DEFAULT 1,
      archived TINYINT(1) NOT NULL DEFAULT 0, source_json TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_owner_family_runtime (owner_id, family_key, runtime),
      KEY ix_growth_owner_updated (owner_id, archived, updated_at),
      CONSTRAINT fk_growth_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_artifacts (
      id CHAR(36) NOT NULL PRIMARY KEY, owner_id INT NOT NULL, content_hash CHAR(64) NOT NULL,
      files_json LONGTEXT NOT NULL, examples_json LONGTEXT NOT NULL,
      total_bytes INT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_artifact_owner_hash (owner_id, content_hash),
      CONSTRAINT fk_growth_artifact_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_jobs (
      id CHAR(36) NOT NULL PRIMARY KEY, project_id CHAR(36) NOT NULL, owner_id INT NOT NULL,
      context_key VARCHAR(64) NOT NULL, artifact_id CHAR(36) NOT NULL,
      blueprint_revision VARCHAR(32) NOT NULL, tests_hash CHAR(64) NOT NULL,
      tests_json LONGTEXT NOT NULL, idempotency_key VARCHAR(128) NOT NULL,
      state VARCHAR(16) NOT NULL DEFAULT 'QUEUED', attempts TINYINT NOT NULL DEFAULT 0,
      lease_owner CHAR(36) NULL, lease_until DATETIME(3) NULL,
      result_json LONGTEXT NULL, error_code VARCHAR(64) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      started_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
      UNIQUE KEY uq_growth_job_idempotency (owner_id, idempotency_key),
      KEY ix_growth_job_queue (state, created_at), KEY ix_growth_job_owner_active (owner_id, state),
      KEY ix_growth_job_context (project_id, context_key, created_at),
      CONSTRAINT fk_growth_job_project FOREIGN KEY (project_id) REFERENCES growth_projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_job_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_job_artifact FOREIGN KEY (artifact_id) REFERENCES growth_project_artifacts(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_versions (
      id CHAR(36) NOT NULL PRIMARY KEY, project_id CHAR(36) NOT NULL, owner_id INT NOT NULL,
      stage_key VARCHAR(8) NOT NULL, sequence_no INT NOT NULL, artifact_id CHAR(36) NOT NULL,
      check_job_id CHAR(36) NOT NULL, previous_version_id CHAR(36) NULL,
      blueprint_revision VARCHAR(32) NOT NULL, idempotency_key VARCHAR(128) NULL,
      explanation TEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_version_sequence (project_id, stage_key, sequence_no),
      UNIQUE KEY uq_growth_version_idempotency (owner_id, idempotency_key),
      UNIQUE KEY uq_growth_version_check_job (check_job_id),
      KEY ix_growth_version_history (project_id, created_at), KEY ix_growth_version_previous (previous_version_id),
      CONSTRAINT fk_growth_version_project FOREIGN KEY (project_id) REFERENCES growth_projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_version_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_version_artifact FOREIGN KEY (artifact_id) REFERENCES growth_project_artifacts(id),
      CONSTRAINT fk_growth_version_job FOREIGN KEY (check_job_id) REFERENCES growth_project_jobs(id),
      CONSTRAINT fk_growth_version_previous FOREIGN KEY (previous_version_id) REFERENCES growth_project_versions(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_assessments (
      id CHAR(36) NOT NULL PRIMARY KEY, project_id CHAR(36) NOT NULL, owner_id INT NOT NULL,
      kind VARCHAR(16) NOT NULL, source_version_id CHAR(36) NOT NULL, card_id VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(128) NULL,
      card_snapshot LONGTEXT NOT NULL, draft_json LONGTEXT NOT NULL, draft_revision INT NOT NULL DEFAULT 1,
      job_id CHAR(36) NULL, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
      explanation TEXT NULL, duration_seconds INT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3) NULL,
      KEY ix_growth_assessment_owner (owner_id, project_id, created_at),
      UNIQUE KEY uq_growth_assessment_idempotency (owner_id, idempotency_key),
      CONSTRAINT fk_growth_assessment_project FOREIGN KEY (project_id) REFERENCES growth_projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assessment_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assessment_version FOREIGN KEY (source_version_id) REFERENCES growth_project_versions(id),
      CONSTRAINT fk_growth_assessment_job FOREIGN KEY (job_id) REFERENCES growth_project_jobs(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_publications (
      id CHAR(36) NOT NULL PRIMARY KEY, project_id CHAR(36) NOT NULL, owner_id INT NOT NULL,
      version_id CHAR(36) NOT NULL, channel VARCHAR(16) NOT NULL, public_id VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(128) NULL,
      title VARCHAR(160) NOT NULL, description TEXT NOT NULL, evidence_json TEXT NOT NULL,
      demo_json LONGTEXT NULL, review_visible TINYINT(1) NOT NULL DEFAULT 0,
      revoked TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_public_id (public_id), UNIQUE KEY uq_growth_public_idempotency (owner_id, idempotency_key),
      KEY ix_growth_public_profile (owner_id, channel, revoked),
      CONSTRAINT fk_growth_public_project FOREIGN KEY (project_id) REFERENCES growth_projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_public_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_public_version FOREIGN KEY (version_id) REFERENCES growth_project_versions(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_reviewer_grants (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, granted_by INT NOT NULL,
      revoked_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_reviewer_user (user_id),
      CONSTRAINT fk_growth_reviewer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_reviewer_admin FOREIGN KEY (granted_by) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_project_reviews (
      id CHAR(36) NOT NULL PRIMARY KEY, project_id CHAR(36) NOT NULL, owner_id INT NOT NULL,
      reviewer_id INT NULL, kind VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      invite_token CHAR(36) NULL, snapshot_json LONGTEXT NOT NULL, scores_json TEXT NULL,
      comment TEXT NULL, recommendation VARCHAR(32) NULL, reviewer_name_public TINYINT(1) NOT NULL DEFAULT 0,
      author_public TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      responded_at DATETIME(3) NULL, KEY ix_growth_review_reviewer (reviewer_id, status),
      KEY ix_growth_review_owner (owner_id, created_at),
      CONSTRAINT fk_growth_review_project FOREIGN KEY (project_id) REFERENCES growth_projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_review_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_review_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    await q.query(`ALTER TABLE notifications
      MODIFY COLUMN type ENUM('BLOG_COMMENT','BLOG_REPLY','GROWTH_REVIEW_INVITATION','GROWTH_REVIEW_ASSIGNED','GROWTH_REVIEW_ASSIGNED_TO_AUTHOR','GROWTH_REVIEW_ACCEPTED','GROWTH_REVIEW_DECLINED','GROWTH_REVIEW_SUBMITTED','GROWTH_REVIEW_REQUESTED') NOT NULL`);
    // Fresh contract databases are synchronized from the current entities
    // before tracked migrations run, so related_path may already exist there.
    // Existing production databases still need the additive column migration.
    if (!(await q.hasColumn("notifications", "related_path"))) {
      await q.query("ALTER TABLE notifications ADD COLUMN related_path VARCHAR(300) NULL");
    }
  }

  async down(q: QueryRunner): Promise<void> {
    throw new Error("Rollback blocked: StudyCod Portfolio and Assess still depend on the growth-project schema and shared notification fields. Use an inventory-backed forward-only migration; no data or schema was changed.");
  }
}
