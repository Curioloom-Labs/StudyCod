import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { AppDataSource } from "../data-source";
import { portfolioRouter, publicPortfolioRouter } from "./portfolio";

function handler(router: typeof portfolioRouter, path: string, method: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
  return layer.route.stack.at(-1).handle;
}

async function request(
  route: (req: any, res: any) => Promise<unknown>,
  { userId = 42, userType = "USER", userMode = "PERSONAL", params = {}, body = {} } = {},
) {
  let status = 200;
  let result: any;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { status = code; return res; },
    json(data: unknown) { result = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
  };
  await route({ userId, userType, userMode, params, body }, res);
  return { status, result, headers };
}

test("Portfolio dashboard is limited to a Personal user", async t => {
  let reads = 0;
  t.mock.method(AppDataSource, "query", async () => { reads++; return []; });
  const result = await request(handler(portfolioRouter, "/me", "get"), { userMode: "EDUCATIONAL" });
  assert.equal(result.status, 403);
  assert.equal(result.result.code, "PERSONAL_USER_REQUIRED");
  assert.equal(reads, 0);
});

test("private Portfolio preview uses only the owner's public selections and current evidence", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes("SELECT username,avatar_url AS avatarUrl FROM users")) return [{ username: "developer", avatarUrl: "https://cdn.example.test/private.png" }];
    if (sql.includes("FROM portfolio_profiles WHERE owner_id=?")) return [{
      displayName: "Ada", headline: "Backend engineer", specialization: "Java", technologiesJson: '["Java","SQL"]', summary: "Profile preview",
      githubUrl: "https://github.com/ada", websiteUrl: null, shareAvatar: 0, visibility: "PRIVATE", email: "private@example.test",
    }];
    if (sql.includes("FROM portfolio_works w")) return [
      { id: "public-work", title: "Public work", problem: "Selected", solution: "Shown", role: "Author", technologiesJson: '["Java"]', skillIdsJson: '["rest-api"]', repositoryUrl: null, demoUrl: null, sourcePublicId: null, visibility: "PUBLIC" },
      { id: "private-work", title: "Private draft", problem: "Hidden", solution: "Hidden", technologiesJson: '["Rust"]', skillIdsJson: "[]", visibility: "PRIVATE", codeSnapshot: "private code" },
    ];
    if (sql.includes("FROM portfolio_evidence e JOIN grades g")) return [
      { id: "public-judge", sourceGradeId: 741, description: "Accepted work", skillIdsJson: '["binary-search"]', visibility: "PUBLIC", sortOrder: 1, updatedAt: "2026-10-28T10:00:00.000Z", taskTitle: "Binary search", language: "JAVA", judgeVerdict: "AC", testsPassed: 6, testsTotal: 6, submittedAt: "2026-10-28T09:00:00.000Z" },
      { id: "private-judge", sourceGradeId: 742, description: "Private evidence", skillIdsJson: '["java"]', visibility: "PRIVATE", sortOrder: 0, updatedAt: "2026-10-28T11:00:00.000Z", taskTitle: "Private task", language: "JAVA", judgeVerdict: "AC", testsPassed: 4, testsTotal: 4, submittedAt: "2026-10-28T09:30:00.000Z" },
    ];
    if (sql.includes("FROM portfolio_sourced_evidence WHERE")) return [{
      id: "public-course", sourceType: "LEARNING_COURSE", sourceKey: "course-1",
      sourceSnapshotJson: JSON.stringify({ title: "Java Foundations", sourceLabel: "StudyCod Learn · course completion", detail: "Course completion recorded by StudyCod.", verifiedAt: "2026-10-27T10:00:00.000Z" }),
      description: "Completed the Java course.", skillIdsJson: '["java"]', visibility: "PUBLIC", sortOrder: 0, updatedAt: "2026-10-27T10:00:00.000Z",
    }];
    if (sql.includes("FROM user_course_enrollments")) return [{ sourceKey: "course-1", title: "Java Foundations", verifiedAt: "2026-10-27T10:00:00.000Z" }];
    return [];
  });

  const result = await request(handler(portfolioRouter, "/preview", "get"));
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(result.result.profile.username, "developer");
  assert.equal(result.result.profile.avatarUrl, null, "the account photo stays hidden until the owner opts in");
  assert.deepEqual(result.result.profile.technologies, ["Java", "SQL"]);
  assert.deepEqual(result.result.works.map((item: { id: string }) => item.id), ["public-work"]);
  assert.deepEqual(result.result.evidence.map((item: { id: string }) => item.id), ["public-course", "public-judge"]);
  assert.equal(result.result.evidence[0].sourceTitle, "Java Foundations");
  assert.equal(result.result.evidence[1].judgeVerdict, "AC");
  assert.doesNotMatch(JSON.stringify(result.result), /private@example\.test|private-work|Private draft|private-judge|Private evidence|private code|visibility|sourceKey|sourceGradeId|shareAvatar/);
  assert.ok(queries.some(query => query.sql.includes("WHERE id=? AND user_mode='PERSONAL'") && query.values?.[0] === 42));
  assert.ok(queries.filter(query => query.values?.includes(42)).every(query => query.values?.every(value => value === 42) || query.sql.includes("source_key")));
});

test("Portfolio dashboard returns age data only in the authenticated owner response", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("SELECT username,avatar_url AS avatarUrl,birth_day")) return [{ username: "developer", avatarUrl: null, birthDay: 12, birthMonth: 4, birthYear: 1998 }];
    return [];
  });
  const result = await request(handler(portfolioRouter, "/me", "get"));
  assert.equal(result.status, 200);
  assert.equal(result.result.birthDate, "1998-04-12");
  assert.equal(result.result.publicSharingAgeStatus, "ADULT");
  assert.equal(result.result.profile.birthDate, undefined);
});

