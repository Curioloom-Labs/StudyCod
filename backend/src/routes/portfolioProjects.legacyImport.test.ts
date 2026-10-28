import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { portfolioProjectsRouter } from "./portfolioProjects";

async function callRoute(path: string, method: "get" | "post", body: Record<string, unknown> = {}) {
  const layer = portfolioProjectsRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer, `${method.toUpperCase()} ${path} route exists`);
  let status = 200;
  let result: unknown;
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { result = value; return response; },
  };
  await layer.route.stack.at(-1).handle({
    userId: 120, userType: "USER", userMode: "PERSONAL", params: {}, query: {}, body,
  }, response);
  return { status, result };
}

async function successfulImportFixture(t: any, kind: "COURSE_PROJECT" | "LIBRARY_PROJECT", sourceId: number, sourceQueryPrefix: string, sourceRow: Record<string, unknown>) {
  const writes: Array<{ sql: string; parameters?: unknown[] }> = [];
  const transaction: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.startsWith(sourceQueryPrefix)) {
      assert.deepEqual(parameters, [sourceId, 120]);
      return [sourceRow];
    }
    if (sql.startsWith("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=?")) return [];
    throw new Error(`Unexpected non-transaction query: ${sql}`);
  });
  const runner = {
    async connect() { transaction.push("connect"); },
    async startTransaction() { transaction.push("start"); },
    async query(sql: string, parameters?: unknown[]) {
      writes.push({ sql, parameters });
      if (sql.startsWith("SELECT id FROM growth_projects")) return [];
      if (sql.startsWith("SELECT id FROM growth_project_artifacts")) return [{ id: "artifact-1" }];
      return { affectedRows: 1 };
    },
    async commitTransaction() { transaction.push("commit"); },
    async rollbackTransaction() { transaction.push("rollback"); },
    async release() { transaction.push("release"); },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);

  const response = await callRoute("/import", "post", { kind, sourceId });
  return { response, writes, transaction };
}

test("legacy work discovery guards course projectSpec extraction against malformed simple-json content", async t => {
  const queries: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    queries.push(sql);
    if (sql.startsWith("SELECT id,title,description,lang,draft_code,final_code FROM tasks")) return [];
    if (sql.includes("SELECT DISTINCT p.item_id AS sourceId")) {
      assert.deepEqual(parameters, [120]);
      assert.match(sql, /CASE WHEN JSON_VALID\(ci\.content\) THEN JSON_EXTRACT\(ci\.content,'\$\.projectSpec'\) END IS NOT NULL/);
      return [];
    }
    if (sql.startsWith("SELECT a.library_task_id AS sourceId")) return [];
    if (sql.startsWith("SELECT source_json FROM growth_projects")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const response = await callRoute("/legacy", "get");
  assert.equal(response.status, 200);
  assert.deepEqual(response.result, { projects: [] });
  assert.equal(queries.length, 4);
});

test("legacy work discovery only lists source records that can be copied without exposing their code", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.startsWith("SELECT id,title,description,lang,draft_code,final_code FROM tasks")) {
      assert.deepEqual(parameters, [120]);
      return [
        { id: 11, title: "Personal project", description: "Personal description", lang: "JAVA", final_code: "class Main {}" },
        { id: 12, title: "No code", lang: "JAVA", final_code: "  " },
        { id: 13, title: "Unsupported runtime", lang: "RUST", final_code: "fn main() {}" },
      ];
    }
    if (sql.startsWith("SELECT DISTINCT p.item_id AS sourceId")) {
      assert.deepEqual(parameters, [120]);
      return [
        { sourceId: 21, title: "Course project", course_title: "Java course", runtime: "JAVA", project_data: JSON.stringify({ files: [{ path: "Main.java", content: "class Main {}" }] }) },
        { sourceId: 22, title: "Empty course project", course_title: "Java course", runtime: "JAVA", project_data: JSON.stringify({ files: [] }) },
      ];
    }
    if (sql.startsWith("SELECT a.library_task_id AS sourceId")) {
      assert.deepEqual(parameters, [120]);
      return [
        { sourceId: 31, title: "Library mini-project", description: "Library description", project_spec: JSON.stringify({ kind: "MINI_PROJECT" }), allowed_languages: JSON.stringify(["JAVA"]), last_submitted_code_by_language: JSON.stringify({ JAVA: "class Main {}" }) },
        { sourceId: 32, title: "Other project mode", project_spec: JSON.stringify({ kind: "STANDARD" }), allowed_languages: JSON.stringify(["JAVA"]), last_submitted_code: "class Main {}" },
        { sourceId: 33, title: "Library project without code", project_spec: JSON.stringify({ kind: "MINI_PROJECT" }), allowed_languages: JSON.stringify(["JAVA"]) },
      ];
    }
    if (sql.startsWith("SELECT source_json FROM growth_projects")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const response = await callRoute("/legacy", "get");
  assert.equal(response.status, 200);
  assert.deepEqual(response.result, { projects: [
    { kind: "PERSONAL_MINI_PROJECT", sourceId: 11, title: "Personal project", description: "Personal description", runtime: "JAVA", imported: false },
    { kind: "COURSE_PROJECT", sourceId: 21, title: "Course project", description: "Java course", runtime: "JAVA", imported: false },
    { kind: "LIBRARY_PROJECT", sourceId: 31, title: "Library mini-project", description: "Library description", runtime: "JAVA", imported: false },
  ] });
  assert.equal(JSON.stringify(response.result).includes("class Main"), false);
});

