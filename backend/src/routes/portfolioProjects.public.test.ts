import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { portfolioProjectsRouter, portfolioProjectPublicRouter } from "./portfolioProjects";

function handler(path: string) {
  const layer = portfolioProjectPublicRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods.get) as any;
  assert.ok(layer, `GET ${path} route exists`);
  return layer.route.stack.at(-1).handle;
}

async function request(route: (req: any, res: any) => Promise<unknown>, params: Record<string, string>) {
  let status = 200;
  let result: unknown;
  const headers: Record<string, string> = {};
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { result = value; return response; },
    setHeader(name: string, value: string) { headers[name] = value; return response; },
  };
  await route({ params }, response);
  return { status, result, headers };
}

function assertPublicHeaders(headers: Record<string, string>) {
  assert.equal(headers["Cache-Control"], "no-store, private");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow, noarchive");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
}

test("legacy public project routes install a shared rate limiter", () => {
  assert.ok(portfolioProjectPublicRouter.stack.some((layer: any) => !layer.route), "public router has a router-level limiter before its routes");
});

test("Portfolio workbench compatibility mounts share an authenticated request limiter", () => {
  assert.ok(portfolioProjectsRouter.stack.some((layer: any) => !layer.route), "project router has a router-level limiter before its routes");
});

test("legacy project share sets no-store and privacy headers before validating a token", async t => {
  let reads = 0;
  t.mock.method(AppDataSource, "query", async () => { reads++; return []; });
  const result = await request(handler("/share/:publicId"), { publicId: "invalid" });
  assert.equal(result.status, 404);
  assert.deepEqual(result.result, { code: "PORTFOLIO_NOT_FOUND", message: "PORTFOLIO_NOT_FOUND" });
  assert.equal(reads, 0, "malformed share tokens are rejected before any database read");
  assertPublicHeaders(result.headers);
});

test("legacy published-project links still render explicit shares with no-store headers", async t => {
  const publicId = "Q".repeat(43);
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    assert.match(sql, /FROM growth_project_publications p JOIN users u/);
    return [{
      id: "publication-1", project_id: "project-1", owner_id: 120, version_id: "version-1", channel: "LINK",
      title: "Published StudyCod work", description: "An explicitly shared project", evidence_json: "{}", demo_json: "null", review_visible: 0,
      username: "developer", firstName: "Ada", lastName: "Lovelace", birthDay: 1, birthMonth: 1, birthYear: 1990,
      family_key: "java-basics", runtime: "JAVA", source_json: null, stage_key: "V1", sequence_no: 1,
      explanation: "Implemented the requested behavior.", files_json: '[{"path":"Main.java","content":"public class Main {}"}]',
      result_json: '{"passed":true}', created_at: "2026-10-28T10:00:00.000Z",
    }];
  });
  const result = await request(handler("/share/:publicId"), { publicId });
  assert.equal(result.status, 200);
  assertPublicHeaders(result.headers);
  assert.equal((result.result as any).publication.title, "Published StudyCod work");
  assert.equal((result.result as any).publication.files[0].content, "public class Main {}");
  assert.deepEqual((result.result as any).publication.badges, ["Опубліковано автором", "Автотести пройдено"]);
});

test("legacy project profile sets no-store and privacy headers when the profile is unavailable", async t => {
  t.mock.method(AppDataSource, "query", async () => []);
  const result = await request(handler("/profile/:username"), { username: "unknown" });
  assert.equal(result.status, 404);
  assert.deepEqual(result.result, { code: "PROFILE_NOT_FOUND", message: "PROFILE_NOT_FOUND" });
  assertPublicHeaders(result.headers);
});