test("Portfolio preview is unavailable to EDU users without reading account data", async t => {
  let reads = 0;
  t.mock.method(AppDataSource, "query", async () => { reads++; return []; });
  const result = await request(handler(portfolioRouter, "/preview", "get"), { userMode: "EDUCATIONAL" });
  assert.equal(result.status, 403);
  assert.equal(result.result.code, "PERSONAL_USER_REQUIRED");
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(reads, 0);
});

test("Portfolio profile writes accept HTTPS links and store the authenticated owner", async t => {
  let inserted: unknown[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    if (sql.startsWith("INSERT INTO portfolio_profiles")) inserted = values ?? [];
    return [{ displayName: "Ada", headline: "Backend developer", specialization: "Java", technologiesJson: '["Java","Spring"]', summary: "Builds APIs", githubUrl: "https://github.com/dev", websiteUrl: null, shareAvatar: 1, visibility: "PRIVATE" }];
  });
  const body = {
    displayName: "Ada", headline: "Backend developer", specialization: "Java", technologies: ["Java", " Spring ", "Java"], summary: "Builds APIs",
    githubUrl: "https://github.com/dev", websiteUrl: "", shareAvatar: true, visibility: "PRIVATE",
  };
  const result = await request(handler(portfolioRouter, "/me", "put"), { body });
  assert.equal(result.status, 200);
  assert.equal(inserted[0], 42);
  assert.equal(inserted[1], "Ada");
  assert.equal(inserted[5], "https://github.com/dev");
  assert.equal(inserted[6], null);
  assert.equal(inserted[8], '["Java","Spring"]');
  assert.equal(inserted[9], 1);
  assert.deepEqual(result.result.profile.technologies, ["Java", "Spring"]);
  assert.equal(result.result.profile.shareAvatar, true);
});

test("private birth date updates only the authenticated Personal user's age fields", async t => {
  let statement = "";
  let values: unknown[] | undefined;
  t.mock.method(AppDataSource, "query", async (sql: string, params?: unknown[]) => {
    statement = sql;
    values = params;
    return { affectedRows: 0 };
  });
  const result = await request(handler(portfolioRouter, "/me/birth-date", "put"), { body: { birthDate: "2000-02-29" } });
  assert.equal(result.status, 200);
  assert.deepEqual(values, [29, 2, 2000, 42]);
  assert.match(statement, /UPDATE users SET birth_day=\?,birth_month=\?,birth_year=\? WHERE id=\? AND user_mode='PERSONAL'/);
  assert.equal(result.result.birthDate, "2000-02-29");
  assert.equal(result.result.publicSharingAgeStatus, "ADULT");
});

test("removing the Portfolio birth year preserves existing birthday day and month", async t => {
  let statement = "";
  let values: unknown[] | undefined;
  t.mock.method(AppDataSource, "query", async (sql: string, params?: unknown[]) => {
    statement = sql;
    values = params;
    return { affectedRows: 1 };
  });
  const result = await request(handler(portfolioRouter, "/me/birth-date", "delete"));
  assert.equal(result.status, 200);
  assert.match(statement, /UPDATE users SET birth_year=NULL WHERE id=\? AND user_mode='PERSONAL'/);
  assert.deepEqual(values, [42]);
  assert.deepEqual(result.result, { birthDate: null, publicSharingAgeStatus: "UNKNOWN" });
});

test("EDU users cannot remove a Personal Portfolio birth year", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async () => { writes++; return { affectedRows: 1 }; });
  const result = await request(handler(portfolioRouter, "/me/birth-date", "delete"), { userMode: "EDUCATIONAL" });
  assert.equal(result.status, 403);
  assert.equal(result.result.code, "PERSONAL_USER_REQUIRED");
  assert.equal(writes, 0);
});

test("private birth date update rejects invalid and future dates without writing", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async () => { writes++; return { affectedRows: 1 }; });
  for (const birthDate of ["2001-02-29", "9999-01-01", "not-a-date"]) {
    const result = await request(handler(portfolioRouter, "/me/birth-date", "put"), { body: { birthDate } });
    assert.equal(result.status, 400);
    assert.equal(result.result.code, "INVALID_PRIVATE_BIRTH_DATE");
  }
  assert.equal(writes, 0);
});

test("profile sharing requires an adult date and remains available to an adult owner", async t => {
  let birthRow: Record<string, unknown> | null = null;
  let profileWrites = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.startsWith("SELECT birth_day AS birthDay")) return birthRow ? [birthRow] : [];
    if (sql.startsWith("INSERT INTO portfolio_profiles")) profileWrites++;
    return [];
  });
  const body = {
    displayName: "Ada", headline: "Developer", specialization: "", technologies: [], summary: "",
    githubUrl: "", websiteUrl: "", shareAvatar: false, visibility: "PUBLIC",
  };
  for (const row of [null, { birthDay: 28, birthMonth: 10, birthYear: 2010 }]) {
    birthRow = row;
    const result = await request(handler(portfolioRouter, "/me", "put"), { body });
    assert.equal(result.status, 403);
    assert.equal(result.result.code, "PUBLIC_SHARING_REQUIRES_ADULT_AGE");
  }
  assert.equal(profileWrites, 0);
  birthRow = { birthDay: 1, birthMonth: 1, birthYear: 1990 };
  const adultResult = await request(handler(portfolioRouter, "/me", "put"), { body });
  assert.equal(adultResult.status, 200);
  assert.equal(profileWrites, 1);
});

