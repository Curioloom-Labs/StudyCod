import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTalentInterviews1793000000000 implements MigrationInterface {
  name = "CreateTalentInterviews1793000000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE growth_interview_kits (
      id CHAR(36) PRIMARY KEY, company_id CHAR(36) NOT NULL, created_by INT NOT NULL,
      title VARCHAR(160) NOT NULL, snapshot_json LONGTEXT NOT NULL, content_hash CHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_talent_kit_content(company_id,content_hash), KEY ix_talent_kit_company(company_id,created_at),
      CONSTRAINT fk_talent_kit_company FOREIGN KEY(company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_talent_kit_author FOREIGN KEY(created_by) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_interviews (
      id CHAR(36) PRIMARY KEY, company_id CHAR(36) NOT NULL, assessment_id CHAR(36) NOT NULL,
      host_user_id INT NOT NULL, interviewer_ids_json TEXT NOT NULL,
      title VARCHAR(160) NOT NULL, scheduled_at DATETIME(3) NOT NULL, duration_minutes SMALLINT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED', phase VARCHAR(16) NOT NULL DEFAULT 'INTRO',
      runtime VARCHAR(8) NOT NULL, kit_snapshot LONGTEXT NOT NULL, kit_hash CHAR(64) NOT NULL,
      source_version_id CHAR(36) NULL, draft_json LONGTEXT NOT NULL, draft_revision INT NOT NULL DEFAULT 1,
      editor_user_id INT NOT NULL, room_name VARCHAR(128) NOT NULL, last_job_id CHAR(36) NULL,
      final_artifact_id CHAR(36) NULL, idempotency_key VARCHAR(128) NOT NULL, request_hash CHAR(64) NOT NULL,
      started_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_talent_interview_request(company_id,idempotency_key), UNIQUE KEY uq_talent_room(room_name),
      KEY ix_talent_schedule(company_id,status,scheduled_at), KEY ix_talent_case(assessment_id,status),
      CONSTRAINT fk_talent_interview_company FOREIGN KEY(company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_talent_interview_case FOREIGN KEY(assessment_id) REFERENCES growth_company_assessments(id) ON DELETE CASCADE,
      CONSTRAINT fk_talent_interview_host FOREIGN KEY(host_user_id) REFERENCES users(id),
      CONSTRAINT fk_talent_interview_editor FOREIGN KEY(editor_user_id) REFERENCES users(id),
      CONSTRAINT fk_talent_interview_version FOREIGN KEY(source_version_id) REFERENCES growth_project_versions(id),
      CONSTRAINT fk_talent_interview_artifact FOREIGN KEY(final_artifact_id) REFERENCES growth_project_artifacts(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_interview_notes (
      interview_id CHAR(36) NOT NULL, user_id INT NOT NULL, revision INT NOT NULL DEFAULT 1,
      private_text TEXT NOT NULL, scores_json TEXT NOT NULL, feedback_text TEXT NOT NULL, practice_text TEXT NOT NULL,
      released_json LONGTEXT NULL, released_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY(interview_id,user_id),
      CONSTRAINT fk_talent_note_interview FOREIGN KEY(interview_id) REFERENCES growth_interviews(id) ON DELETE CASCADE,
      CONSTRAINT fk_talent_note_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_interview_messages (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, interview_id CHAR(36) NOT NULL, user_id INT NOT NULL,
      client_key VARCHAR(64) NOT NULL, message_text VARCHAR(2000) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_talent_message(interview_id,user_id,client_key), KEY ix_talent_chat(interview_id,id),
      CONSTRAINT fk_talent_message_interview FOREIGN KEY(interview_id) REFERENCES growth_interviews(id) ON DELETE CASCADE,
      CONSTRAINT fk_talent_message_user FOREIGN KEY(user_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE growth_interview_quizzes (
      interview_id CHAR(36) NOT NULL PRIMARY KEY, candidate_id INT NOT NULL, kit_hash CHAR(64) NOT NULL,
      answers_json TEXT NOT NULL, result_json TEXT NOT NULL, submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_talent_quiz_interview FOREIGN KEY(interview_id) REFERENCES growth_interviews(id) ON DELETE CASCADE,
      CONSTRAINT fk_talent_quiz_candidate FOREIGN KEY(candidate_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await q.query(`ALTER TABLE growth_project_jobs
      MODIFY COLUMN project_id CHAR(36) NULL,
      ADD COLUMN interview_id CHAR(36) NULL,
      ADD COLUMN runtime_override VARCHAR(8) NULL,
      ADD COLUMN execution_kind VARCHAR(8) NULL,
      ADD COLUMN interview_draft_revision INT NULL,
      ADD KEY ix_talent_execution(interview_id,state,created_at),
      ADD CONSTRAINT fk_talent_job_interview FOREIGN KEY(interview_id) REFERENCES growth_interviews(id) ON DELETE CASCADE`);
    await q.query(`ALTER TABLE growth_interviews ADD CONSTRAINT fk_talent_interview_job FOREIGN KEY(last_job_id) REFERENCES growth_project_jobs(id) ON DELETE SET NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE growth_interviews DROP FOREIGN KEY fk_talent_interview_job");
    await q.query("DELETE FROM growth_project_jobs WHERE interview_id IS NOT NULL");
    await q.query(`ALTER TABLE growth_project_jobs DROP FOREIGN KEY fk_talent_job_interview,
      DROP INDEX ix_talent_execution, DROP COLUMN interview_id, DROP COLUMN runtime_override,
      DROP COLUMN execution_kind, DROP COLUMN interview_draft_revision, MODIFY COLUMN project_id CHAR(36) NOT NULL`);
    for (const table of ["growth_interview_quizzes", "growth_interview_messages", "growth_interview_notes", "growth_interviews", "growth_interview_kits"]) await q.query(`DROP TABLE ${table}`);
  }
}
