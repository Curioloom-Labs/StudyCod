// Deterministic UI contract. Every API request is intercepted; no production data is changed.
// BROWSER_CONTRACT_BASE_URL=http://127.0.0.1:5187 node run-assess-browser-contract.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const origin = process.env.BROWSER_CONTRACT_BASE_URL;
if (!origin) throw new Error("BROWSER_CONTRACT_BASE_URL is required");
const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const interviewId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const candidateId = 10, hostId = 20;
const kit = { title: "Нормалізація імпорту", kind: "TECHNICAL", runtime: "PYTHON", durationMinutes: 45, agenda: ["Уточнити контракт", "Реалізувати й перевірити", "Обговорити рішення"], prompt: "Виведи унікальні адреси. Ввід: кількість, потім адреси. Вивід: адреси у відсортованому порядку.", questions: ["Як перевіряєш повторний імпорт?"], files: [{ path: "main.py", content: "# starter\n" }], tests: [{ input: "1\na@b\n", output: "a@b\n", hidden: false, group: "public" }, { input: "hidden", output: "secret", hidden: true, group: "hidden" }], quiz: [{ id: "q1", text: "Що робить повторний імпорт без дублікатів?", options: ["Ідемпотентність", "Рекурсія"], correctIndex: 0 }], rubric: ["Розуміння вимог", "Крайові випадки"] };
const publicKit = () => { const { files, tests, quiz, ...rest } = kit; return { ...rest, examples: tests.filter(test => !test.hidden).map(({ input, output }) => ({ input, output })), testCount: tests.length, quiz: quiz.map(({ correctIndex, ...question }) => question) }; };
let state = { status: "SCHEDULED", consented: false, phase: "INTRO", editorUserId: candidateId, revision: 1, files: structuredClone(kit.files) };
const companyMembers = [
  { id: "owner-member", user_id: hostId, username: "olena.hr", role: "OWNER", status: "ACTIVE" },
  { id: "hr-member", user_id: 21, username: "hr.member", role: "HR", status: "ACTIVE" },
  { id: "engineer-member", user_id: 22, username: "engineer.member", role: "ENGINEER", status: "ACTIVE" },
];
let note = null, feedback = [], quizResult = null, job = null, scheduledPayload = null;
const errors = [], heavy = [], lsp = [], unexpected = [];
let savedKit = null;
function session(userId) {
  const staff = userId === hostId;
  return { ...state, ...(staff || state.consented && state.status !== "SCHEDULED" ? {} : { files: undefined }), id: interviewId, companyId, companyName: "Кодова майстерня", assessmentId: "case-1", candidateId, candidateName: "marta.dev", hostId, hostName: "olena.hr", title: "Python-розробник · перша розмова", scheduledAt: "2026-10-27T12:00:00Z", durationMinutes: 45, runtime: "PYTHON", role: staff ? "OWNER" : "CANDIDATE", userId, canHost: staff, canEdit: state.status === "LIVE" && state.editorUserId === userId, canRun: state.status === "LIVE" && (staff || state.editorUserId === userId), mediaEnabled: true, builtInAi: false, documentationAllowed: true, recording: false, kit: publicKit(), participants: [{ id: candidateId, username: "marta.dev", role: "CANDIDATE" }, { id: hostId, username: "olena.hr", role: "OWNER" }] };
}
async function fixture(context, userId) {
  await context.addInitScript(() => { localStorage.setItem("studycod_language", "uk"); localStorage.setItem("studycod_theme", "light"); });
  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()); if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname.slice(4), method = request.method(), body = request.postDataJSON?.() ?? {};
    let data = {}, status = 200;
    if (method === "OPTIONS") data = {};
    else if (p === "/profile/me") data = { id: userId, username: userId === hostId ? "olena.hr" : "marta.dev", userMode: "PERSONAL", role: "USER", activeRuntime: "PYTHON", placementDone: true };
    else if (p === "/auth/maintenance") data = { maintenance: false };
    else if (p === "/geo") data = { geoBlocked: false, country: "UA" };
    else if (p === "/notifications/unread-count") data = { unread: 0 };
    else if (p === "/csrf-token") data = { csrfToken: "assess-browser-contract" };
    else if (p === "/assess/companies") data = { companies: userId === hostId ? [{ id: companyId, name: "Кодова майстерня", role: "OWNER" }] : [], pendingMemberships: [], candidateCases: [] };
    else if (p === `/assess/companies/${companyId}`) data = { company: { id: companyId, name: "Кодова майстерня", role: "OWNER" }, members: companyMembers.map(member => ({ ...member })), assessments: [] };
    else if (method === "PATCH" && p === `/assess/companies/${companyId}/members/hr-member`) {
      const member = companyMembers.find(item => item.id === "hr-member");
      assert.equal(body.role, "ENGINEER"); member.role = body.role;
      data = { membership: { id: member.id, role: member.role, status: member.status } };
    }
    else if (method === "DELETE" && p === `/assess/companies/${companyId}/members/engineer-member`) {
      const member = companyMembers.find(item => item.id === "engineer-member"); member.status = "REVOKED";
      data = { membership: { id: member.id, status: member.status } };
    }
    else if (method === "POST" && p === `/assess/companies/${companyId}/members`) {
      assert.equal(body.username, "engineer.member");
      const member = companyMembers.find(item => item.id === "engineer-member");
      assert.equal(member.status, "REVOKED", "re-invitation should reuse a revoked membership row");
      member.role = body.role; member.status = "PENDING";
      status = 201; data = { membership: { id: member.id, username: member.username, role: member.role, status: member.status } };
    }
    else if (p === "/assess/kits") data = { kits: [{ id: "kit-1", kit, builtIn: true }, ...(savedKit ? [{ id: "kit-rust", kit: savedKit, builtIn: false }] : [])], languages: ["java", "python", "cpp", "rust"] };
    else if (method === "POST" && p === `/assess/companies/${companyId}/kits`) { savedKit = body.kit; status = 201; data = { id: "kit-rust" }; }
    else if (p === "/assess/interviews") data = { interviews: [{ id: interviewId, company_id: companyId, company_name: "Кодова майстерня", title: "Python-розробник · перша розмова", status: state.status, scheduled_at: "2026-10-27T12:00:00Z", duration_minutes: 45, candidate_name: "marta.dev", host_name: "olena.hr", my_role: userId === hostId ? "OWNER" : "CANDIDATE", consent_status: state.consented ? "ACCEPTED" : "INVITED" }] };
    else if (p === `/assess/companies/${companyId}/interviews`) { scheduledPayload = body; status = 201; data = { id: interviewId }; }
    else if (p === `/assess/interviews/${interviewId}`) data = { interview: session(userId), ownNote: userId === hostId ? note : null, feedback, quizResult, executions: job ? [job] : [] };
    else if (p.endsWith("/state")) { const value = session(userId); if (Number(url.searchParams.get("revision")) === state.revision) delete value.files; data = { interview: value, messages: [], execution: job }; }
    else if (p.endsWith("/respond")) { state.consented = true; data = { accepted: true }; }
    else if (p.endsWith("/start")) { assert.equal(state.consented, true); state.status = "LIVE"; data = { status: "LIVE" }; }
    else if (p.endsWith("/draft")) {
      if (body.expectedRevision !== state.revision) { status = 409; data = { code: "DRAFT_REVISION_CONFLICT" }; }
      else { assert.equal(state.editorUserId, userId); state.files = body.files; state.revision++; data = { revision: state.revision }; }
    }
    else if (p.endsWith("/control")) { assert.equal(body.expectedRevision, state.revision); state.editorUserId = body.editorUserId; }
    else if (p.endsWith("/executions")) { assert.equal(body.expectedRevision, state.revision); job = { id: "job-1", state: "COMPLETED", kind: body.kind, revision: state.revision, result: { testsPassed: 2, testsTotal: 2, stdout: "a@b\n", runOk: true } }; data = { jobId: job.id, state: "QUEUED" }; status = 202; }
    else if (p.endsWith("/quiz")) { assert.deepEqual(body.answers, { q1: 0 }); quizResult = { correct: 1, total: 1 }; data = { result: quizResult }; }
    else if (p.endsWith("/notes")) { note = { ...body, revision: (note?.revision ?? 0) + 1 }; data = { revision: note.revision }; }
    else if (p.endsWith("/end")) { assert.equal(body.expectedRevision, state.revision); state.status = "COMPLETED"; data = { status: "COMPLETED" }; }
    else if (p.endsWith("/release-feedback")) { assert.equal(body.allowPublicPortfolio, true, "public Portfolio sharing requires an explicit interviewer grant"); feedback = [{ text: note.feedback, practice: note.practice, reviewer: "olena.hr", allowPublicPortfolio: body.allowPublicPortfolio }]; note.allowPublicPortfolio = body.allowPublicPortfolio; note.releasedAt = new Date().toISOString(); }
    else if (p.endsWith("/join")) { status = 503; data = { code: "INTERVIEW_MEDIA_UNAVAILABLE" }; }
    else { unexpected.push(`${method} ${p}`); status = 404; data = { code: "UNEXPECTED_FIXTURE" }; }
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": new URL(origin).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*" }, body: JSON.stringify(data) });
  });
}
async function capture(page, filename) { if (process.env.BROWSER_CONTRACT_CAPTURE_DIR) { await fs.mkdir(process.env.BROWSER_CONTRACT_CAPTURE_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.BROWSER_CONTRACT_CAPTURE_DIR, filename), fullPage: true }); } }
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CONTRACT_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_CONTRACT_EXECUTABLE_PATH } : {}),
    ...(process.env.BROWSER_CONTRACT_CHANNEL ? { channel: process.env.BROWSER_CONTRACT_CHANNEL } : {})
  });
  try {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const candidateContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await fixture(hostContext, hostId); await fixture(candidateContext, candidateId);
    const host = await hostContext.newPage(), candidate = await candidateContext.newPage();
    for (const page of [host, candidate]) { page.setDefaultTimeout(20000); page.on("pageerror", err => errors.push(err.message)); page.on("request", req => { if (/monaco|y-monaco/i.test(req.url())) heavy.push(req.url()); if (/\/lsp\//i.test(req.url())) lsp.push(req.url()); }); }
    const appOrigin = origin.replace(/\/+$/, "");
    await host.goto(`${appOrigin}/companies?company=${companyId}`);
    try { await host.getByRole("heading", { name: "Проводьте співбесіди у StudyCod" }).waitFor(); }
    catch (error) { console.error({ url: host.url(), body: await host.locator("body").innerText().catch(() => "(body unavailable)"), errors, unexpected }); await capture(host, "interviews-load-failure.png"); throw error; }
    assert.equal(new URL(host.url()).pathname, "/assess", "legacy company URLs should redirect to Assess");
    await capture(host, "interviews.png");
    await host.getByRole("button", { name: "Запланувати співбесіду", exact: true }).click();
    await host.getByRole("textbox", { name: "Username кандидата" }).fill("marta.dev");
    await host.getByRole("textbox", { name: "Роль / назва співбесіди" }).fill("Python-розробник · перша розмова");
    await host.getByRole("button", { name: "Створити співбесіду й надіслати запрошення" }).click();
    await host.getByRole("heading", { name: "Зрозумілий план для обох сторін" }).waitFor().catch(async error => { console.error({ url: host.url(), body: await host.locator("body").innerText(), errors, unexpected, scheduledPayload }); await capture(host, "failure.png"); throw error; });
    assert.equal(scheduledPayload.candidateUsername, "marta.dev"); assert.equal(scheduledPayload.useSelectedProject, false); assert.equal(scheduledPayload.assessmentId, undefined);
    await host.goto(`${appOrigin}/assess?company=${companyId}&view=kits`);
    await host.getByRole("heading", { name: "Комплекти співбесід і тести" }).waitFor();
    await host.getByRole("button", { name: "Адаптувати для команди", exact: true }).first().waitFor();
    await host.getByRole("button", { name: "Адаптувати для команди", exact: true }).first().click();
    await host.getByRole("combobox", { name: "Мова програмування" }).selectOption("rust");
    await host.getByRole("button", { name: "main.rs", exact: true }).waitFor();
    await host.getByRole("button", { name: "Зберегти новий комплект", exact: true }).click();
    await host.getByText("Новий незмінний комплект збережено. Розпочаті співбесіди мають власні знімки умов.", { exact: true }).waitFor();
    assert.equal(savedKit.runtime, "RUST"); assert.equal(savedKit.files[0].path, "main.rs");
    await host.goto(`${appOrigin}/assess?company=${companyId}&view=interviews`);
    await host.getByRole("button", { name: "Команда", exact: true }).click();
    await host.getByRole("heading", { name: "Люди й відповідальність" }).waitFor();
    await host.getByRole("combobox", { name: "Роль для hr.member" }).selectOption("ENGINEER");
    const hrRow = host.locator(".assess-team-list > div").filter({ hasText: "hr.member" });
    await hrRow.getByRole("button", { name: "Зберегти роль", exact: true }).click();
    await host.locator(".assess-team-list").getByText("Інженер", { exact: true }).first().waitFor();
    const engineerRow = host.locator(".assess-team-list > div").filter({ hasText: "engineer.member" });
    await engineerRow.getByRole("button", { name: "Відкликати доступ" }).click();
    await engineerRow.getByText("Доступ відкликано", { exact: true }).waitFor();
    await host.getByRole("textbox", { name: "Username зареєстрованого користувача" }).fill("engineer.member");
    await host.getByRole("combobox", { name: "Відповідальність" }).selectOption("HR");
    await host.getByRole("button", { name: "Надіслати запрошення в команду" }).click();
    await host.locator(".assess-team-list").getByText("Запрошення надіслано", { exact: true }).waitFor();
    await host.goto(`${appOrigin}/companies/interviews/${interviewId}`);
    await candidate.goto(`${appOrigin}/assess?view=invitations`);
    await candidate.getByRole("heading", { name: "Мої запрошення" }).waitFor();
    await candidate.getByText("StudyCod · Assess", { exact: true }).waitFor();
    assert.equal(await candidate.getByText("StudyCod Talent", { exact: true }).count(), 0, "the candidate inbox should use the current Assess brand");
    await candidate.goto(`${appOrigin}/companies/interviews/${interviewId}`);
    await candidate.getByRole("button", { name: "Прийняти запрошення" }).waitFor();
    assert.equal(new URL(candidate.url()).pathname, `/assess/interviews/${interviewId}`, "legacy interview URLs should redirect to Assess");
    assert.equal(await candidate.locator(".interview-monaco-editor").count(), 0);
    await capture(candidate, "preparation-mobile.png");
    await candidate.locator(".interview-consent input").check(); await candidate.getByRole("button", { name: "Прийняти запрошення" }).click();
    await host.bringToFront();
    await host.getByRole("button", { name: "Почати співбесіду" }).click();
    await candidate.bringToFront();
    await candidate.getByRole("button", { name: "Спільний код", exact: true }).click();
    const editor = candidate.locator(".interview-monaco-editor"); await editor.waitFor();
    await candidate.waitForFunction(() => Boolean(window.__monacoDebug?.editor));
    assert.ok(await candidate.locator(".monaco-editor").count() > 0);
    await candidate.evaluate(value => window.__monacoDebug.editor.setValue(value), "print('candidate copy')\n");
    await candidate.getByRole("button", { name: "Зберегти", exact: true }).click();
    await host.bringToFront();
    await host.getByRole("button", { name: "Спільний код", exact: true }).click();
    await host.waitForFunction(() => window.__monacoDebug?.editor.getValue().includes("candidate copy"));
    assert.equal(await host.evaluate(() => window.__monacoDebug.editor.getOption(window.__monacoDebug.monaco.editor.EditorOption.readOnly)), true);
    await candidate.bringToFront();
    await candidate.getByRole("button", { name: "Перевірити тести", exact: true }).click();
    await candidate.getByText("2/2 обов’язкових тестів пройдено").waitFor();
    await candidate.getByRole("button", { name: "Приєднатися до дзвінка", exact: true }).click();
    await candidate.getByText("Медіасервіс не налаштований або недоступний. Код, тести й чат залишаються доступними.", { exact: true }).waitFor();
    await candidate.getByRole("button", { name: "Тести", exact: true }).click(); await candidate.getByLabel("Ідемпотентність", { exact: true }).check();
    await candidate.getByRole("button", { name: "Подати відповіді", exact: true }).click();
    await host.bringToFront();
    await host.getByRole("combobox", { name: "Керування редактором" }).selectOption(String(hostId));
    await host.evaluate(() => window.__monacoDebug.editor.setValue("print('final interview copy')\n"));
    await host.getByRole("button", { name: "Зберегти", exact: true }).click();
    await host.getByRole("button", { name: "Мої приватні нотатки", exact: true }).click();
    await host.getByRole("textbox", { name: "Спостереження й приклади" }).fill("PRIVATE_ONLY_HOST");
    await host.getByRole("textbox", { name: "Відгук для кандидата" }).fill("Добре пояснила вибір структури. Перевіряй порожній ввід.");
    await host.getByRole("textbox", { name: "Що потренувати далі" }).fill("Додай регресійний тест повторного імпорту.");
    await host.locator(".interview-notes input[type=checkbox]").check();
    await host.getByRole("button", { name: "Зберегти приватно" }).click();
    await capture(host, "live-room.png");
    await host.getByRole("button", { name: "Завершити співбесіду", exact: true }).click();
    await host.getByRole("button", { name: "Завершити й зберегти", exact: true }).click();
    await host.getByRole("button", { name: "Оприлюднити після співбесіди", exact: true }).click();
    await candidate.bringToFront();
    await candidate.getByRole("button", { name: "Підсумок і відгук", exact: true }).click();
    await candidate.getByRole("button", { name: "Оновити підсумок" }).click();
    await candidate.getByText("Добре пояснила вибір структури. Перевіряй порожній ввід.", { exact: true }).waitFor();
    assert.doesNotMatch(await candidate.locator("body").innerText(), /PRIVATE_ONLY_HOST/);
    assert.match(await candidate.locator(".assess-code-view").innerText(), /final interview copy/);
    assert.equal(await candidate.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await capture(candidate, "feedback-mobile.png");
    // A permission prompt may resolve after leaving the room; stop those late tracks too.
    await candidate.evaluate(() => {
      window.__assessStoppedTracks = 0;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => new Promise(resolve => { window.__assessResolveDevices = () => resolve({ getTracks: () => [{ stop: () => window.__assessStoppedTracks++ }] }); }) } });
    });
    await candidate.getByRole("button", { name: "Перевірити обрані пристрої" }).click();
    await candidate.getByRole("link", { name: "Співбесіди", exact: true }).click();
    await candidate.evaluate(() => window.__assessResolveDevices());
    await candidate.waitForFunction(() => window.__assessStoppedTracks === 1);
    assert.deepEqual(errors, []); assert.deepEqual(lsp, []); assert.deepEqual(unexpected, []);
    assert.ok(heavy.length > 0, "the shared StudyCod Monaco editor should load only when opening the code workspace");
    console.log("ASSESS UI CONTRACT PASS: legacy URL redirects, company member role changes, access revocation and re-invitation, 19-family Judge kit selection, standalone scheduling, consent, two-client Monaco code handover, saving, queued checks, quiz, private notes, frozen summary, feedback, mobile, no LSP.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