test("all Portfolio public write surfaces fail closed for an underage owner", async t => {
  const nonAgeQueries: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.startsWith("SELECT birth_day AS birthDay")) return [{ birthDay: 29, birthMonth: 10, birthYear: 2010 }];
    nonAgeQueries.push(sql);
    return { affectedRows: 1 };
  });
  const publicWork = {
    title: "Work", problem: "", solution: "", role: "", technologies: [], skillIds: [],
    repositoryUrl: "", demoUrl: "", visibility: "PUBLIC",
  };
  const cases = [
    [handler(portfolioRouter, "/works", "post"), { body: publicWork }],
    [handler(portfolioRouter, "/evidence", "post"), { body: { sourceGradeId: 1, description: "", skillIds: [], visibility: "PUBLIC" } }],
    [handler(portfolioRouter, "/evidence/sourced", "post"), { body: { sourceType: "LEARNING_COURSE", sourceKey: "course", description: "", skillIds: [], visibility: "PUBLIC" } }],
    [handler(portfolioRouter, "/evidence/:evidenceId", "patch"), { params: { evidenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, body: { description: "", skillIds: [], visibility: "PUBLIC" } }],
    [handler(portfolioRouter, "/evidence-packs", "post"), { body: { title: "Share", specialization: "", includeProfile: false, workIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], evidenceIds: [], skillIds: [], expiresInDays: 7 } }],
  ] as const;
  for (const [route, options] of cases) {
    const result = await request(route, options);
    assert.equal(result.status, 403);
    assert.equal(result.result.code, "PUBLIC_SHARING_REQUIRES_ADULT_AGE");
  }
  assert.deepEqual(nonAgeQueries, [], "no public material should be read, updated, or created after the age check fails");
});

test("Portfolio profile rejects executable, non-HTTPS, and credential-bearing links", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async () => { writes++; return []; });
  for (const { githubUrl, websiteUrl } of [
    { githubUrl: "javascript:alert(1)", websiteUrl: "" },
    { githubUrl: "", websiteUrl: "http://example.test" },
    { githubUrl: "https://user:secret@github.com/", websiteUrl: "" },
  ]) {
    const result = await request(handler(portfolioRouter, "/me", "put"), {
      body: { displayName: "", headline: "", specialization: "", summary: "", githubUrl, websiteUrl, visibility: "PUBLIC" },
    });
    assert.equal(result.status, 400);
    assert.equal(result.result.code, "INVALID_PORTFOLIO_PROFILE");
  }
  assert.equal(writes, 0);
});

test("Portfolio work rejects unsafe repository and demo URLs before writing", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async () => { writes++; return []; });
  for (const { repositoryUrl, demoUrl } of [
    { repositoryUrl: "javascript:alert(1)", demoUrl: "" },
    { repositoryUrl: "", demoUrl: "http://demo.example.test" },
    { repositoryUrl: "https://user:secret@github.com/", demoUrl: "" },
  ]) {
    const result = await request(handler(portfolioRouter, "/works", "post"), {
      body: {
        title: "External work", problem: "", solution: "", role: "Author", technologies: [], skillIds: [],
        repositoryUrl, demoUrl, visibility: "PUBLIC",
      },
    });
    assert.equal(result.status, 400);
    assert.equal(result.result.code, "INVALID_PORTFOLIO_WORK");
  }
  assert.equal(writes, 0);
});

test("Portfolio cannot attach another user's or revoked publication", async t => {
  let inserted = false;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM growth_project_publications")) return [];
    if (sql.startsWith("INSERT INTO portfolio_works")) inserted = true;
    return [];
  });
  const result = await request(handler(portfolioRouter, "/works", "post"), {
    body: {
      title: "Work", problem: "Problem", solution: "Solution", role: "Author", technologies: ["Java"], skillIds: [],
      repositoryUrl: "", demoUrl: "", visibility: "PRIVATE", sourcePublicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "PORTFOLIO_SOURCE_NOT_FOUND");
  assert.equal(inserted, false);
});

test("public Portfolio returns only public owner-selected work and excludes private profile fields", async t => {
  const queries: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push(sql);
    if (sql.includes("FROM portfolio_profiles")) return [{
      ownerId: 42, username: "developer", displayName: "Ada Lovelace",
      birthDay: 1, birthMonth: 1, birthYear: 1990,
      headline: "Backend developer", specialization: "Java", technologiesJson: '["Java","Spring"]', summary: "Selected work only",
      githubUrl: "https://github.com/developer", websiteUrl: null, email: "private@example.com", shareAvatar: 1, avatarUrl: "https://cdn.example.test/ada.png",
    }];
    if (sql.includes("FROM portfolio_evidence")) {
      assert.deepEqual(values, [42, 42]);
      return [];
    }
    if (sql.includes("FROM portfolio_sourced_evidence")) return [];
    if (sql.includes("FROM user_course_enrollments") || sql.includes("FROM growth_project_publications")
      || sql.includes("FROM growth_interviews") || sql.includes("FROM contest_participants")) return [];
    assert.deepEqual(values, [42]);
    return [{ id: "work-1", title: "Public API", problem: "Public problem", solution: "Public solution", role: "Author", technologiesJson: '["Java","SQL"]', skillIdsJson: '["rest-api","sql"]', repositoryUrl: "https://github.com/developer/api", demoUrl: null, sourcePublicId: null }];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "developer" } });
  assert.equal(result.status, 200);
  assert.equal(result.result.profile.displayName, "Ada Lovelace");
  assert.deepEqual(result.result.profile.technologies, ["Java", "Spring"]);
  assert.equal(result.result.profile.avatarUrl, "https://cdn.example.test/ada.png");
  assert.deepEqual(result.result.works[0].technologies, ["Java", "SQL"]);
  assert.deepEqual(result.result.works[0].skillIds, ["rest-api", "sql"]);
  assert.doesNotMatch(JSON.stringify(result.result), /private@example.com|source_publication_id/);
  assert.doesNotMatch(JSON.stringify(result.result), /birthDate|birthDay|birthMonth|birthYear/);
  assert.match(queries[0], /p\.visibility='PUBLIC'/);
  assert.match(queries[1], /w\.visibility='PUBLIC'/);
  assert.match(queries[1], /w\.archived_at IS NULL/);
});

