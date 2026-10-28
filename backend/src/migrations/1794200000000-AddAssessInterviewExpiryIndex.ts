import type { MigrationInterface, QueryRunner } from "typeorm";

/** Support the bounded sweep that closes time-expired Assess interview sessions. */
export class AddAssessInterviewExpiryIndex1794200000000 implements MigrationInterface {
  name = "AddAssessInterviewExpiryIndex1794200000000";

  async up(q: QueryRunner): Promise<void> {
    const table = await q.getTable("growth_interviews");
    if (!table?.indices.some(index => index.name === "ix_growth_interviews_expiry")) {
      await q.query("ALTER TABLE growth_interviews ADD KEY ix_growth_interviews_expiry (status,started_at)");
    }
  }

  async down(q: QueryRunner): Promise<void> {
    const table = await q.getTable("growth_interviews");
    if (table?.indices.some(index => index.name === "ix_growth_interviews_expiry")) {
      await q.query("ALTER TABLE growth_interviews DROP INDEX ix_growth_interviews_expiry");
    }
  }
}
