import type { MigrationInterface, QueryRunner } from "typeorm";

/** Private company workspaces and candidate assessments linked to frozen project evidence. */
export class CreateGrowthCompanyAssessments1792900000000 implements MigrationInterface {
  name = "CreateGrowthCompanyAssessments1792900000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE growth_companies (
      id CHAR(36) NOT NULL PRIMARY KEY,
      owner_id INT NOT NULL,
      name VARCHAR(160) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY ix_growth_company_owner (owner_id, updated_at),
      CONSTRAINT fk_growth_company_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await q.query(`CREATE TABLE growth_company_members (
      id CHAR(36) NOT NULL PRIMARY KEY,
      company_id CHAR(36) NOT NULL,
      user_id INT NOT NULL,
      role VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      invited_by INT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_company_member (company_id, user_id),
      KEY ix_growth_company_member_user (user_id, status, created_at),
      CONSTRAINT fk_growth_company_member_company FOREIGN KEY (company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_company_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_company_member_inviter FOREIGN KEY (invited_by) REFERENCES users(id)
    ) ENGINE=InnoDB`);

    await q.query(`CREATE TABLE growth_company_assessments (
      id CHAR(36) NOT NULL PRIMARY KEY,
      company_id CHAR(36) NOT NULL,
      created_by INT NOT NULL,
      candidate_id INT NOT NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      role_title VARCHAR(160) NOT NULL,
      introduction TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      answers_json LONGTEXT NULL,
      hr_review_json LONGTEXT NULL,
      task_title VARCHAR(120) NULL,
      task_prompt TEXT NULL,
      task_runtime VARCHAR(8) NULL,
      task_tests_json LONGTEXT NULL,
      task_idempotency_key VARCHAR(128) NULL,
      task_hash CHAR(64) NULL,
      project_id CHAR(36) NULL,
      version_id CHAR(36) NULL,
      technical_assessment_id CHAR(36) NULL,
      technical_review_json LONGTEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'INVITED',
      consent_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_growth_company_assessment_request (company_id, idempotency_key),
      UNIQUE KEY uq_growth_company_task_idempotency (company_id, task_idempotency_key),
      UNIQUE KEY uq_growth_company_assessment_link (technical_assessment_id),
      KEY ix_growth_company_assessment_company (company_id, status, created_at),
      KEY ix_growth_company_assessment_candidate (candidate_id, status, created_at),
      CONSTRAINT fk_growth_company_assessment_company FOREIGN KEY (company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_company_assessment_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_company_assessment_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_company_assessment_project FOREIGN KEY (project_id) REFERENCES growth_projects(id) ON DELETE SET NULL,
      CONSTRAINT fk_growth_company_assessment_version FOREIGN KEY (version_id) REFERENCES growth_project_versions(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);

    await q.query(`ALTER TABLE growth_project_assessments
      ADD COLUMN company_assessment_id CHAR(36) NULL,
      ADD UNIQUE KEY uq_growth_project_company_assessment (company_assessment_id),
      ADD CONSTRAINT fk_growth_project_company_assessment FOREIGN KEY (company_assessment_id) REFERENCES growth_company_assessments(id) ON DELETE SET NULL`);

    await q.query(`ALTER TABLE growth_company_assessments
      ADD CONSTRAINT fk_growth_company_assessment_task FOREIGN KEY (technical_assessment_id) REFERENCES growth_project_assessments(id) ON DELETE SET NULL`);
    await q.query(`ALTER TABLE notifications MODIFY COLUMN type ENUM(
      'BLOG_COMMENT','BLOG_REPLY','GROWTH_REVIEW_INVITATION','GROWTH_REVIEW_ASSIGNED',
      'GROWTH_REVIEW_ASSIGNED_TO_AUTHOR','GROWTH_REVIEW_ACCEPTED','GROWTH_REVIEW_DECLINED',
      'GROWTH_REVIEW_SUBMITTED','GROWTH_REVIEW_REQUESTED','COMPANY_TEAM_INVITATION',
      'COMPANY_ASSESSMENT_INVITATION','COMPANY_ASSESSMENT_UPDATED'
    ) NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM notifications WHERE type LIKE 'COMPANY_%'");
    await q.query(`ALTER TABLE notifications MODIFY COLUMN type ENUM(
      'BLOG_COMMENT','BLOG_REPLY','GROWTH_REVIEW_INVITATION','GROWTH_REVIEW_ASSIGNED',
      'GROWTH_REVIEW_ASSIGNED_TO_AUTHOR','GROWTH_REVIEW_ACCEPTED','GROWTH_REVIEW_DECLINED',
      'GROWTH_REVIEW_SUBMITTED','GROWTH_REVIEW_REQUESTED'
    ) NOT NULL`);
    await q.query("ALTER TABLE growth_company_assessments DROP FOREIGN KEY fk_growth_company_assessment_task");
    await q.query("ALTER TABLE growth_project_assessments DROP FOREIGN KEY fk_growth_project_company_assessment, DROP INDEX uq_growth_project_company_assessment, DROP COLUMN company_assessment_id");
    await q.query("DROP TABLE growth_company_assessments");
    await q.query("DROP TABLE growth_company_members");
    await q.query("DROP TABLE growth_companies");
  }
}
