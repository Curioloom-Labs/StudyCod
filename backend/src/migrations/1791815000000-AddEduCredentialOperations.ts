import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddEduCredentialOperations1791815000000 implements MigrationInterface {
  name = "AddEduCredentialOperations1791815000000";
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS edu_credential_operations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_id INT NOT NULL, class_id INT NOT NULL,
      operation_key CHAR(36) NOT NULL, kind ENUM('CREATE','IMPORT','RESET','RESET_BATCH') NOT NULL,
      state ENUM('PENDING','READY','EXPIRED','CANCELLED','ACKNOWLEDGED') NOT NULL,
      request_hash CHAR(64) NOT NULL, requested_count INT NOT NULL, student_ids JSON NOT NULL,
      response_cipher MEDIUMTEXT NULL, expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_edu_credential_operation_actor_key (actor_id,operation_key),
      INDEX idx_edu_credential_operation_class_actor (class_id,actor_id,state,id),
      INDEX idx_edu_credential_operation_expiry (state,expires_at),
      CONSTRAINT fk_edu_credential_operation_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_edu_credential_operation_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query("DROP TABLE IF EXISTS edu_credential_operations"); }
}