test("public Portfolio does not reveal a private profile or query its materials", async t => {
  let reads = 0;
  t.mock.method(AppDataSource, "query", async () => { reads++; return []; });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "private-user" } });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "PORTFOLIO_NOT_FOUND");
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(reads, 1);
});

test("public Portfolio hides profiles for underage or unknown-age owners before loading materials", async t => {
  let birthYear: number | null = null;
  const queries: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM portfolio_profiles")) return [{
      ownerId: 42, username: "developer", displayName: "Ada", birthDay: 1, birthMonth: 1, birthYear,
    }];
    return [];
  });
  for (const nextBirthYear of [2010, null]) {
    birthYear = nextBirthYear;
    const queryCountBefore = queries.length;
    const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "developer" } });
    assert.equal(result.status, 404);
    assert.equal(result.result.code, "PORTFOLIO_NOT_FOUND");
    assert.equal(queries.length, queryCountBefore + 1, "public work and evidence must not be queried for an ineligible owner");
  }
});

test("public Portfolio filters unsafe account-photo URLs even after the owner opts in", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM portfolio_profiles")) return [{
      ownerId: 42, username: "developer", displayName: "Ada", birthDay: 1, birthMonth: 1, birthYear: 1990, shareAvatar: 1, avatarUrl: "javascript:alert(1)",
    }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "developer" } });
  assert.equal(result.status, 200);
  assert.equal(result.result.profile.avatarUrl, null);
});

test("public Portfolio keeps the account photo private until profile sharing is enabled", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM portfolio_profiles")) return [{
      ownerId: 42, username: "developer", displayName: "Ada", birthDay: 1, birthMonth: 1, birthYear: 1990, shareAvatar: 0, avatarUrl: "https://cdn.example.test/ada.png",
    }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "developer" } });
  assert.equal(result.status, 200);
  assert.equal(result.result.profile.avatarUrl, null);
});

test("Portfolio work rejects skills outside the server taxonomy", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async () => { writes += 1; return []; });
  const result = await request(handler(portfolioRouter, "/works", "post"), {
    body: {
      title: "Work", problem: "", solution: "", role: "", technologies: [], skillIds: ["rest-api", "invented"],
      repositoryUrl: "", demoUrl: "", visibility: "PRIVATE",
    },
  });
  assert.equal(result.status, 400);
  assert.equal(result.result.code, "INVALID_PORTFOLIO_WORK");
  assert.equal(writes, 0);
});

test("Portfolio work accepts and persists Judge language skills", async t => {
  let insertValues: unknown[] | undefined;
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    if (sql.startsWith("INSERT INTO portfolio_works")) insertValues = values;
    return { affectedRows: 1 };
  });
  const result = await request(handler(portfolioRouter, "/works", "post"), {
    body: {
      title: "Multi-language project", problem: "Problem", solution: "Solution", role: "Author",
      technologies: ["Rust", "JavaScript"], skillIds: ["rust", "js", "java-language"],
      repositoryUrl: "https://github.com/developer/multi-language", demoUrl: "", visibility: "PRIVATE",
    },
  });
  assert.equal(result.status, 201);
  assert.deepEqual(JSON.parse(String(insertValues?.[7])), ["rust", "js", "java-language"]);
});

test("Portfolio work rejects duplicate skill labels", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async () => { writes += 1; return []; });
  const result = await request(handler(portfolioRouter, "/works", "post"), {
    body: {
      title: "Work", problem: "", solution: "", role: "", technologies: [], skillIds: ["rest-api", "rest-api"],
      repositoryUrl: "", demoUrl: "", visibility: "PRIVATE",
    },
  });
  assert.equal(result.status, 400);
  assert.equal(result.result.code, "INVALID_PORTFOLIO_WORK");
  assert.equal(writes, 0);
});

test("reordering is atomic and only accepts the authenticated owner's complete work list", async t => {
  const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const trace: string[] = [];
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, release: async () => {},
    commitTransaction: async () => { trace.push("commit"); },
    rollbackTransaction: async () => { trace.push("rollback"); },
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT w.id FROM portfolio_works")) return [{ id: idA }, { id: idB }];
      if (sql.startsWith("UPDATE portfolio_works")) { trace.push(`update:${String(values[1])}:${String(values[0])}`); return { affectedRows: 1 }; }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const route = handler(portfolioRouter, "/works/order", "put");
  const result = await request(route, { body: { ids: [idB, idA] } });
  assert.equal(result.status, 200);
  assert.deepEqual(trace, [`update:${idB}:0`, `update:${idA}:1`, "commit"]);
});

