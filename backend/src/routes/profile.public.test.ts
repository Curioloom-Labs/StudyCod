import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { ContestParticipant } from "../entities/ContestParticipant";
import { ContestSubmission } from "../entities/ContestSubmission";
import { LibraryTaskAttempt } from "../entities/LibraryTaskAttempt";
import { User } from "../entities/User";
import { profileRouter } from "./profile";

function publicProfileHandler() {
  const layer = profileRouter.stack.find((entry: any) => entry.route?.path === "/public/:username" && entry.route.methods.get) as any;
  assert.ok(layer, "GET /public/:username is registered");
  return layer.route.stack.at(-1).handle;
}

function userRepository(user: Partial<User>) {
  const builder: any = {
    where() { return builder; },
    andWhere() { return builder; },
    async getOne() { return user; },
  };
  return { createQueryBuilder: () => builder };
}

async function request(route: (req: any, res: any) => Promise<unknown>) {
  let status = 200;
  let result: any;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { status = code; return res; },
    json(data: unknown) { result = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
  };
  await route({ params: { username: "learner" } }, res);
  return { status, result, headers };
}

function publicUser(overrides: Partial<User> = {}): Partial<User> {
  return {
    id: 52,
    username: "learner",
    userMode: "PERSONAL",
    timezone: null,
    avatarUrl: "https://cdn.example.test/learner.png",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    iadPython: 0.7,
    birthDay: null,
    birthMonth: null,
    birthYear: null,
    ...overrides,
  };
}

test("public Personal profile keeps learning data private by default when age is unknown", async t => {
  const user = publicUser();
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    assert.equal(entity, User, "private public-profile fields must not be queried");
    return userRepository(user);
  });

  const result = await request(publicProfileHandler());
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store, private");
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.equal(result.result.username, "learner");
  assert.equal(result.result.avatarUrl, null);
  assert.deepEqual(result.result.privacy, {
    showContestStats: false,
    showSolvedHistory: false,
    showLanguageBreakdown: false,
  });
  assert.equal(result.result.avatarUrl, null);
  assert.equal(result.result.iad, null);
  assert.equal(result.result.difus, null);
  assert.equal(result.result.stats.solvedTotal, null);
  assert.deepEqual(result.result.stats.badgesUnlocked, []);
  assert.deepEqual(result.result.recentSolved, []);
  assert.deepEqual(result.result.contestHandles, {
    codeforces: null,
    atcoder: null,
    leetcode: null,
    codechef: null,
  });
  assert.doesNotMatch(JSON.stringify(result.result), /birthDay|birthMonth|birthYear/);
});

test("adult public Personal profile remains private until sharing preferences are saved", async t => {
  const user = publicUser({
    birthDay: 1,
    birthMonth: 1,
    birthYear: 1990,
  });
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    assert.equal(entity, User, "default-private profile must not read learning activity");
    return userRepository(user);
  });

  const result = await request(publicProfileHandler());
  assert.equal(result.status, 200);
  assert.deepEqual(result.result.privacy, {
    showContestStats: false,
    showSolvedHistory: false,
    showLanguageBreakdown: false,
  });
  assert.equal(result.result.stats.solvedTotal, null);
  assert.deepEqual(result.result.stats.badgesUnlocked, []);
  assert.deepEqual(result.result.recentSolved, []);
});

test("public Personal profile overrides saved sharing preferences for a minor", async t => {
  const user = publicUser({
    timezone: "pp:c=1;h=1;l=1",
    birthDay: 1,
    birthMonth: 1,
    birthYear: 2012,
  });
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    assert.equal(entity, User, "age protection must run before activity repositories are read");
    return userRepository(user);
  });

  const result = await request(publicProfileHandler());
  assert.equal(result.status, 200);
  assert.deepEqual(result.result.privacy, {
    showContestStats: false,
    showSolvedHistory: false,
    showLanguageBreakdown: false,
  });
  assert.equal(result.result.stats.solvedTotal, null);
  assert.deepEqual(result.result.stats.solvedByLang, { JAVA: 0, PYTHON: 0, CPP: 0 });
  assert.deepEqual(result.result.stats.badgesUnlocked, []);
});

test("adult public Personal profile returns only learning fields explicitly enabled", async t => {
  const user = publicUser({
    timezone: "pp:c=1;h=1;l=1",
    birthDay: 1,
    birthMonth: 1,
    birthYear: 1990,
    cfHandle: "learner_cf",
  });
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === User) return userRepository(user);
    if (entity === LibraryTaskAttempt) {
      return {
        createQueryBuilder() {
          let recent = false;
          const builder: any = {};
          for (const method of ["innerJoin", "select", "addSelect", "where", "andWhere", "groupBy", "orderBy"]) {
            builder[method] = () => builder;
          }
          builder.limit = () => { recent = true; return builder; };
          builder.getRawMany = async () => recent
            ? [{ id: 7, title: "Binary search", problemCode: "BS-1", slug: "binary-search", lang: "JAVA", lastScore: 100, lastTestsPassed: 6, lastTestsTotal: 6, lastCheckedAt: "2026-10-27T10:00:00.000Z" }]
            : [{ lang: "JAVA", solved: 2 }];
          return builder;
        },
      };
    }
    if (entity === ContestParticipant) {
      return { createQueryBuilder: () => ({ where() { return this; }, async getCount() { return 3; } }) };
    }
    if (entity === ContestSubmission) {
      const builder: any = {
        innerJoin() { return builder; }, select() { return builder; }, addSelect() { return builder; }, where() { return builder; },
        async getRawOne() { return { total: 5, accepted: 2 }; },
      };
      return { createQueryBuilder: () => builder };
    }
    throw new Error(`Unexpected repository ${String(entity)}`);
  });

  const result = await request(publicProfileHandler());
  assert.equal(result.status, 200);
  assert.deepEqual(result.result.privacy, {
    showContestStats: true,
    showSolvedHistory: true,
    showLanguageBreakdown: true,
  });
  assert.equal(result.result.stats.solvedTotal, 2);
  assert.deepEqual(result.result.stats.solvedByLang, { JAVA: 2, PYTHON: 0, CPP: 0 });
  assert.deepEqual(result.result.stats.badgesUnlocked, [1]);
  assert.equal(result.result.recentSolved[0].title, "Binary search");
  assert.equal(result.result.stats.contestsJoined, 3);
  assert.equal(result.result.stats.contestAcceptedLike, 2);
  assert.equal(result.result.contestHandles.codeforces, "learner_cf");
  assert.doesNotMatch(JSON.stringify(result.result), /birthDay|birthMonth|birthYear/);
});
