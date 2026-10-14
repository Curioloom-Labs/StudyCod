import type { MigrationInterface, QueryRunner } from "typeorm";

export class IndexEduInviteMailContext1791928000000 implements MigrationInterface {
  name = "IndexEduInviteMailContext1791928000000";
  async up(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable("org_invitations");
    if (!table?.indices.some(index => index.name === "idx_invite_email_status")) await runner.query("CREATE INDEX idx_invite_email_status ON org_invitations (email,status)");
  }
  async down(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable("org_invitations");
    if (table?.indices.some(index => index.name === "idx_invite_email_status")) await runner.query("DROP INDEX idx_invite_email_status ON org_invitations");
  }
}