test("evidence ordering spans both Judge and source-linked evidence for the authenticated owner", async t => {
  const gradeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sourcedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const trace: string[] = [];
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, release: async () => {},
    commitTransaction: async () => { trace.push("commit"); },
    rollbackTransaction: async () => { trace.push("rollback"); },
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM portfolio_evidence WHERE owner_id")) return [{ id: gradeId }];
      if (sql.includes("FROM portfolio_sourced_evidence WHERE owner_id")) return [{ id: sourcedId }];
      if (sql.startsWith("UPDATE portfolio_evidence")) { trace.push(`grade:${String(values[0])}:${String(values[1])}`); return { affectedRows: 1 }; }
      if (sql.startsWith("UPDATE portfolio_sourced_evidence")) { trace.push(`sourced:${String(values[0])}:${String(values[1])}`); return { affectedRows: 1 }; }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const result = await request(handler(portfolioRouter, "/evidence/order", "put"), { body: { ids: [sourcedId, gradeId] } });
  assert.equal(result.status, 200);
  assert.deepEqual(trace, [`grade:${gradeId}:1`, `sourced:${sourcedId}:0`, "commit"]);
});

test("evidence ordering rejects incomplete or foreign item lists without writes", async t => {
  const gradeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const trace: string[] = [];
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, release: async () => {},
    commitTransaction: async () => { trace.push("commit"); },
    rollbackTransaction: async () => { trace.push("rollback"); },
    query: async (sql: string) => {
      if (sql.includes("FROM portfolio_evidence WHERE owner_id")) return [{ id: gradeId }];
      if (sql.includes("FROM portfolio_sourced_evidence WHERE owner_id")) return [];
      if (sql.startsWith("UPDATE ")) { trace.push("write"); return { affectedRows: 1 }; }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const result = await request(handler(portfolioRouter, "/evidence/order", "put"), {
    body: { ids: [gradeId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] },
  });
  assert.equal(result.status, 409);
  assert.equal(result.result.code, "PORTFOLIO_EVIDENCE_ORDER_CONFLICT");
  assert.deepEqual(trace, ["rollback"]);
});

test("Skill Evidence requires an owned accepted Judge grade with every test passed", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes("FROM grades g JOIN tasks t") && sql.includes("g.id=?")) return [];
    return [];
  });
  const result = await request(handler(portfolioRouter, "/evidence", "post"), {
    body: { sourceGradeId: 991, description: "Solved it", skillIds: ["algorithms"], visibility: "PRIVATE" },
  });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "ELIGIBLE_EVIDENCE_SOURCE_NOT_FOUND");
  assert.deepEqual(queries[0].values, [991, 42]);
  assert.match(queries[0].sql, /g\.verification_method='ONLINE_JUDGE'/);
  assert.match(queries[0].sql, /g\.judge_verdict='AC'/);
  assert.match(queries[0].sql, /g\.tests_total>0 AND g\.tests_passed=g\.tests_total/);
  assert.match(queries[0].sql, /t\.user_id=g\.user_id/);
});

test("Skill Evidence stores only owner-selected context, never a client-provided verdict", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.startsWith("SELECT birth_day AS birthDay")) return [{ birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.includes("FROM grades g JOIN tasks t") && sql.includes("g.id=?")) return [{ id: 992 }];
    if (sql.includes("SELECT id,archived_at AS archivedAt FROM portfolio_evidence")) return [];
    return { affectedRows: 1 };
  });
  const result = await request(handler(portfolioRouter, "/evidence", "post"), {
    body: { sourceGradeId: 992, description: "Uses a linear scan", skillIds: ["algorithms", "problem-solving"], visibility: "PUBLIC", judgeVerdict: "WA", testsPassed: 0 },
  });
  assert.equal(result.status, 201);
  const insert = queries.find(query => query.sql.startsWith("INSERT INTO portfolio_evidence"));
  assert.deepEqual(insert?.values?.slice(1), [42, 992, "Uses a linear scan", '["algorithms","problem-solving"]', "PUBLIC", 0]);
  assert.doesNotMatch(JSON.stringify(insert?.values), /WA|testsPassed/);
});

test("public Portfolio exposes only selected Judge metadata and never code", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM portfolio_profiles")) return [{ ownerId: 42, username: "developer", displayName: "Ada", birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.includes("FROM portfolio_works")) return [];
    if (sql.includes("FROM portfolio_evidence")) return [{
      id: "evidence-1", description: "Separates lookup from sorting", skillIdsJson: '["algorithms"]',
      taskTitle: "Sort values", language: "JAVA", judgeVerdict: "AC", testsPassed: 6, testsTotal: 6,
      submittedAt: "2026-10-28T10:00:00.000Z", codeSnapshot: "must not be returned",
    }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "developer" } });
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.deepEqual(result.result.evidence[0], {
    id: "evidence-1", description: "Separates lookup from sorting", skillIds: ["algorithms"],
    sourceType: "ONLINE_JUDGE", sourceTitle: "Sort values", sourceLabel: "StudyCod Online Judge · accepted solution", sourceDetail: "6/6 tests passed",
    taskTitle: "Sort values", language: "JAVA", verificationMethod: "ONLINE_JUDGE", judgeVerdict: "AC",
    testsPassed: 6, testsTotal: 6, submittedAt: "2026-10-28T10:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(result.result), /codeSnapshot|must not be returned/);
});