test("course project import safely treats malformed projectSpec content as unavailable", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    assert.match(sql, /FROM course_item_progress p/);
    assert.deepEqual(parameters, [99, 120]);
    assert.match(sql, /CASE WHEN JSON_VALID\(ci\.content\) THEN JSON_EXTRACT\(ci\.content,'\$\.projectSpec'\) END IS NOT NULL/);
    return [];
  });

  const response = await callRoute("/import", "post", { kind: "COURSE_PROJECT", sourceId: 99 });
  assert.equal(response.status, 404);
  assert.deepEqual(response.result, { code: "LEGACY_SOURCE_NOT_FOUND", message: "LEGACY_SOURCE_NOT_FOUND" });
});

test("completed Personal project import preserves authorship, source details, and code without claiming a Judge pass", async t => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const writes: Array<{ sql: string; parameters?: unknown[] }> = [];
  const transaction: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    queries.push({ sql, parameters });
    if (sql.startsWith("SELECT id,title,description,lang,draft_code,final_code FROM tasks")) {
      assert.deepEqual(parameters, [99, 120], "the import must resolve a source owned by the authenticated user");
      return [{ id: 99, title: "API mini-project", description: "Build a catalog API", lang: "JAVA", draft_code: "class Draft {}", final_code: "class Main { public static void main(String[] args) {} }" }];
    }
    if (sql.startsWith("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=?")) return [];
    throw new Error(`Unexpected non-transaction query: ${sql}`);
  });
  const runner = {
    async connect() { transaction.push("connect"); },
    async startTransaction() { transaction.push("start"); },
    async query(sql: string, parameters?: unknown[]) {
      writes.push({ sql, parameters });
      if (sql.startsWith("SELECT id FROM growth_projects")) return [];
      if (sql.startsWith("SELECT id FROM growth_project_artifacts")) return [{ id: "artifact-1" }];
      return { affectedRows: 1 };
    },
    async commitTransaction() { transaction.push("commit"); },
    async rollbackTransaction() { transaction.push("rollback"); },
    async release() { transaction.push("release"); },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);

  const response = await callRoute("/import", "post", { kind: "PERSONAL_MINI_PROJECT", sourceId: 99 });
  assert.equal(response.status, 201);
  const projectInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_projects"));
  assert.deepEqual(response.result, { id: projectInsert?.parameters?.[0], existing: false, label: "ADDED_FROM_PRIOR_LEARNING" });
  assert.deepEqual(transaction, ["connect", "start", "commit", "release"]);
  const artifactInsert = writes.find(write => write.sql.startsWith("INSERT IGNORE INTO growth_project_artifacts"));
  const jobInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_project_jobs"));
  const versionInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_project_versions"));
  assert.ok(artifactInsert && projectInsert && jobInsert && versionInsert, "artifact, project, imported execution, and initial version must be committed together");
  assert.equal(projectInsert.parameters?.[1], 120, "the new project must retain the authenticated owner");
  assert.equal(projectInsert.parameters?.[2], "legacy-mpj-99");
  const draft = JSON.parse(projectInsert.parameters?.[5] as string);
  assert.deepEqual(draft.files, [{ path: "Main.java", content: "class Main { public static void main(String[] args) {} }" }]);
  const source = JSON.parse(projectInsert.parameters?.[6] as string);
  assert.deepEqual(source, {
    kind: "PERSONAL_MINI_PROJECT", sourceId: 99, title: "API mini-project", description: "Build a catalog API",
    importedLabel: "ADDED_FROM_PRIOR_LEARNING",
  });
  const importedJob = JSON.parse(jobInsert.parameters?.[9] as string);
  assert.deepEqual(importedJob, { passed: false, verdict: "IMPORTED", testsPassed: 0, testsTotal: 0, legacy: true });
  assert.match(String(versionInsert.parameters?.[6]), /Нові автотести для цієї роботи не запускалися/);
  assert.equal(JSON.stringify(response.result).includes("class Main"), false, "the import response must not echo source code");
});

