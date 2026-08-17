import assert from "node:assert/strict";
import test from "node:test";
import { createConnection, type RowDataPacket } from "mysql2/promise";

const databaseUrl = String(process.env.DB_CONTRACT_DATABASE_URL ?? "").trim();

type ColumnRow = RowDataPacket & {
  Field: string;
  Null: string;
};

type IndexRow = RowDataPacket & {
  Key_name: string;
};

async function hasTable(connection: Awaited<ReturnType<typeof createConnection>>, table: string): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [table],
  );
  return rows.length > 0;
}

async function columns(connection: Awaited<ReturnType<typeof createConnection>>, table: string): Promise<ColumnRow[]> {
  const [rows] = await connection.query<ColumnRow[]>(`SHOW COLUMNS FROM \`${table}\``);
  return rows;
}

async function indexNames(connection: Awaited<ReturnType<typeof createConnection>>, table: string): Promise<Set<string>> {
  const [rows] = await connection.query<IndexRow[]>(`SHOW INDEX FROM \`${table}\``);
  return new Set(rows.map(row => String(row.Key_name)));
}

test("database contract: critical schema, indexes, and hot-path plans", {
  skip: !process.env.RUN_DB_CONTRACT_TEST
    ? "set RUN_DB_CONTRACT_TEST=1 and DB_CONTRACT_DATABASE_URL to run against an isolated test database"
    : false,
}, async () => {
  assert.ok(databaseUrl, "DB_CONTRACT_DATABASE_URL is required");
  const connection = await createConnection(databaseUrl);
  try {
    const requiredTables = [
      "organizations",
      "classes",
      "courses",
      "students",
      "maintenance_state",
      "edu_grades",
      "summary_grades",
    ];
    for (const table of requiredTables) {
      assert.equal(await hasTable(connection, table), true, `missing required table: ${table}`);
    }

    const classOrg = columns(connection, "classes");
    const studentColumns = columns(connection, "students");
    const maintenanceColumns = columns(connection, "maintenance_state");
    const [classRows, studentRows, maintenanceRows] = await Promise.all([classOrg, studentColumns, maintenanceColumns]);

    assert.equal(classRows.find(row => row.Field === "org_id")?.Null, "NO", "classes.org_id must be NOT NULL");
    assert.ok(studentRows.some(row => row.Field === "deleted_at"), "students.deleted_at must exist");
    assert.equal(maintenanceRows.find(row => row.Field === "until")?.Null, "YES", "maintenance_state.until must remain nullable");

    const [gradeIndexes, summaryIndexes] = await Promise.all([
      indexNames(connection, "edu_grades"),
      indexNames(connection, "summary_grades"),
    ]);
    for (const name of ["idx_edu_grades_student_task_created", "idx_edu_grades_student_topic_created"]) {
      assert.equal(gradeIndexes.has(name), true, `missing index: edu_grades.${name}`);
    }
    for (const name of ["idx_summary_grades_student_created", "idx_summary_grades_class_student_created"]) {
      assert.equal(summaryIndexes.has(name), true, `missing index: summary_grades.${name}`);
    }

    const [gradePlanRows] = await connection.query<RowDataPacket[]>(
      "EXPLAIN SELECT id FROM edu_grades WHERE student_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1",
      [0, 0],
    );
    const gradePlan = String(gradePlanRows[0]?.possible_keys ?? "");
    assert.match(gradePlan, /idx_edu_grades_student_task_created/, "grade lookup does not expose the expected composite index");

    const [summaryPlanRows] = await connection.query<RowDataPacket[]>(
      "EXPLAIN SELECT id FROM summary_grades WHERE class_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 1",
      [0, 0],
    );
    const summaryPlan = String(summaryPlanRows[0]?.possible_keys ?? "");
    assert.match(summaryPlan, /idx_summary_grades_class_student_created/, "summary grade lookup does not expose the expected composite index");
  } finally {
    await connection.end();
  }
});