test("Skill Evidence can cite a completed Personal Learn course without trusting client metadata", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.startsWith("SELECT birth_day AS birthDay")) return [{ birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.includes("FROM user_course_enrollments")) return [{ sourceKey: "17", title: "Java Core", verifiedAt: "2026-10-01T10:00:00.000Z" }];
    if (sql.includes("SELECT id,archived_at AS archivedAt FROM portfolio_sourced_evidence")) return [];
    if (sql.startsWith("INSERT INTO portfolio_sourced_evidence")) return { affectedRows: 1 };
    return [];
  });
  const result = await request(handler(portfolioRouter, "/evidence/sourced", "post"), {
    body: {
      sourceType: "LEARNING_COURSE", sourceKey: "17", description: "Completed the course.",
      skillIds: ["java", "oop"], visibility: "PUBLIC", title: "Forged result", score: 100,
    },
  });
  assert.equal(result.status, 201);
  const insert = queries.find(query => query.sql.startsWith("INSERT INTO portfolio_sourced_evidence"));
  assert.equal(insert?.values?.[1], 42);
  assert.equal(insert?.values?.[2], "LEARNING_COURSE");
  assert.equal(insert?.values?.[3], "17");
  const snapshot = JSON.parse(String(insert?.values?.[4]));
  assert.equal(snapshot.title, "Java Core");
  assert.equal(snapshot.sourceLabel, "StudyCod Learn · course completion");
  assert.doesNotMatch(String(insert?.values?.[4]), /Forged result|100/);
});

test("sourced Skill Evidence rejects a source not eligible for the authenticated owner", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.startsWith("INSERT INTO portfolio_sourced_evidence")) writes += 1;
    return [];
  });
  const result = await request(handler(portfolioRouter, "/evidence/sourced", "post"), {
    body: { sourceType: "ASSESSMENT_FEEDBACK", sourceKey: "not-owned", description: "", skillIds: [], visibility: "PRIVATE" },
  });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "ELIGIBLE_EVIDENCE_SOURCE_NOT_FOUND");
  assert.equal(writes, 0);
});

test("public Portfolio rechecks and exposes only selected metadata for released Assess feedback", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM portfolio_profiles")) return [{ ownerId: 42, username: "developer", displayName: "Ada", birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.includes("FROM portfolio_works")) return [];
    if (sql.includes("FROM portfolio_evidence")) return [{
      id: "judge-1", description: "Solved a binary search task.", skillIdsJson: '["binary-search"]', sortOrder: 2,
      updatedAt: "2026-10-28T12:00:00.000Z", taskTitle: "Binary search", language: "JAVA", judgeVerdict: "AC",
      testsPassed: 6, testsTotal: 6, submittedAt: "2026-10-28T10:00:00.000Z",
    }];
    if (sql.includes("FROM portfolio_sourced_evidence WHERE")) return [{
      id: "sourced-1", sourceType: "ASSESSMENT_FEEDBACK", sourceKey: "interview-1",
      sourceSnapshotJson: JSON.stringify({ title: "Backend interview", sourceLabel: "StudyCod Assess · released interview feedback", detail: "1 interviewer released feedback to the candidate.", verifiedAt: "2026-10-28T10:00:00.000Z" }),
      description: "Discussed tradeoffs in API design.", skillIdsJson: '["rest-api"]', visibility: "PUBLIC", sortOrder: 1, updatedAt: "2026-10-28T10:00:00.000Z",
    }];
    if (sql.includes("FROM growth_interviews")) return [{ sourceKey: "interview-1", title: "Backend interview", verifiedAt: "2026-10-28T10:00:00.000Z", reviewerCount: 1 }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/u/:username", "get"), { params: { username: "developer" } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.result.evidence[0], {
    id: "sourced-1", sourceType: "ASSESSMENT_FEEDBACK", sourceTitle: "Backend interview",
    sourceLabel: "StudyCod Assess · released interview feedback", sourceDetail: "1 interviewer released feedback to the candidate.",
    verifiedAt: "2026-10-28T10:00:00.000Z", description: "Discussed tradeoffs in API design.", skillIds: ["rest-api"],
  });
  assert.equal(result.result.evidence[1].id, "judge-1", "public evidence must follow the owner's order across source types");
  assert.doesNotMatch(JSON.stringify(result.result), /sortOrder|updatedAt/);
  assert.doesNotMatch(JSON.stringify(result.result), /interview-1|privateText|released_json|reviewerCount/);
});

