import type { DataSource } from "typeorm";

export type LegacyMigrationHistoryRow = {
  timestamp: number;
  name: string;
};

export const LEGACY_MIGRATION_HISTORY_BASELINE: LegacyMigrationHistoryRow[] = [
  { timestamp: 1736032800000, name: "CreateAssignmentTargets1736032800000" },
  { timestamp: 1736119200000, name: "CreateAppealsInsightsTables1736119200000" },
  { timestamp: 1736202800000, name: "CreateNormalizedAssignmentTables1736202800000" },
];

const LEGACY_MIGRATION_HISTORY_BY_TABLE = new Map<string, string>([
  ["assignment_targets", "CreateAssignmentTargets1736032800000"],
  ["grade_appeals", "CreateAppealsInsightsTables1736119200000"],
  ["grade_appeal_messages", "CreateAppealsInsightsTables1736119200000"],
  ["edu_hint_feedback", "CreateAppealsInsightsTables1736119200000"],
  ["teacher_digest_deliveries", "CreateAppealsInsightsTables1736119200000"],
  ["topic_task_assignments", "CreateNormalizedAssignmentTables1736202800000"],
  ["control_work_assignments", "CreateNormalizedAssignmentTables1736202800000"],
]);

const LEGACY_MIGRATION_ALIAS_NAMES = new Map<string, string>([
  ["1736032800000-createassignmenttargets", "CreateAssignmentTargets1736032800000"],
  ["1736119200000-createappealsinsightstables", "CreateAppealsInsightsTables1736119200000"],
  ["1736202800000-createnormalizedassignmenttables", "CreateNormalizedAssignmentTables1736202800000"],
]);

const LEGACY_MIGRATION_HISTORY_BY_NAME = new Map<string, LegacyMigrationHistoryRow>();

function normalizeMigrationName(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\.(ts|js)$/i, "");
}

function normalizeTableName(raw: unknown): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[`"']/g, "");

  if (!cleaned) return "";

  const parts = cleaned.split(".");
  return String(parts[parts.length - 1] || "")
    .trim()
    .toLowerCase();
}

function extractMigrationTimestamp(raw: unknown): number | undefined {
  const match = String(raw || "").match(/(\d{10,16})/);
  if (!match?.[1]) return undefined;
  const timestamp = Number.parseInt(match[1], 10);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

for (const row of LEGACY_MIGRATION_HISTORY_BASELINE) {
  LEGACY_MIGRATION_HISTORY_BY_NAME.set(normalizeMigrationName(row.name), row);
}

for (const [aliasName, canonicalName] of LEGACY_MIGRATION_ALIAS_NAMES.entries()) {
  const row = LEGACY_MIGRATION_HISTORY_BASELINE.find(item => item.name === canonicalName);
  if (!row) continue;

  const normalizedAlias = normalizeMigrationName(aliasName);
  LEGACY_MIGRATION_HISTORY_BY_NAME.set(normalizedAlias, row);
  LEGACY_MIGRATION_HISTORY_BY_NAME.set(`${normalizedAlias}.ts`, row);
  LEGACY_MIGRATION_HISTORY_BY_NAME.set(`${normalizedAlias}.js`, row);
}

export function getLegacyMigrationHistoryRowByName(name: unknown): LegacyMigrationHistoryRow | undefined {
  const normalizedName = normalizeMigrationName(name);
  if (!normalizedName) return undefined;

  const direct = LEGACY_MIGRATION_HISTORY_BY_NAME.get(normalizedName);
  if (direct) return direct;

  const timestamp = extractMigrationTimestamp(name);
  if (!timestamp) return undefined;

  return LEGACY_MIGRATION_HISTORY_BASELINE.find(row => row.timestamp === timestamp);
}

export function getLegacyMigrationHistoryRowByTableName(tableName: unknown): LegacyMigrationHistoryRow | undefined {
  const normalizedTableName = normalizeTableName(tableName);
  if (!normalizedTableName) return undefined;

  const migrationName = LEGACY_MIGRATION_HISTORY_BY_TABLE.get(normalizedTableName);
  if (!migrationName) return undefined;

  return getLegacyMigrationHistoryRowByName(migrationName);
}

export type StampLegacyMigrationHistoryResult = {
  inserted: number;
  exists: number;
  skippedUnknown: number;
  rows: LegacyMigrationHistoryRow[];
};

async function ensureMigrationsTable(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT NOT NULL AUTO_INCREMENT,
      timestamp BIGINT NOT NULL,
      name VARCHAR(255) NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function stampMigrationRow(
  dataSource: DataSource,
  row: LegacyMigrationHistoryRow
): Promise<"inserted" | "exists"> {
  const existing = (await dataSource.query(
    "SELECT id FROM migrations WHERE timestamp = ? AND name = ? LIMIT 1",
    [row.timestamp, row.name]
  )) as Array<Record<string, unknown>>;

  if (Array.isArray(existing) && existing.length > 0) {
    return "exists";
  }

  await dataSource.query(
    "INSERT INTO migrations (timestamp, name) VALUES (?, ?)",
    [row.timestamp, row.name]
  );
  return "inserted";
}

function resolveRowsFromNames(names: string[]): { rows: LegacyMigrationHistoryRow[]; skippedUnknown: number } {
  const rows: LegacyMigrationHistoryRow[] = [];
  const seen = new Set<string>();
  let skippedUnknown = 0;

  for (const rawName of names) {
    const normalized = String(rawName || "").trim();
    if (!normalized) continue;

    const row = getLegacyMigrationHistoryRowByName(normalized);
    if (!row) {
      skippedUnknown += 1;
      continue;
    }

    if (seen.has(row.name)) continue;
    seen.add(row.name);
    rows.push(row);
  }

  return { rows, skippedUnknown };
}

export async function stampLegacyMigrationHistory(
  dataSource: DataSource,
  options?: {
    names?: string[];
  }
): Promise<StampLegacyMigrationHistoryResult> {
  await ensureMigrationsTable(dataSource);

  const requestedNames = Array.isArray(options?.names)
    ? options.names
      .map(name => String(name || "").trim())
      .filter(Boolean)
    : [];

  const resolved = requestedNames.length > 0
    ? resolveRowsFromNames(requestedNames)
    : { rows: LEGACY_MIGRATION_HISTORY_BASELINE, skippedUnknown: 0 };

  let inserted = 0;
  let exists = 0;

  for (const row of resolved.rows) {
    const status = await stampMigrationRow(dataSource, row);
    if (status === "inserted") inserted += 1;
    else exists += 1;
  }

  return {
    inserted,
    exists,
    skippedUnknown: resolved.skippedUnknown,
    rows: resolved.rows,
  };
}
