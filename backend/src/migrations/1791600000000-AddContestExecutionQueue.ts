import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddContestExecutionQueue1791600000000 implements MigrationInterface {
  name = "AddContestExecutionQueue1791600000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS contest_execution_admission (id INT PRIMARY KEY)`);
    await q.query(`INSERT IGNORE INTO contest_execution_admission (id) VALUES (1)`);
    await q.query(`CREATE TABLE IF NOT EXISTS contest_execution_jobs (
      job_id CHAR(36) PRIMARY KEY,
      contest_id INT NOT NULL, problem_id INT NOT NULL, participant_id INT NOT NULL,
      submission_id INT NULL, kind ENUM('check','run') NOT NULL,
      state ENUM('queued','running','completed','system_error') NOT NULL DEFAULT 'queued',
      idempotency_key VARCHAR(128) NOT NULL, request_hash CHAR(64) NOT NULL,
      payload MEDIUMTEXT NOT NULL, snapshot MEDIUMTEXT NOT NULL, result MEDIUMTEXT NULL, diagnostics MEDIUMTEXT NULL, error TEXT NULL,
      lease_owner VARCHAR(80) NULL, lease_until DATETIME(3) NULL,
      attempt INT NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      started_at DATETIME(3) NULL, finished_at DATETIME(3) NULL,
      UNIQUE KEY uq_contest_job_request (participant_id, kind, idempotency_key),
      INDEX idx_contest_job_queue (state, created_at),
      INDEX idx_contest_job_owner (participant_id, state, kind),
      INDEX idx_contest_job_lease (state, lease_until),
      INDEX idx_contest_job_fairness (participant_id, started_at),
      CONSTRAINT fk_contest_job_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
      CONSTRAINT fk_contest_job_participant FOREIGN KEY (participant_id) REFERENCES contest_participants(id) ON DELETE CASCADE,
      CONSTRAINT fk_contest_job_submission FOREIGN KEY (submission_id) REFERENCES contest_submissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    const table = await q.getTable("contest_submissions");
    for (const [name, definition] of [
      ["compiler", "VARCHAR(32) NULL"],
      ["snapshot_hash", "CHAR(64) NULL"],
      ["execution_status", "VARCHAR(16) NOT NULL DEFAULT 'completed'"],
    ]) {
      if (!table?.findColumnByName(name)) await q.query(`ALTER TABLE contest_submissions ADD COLUMN ${name} ${definition}`);
    }
    const updated = await q.getTable("contest_submissions");
    if (!updated?.indices.some(i => i.columnNames.join(",") === "contest_id,phase,created_at,id")) {
      await q.query("CREATE INDEX idx_contest_submissions_standings ON contest_submissions (contest_id,phase,created_at,id)");
    }
  }
  async down(q: QueryRunner): Promise<void> {
    const unfinished = await q.query("SELECT COUNT(*) AS count FROM contest_execution_jobs WHERE state IN ('queued','running')");
    if (Number(unfinished[0].count)) throw new Error("Drain or preserve accepted contest jobs before reverting this migration");
    await q.query("DROP TABLE IF EXISTS contest_execution_jobs");
    await q.query("DROP TABLE IF EXISTS contest_execution_admission");
    const table = await q.getTable("contest_submissions");
    if (table?.indices.some(i => i.name === "idx_contest_submissions_standings")) {
      await q.dropIndex("contest_submissions", "idx_contest_submissions_standings");
    }
    for (const name of ["compiler", "snapshot_hash", "execution_status"]) {
      if (await q.hasColumn("contest_submissions", name)) await q.query(`ALTER TABLE contest_submissions DROP COLUMN ${name}`);
    }
  }
}
