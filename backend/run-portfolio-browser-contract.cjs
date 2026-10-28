// Deterministic Portfolio UI contract. API calls are fixture-backed; no database is changed.
// BROWSER_CONTRACT_BASE_URL=http://127.0.0.1:5187 node run-portfolio-browser-contract.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const origin = process.env.BROWSER_CONTRACT_BASE_URL;
if (!origin) throw new Error("BROWSER_CONTRACT_BASE_URL is required");

const username = "ada.dev";
const accountAvatarUrl = "data:image/png;base64,iVBORw0KGgo=";
const evidenceSource = {
  sourceType: "ONLINE_JUDGE",
  sourceKey: "741",
  title: "Java Binary Search",
  sourceLabel: "StudyCod Online Judge · accepted solution",
  detail: "6/6 tests passed",
  gradeId: 741,
  taskTitle: "Binary search",
  language: "JAVA",
  testsPassed: 6,
  testsTotal: 6,
  submittedAt: "2026-10-28T10:00:00.000Z",
  verifiedAt: "2026-10-28T10:00:00.000Z",
};
const secondEvidenceSource = {
  ...evidenceSource,
  sourceKey: "742",
  title: "Java Collections",
  sourceLabel: "StudyCod Online Judge · accepted solution",
  detail: "4/4 tests passed",
  gradeId: 742,
  taskTitle: "Collection lookup",
  testsPassed: 4,
  testsTotal: 4,
  submittedAt: "2026-10-27T10:00:00.000Z",
  verifiedAt: "2026-10-27T10:00:00.000Z",
};
const skills = [{
  id: "binary-search",
  categoryId: "algorithms",
  categoryUk: "Алгоритми та структури даних",
  categoryEn: "Algorithms & data structures",
  labelUk: "Бінарний пошук",
  labelEn: "Binary search",
}, {
  id: "rust",
  categoryId: "languages",
  categoryUk: "Мови програмування",
  categoryEn: "Programming languages",
  labelUk: "Rust",
  labelEn: "Rust",
}];
let profile = { displayName: "", headline: "", specialization: "", technologies: [], summary: "", githubUrl: null, websiteUrl: null, shareAvatar: false, visibility: "PRIVATE" };
let birthDate = null;
let publicSharingAgeStatus = "UNKNOWN";
let legacyPublicProfileAdult = false;
let works = [];
let evidence = [];
let pack = null;
let failLegacyDiscovery = true;
const unexpected = [];
const pageErrors = [];
let packResponseData = null;

function dashboard() {
  return {
    username,
    avatarUrl: accountAvatarUrl,
    birthDate,
    publicSharingAgeStatus,
    profile,
    works,
    availablePublications: [],
    evidence,
    evidenceSources: [evidenceSource, secondEvidenceSource].filter(source => !evidence.some(item => item.sourceKey === source.sourceKey)),
    sourcedEvidenceSources: [],
    evidencePacks: pack ? [{
      id: pack.id,
      title: pack.title,
      specialization: pack.specialization,
      includeProfile: pack.includeProfile,
      workCount: pack.workIds.length,
      evidenceCount: pack.evidenceIds.length,
      skillIds: pack.skillIds,
      expiresAt: pack.expiresAt,
      revokedAt: pack.revokedAt,
      createdAt: "2026-10-28T10:00:00.000Z",
    }] : [],
    skills,
  };
}

function publicWork(item) {
  return {
    id: item.id,
    title: item.title,
    problem: item.problem,
    solution: item.solution,
    role: item.role,
    technologies: item.technologies,
    skillIds: item.skillIds,
    repositoryUrl: item.repositoryUrl,
    demoUrl: item.demoUrl,
    sourcePublicId: null,
  };
}

