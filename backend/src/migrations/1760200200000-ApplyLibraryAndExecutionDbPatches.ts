import type { MigrationInterface, QueryRunner } from "typeorm";
import { _legacyDbPatchPhaseForMigration } from "../utils/dbPatches";

export class ApplyLibraryAndExecutionDbPatches1760200200000 implements MigrationInterface {
  name = "ApplyLibraryAndExecutionDbPatches1760200200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await _legacyDbPatchPhaseForMigration("library-execution", queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error("IRREVERSIBLE_MIGRATION: library/execution schema repairs have no safe inverse; restore a database backup instead.");
  }
}
