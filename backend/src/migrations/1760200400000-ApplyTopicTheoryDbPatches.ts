import type { MigrationInterface, QueryRunner } from "typeorm";
import { _legacyDbPatchPhaseForMigration } from "../utils/dbPatches";

export class ApplyTopicTheoryDbPatches1760200400000 implements MigrationInterface {
  name = "ApplyTopicTheoryDbPatches1760200400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await _legacyDbPatchPhaseForMigration("topic-theory", queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error("IRREVERSIBLE_MIGRATION: topic/theory schema repairs have no safe inverse; restore a database backup instead.");
  }
}
