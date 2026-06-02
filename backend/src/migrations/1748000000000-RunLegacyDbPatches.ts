import type { MigrationInterface, QueryRunner } from "typeorm";
import { _legacyDbPatchesForMigration } from "../utils/dbPatches";

/**
 * Consolidates the 60+ legacy `ensure*` / `migrate*` schema-repair helpers
 * from `utils/dbPatches.ts` into a single tracked migration.
 *
 * History: these helpers were originally executed at server startup as
 * "shadow migrations" — ad-hoc `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS`
 * statements outside the TypeORM migration runner. That pattern races across
 * multi-instance startup and bypasses migration history. The audit (C3)
 * identified it as a Critical issue.
 *
 * The helpers themselves are internally idempotent (every step does a
 * `SHOW COLUMNS` / `SHOW TABLES` check first), so running this migration
 * against a database that already has the fixes applied is a no-op. New
 * databases inherit the fixes from the migration runner instead of from
 * boot-time shadow execution.
 *
 * `down()` is intentionally a no-op: these are forward-only schema repairs
 * with no defined inverse.
 */
export class RunLegacyDbPatches1748000000000 implements MigrationInterface {
  name = "RunLegacyDbPatches1748000000000";

  public async up(_queryRunner: QueryRunner): Promise<void> {
    await _legacyDbPatchesForMigration();
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: legacy repairs have no inverse.
  }
}
