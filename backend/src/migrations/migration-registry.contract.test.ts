import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationFilePattern = /^(\d+)-[^/]+\.(ts|js)$/;
const migrationSourcePattern = /export class \w+\d+ implements MigrationInterface/;
const compiledMigrationPattern = /class \w+\d+\s*\{[\s\S]*exports\.\w+\d+\s*=\s*\w+\d+;/;
const migrationIdentityPattern = /export class (\w+\d+) implements MigrationInterface/;
const compiledMigrationIdentityPattern = /class (\w+\d+)\s*\{/;

test("migration registry only discovers timestamped migration files", () => {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => migrationFilePattern.test(file))
    .sort((a, b) => a.localeCompare(b));

  assert.ok(files.length > 0, "at least one migration must be registered");
  assert.equal(files.some((file) => file.includes(".contract.test.")), false, "contract tests must not be migrations");
  assert.equal(files.some((file) => file === "legacyMigrationHistory.ts" || file === "legacyMigrationHistory.js"), false, "migration helpers must not be migrations");

  const timestamps = files.map((file) => file.match(migrationFilePattern)?.[1] ?? "");
  assert.equal(new Set(timestamps).size, timestamps.length, "migration timestamps must be unique");
  assert.deepEqual(
    timestamps,
    [...timestamps].sort((a, b) => Number(a) - Number(b)),
    "migration files must be ordered by timestamp",
  );

  const identities = files.map((file) => {
    const source = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const isCompiledJavaScript = path.extname(file) === ".js";
    assert.match(
      source,
      isCompiledJavaScript ? compiledMigrationPattern : migrationSourcePattern,
      `${file} must export a named TypeORM migration`,
    );
    const identity = source.match(isCompiledJavaScript ? compiledMigrationIdentityPattern : migrationIdentityPattern)?.[1];
    assert.ok(identity, `${file} must have a discoverable TypeORM migration identity`);
    return identity;
  });

  assert.equal(new Set(identities).size, identities.length, "migration identities must be unique");
});

test("legacy patch phases use the TypeORM query runner boundary", () => {
  const extension = path.extname(__filename);
  const migrationFiles = [
    "1760200000000-ApplyIdentityAndTaskDbPatches",
    "1760200100000-ApplyTheoryAndSupportDbPatches",
    "1760200200000-ApplyLibraryAndExecutionDbPatches",
    "1760200300000-ApplyContestAndCertificateDbPatches",
    "1760200400000-ApplyTopicTheoryDbPatches",
  ].map(name => path.join(__dirname, `${name}${extension}`));
  const dbPatchesFile = path.join(__dirname, "..", "utils", `dbPatches${extension}`);
  const dbPatchesSource = fs.readFileSync(dbPatchesFile, "utf8");

  for (const migrationFile of migrationFiles) {
    const migrationSource = fs.readFileSync(migrationFile, "utf8");
    assert.match(migrationSource, /_legacyDbPatchPhaseForMigration/, `${path.basename(migrationFile)} must call its phase runner`);
    assert.match(migrationSource, /_legacyDbPatchPhaseForMigration/, `${path.basename(migrationFile)} must call its phase runner`);
    assert.match(migrationSource, /queryRunner/, `${path.basename(migrationFile)} must execute through its QueryRunner`);
    assert.doesNotMatch(migrationSource, /queryRunner\.query\.bind\(queryRunner\)/, `${path.basename(migrationFile)} must not downgrade to a raw query callback`);
  }
  const historicalMarkerSource = fs.readFileSync(
    path.join(__dirname, `1748000000000-RunLegacyDbPatches${extension}`),
    "utf8",
  );
  assert.doesNotMatch(historicalMarkerSource, /_legacyDbPatchesForMigration/, "historical marker must not run the monolith again");
  assert.match(dbPatchesSource, /AsyncLocalStorage/, "legacy SQL must have an isolated executor context");
  assert.match(dbPatchesSource, /queryRunner\.hasTable/, "tracked migrations must use QueryRunner metadata for table checks");
  assert.match(dbPatchesSource, /queryRunner\.getTable/, "tracked migrations must use QueryRunner metadata for column/index checks");
  assert.match(dbPatchesSource, /_legacyDbPatchPhaseForMigration/, "canonical migrations must have a phase-level executor");
  assert.equal(
    (dbPatchesSource.match(/AppDataSource\.query/g) ?? []).length,
    1,
    "AppDataSource.query may only be the emergency fallback executor",
  );
});

test("database contract bootstrap executes tracked migrations", () => {
  const bootstrapFile = [
    path.join(__dirname, "..", "..", "..", "..", "run-db-contract-bootstrap.js"),
    path.join(__dirname, "..", "..", "run-db-contract-bootstrap.js"),
  ].find(file => fs.existsSync(file));
  assert.ok(bootstrapFile, "database contract bootstrap script must be discoverable");
  const bootstrapSource = fs.readFileSync(bootstrapFile, "utf8");

  assert.match(bootstrapSource, /synchronize:\s*true/, "contract bootstrap must create an isolated entity baseline");
  assert.match(bootstrapSource, /runMigrations\(\{\s*transaction:\s*["']all["']\s*\}\)/, "contract bootstrap must execute tracked migrations");
  assert.doesNotMatch(bootstrapSource, /migrations:\s*\[\s*\]/, "contract bootstrap must not disable migration discovery");
});
