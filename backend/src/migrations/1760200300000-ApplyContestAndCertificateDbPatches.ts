import type { MigrationInterface, QueryRunner } from "typeorm";
import { _legacyDbPatchPhaseForMigration } from "../utils/dbPatches";

export class ApplyContestAndCertificateDbPatches1760200300000 implements MigrationInterface {
  name = "ApplyContestAndCertificateDbPatches1760200300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await _legacyDbPatchPhaseForMigration("contest-certificate", queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error("IRREVERSIBLE_MIGRATION: contest/certificate schema repairs have no safe inverse; restore a database backup instead.");
  }
}
