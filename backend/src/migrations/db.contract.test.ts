import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { educationalUserContextSql } from "../services/edu/accountMetadata";

const databaseUrl = String(process.env.DB_CONTRACT_DATABASE_URL ?? "").trim();

test("EDU account security queries support mixed legacy email collations", {
  skip: process.env.RUN_DB_CONTRACT_TEST !== "1",
}, async () => {
  const connection = await createConnection(databaseUrl);
  try {
    await connection.query(`CREATE TEMPORARY TABLE users (id INT, email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
      user_mode VARCHAR(20), role VARCHAR(20), edu_session_version INT, edu_account_setup_required INT)`);
    await connection.query(`CREATE TEMPORARY TABLE org_invitations (email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci, status VARCHAR(20))`);
    await connection.query("CREATE TEMPORARY TABLE students (user_id INT, user_account_managed INT)");
    await connection.query("CREATE TEMPORARY TABLE memberships (user_id INT, role VARCHAR(20))");
    await connection.query("CREATE TEMPORARY TABLE classes (teacher_id INT)");
    await connection.query("CREATE TEMPORARY TABLE class_teachers (teacher_id INT)");
    await connection.query("CREATE TEMPORARY TABLE parent_links (parent_user_id INT)");
    await connection.query(`INSERT INTO users VALUES
      (1,'Invited@example.test','PERSONAL','USER',0,0),
      (2,'other@example.test','PERSONAL','USER',0,0),
      (3,'invited@example.test','CONTEST','USER',0,0),
      (4,'staff@example.test','EDUCATIONAL','SYSTEM_ADMIN',0,0)`);
    await connection.query("INSERT INTO org_invitations VALUES ('invited@example.test','PENDING')");
    const verify = async () => {
      const [rows] = await connection.query<RowDataPacket[]>(`SELECT user.id
        FROM users user WHERE ${educationalUserContextSql()} ORDER BY user.id`);
      assert.deepEqual(rows.map(row => row.id), [1, 4]);
    };
    await verify();
    await connection.query("ALTER TABLE users MODIFY email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await connection.query("ALTER TABLE org_invitations MODIFY email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
    await verify();
  } finally {
    await connection.end();
  }
});

type ColumnRow = RowDataPacket & {
  Field: string;
  Null: string;
  Default: string | number | null;
};

type IndexRow = RowDataPacket & {
  Key_name: string;
};

type MigrationRow = RowDataPacket & {
  timestamp: string | number;
  name: string;
};

function workspaceFile(relativePath: string): string {
  for (const start of [process.cwd(), __dirname]) {
    let directory = path.resolve(start);
    while (true) {
      const candidate = path.join(directory, relativePath);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  throw new Error(`Could not locate workspace file: ${relativePath}`);
}

function readReadOnlyInventoryStatements(relativePath: string): string[] {
  const source = fs.readFileSync(workspaceFile(relativePath), "utf8")
    .replace(/^\s*--.*$/gm, "");
  const statements = source.split(";").map(statement => statement.trim()).filter(Boolean);
  assert.equal(statements[0]?.toUpperCase(), "START TRANSACTION READ ONLY", `${relativePath} must begin a read-only transaction`);
  assert.equal(statements[statements.length - 1]?.toUpperCase(), "ROLLBACK", `${relativePath} must end by rolling back its read-only transaction`);
  for (const statement of statements.slice(1, -1)) {
    assert.match(statement, /^(?:SELECT|WITH)\b/i, `${relativePath} contains a statement other than a read-only query`);
    assert.doesNotMatch(statement, /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|COMMIT|GRANT|REVOKE|SET)\b/i,
      `${relativePath} contains a mutating or privilege-changing statement`);
  }
  return statements;
}

test("read-only inventory SQL contains only SELECT statements", () => {
  for (const report of [
    "docs/portfolio-assess-data-inventory-readonly.sql",
    "docs/portfolio-assess-portfolio-data-inventory-readonly.sql",
  ]) {
    assert.ok(readReadOnlyInventoryStatements(report).length > 2, `${report} must contain inventory queries`);
  }
});

test("legacy and Portfolio inventory reports execute on MySQL", {
  skip: !process.env.RUN_DB_CONTRACT_TEST
    ? "set RUN_DB_CONTRACT_TEST=1 and DB_CONTRACT_DATABASE_URL to validate inventory SQL on MySQL"
    : false,
}, async () => {
  const reports = [
    "docs/portfolio-assess-data-inventory-readonly.sql",
    "docs/portfolio-assess-portfolio-data-inventory-readonly.sql",
  ];
  const connection = await createConnection(databaseUrl);
  try {
    for (const report of reports) {
      const statements = readReadOnlyInventoryStatements(report);
      await connection.query(statements[0]);
      try {
        for (const statement of statements.slice(1, -1)) {
          await connection.query(statement);
        }
      } finally {
        await connection.query("ROLLBACK");
      }
    }
  } finally {
    await connection.end();
  }
});

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

function expectedMigrationNames(): Set<string> {
  return new Set(
    fs.readdirSync(__dirname)
      .filter(file => /^\d+-.+\.js$/.test(file))
      .map(file => {
        const source = fs.readFileSync(path.join(__dirname, file), "utf8");
        return source.match(/class (\w+\d+)\s*\{/i)?.[1] ?? "";
      })
      .filter(Boolean),
  );
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
      "edu_credential_operations",
      "topics_new",
      "maintenance_state",
      "edu_grades",
      "summary_grades",
      "growth_projects",
      "growth_companies",
      "growth_company_assessments",
      "growth_interviews",
      "portfolio_profiles",
      "portfolio_works",
      "portfolio_evidence",
      "portfolio_evidence_packs",
      "portfolio_sourced_evidence",
    ];
    for (const table of requiredTables) {
      assert.equal(await hasTable(connection, table), true, `missing required table: ${table}`);
    }

    const [migrationRows] = await connection.query<MigrationRow[]>(
      "SELECT timestamp, name FROM migrations ORDER BY timestamp ASC",
    );
    const appliedMigrationNames = new Set(migrationRows.map(row => String(row.name)));
    for (const name of expectedMigrationNames()) {
      assert.equal(
        appliedMigrationNames.has(name),
        true,
        `tracked migration ${name} was not applied in the contract database`,
      );
    }

    const classOrg = columns(connection, "classes");
    const studentColumns = columns(connection, "students");
    const maintenanceColumns = columns(connection, "maintenance_state");
    const [classRows, studentRows, maintenanceRows] = await Promise.all([classOrg, studentColumns, maintenanceColumns]);

    assert.equal(classRows.find(row => row.Field === "org_id")?.Null, "NO", "classes.org_id must be NOT NULL");
    assert.ok(studentRows.some(row => row.Field === "deleted_at"), "students.deleted_at must exist");
    const managedAccount = studentRows.find(row => row.Field === "user_account_managed");
    assert.equal(managedAccount?.Null, "NO", "managed student account flag must exist and be non-null");
    assert.equal(Number(managedAccount?.Default), 0, "joining a class must not implicitly waive personal account email verification");
    const credentialVersion = studentRows.find(row => row.Field === "credential_version");
    assert.equal(credentialVersion?.Null, "NO", "student credential version must be non-null");
    assert.equal(Number(credentialVersion?.Default), 0, "existing student sessions start at credential version zero");
    const userRows = await columns(connection, "users");
    assert.equal(userRows.find(row => row.Field === "birth_year")?.Null, "YES", "Portfolio birth year must remain optional for existing users");
    const eduSessionVersion = userRows.find(row => row.Field === "edu_session_version");
    assert.equal(eduSessionVersion?.Null, "NO", "EDU User session revocation must be durable");
    assert.equal(Number(eduSessionVersion?.Default), 0, "legacy EDU sessions start at version zero");
    assert.equal(userRows.find(row => row.Field === "edu_account_setup_required")?.Null, "NO", "school account activation state must be durable");
    assert.equal(Number(userRows.find(row => row.Field === "edu_account_setup_required")?.Default), 0, "personal accounts are not implicitly school-issued");
    assert.equal(userRows.find(row => row.Field === "edu_issuer_org_id")?.Null, "YES", "private accounts have no school issuer");
    assert.equal(maintenanceRows.find(row => row.Field === "until")?.Null, "YES", "maintenance_state.until must remain nullable");

    const operationColumns = await columns(connection, "edu_credential_operations");
    for (const field of ["actor_id", "class_id", "operation_key", "kind", "state", "request_hash", "student_ids", "expires_at"]) {
      assert.equal(operationColumns.find(row => row.Field === field)?.Null, "NO", `credential operation ${field} must be non-null`);
    }
    assert.equal(operationColumns.find(row => row.Field === "response_cipher")?.Null, "YES", "acknowledgment must be able to erase the credential ciphertext");
    const operationIndexes = await indexNames(connection, "edu_credential_operations");
    const invitationIndexes = await indexNames(connection, "org_invitations");
    assert.equal(invitationIndexes.has("idx_invite_email_status"), true, "pending EDU invitation context requires indexed email/status lookup");
    for (const name of ["uq_edu_credential_operation_actor_key", "idx_edu_credential_operation_class_actor", "idx_edu_credential_operation_expiry"]) {
      assert.equal(operationIndexes.has(name), true, `missing credential operation index: ${name}`);
    }

    const [gradeIndexes, summaryIndexes, topicIndexes] = await Promise.all([
      indexNames(connection, "edu_grades"),
      indexNames(connection, "summary_grades"),
      indexNames(connection, "topics_new"),
    ]);
    const gradeColumns = await columns(connection, "grades");
    for (const field of ["verification_method", "judge_verdict", "tests_passed", "tests_total"]) {
      assert.ok(gradeColumns.some(row => row.Field === field), `Personal Judge provenance column must exist: grades.${field}`);
    }
    assert.equal((await indexNames(connection, "grades")).has("ix_grade_owner_verification"), true, "Personal Judge provenance lookup index must exist");
    for (const name of ["idx_edu_grades_student_task_created", "idx_edu_grades_student_topic_created"]) {
      assert.equal(gradeIndexes.has(name), true, `missing index: edu_grades.${name}`);
    }
    for (const name of ["idx_summary_grades_student_created", "idx_summary_grades_class_student_created"]) {
      assert.equal(summaryIndexes.has(name), true, `missing index: summary_grades.${name}`);
    }
    assert.equal(topicIndexes.has("idx_topics_new_language_class_order"), true, "missing index: topics_new.idx_topics_new_language_class_order");

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

    const [topicPlanRows] = await connection.query<RowDataPacket[]>(
      "EXPLAIN SELECT id FROM topics_new WHERE language = ? AND class_id IS NULL ORDER BY `order` ASC",
      ["PYTHON"],
    );
    const topicPlan = String(topicPlanRows[0]?.possible_keys ?? "");
    assert.match(topicPlan, /idx_topics_new_language_class_order/, "theory topic sidebar lookup does not expose the expected composite index");
  } finally {
    await connection.end();
  }
});
