import type { MigrationInterface, QueryRunner } from "typeorm";
import { _legacyDbPatchPhaseForMigration } from "../utils/dbPatches";

export class ApplyIdentityAndTaskDbPatches1760200000000 implements MigrationInterface {
  name = "ApplyIdentityAndTaskDbPatches1760200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await _legacyDbPatchPhaseForMigration("identity-task", queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error("IRREVERSIBLE_MIGRATION: identity/task schema repairs have no safe inverse; restore a database backup instead.");
  }
}
