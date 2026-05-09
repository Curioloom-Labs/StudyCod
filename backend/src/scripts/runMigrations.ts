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

main().catch((error: any) => {
  logger.error("[migrations] failed", {
    message: error?.message,
    code: error?.code
  });
  process.exit(1);
});
