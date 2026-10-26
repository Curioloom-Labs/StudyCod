import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { projectCompaniesRouter } from "./projectCompanies";

async function readDossier() {
  const layer = projectCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/:companyId/assessments/:assessmentId" && entry.route.methods.get) as any;
  assert.ok(layer);
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; } };
  await layer.route.stack.at(-1).handle({ userId: 120, userType: "USER", userMode: "PERSONAL", params: { companyId: "company-1", assessmentId: "case-1" } }, response);
  return { status, body };
}

const row = {
  id: "case-1", company_id: "company-1", candidate_username: "candidate", status: "TASK_SUBMITTED",
  project_id: "project-1", version_id: "version-1", technical_assessment_id: "task-1", task_status: "PASSED",
  task_draft: JSON.stringify({ files: [{ path: "main.py", content: "print('submitted')" }], examples: [{ input: "private-example", output: "private-output" }], explanation: "Candidate explanation" }),
  files_json: JSON.stringify([{ path: "main.py", content: "print('original')" }]),
  questions_json: "[]", answers_json: JSON.stringify([{ questionId: "q1", answer: "Private interview answer" }]),
  result_json: JSON.stringify({ passed: true, testsPassed: 2, testsTotal: 2, hiddenTests: [{ input: "hidden-test-secret" }] }),
};

test("the engineering dossier reads submitted files from the stored draft envelope and projects only allowed evidence", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM growth_company_members")) {
      assert.deepEqual(parameters, ["company-1", 120]);
      return [{ role: "ENGINEER" }];
    }
    assert.deepEqual(parameters, ["case-1", "company-1"]);
    return [row];
  });
  const result = await readDossier();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.assessment.task.files, [{ path: "main.py", content: "print('submitted')" }]);
  assert.deepEqual(result.body.assessment.task.result, { passed: true, testsPassed: 2, testsTotal: 2 });
  assert.equal(result.body.assessment.answers, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /hidden-test-secret|private-example|Private interview answer/);
});

test("an active working copy and completed check stay private until the candidate submits", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_company_members") ? [{ role: "ENGINEER" }] : [{ ...row, status: "TASK_ASSIGNED", task_status: "ACTIVE" }]);
  const result = await readDossier();
  assert.equal(result.status, 200);
  assert.equal(result.body.assessment.task.files, undefined);
  assert.equal(result.body.assessment.task.result, null);
  assert.equal(result.body.assessment.portfolio.files[0].content, "print('original')");
});

test("withdrawal removes source and submitted code from the company dossier", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_company_members") ? [{ role: "ENGINEER" }] : [{ ...row, status: "WITHDRAWN" }]);
  const result = await readDossier();
  assert.equal(result.status, 200);
  assert.equal(result.body.assessment.portfolio, undefined);
  assert.equal(result.body.assessment.task, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /print\('submitted'\)|print\('original'\)/);
});

test("a user without active company membership cannot fetch candidate material", async t => {
  let reads = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => { reads++; assert.match(sql, /FROM growth_company_members/); return []; });
  const result = await readDossier();
  assert.equal(result.status, 404);
  assert.equal(reads, 1);
});