test("Evidence Pack shares only selected source-linked evidence and strips source internals", async t => {
  const token = "A".repeat(43);
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const judgeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM portfolio_evidence_packs")) return [{
      id: "pack-1", ownerId: 42, title: "Java Backend", specialization: "Backend", includeProfile: 0,
      birthDay: 1, birthMonth: 1, birthYear: 1990,
      workIdsJson: "[]", evidenceIdsJson: JSON.stringify([id, judgeId]), skillIdsJson: '["java","unknown-skill"]', expiresAt: "2026-10-30T10:00:00.000Z", username: "developer",
    }];
    if (sql.startsWith("SELECT e.id FROM portfolio_evidence e JOIN grades")) return [{ id: judgeId }];
    if (sql.includes("FROM portfolio_evidence e JOIN grades")) return [{
      id: judgeId, description: "Accepted Java solution.", skillIdsJson: '["java"]', sortOrder: 2,
      updatedAt: "2026-10-01T11:00:00.000Z", taskTitle: "Array lookup", language: "JAVA",
      judgeVerdict: "AC", testsPassed: 5, testsTotal: 5, submittedAt: "2026-10-01T10:00:00.000Z",
    }];
    if (sql.includes("FROM portfolio_sourced_evidence WHERE")) return [{
      id, sourceType: "LEARNING_COURSE", sourceKey: "17",
      sourceSnapshotJson: JSON.stringify({ title: "Java Core", sourceLabel: "StudyCod Learn · course completion", detail: "Course completion recorded by StudyCod.", verifiedAt: "2026-10-01T10:00:00.000Z", codeSnapshot: "private source internals" }),
      description: "Completed Java Core.", skillIdsJson: '["java"]', visibility: "PRIVATE", sortOrder: 0, updatedAt: "2026-10-01T10:00:00.000Z",
    }];
    if (sql.includes("FROM user_course_enrollments")) return [{ sourceKey: "17", title: "Java Core", verifiedAt: "2026-10-01T10:00:00.000Z" }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/p/:token", "get"), { params: { token } });
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.deepEqual(result.result.skillIds, ["java"]);
  assert.deepEqual(result.result.competencies.map((skill: { id: string }) => skill.id), ["java"], "the viewer receives only valid competencies explicitly selected for this pack");
  assert.deepEqual(result.result.evidence.map((item: { id: string }) => item.id), [id, judgeId], "an Evidence Pack must preserve the owner's cross-source evidence order");
  assert.deepEqual(result.result.evidence[0], {
    id, sourceType: "LEARNING_COURSE", sourceTitle: "Java Core", sourceLabel: "StudyCod Learn · course completion",
    sourceDetail: "Course completion recorded by StudyCod.", verifiedAt: "2026-10-01T10:00:00.000Z",
    description: "Completed Java Core.", skillIds: ["java"],
  });
  assert.doesNotMatch(JSON.stringify(result.result), /sourceKey|codeSnapshot|private source internals|visibility/);
  assert.doesNotMatch(JSON.stringify(result.result), /birthDate|birthDay|birthMonth|birthYear/);
});

test("Evidence Pack stores a hash, selected owner IDs, and a bounded expiry", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.startsWith("SELECT birth_day AS birthDay")) return [{ birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.startsWith("SELECT id FROM portfolio_works")) return [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];
    if (sql.includes("SELECT e.id FROM portfolio_evidence")) return [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }];
    return { affectedRows: 1 };
  });
  const result = await request(handler(portfolioRouter, "/evidence-packs", "post"), {
    body: {
      title: "Internship review", specialization: "Java backend", includeProfile: true, expiresInDays: 7, skillIds: ["java", "sql"],
      workIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], evidenceIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    },
  });
  assert.equal(result.status, 201);
  assert.match(result.result.token, /^[A-Za-z0-9_-]{43}$/);
  const insert = queries.find(query => query.sql.startsWith("INSERT INTO portfolio_evidence_packs"));
  assert.ok(insert);
  assert.equal(insert.values?.[1], 42);
  assert.equal(insert.values?.[2], createHash("sha256").update(result.result.token).digest("hex"));
  assert.notEqual(insert.values?.[2], result.result.token);
  assert.deepEqual(insert.values?.slice(4, 8), ["Java backend", 1, '["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]', '["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]']);
  assert.equal(new Date(insert.values?.[8] as Date).getTime() - Date.now() < 8 * 24 * 60 * 60 * 1000, true);
  assert.equal(insert.values?.[9], '["java","sql"]', "selected competencies must be persisted with the capability grant");
});

test("Evidence Pack management returns only known saved competency IDs", async t => {
  t.mock.method(AppDataSource, "query", async () => [{
    id: "pack-1", title: "Java API", specialization: "Backend", includeProfile: 0,
    workIdsJson: "[]", evidenceIdsJson: "[]", skillIdsJson: '["java","unknown"]',
    expiresAt: "2026-11-04T00:00:00.000Z", revokedAt: null, createdAt: "2026-10-28T00:00:00.000Z",
  }]);
  const result = await request(handler(portfolioRouter, "/evidence-packs", "get"));
  assert.equal(result.status, 200);
  assert.deepEqual(result.result.packs[0].skillIds, ["java"]);
});

test("Evidence Pack remains compatible with clients that omit competency IDs", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.startsWith("SELECT birth_day AS birthDay")) return [{ birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.startsWith("SELECT id FROM portfolio_works")) return [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];
    return { affectedRows: 1 };
  });
  const result = await request(handler(portfolioRouter, "/evidence-packs", "post"), {
    body: {
      title: "Existing client pack", specialization: "Backend", includeProfile: false,
      workIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], evidenceIds: [], expiresInDays: 7,
    },
  });
  assert.equal(result.status, 201);
  const insert = queries.find(query => query.sql.startsWith("INSERT INTO portfolio_evidence_packs"));
  assert.ok(insert);
  assert.equal(insert.values?.[9], "[]", "an omitted optional field must persist as an empty competency selection");
});

test("Evidence Pack rejects unknown or duplicate competencies", async () => {
  for (const skillIds of [["unknown"], ["java", "java"]]) {
    const result = await request(handler(portfolioRouter, "/evidence-packs", "post"), {
      body: { title: "Share", specialization: "", includeProfile: false, workIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], evidenceIds: [], skillIds, expiresInDays: 7 },
    });
    assert.equal(result.status, 400);
    assert.equal(result.result.code, "INVALID_EVIDENCE_PACK");
  }
});