test("completed Personal course-project import copies saved project files without claiming a Judge pass", async t => {
  const code = "class Main { public static void main(String[] args) {} }";
  const { response, writes, transaction } = await successfulImportFixture(
    t,
    "COURSE_PROJECT",
    501,
    "SELECT p.item_id AS sourceId",
    {
      sourceId: 501,
      title: "Course project",
      course_title: "Java Foundations",
      runtime: "JAVA",
      project_data: JSON.stringify({ files: [{ path: "Main.java", content: code }], status: "SUBMITTED" }),
    },
  );

  assert.equal(response.status, 201);
  const projectInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_projects"));
  const jobInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_project_jobs"));
  assert.ok(projectInsert && jobInsert);
  assert.equal(projectInsert.parameters?.[1], 120);
  assert.equal(projectInsert.parameters?.[2], "legacy-course-501");
  assert.equal(projectInsert.parameters?.[3], "JAVA");
  assert.deepEqual(JSON.parse(projectInsert.parameters?.[5] as string).files, [{ path: "Main.java", content: code }]);
  assert.deepEqual(JSON.parse(projectInsert.parameters?.[6] as string), {
    kind: "COURSE_PROJECT", sourceId: 501, title: "Course project", description: "Java Foundations", importedLabel: "ADDED_FROM_PRIOR_LEARNING",
  });
  assert.deepEqual(JSON.parse(jobInsert.parameters?.[9] as string), { passed: false, verdict: "IMPORTED", testsPassed: 0, testsTotal: 0, legacy: true });
  assert.equal(JSON.stringify(response.result).includes(code), false);
  assert.deepEqual(transaction, ["connect", "start", "commit", "release"]);
});