function publicEvidence(item) {
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceTitle: item.sourceTitle,
    sourceLabel: item.sourceLabel,
    sourceDetail: item.sourceDetail,
    description: item.description,
    skillIds: item.skillIds,
    taskTitle: item.taskTitle,
    language: item.language,
    verificationMethod: "ONLINE_JUDGE",
    judgeVerdict: "AC",
    testsPassed: item.testsPassed,
    testsTotal: item.testsTotal,
    submittedAt: item.submittedAt,
    verifiedAt: item.verifiedAt,
  };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CONTRACT_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_CONTRACT_EXECUTABLE_PATH } : {}),
    ...(process.env.BROWSER_CONTRACT_CHANNEL ? { channel: process.env.BROWSER_CONTRACT_CHANNEL } : {}),
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem("studycod_language", "uk");
      localStorage.setItem("studycod_theme", "light");
    });
    await context.route(url => url.pathname.startsWith("/api/"), async route => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;
      const p = pathname.slice(4);
      const method = request.method();
      const body = request.postDataJSON?.() ?? {};
      let data = {};
      let status = 200;

      if (method === "OPTIONS") data = {};
      else if (p === `/profile/public/${username}`) data = legacyPublicProfileAdult ? {
        id: 42,
        username,
        avatarUrl: accountAvatarUrl,
        lang: "PYTHON",
        difus: 0.74,
        joinedAt: "2024-06-01T00:00:00.000Z",
        contestHandles: { codeforces: "ada_cf", atcoder: null, leetcode: null, codechef: null },
        privacy: { showContestStats: true, showSolvedHistory: true, showLanguageBreakdown: true },
        stats: {
          solvedTotal: 1,
          solvedByLang: { JAVA: 1, PYTHON: 0, CPP: 0 },
          badgesUnlocked: [1],
          contestsJoined: 2,
          contestSubmissionsTotal: 3,
          contestAcceptedLike: 1,
        },
        recentSolved: [{ id: 1, title: "Binary search private fixture", problemCode: "BS-1", slug: "binary-search", lang: "JAVA", lastScore: 100, lastTestsPassed: 6, lastTestsTotal: 6, lastCheckedAt: "2026-10-27T10:00:00.000Z" }],
      } : {
        id: 42,
        username,
        avatarUrl: null,
        lang: "PYTHON",
        difus: null,
        joinedAt: "2024-06-01T00:00:00.000Z",
        contestHandles: { codeforces: null, atcoder: null, leetcode: null, codechef: null },
        privacy: { showContestStats: false, showSolvedHistory: false, showLanguageBreakdown: false },
        stats: {
          solvedTotal: null,
          solvedByLang: { JAVA: 0, PYTHON: 0, CPP: 0 },
          badgesUnlocked: [],
          contestsJoined: null,
          contestSubmissionsTotal: null,
          contestAcceptedLike: null,
        },
        recentSolved: [],
      }
      else if (p === `/project-portfolio/profile/${username}`) data = { projects: [] };
      else if (p === "/profile/me") data = { id: 42, username, userMode: "PERSONAL", role: "USER", activeRuntime: "JAVA", placementDone: true };
      else if (p === "/auth/maintenance") data = { maintenance: false };
      else if (p === "/geo") data = { geoBlocked: false, country: "UA" };
      else if (p === "/notifications/unread-count") data = { unread: 0 };
      else if (p === "/learning/me") data = { currentEnrollmentId: null, current: null, enrollments: [] };
      else if (p === "/csrf-token") data = { csrfToken: "portfolio-browser-contract" };
      else if (p === "/portfolio/projects/catalog") data = { families: [] };
      else if (p === "/portfolio/projects") data = { projects: [] };
      else if (p === "/portfolio/projects/legacy" && method === "GET") {
        if (failLegacyDiscovery) {
          status = 503;
          data = { code: "LEGACY_DISCOVERY_UNAVAILABLE", message: "LEGACY_DISCOVERY_UNAVAILABLE" };
        } else data = { projects: [] };
      }
      else if (p === "/portfolio/projects/reviews/inbox") data = { reviews: [] };
      else if (p === "/portfolio/projects/admin/review-requests") data = { requests: [] };
      else if (p === "/portfolio/projects/admin/reviewers") data = { reviewers: [] };
      else if (p === "/portfolio/me" && method === "GET") data = dashboard();
      else if (p === "/portfolio/me" && method === "PUT") { profile = { ...profile, ...body }; data = { profile }; }
      else if (p === "/portfolio/me/birth-date" && method === "PUT") {
        birthDate = body.birthDate;
        publicSharingAgeStatus = "ADULT";
        data = { birthDate, publicSharingAgeStatus };
      }
      else if (p === "/portfolio/me/birth-date" && method === "DELETE") {
        birthDate = null;
        publicSharingAgeStatus = "UNKNOWN";
        data = { birthDate, publicSharingAgeStatus };
      }
      else if (p === "/portfolio/preview" && method === "GET") data = {
        profile: { ...profile, username, displayName: profile.displayName || username, avatarUrl: profile.shareAvatar ? accountAvatarUrl : null },
        works: works.filter(item => item.visibility === "PUBLIC").map(publicWork),
        evidence: evidence.filter(item => item.visibility === "PUBLIC").map(publicEvidence),
        skills,
      };
      else if (p === "/portfolio/works" && method === "POST") {
        const id = `work-${works.length + 1}`;
        works.push({ id, ...body, sourcePublicId: null, sortOrder: works.length, createdAt: "2026-10-28T10:00:00.000Z", updatedAt: "2026-10-28T10:00:00.000Z" });
        data = { id };
      }
      else if (p === "/portfolio/evidence" && method === "POST") {
        const source = [evidenceSource, secondEvidenceSource].find(item => item.gradeId === body.sourceGradeId);
        assert.ok(source, "the UI must submit the selected owner's Judge grade ID");
        const id = `evidence-${evidence.length + 1}`;
        evidence.push({
          id,
          sourceGradeId: source.gradeId,
          sourceKey: source.sourceKey,
          sourceType: source.sourceType,
          sourceTitle: source.title,
          sourceLabel: source.sourceLabel,
          sourceDetail: source.detail,
          description: body.description,
          skillIds: body.skillIds,
          visibility: body.visibility,
          taskTitle: source.taskTitle,
          language: source.language,
          verificationMethod: "ONLINE_JUDGE",
          judgeVerdict: "AC",
          testsPassed: source.testsPassed,
          testsTotal: source.testsTotal,
          submittedAt: source.submittedAt,
          verifiedAt: source.verifiedAt,
        });
        data = { id };
      }
      else if (p === "/portfolio/evidence/order" && method === "PUT") {
        assert.deepEqual(body.ids, ["evidence-2", "evidence-1"], "the owner must be able to reorder mixed Judge evidence");
        evidence = body.ids.map(id => evidence.find(item => item.id === id));
        data = { updated: true };
      }
      else if (p === "/portfolio/evidence-packs" && method === "POST") {
        pack = {
          id: "pack-1",
          token: "portfolio-contract-token",
          title: body.title,
          specialization: body.specialization,
          includeProfile: body.includeProfile,
          workIds: body.workIds,
          evidenceIds: body.evidenceIds,
          skillIds: body.skillIds,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          revokedAt: null,
        };
        assert.deepEqual(pack.workIds, ["work-1"], "the owner must be able to select only one of several works");
        assert.deepEqual(pack.evidenceIds, ["evidence-1"]);
        assert.deepEqual(pack.skillIds, ["binary-search"], "the owner must choose pack competencies explicitly");
        assert.equal(pack.includeProfile, false, "profile sharing must stay opt-in");
        data = { id: pack.id, token: pack.token, expiresAt: pack.expiresAt };
      }
      else if (p === "/portfolio/evidence-packs/pack-1" && method === "DELETE") {
        if (pack) pack.revokedAt = new Date().toISOString();
        data = { revoked: true };
      }
      else if (p === "/portfolio-public/p/portfolio-contract-token" && method === "GET") {
        if (!pack || pack.revokedAt || new Date(pack.expiresAt).getTime() <= Date.now()) {
          status = 404;
          data = { error: "Evidence Pack not found" };
        } else {
          data = {
            title: pack.title,
            specialization: pack.specialization,
            skillIds: pack.skillIds,
            competencies: skills.filter(skill => pack.skillIds.includes(skill.id)),
            expiresAt: pack.expiresAt,
            profile: null,
            works: works.filter(item => pack.workIds.includes(item.id)).map(publicWork),
            evidence: evidence.filter(item => pack.evidenceIds.includes(item.id)).map(publicEvidence),
            skills,
          };
          packResponseData = data;
        }
      }
      else if (p === `/portfolio-public/u/${username}` && method === "GET") {
        if (profile.visibility !== "PUBLIC" || publicSharingAgeStatus !== "ADULT") {
          status = 404;
          data = { error: "Portfolio not found" };
        } else {
          data = {
            profile: { ...profile, username, avatarUrl: profile.shareAvatar ? accountAvatarUrl : null },
            works: works.filter(item => item.visibility === "PUBLIC").map(publicWork),
            evidence: evidence.filter(item => item.visibility === "PUBLIC").map(publicEvidence),
            skills,
          };
        }
      }
      else {
        unexpected.push(`${method} ${pathname}`);
        status = 404;
        data = { code: "UNEXPECTED_FIXTURE" };
      }

      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => pageErrors.push(error.message));
    const base = origin.replace(/\/+$/, "");

    const privacyPage = await context.newPage();
    privacyPage.setDefaultTimeout(15000);
    privacyPage.on("pageerror", error => pageErrors.push(error.message));
    await privacyPage.goto(`${base}/privacy`);
    await privacyPage.getByText("Для публічного Personal Portfolio та посилань Evidence Pack", { exact: false }).waitFor();
    await privacyPage.getByRole("button", { name: "Перемкнути на англійську" }).click();
    await privacyPage.getByRole("heading", { name: "Children and educational accounts" }).waitFor();
    await privacyPage.getByText("For public Personal Portfolios and Evidence Pack links", { exact: false }).waitFor();

    const legacyPublicPage = await context.newPage();
    legacyPublicPage.setDefaultTimeout(15000);
    legacyPublicPage.on("pageerror", error => pageErrors.push(error.message));
    const privateLearningProfileResponse = legacyPublicPage.waitForResponse(response => response.url().includes(`/api/profile/public/${username}`));
    await legacyPublicPage.goto(`${base}/u/${encodeURIComponent(username)}`);
    assert.equal((await privateLearningProfileResponse).status(), 200);
    await legacyPublicPage.getByRole("heading", { name: username }).waitFor();
    assert.equal(await legacyPublicPage.getByText("Binary search private fixture", { exact: true }).count(), 0, "unset age and sharing preferences must not expose solved history");
    assert.equal(await legacyPublicPage.locator("main").getByText(/ada_cf/).count(), 0, "unset age must not expose a linked contest profile");
    assert.equal(await legacyPublicPage.locator("main img").count(), 0, "unknown age must not expose the account photo");
    assert.equal(await legacyPublicPage.getByText("IAD", { exact: false }).count(), 0, "unset age must not expose the learning score");

    legacyPublicProfileAdult = true;
    const optedInLearningProfileResponse = legacyPublicPage.waitForResponse(response => response.url().includes(`/api/profile/public/${username}`));
    await legacyPublicPage.reload();
    assert.equal((await optedInLearningProfileResponse).status(), 200);
    await legacyPublicPage.getByText("Binary search private fixture", { exact: true }).waitFor();
    assert.equal(await legacyPublicPage.locator("main").getByText(/ada_cf/).count(), 1, "an adult opt-in should reveal only the selected contest profile");
    assert.equal(await legacyPublicPage.locator("main img").count(), 1, "adult profile retains its existing avatar behavior");

    await page.goto(`${base}/projects?source=compat#workbench`);
    await page.waitForURL(url => url.pathname === "/portfolio/projects");
    assert.equal(new URL(page.url()).search, "?source=compat", "the legacy workbench redirect should preserve its query");
    assert.equal(new URL(page.url()).hash, "#workbench", "the legacy workbench redirect should preserve its hash");
    await page.getByRole("heading", { name: "Створюй корисні проєкти крок за кроком" }).waitFor();
    await page.getByRole("button", { name: "Попередні роботи" }).click();
    await page.getByRole("heading", { name: "Додай попередню роботу" }).waitFor();
    await page.getByRole("alert").getByText("LEGACY_DISCOVERY_UNAVAILABLE").waitFor();
    await page.getByRole("button", { name: "Обрати проєкт" }).click();
    await page.getByRole("heading", { name: "Обери напрям проєкту" }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0, "optional legacy discovery failure must not block the Portfolio workbench");
    failLegacyDiscovery = false;
    await page.getByRole("button", { name: "Попередні роботи" }).click();
    await page.getByRole("button", { name: "Спробувати ще" }).click();
    await page.getByText("Попередніх проєктів поки не знайдено.").waitFor();
    assert.equal(await page.getByRole("alert").count(), 0, "retrying legacy discovery should clear the scoped error");

    const legacyReviewPage = await context.newPage();
    legacyReviewPage.setDefaultTimeout(15000);
    legacyReviewPage.on("pageerror", error => pageErrors.push(error.message));
    await legacyReviewPage.goto(`${base}/projects/reviews?source=compat#inbox`);
    await legacyReviewPage.waitForURL(url => url.pathname === "/portfolio/projects/reviews");
    assert.equal(new URL(legacyReviewPage.url()).search, "?source=compat", "the legacy review redirect should preserve its query");
    assert.equal(new URL(legacyReviewPage.url()).hash, "#inbox", "the legacy review redirect should preserve its hash");
    await legacyReviewPage.getByRole("heading", { name: "Черга рецензій" }).waitFor();

    const legacyAdminPage = await context.newPage();
    legacyAdminPage.setDefaultTimeout(15000);
    legacyAdminPage.on("pageerror", error => pageErrors.push(error.message));
    await legacyAdminPage.goto(`${base}/projects/admin/reviews?source=compat#admin`);
    await legacyAdminPage.waitForURL(url => url.pathname === "/portfolio/projects/admin/reviews");
    assert.equal(new URL(legacyAdminPage.url()).search, "?source=compat", "the legacy admin review redirect should preserve its query");
    assert.equal(new URL(legacyAdminPage.url()).hash, "#admin", "the legacy admin review redirect should preserve its hash");
    await legacyAdminPage.getByRole("heading", { name: "Рецензії проєктів" }).waitFor();

    await page.goto(`${base}/portfolio`);
    await page.getByRole("heading", { name: "Твої роботи, твій вибір" }).waitFor();
    assert.equal(await page.getByText("Приватний", { exact: true }).count(), 1, "a new profile should be private");
    assert.equal(await page.getByRole("checkbox", { name: /Показувати фото профілю/ }).isChecked(), false, "account photos must be private until the owner opts in");
    const profileVisibility = page.getByLabel("Видимість профілю");
    assert.equal(await profileVisibility.locator('option[value="PUBLIC"]').evaluate(option => option.disabled), true, "unknown age must disable public sharing in the editor");
    await page.getByLabel("Дата народження для налаштування приватності").fill("1990-04-12");
    await page.getByRole("button", { name: "Зберегти дату", exact: true }).click();
    await page.getByRole("status").getByText("Дату збережено приватно.", { exact: false }).waitFor();
    assert.equal(birthDate, "1990-04-12");
    assert.equal(publicSharingAgeStatus, "ADULT");
    assert.equal(await profileVisibility.locator('option[value="PUBLIC"]').evaluate(option => option.disabled), false, "adult age data should enable owner-controlled public sharing");

    await page.getByLabel("Ім'я або псевдонім", { exact: true }).fill("Ada Lovelace");
    await page.getByLabel("Заголовок", { exact: true }).fill("Java backend developer");
    await page.getByLabel("Про мене", { exact: true }).fill("Building reliable services.");
    await page.locator('input[maxlength="800"]').fill("Java, Spring, SQL");
    await page.getByRole("checkbox", { name: /Показувати фото профілю/ }).check();
    await page.getByRole("button", { name: "Зберегти профіль", exact: true }).click();
    await page.getByRole("status").getByText("Профіль збережено.", { exact: true }).waitFor();

    await page.getByRole("link", { name: "Попередній перегляд" }).click();
    await page.waitForURL(url => url.pathname === "/portfolio/preview");
    await page.getByRole("status").getByText("Приватний попередній перегляд").waitFor();
    await page.getByRole("heading", { name: "Ada Lovelace" }).waitFor();
    assert.equal(await page.getByText("Java", { exact: true }).count(), 1, "the private preview should show profile technologies");
    assert.equal(await page.locator("header img").count(), 1, "the preview should honor the owner's account-photo opt-in");
    await page.goto(`${base}/portfolio`);
    await page.getByRole("heading", { name: "Твої роботи, твій вибір" }).waitFor();
    assert.equal(await page.getByText("Приватний", { exact: true }).count(), 1, "previewing must leave the profile private");

    await page.getByLabel("Видимість профілю").selectOption("PUBLIC");
    await page.getByRole("button", { name: "Зберегти профіль", exact: true }).click();
    await page.getByRole("status").getByText("Профіль збережено.", { exact: true }).waitFor();

    const publicPage = await context.newPage();
    const publicProfileResponse = publicPage.waitForResponse(response => response.url().includes(`/portfolio-public/u/${username}`));
    await publicPage.goto(`${base}/portfolio/u/${username}`);
    assert.equal((await publicProfileResponse).status(), 200);
    assert.equal(await publicPage.getByText("Java", { exact: true }).count(), 1, "the profile technology stack should be visible");
    assert.equal(await publicPage.locator("header img").count(), 1, "the opted-in account photo should be visible");

    await page.getByRole("button", { name: "Додати", exact: true }).first().click();
    await page.getByLabel("Назва", { exact: true }).fill("Java API project");
    await page.getByLabel("Проблема", { exact: true }).fill("Handle paged catalog requests.");
    await page.getByLabel("Рішення", { exact: true }).fill("Added a bounded query service.");
    await page.getByLabel("Технології через кому", { exact: true }).fill("Java, SQL");
    const workSkillGroup = page.getByRole("group", { name: "Навички, які демонструє робота" });
    await workSkillGroup.getByLabel("Rust", { exact: true }).check();
    await page.getByRole("button", { name: "Зберегти роботу", exact: true }).click();
    await page.getByRole("heading", { name: "Java API project" }).waitFor();
    assert.deepEqual(works[0].skillIds, ["rust"], "the editor must submit and retain Judge language tags");
    await page.locator("article").filter({ hasText: "Java API project" }).getByText("Rust", { exact: true }).waitFor();

    await page.getByRole("button", { name: "Додати", exact: true }).first().click();
    await page.getByLabel("Назва", { exact: true }).fill("Secret draft");
    await page.getByLabel("Проблема", { exact: true }).fill("Unshared work.");
    await page.getByRole("button", { name: "Зберегти роботу", exact: true }).click();
    await page.getByRole("heading", { name: "Secret draft" }).waitFor();

    await page.getByRole("button", { name: "Додати свідчення", exact: true }).click();
    const evidenceSourceSelect = page.locator('section[aria-labelledby="portfolio-evidence-form-title"] select').first();
    await evidenceSourceSelect.waitFor();
    await evidenceSourceSelect.selectOption("ONLINE_JUDGE:741");
    await page.getByLabel("Що це показує?", { exact: true }).fill("A verified accepted solution.");
    await page.getByRole("group", { name: "Навички для цієї картки" }).getByLabel("Бінарний пошук", { exact: true }).check();
    await page.getByRole("button", { name: "Зберегти свідчення", exact: true }).click();
    await page.getByRole("heading", { name: "Java Binary Search", exact: true }).waitFor();
    try {
      await page.locator("article").filter({ hasText: "Java Binary Search" }).getByText("6/6 тестів пройдено", { exact: true }).waitFor();
    } catch (error) {
      console.error("Portfolio evidence card text:", (await page.locator("body").innerText()).slice(-2400));
      throw error;
    }

    await page.getByRole("button", { name: "Додати свідчення", exact: true }).click();
    await page.locator('section[aria-labelledby="portfolio-evidence-form-title"] select').first().selectOption("ONLINE_JUDGE:742");
    await page.getByLabel("Що це показує?", { exact: true }).fill("Used a collection lookup.");
    await page.getByRole("button", { name: "Зберегти свідчення", exact: true }).click();
    await page.getByRole("heading", { name: "Java Collections", exact: true }).waitFor();
    await page.getByRole("button", { name: "Перемістити свідчення Java Collections вгору", exact: true }).click();

    await page.getByLabel("Назва пакета", { exact: true }).fill("Java application pack");
    await page.getByLabel("Спеціалізація", { exact: true }).last().fill("Java Backend");
    const worksGroup = page.getByRole("group", { name: "Вибрати роботи" });
    const selectedWork = worksGroup.locator("label").filter({ hasText: "Java API project" }).locator('input[type="checkbox"]');
    assert.equal(await selectedWork.isChecked(), false, "metadata suggestions must not preselect work");
    await selectedWork.check();
    const evidenceGroup = page.getByRole("group", { name: "Вибрати свідчення навичок" });
    const selectedEvidence = evidenceGroup.locator("label").filter({ hasText: "Java Binary Search" }).locator('input[type="checkbox"]');
    assert.equal(await selectedEvidence.isChecked(), false, "metadata suggestions must not preselect evidence");
    await selectedEvidence.check();
    const competencyGroup = page.getByRole("group", { name: "Вибрати компетенції" });
    await competencyGroup.locator("label").filter({ hasText: "Бінарний пошук" }).locator('input[type="checkbox"]').check();
    assert.equal(await evidenceGroup.locator("label").filter({ hasText: "Java Binary Search" }).getByText("Рекомендовано", { exact: true }).count(), 1, "skill metadata should produce a transparent suggestion");
    const createPackButton = page.getByRole("button", { name: "Створити посилання", exact: true });
    assert.equal(await createPackButton.isDisabled(), true, "publishing must wait until the recipient preview is opened");
    await page.getByRole("button", { name: "Переглянути пакет", exact: true }).click();
    await page.getByRole("heading", { name: "Компетенції цього пакета", exact: true }).waitFor();
    assert.equal(await page.getByText("Бінарний пошук", { exact: true }).count() > 0, true, "the preview should show chosen competencies");
    assert.equal(await createPackButton.isDisabled(), false);
    await createPackButton.click();
    const shareLink = page.locator('input[readonly]').last();
    await shareLink.waitFor();
    assert.match(await shareLink.inputValue(), /\/portfolio\/p\/portfolio-contract-token$/);

    const packPage = await context.newPage();
    packPage.setDefaultTimeout(15000);
    packPage.on("pageerror", error => pageErrors.push(error.message));
    await packPage.goto(`${base}/portfolio/p/portfolio-contract-token`);
    await packPage.getByRole("heading", { name: "Java application pack" }).waitFor();
    await packPage.getByRole("heading", { name: "Компетенції", exact: true }).waitFor();
    assert.equal(await packPage.getByText("Бінарний пошук", { exact: true }).count() > 0, true, "the employer view should show the selected pack competencies");
    assert.equal(await packPage.locator('meta[name="referrer"]').getAttribute("content"), "no-referrer", "share tokens must not escape in referrer headers");
    assert.equal(await packPage.getByRole("heading", { name: "Java API project" }).count(), 1);
    assert.equal(await packPage.getByText("Secret draft", { exact: true }).count(), 0, "the pack must not expose unselected work");
    assert.equal(await packPage.getByText("ada.dev", { exact: true }).count(), 0, "the pack must not expose the profile when not selected");
    assert.equal("sourceKey" in packResponseData.evidence[0], false);
    assert.equal("sourceGradeId" in packResponseData.evidence[0], false);
    assert.equal("codeSnapshot" in packResponseData.evidence[0], false);

    await page.getByRole("button", { name: "Відкликати", exact: true }).click();
    await page.getByRole("status").getByText("Доступ за посиланням відкликано.", { exact: true }).waitFor();
    const revokedRead = packPage.waitForResponse(response => response.url().includes("/portfolio-public/p/portfolio-contract-token"));
    await packPage.reload();
    assert.equal((await revokedRead).status(), 404, "a revoked share link must stop serving its contents");
    assert.equal(await packPage.getByRole("heading", { name: "Java application pack" }).count(), 0);

    evidence.find(item => item.id === "evidence-1").visibility = "PUBLIC";
    evidence.push({
      id: "evidence-course", sourceType: "LEARNING_COURSE", sourceTitle: "Python foundations",
      sourceLabel: "StudyCod Learn · course completion", sourceDetail: "Course completion recorded by StudyCod.",
      description: "Completed the foundations course.", skillIds: ["python"], visibility: "PUBLIC",
      verifiedAt: "2026-10-26T10:00:00.000Z",
    }, {
      id: "evidence-contest", sourceType: "COMPETITION_RESULT", sourceTitle: "Autumn algorithms cup",
      sourceLabel: "Competition · official result", sourceDetail: "2 problems accepted during the official contest window.",
      description: "", skillIds: ["algorithms"], visibility: "PUBLIC", verifiedAt: "2026-10-25T10:00:00.000Z",
    });
    const achievementProfileResponse = publicPage.waitForResponse(response => response.url().includes(`/portfolio-public/u/${username}`));
    await publicPage.reload();
    assert.equal((await achievementProfileResponse).status(), 200);
    const achievementSection = publicPage.getByRole("region", { name: "Досягнення" });
    await achievementSection.getByRole("heading", { name: "Python foundations" }).waitFor();
    await achievementSection.getByRole("heading", { name: "Autumn algorithms cup" }).waitFor();
    const skillEvidenceSection = publicPage.getByRole("region", { name: "Свідчення навичок" });
    assert.equal(await skillEvidenceSection.getByRole("heading", { name: "Java Binary Search" }).count(), 1);
    assert.equal(await skillEvidenceSection.getByRole("heading", { name: "Python foundations" }).count(), 0, "course records belong in Achievements, not Skill Evidence");

    await page.getByLabel("Видимість профілю").selectOption("PRIVATE");
    await page.getByRole("checkbox", { name: /Показувати фото профілю/ }).uncheck();
    await page.getByRole("button", { name: "Зберегти профіль", exact: true }).click();
    await page.getByRole("status").getByText("Профіль збережено.", { exact: true }).waitFor();
    const privateProfileResponse = publicPage.waitForResponse(response => response.url().includes(`/portfolio-public/u/${username}`));
    await publicPage.reload();
    assert.equal((await privateProfileResponse).status(), 404, "a profile changed back to private must not be public");

    await page.getByLabel("Видимість профілю").selectOption("PUBLIC");
    await page.getByRole("button", { name: "Зберегти профіль", exact: true }).click();
    await page.getByRole("status").getByText("Профіль збережено.", { exact: true }).waitFor();
    const adultProfileResponse = publicPage.waitForResponse(response => response.url().includes(`/portfolio-public/u/${username}`));
    await publicPage.reload();
    assert.equal((await adultProfileResponse).status(), 200, "an adult owner can restore public visibility before removing the year");

    await page.getByRole("button", { name: "Прибрати рік", exact: true }).click();
    await page.getByRole("status").getByText(/Рік прибрано/).waitFor();
    assert.equal(birthDate, null);
    assert.equal(publicSharingAgeStatus, "UNKNOWN");
    assert.equal(await page.getByLabel("Видимість профілю").locator('option[value="PUBLIC"]').evaluate(option => option.disabled), true, "removing the year must disable public sharing");
    const unknownAgeProfileResponse = publicPage.waitForResponse(response => response.url().includes(`/portfolio-public/u/${username}`));
    await publicPage.reload();
    assert.equal((await unknownAgeProfileResponse).status(), 404, "removing the year must immediately disable public profile reads");

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpected, []);
    console.log("PORTFOLIO UI CONTRACT PASS: bilingual age-gate privacy disclosure; removing the stored year preserves the day/month and fails closed for public reads; legacy Project workbench/review/admin-review redirects preserve query and hash; previous-work discovery failures stay scoped and retryable; private preview before publishing, private-by-default profile, work creation, Judge language tags, separate learning/competition achievements, owner-selected Judge evidence and ordering, manual pack selection, code-free selected pack, private profile sharing opt-in, and revocation.");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
