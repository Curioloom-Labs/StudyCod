import type { DataSource } from "typeorm";
import { env } from "../env";
import { logger } from "../utils/logger";

const MYSQL_GET_LOCK_TIMEOUT_SECONDS = env.__migrationLockTimeoutSeconds;

function resolveLockName(dataSource: DataSource): string {
  const database = typeof dataSource.options.database === "string"
    ? dataSource.options.database
    : "default";
  const normalizedDatabase = database.replace(/[^a-zA-Z0-9_.-]/g, "_");
  // MySQL limits named locks to 64 characters. Keep the database component in
  // the name so unrelated databases on the same server never block each other.
  return `studycod:migrations:${normalizedDatabase || "default"}`.slice(0, 64);
}

/**
 * Serialize migration execution across PM2 workers and one-off CLI jobs.
 *
 * MySQL GET_LOCK is connection-scoped, so the QueryRunner must stay alive for
 * the entire callback. TypeORM migration calls may use their own pool
 * connection; that is safe because the named lock is held independently until
 * the callback completes and is explicitly released.
 */
export async function withMigrationLock<T>(
  dataSource: DataSource,
  callback: () => Promise<T>,
): Promise<T> {
  if (dataSource.options.type !== "mysql") {
    return callback();
  }

  const lockName = resolveLockName(dataSource);
  const queryRunner = dataSource.createQueryRunner();
  let acquired = false;

  try {
    await queryRunner.connect();
    const rows = await queryRunner.query(
      "SELECT GET_LOCK(?, ?) AS acquired",
      [lockName, MYSQL_GET_LOCK_TIMEOUT_SECONDS],
    ) as Array<{ acquired?: unknown }>;
    const result = rows[0]?.acquired;

    if (Number(result) !== 1) {
      throw new Error(
        `MIGRATION_LOCK_TIMEOUT: could not acquire MySQL migration lock within ${MYSQL_GET_LOCK_TIMEOUT_SECONDS}s`,
      );
    }

    acquired = true;
    logger.info("[migrations:lock] acquired", {
      lockName,
      timeoutSeconds: MYSQL_GET_LOCK_TIMEOUT_SECONDS,
    });

    return await callback();
  } finally {
    if (acquired) {
      try {
        await queryRunner.query("SELECT RELEASE_LOCK(?)", [lockName]);
        logger.info("[migrations:lock] released", { lockName });
      } catch (error: unknown) {
        logger.warn("[migrations:lock] release failed", {
          lockName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    try {
      await queryRunner.release();
    } catch (error: unknown) {
      logger.warn("[migrations:lock] query runner release failed", {
        lockName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
