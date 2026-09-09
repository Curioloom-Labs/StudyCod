import type { MigrationInterface, QueryRunner } from "typeorm";
import { _legacyDbPatchPhaseForMigration } from "../utils/dbPatches";

export class ApplyTheoryAndSupportDbPatches1760200100000 implements MigrationInterface {
  name = "ApplyTheoryAndSupportDbPatches1760200100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await _legacyDbPatchPhaseForMigration("theory-support", queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error("IRREVERSIBLE_MIGRATION: theory/support schema repairs have no safe inverse; restore a database backup instead.");
  }
}
