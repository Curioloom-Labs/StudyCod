import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { logger } from "../utils/logger";
import {
  LEGACY_MIGRATION_HISTORY_BASELINE,
  stampLegacyMigrationHistory,
} from "../migrations/legacyMigrationHistory";

async function main(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const result = await stampLegacyMigrationHistory(AppDataSource);

    logger.info("[migrations:bootstrap-history] completed", {
      inserted: result.inserted,
      exists: result.exists,
      skippedUnknown: result.skippedUnknown,
      stampedTotal: LEGACY_MIGRATION_HISTORY_BASELINE.length,
      migrations: LEGACY_MIGRATION_HISTORY_BASELINE.map(m => m.name),
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: any) => {
  logger.error("[migrations:bootstrap-history] failed", {
    message: error?.message,
    code: error?.code,
  });
  process.exit(1);
});
