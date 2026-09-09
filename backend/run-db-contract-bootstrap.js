if (process.env.DB_CONTRACT_BOOTSTRAP_SCHEMA !== "1") {
  console.error("DB CONTRACT BOOTSTRAP REFUSED: set DB_CONTRACT_BOOTSTRAP_SCHEMA=1 for an isolated contract database");
  process.exit(1);
}

const databaseUrl = String(process.env.DB_CONTRACT_DATABASE_URL || "").trim();
if (!databaseUrl) {
  console.error("DB CONTRACT BOOTSTRAP REFUSED: DB_CONTRACT_DATABASE_URL is required");
  process.exit(1);
}

// This runner is only for a disposable contract database. Force the non-prod
// env profile before importing the app data source so a developer's local
// production .env cannot change the bootstrap semantics.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
const { AppDataSource } = require("./dist/backend/src/data-source");

async function main() {
  // The repository intentionally has no synthetic baseline migration for the
  // legacy production schema. CI therefore bootstraps a disposable database
  // from the current entities, then runs every tracked migration through the
  // TypeORM runner before the read-only contract assertions. This is explicit
  // and isolated; it must never be enabled for production.
  AppDataSource.setOptions({ synchronize: true });
  await AppDataSource.initialize();
  try {
    const hadPending = await AppDataSource.showMigrations();
    const applied = await AppDataSource.runMigrations({ transaction: "all" });
    console.log(
      `DB CONTRACT BOOTSTRAP PASS: synchronized isolated schema and applied ${applied.length} tracked migrations` +
      ` (pending before run: ${hadPending})`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`DB CONTRACT BOOTSTRAP FAILED: ${error?.message || String(error)}`);
  process.exit(1);
});