test("completed Personal library mini-project import chooses and preserves the submitted language and code", async t => {
  const code = "class Main { public static void main(String[] args) {} }";
  const { response, writes, transaction } = await successfulImportFixture(
    t,
    "LIBRARY_PROJECT",
    601,
    "SELECT a.library_task_id AS sourceId",
    {
      sourceId: 601,
      title: "Library mini-project",
      description: "Create a small Java app",
      project_spec: JSON.stringify({ kind: "MINI_PROJECT" }),
      allowed_languages: JSON.stringify(["PYTHON", "JAVA"]),
      last_submitted_code_by_language: JSON.stringify({ JAVA: code }),
      draft_code_by_language: JSON.stringify({}),
    },
  );

  assert.equal(response.status, 201);
  const projectInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_projects"));
  const jobInsert = writes.find(write => write.sql.startsWith("INSERT INTO growth_project_jobs"));
  assert.ok(projectInsert && jobInsert);
  assert.equal(projectInsert.parameters?.[1], 120);
  assert.equal(projectInsert.parameters?.[2], "legacy-library-601");
  assert.equal(projectInsert.parameters?.[3], "JAVA");
  assert.deepEqual(JSON.parse(projectInsert.parameters?.[5] as string).files, [{ path: "Main.java", content: code }]);
  assert.deepEqual(JSON.parse(projectInsert.parameters?.[6] as string), {
    kind: "LIBRARY_PROJECT", sourceId: 601, title: "Library mini-project", description: "Create a small Java app", importedLabel: "ADDED_FROM_PRIOR_LEARNING",
  });
  assert.deepEqual(JSON.parse(jobInsert.parameters?.[9] as string), { passed: false, verdict: "IMPORTED", testsPassed: 0, testsTotal: 0, legacy: true });
  assert.equal(JSON.stringify(response.result).includes(code), false);
  assert.deepEqual(transaction, ["connect", "start", "commit", "release"]);
});

test("reimporting an existing legacy project returns the same owner-scoped project without writes", async t => {
  const statements: string[] = [];
  let transactionCreated = false;
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    statements.push(sql);
    if (sql.startsWith("SELECT id,title,description,lang,draft_code,final_code FROM tasks")) {
      assert.deepEqual(parameters, [99, 120]);
      return [{ id: 99, title: "API mini-project", description: "Build a catalog API", lang: "JAVA", draft_code: "class Main {}", final_code: "" }];
    }
    if (sql.startsWith("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=?")) {
      assert.deepEqual(parameters, [120, "legacy-mpj-99", "JAVA"]);
      return [{ id: "already-imported" }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  t.mock.method(AppDataSource, "createQueryRunner", () => { transactionCreated = true; throw new Error("an existing import must not write"); });

  const response = await callRoute("/import", "post", { kind: "PERSONAL_MINI_PROJECT", sourceId: 99 });
  assert.equal(response.status, 200);
  assert.deepEqual(response.result, { id: "already-imported", existing: true });
  assert.equal(transactionCreated, false);
  assert.equal(statements.some(sql => sql.startsWith("INSERT")), false);
});

test("legacy import rolls back the artifact when project creation fails", async t => {
  const outsideQueries: string[] = [];
  const transactionWrites: string[] = [];
  const transaction: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    outsideQueries.push(sql);
    if (sql.startsWith("SELECT id,title,description,lang,draft_code,final_code FROM tasks")) {
      assert.deepEqual(parameters, [99, 120]);
      return [{ id: 99, title: "API mini-project", description: "Build a catalog API", lang: "JAVA", draft_code: "class Main {}", final_code: "" }];
    }
    if (sql.startsWith("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=?")) return [];
    throw new Error(`Unexpected query outside the transaction: ${sql}`);
  });
  const runner = {
    async connect() { transaction.push("connect"); },
    async startTransaction() { transaction.push("start"); },
    async query(sql: string) {
      transactionWrites.push(sql);
      if (sql.startsWith("SELECT id FROM growth_projects")) return [];
      if (sql.startsWith("SELECT id FROM growth_project_artifacts")) return [{ id: "artifact-1" }];
      if (sql.startsWith("INSERT INTO growth_projects")) throw new Error("simulated project insert failure");
      return { affectedRows: 1 };
    },
    async commitTransaction() { transaction.push("commit"); },
    async rollbackTransaction() { transaction.push("rollback"); },
    async release() { transaction.push("release"); },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);

  await assert.rejects(
    () => callRoute("/import", "post", { kind: "PERSONAL_MINI_PROJECT", sourceId: 99 }),
    /simulated project insert failure/,
  );
  assert.deepEqual(transaction, ["connect", "start", "rollback", "release"]);
  assert.ok(transactionWrites.some(sql => sql.startsWith("INSERT IGNORE INTO growth_project_artifacts")));
  assert.equal(outsideQueries.some(sql => sql.startsWith("INSERT")), false, "the artifact must not be written outside the rollback boundary");
});
