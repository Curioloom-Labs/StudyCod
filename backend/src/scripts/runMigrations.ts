import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { logger } from "../utils/logger";

async function main(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const hadPending = await AppDataSource.showMigrations();
    const applied = await AppDataSource.runMigrations({
      transaction: "all"
    });

    logger.info("[migrations] completed", {
      hadPending,
      appliedCount: applied.length,
      appliedNames: applied.map(m => m.name)
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  logger.error("[migrations] failed", {
    message: error instanceof Error ? error.message : String(error),
    code: error && typeof error === "object" ? (error as Record<string, unknown>).code : undefined
  });
  process.exit(1);
});