test("Evidence Pack cannot include another owner's work", async t => {
  let inserts = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.startsWith("SELECT birth_day AS birthDay")) return [{ birthDay: 1, birthMonth: 1, birthYear: 1990 }];
    if (sql.startsWith("SELECT id FROM portfolio_works")) return [];
    if (sql.startsWith("INSERT INTO portfolio_evidence_packs")) inserts++;
    return { affectedRows: 1 };
  });
  const result = await request(handler(portfolioRouter, "/evidence-packs", "post"), {
      body: { title: "Share", specialization: "", includeProfile: false, expiresInDays: 7, workIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], evidenceIds: [], skillIds: [] },
  });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "EVIDENCE_PACK_ITEM_NOT_FOUND");
  assert.equal(inserts, 0);
});

test("Evidence Pack share page exposes only granted, still-active work metadata", async t => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const token = "a".repeat(43);
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes("FROM portfolio_evidence_packs p JOIN users")) return [{
      id: "pack-1", ownerId: 42, title: "Selected work", specialization: "Java backend", includeProfile: 0,
      birthDay: 1, birthMonth: 1, birthYear: 1990,
      workIdsJson: '["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]', evidenceIdsJson: "[]", skillIdsJson: '["sql"]',
      expiresAt: "2026-11-04T00:00:00.000Z", username: "developer",
    }];
    if (sql.includes("FROM portfolio_works w")) return [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Selected private work", problem: "Only this was selected",
      solution: "Scoped result", role: "Author", technologiesJson: '["Java"]', repositoryUrl: null,
      demoUrl: null, sourcePublicId: null, codeSnapshot: "must not be returned",
    }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/p/:token", "get"), { params: { token } });
  assert.equal(result.status, 200);
  assert.equal(queries[0].values?.[0], createHash("sha256").update(token).digest("hex"));
  assert.match(queries[0].sql, /p\.revoked_at IS NULL AND p\.expires_at>UTC_TIMESTAMP\(3\)/);
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(result.headers["X-Robots-Tag"], "noindex, nofollow, noarchive");
  assert.equal(result.result.profile, null);
  assert.equal(result.result.specialization, "Java backend");
  assert.equal(result.result.works.length, 1);
  assert.equal(result.result.works[0].title, "Selected private work");
  assert.doesNotMatch(JSON.stringify(result.result), /codeSnapshot|must not be returned/);
  assert.match(queries[1].sql, /w\.owner_id=\? AND w\.archived_at IS NULL AND w\.id IN/);
  assert.equal(queries.some(query => query.sql.includes("FROM portfolio_profiles")), false, "a pack that excludes the profile must not load profile details");
});

test("Evidence Pack link is indistinguishable from a missing link for an underage owner", async t => {
  const token = "d".repeat(43);
  let detailReads = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM portfolio_evidence_packs p JOIN users")) return [{
      id: "pack-underage", ownerId: 42, title: "Private", specialization: "", includeProfile: 0,
      workIdsJson: "[]", evidenceIdsJson: "[]", username: "learner", birthDay: 1, birthMonth: 1, birthYear: 2010,
    }];
    detailReads++;
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/p/:token", "get"), { params: { token } });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "EVIDENCE_PACK_NOT_FOUND");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(detailReads, 0);
});

test("Evidence Pack includes profile technologies only when profile sharing is selected", async t => {
  const token = "c".repeat(43);
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM portfolio_evidence_packs p JOIN users")) return [{
      id: "pack-profile", ownerId: 42, title: "Selected stack", specialization: "Backend", includeProfile: 1,
      birthDay: 1, birthMonth: 1, birthYear: 1990,
      workIdsJson: "[]", evidenceIdsJson: "[]", expiresAt: "2026-11-04T00:00:00.000Z", username: "developer",
    }];
    if (sql.includes("FROM portfolio_profiles")) return [{
      displayName: "Ada", headline: "Backend developer", specialization: "Backend",
      technologiesJson: '["Java","Spring","SQL"]', summary: "Selected profile",
      githubUrl: "https://github.com/ada", websiteUrl: null, shareAvatar: 1, avatarUrl: "https://cdn.example.test/ada.png",
    }];
    return [];
  });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/p/:token", "get"), { params: { token } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.result.profile.technologies, ["Java", "Spring", "SQL"]);
  assert.equal(result.result.profile.displayName, "Ada");
  assert.equal(result.result.profile.avatarUrl, "https://cdn.example.test/ada.png");
});

test("revoked or expired Evidence Pack tokens are indistinguishable from missing links", async t => {
  const token = "B".repeat(43);
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, values?: unknown[]) => { queries.push({ sql, values }); return []; });
  const result = await request(handler(publicPortfolioRouter as typeof portfolioRouter, "/p/:token", "get"), { params: { token } });
  assert.equal(result.status, 404);
  assert.equal(result.result.code, "EVIDENCE_PACK_NOT_FOUND");
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(result.headers["X-Robots-Tag"], "noindex, nofollow, noarchive");
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [createHash("sha256").update(token).digest("hex")]);
  assert.match(queries[0].sql, /p\.revoked_at IS NULL AND p\.expires_at>UTC_TIMESTAMP\(3\)/);
});

test("Evidence Pack revocation is restricted to the authenticated owner", async t => {
  let statement = "";
  let values: unknown[] | undefined;
  t.mock.method(AppDataSource, "query", async (sql: string, params?: unknown[]) => {
    statement = sql;
    values = params;
    return { affectedRows: 1 };
  });
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const result = await request(handler(portfolioRouter, "/evidence-packs/:packId", "delete"), { params: { packId: id } });
  assert.equal(result.status, 200);
  assert.equal(result.result.revoked, true);
  assert.deepEqual(values, [id, 42]);
  assert.match(statement, /WHERE id=\? AND owner_id=\? AND revoked_at IS NULL/);
});
