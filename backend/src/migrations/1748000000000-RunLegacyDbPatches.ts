import type { MigrationInterface, QueryRunner } from "typeorm";
/**
 * Historical marker for the former all-in-one legacy patch migration.
 *
 * The actual phase migrations follow this marker. Keeping this migration as
 * a no-op preserves the applied timestamp for existing databases while
 * preventing new databases from running the historical monolith twice.
 *
 * `down()` explicitly fails: these are forward-only schema repairs with no
 * defined inverse, and a silent no-op would make TypeORM report a misleading
 * rollback state.
 */
export class RunLegacyDbPatches1748000000000 implements MigrationInterface {
  name = "RunLegacyDbPatches1748000000000";

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Historical marker only. See the five phase migrations after this file.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      "IRREVERSIBLE_MIGRATION: RunLegacyDbPatches1748000000000 has no safe inverse; restore a database backup instead.",
    );
  }
}
