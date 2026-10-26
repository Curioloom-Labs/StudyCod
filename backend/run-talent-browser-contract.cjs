// Deterministic UI contract. Every API request is intercepted; no production data is changed.
// BROWSER_CONTRACT_BASE_URL=http://127.0.0.1:5187 node run-talent-browser-contract.cjs
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
let note = null, feedback = [], quizResult = null, job = null, scheduledPayload = null;
const errors = [], heavy = [], unexpected = [];
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
    else if (p === "/csrf-token") data = { csrfToken: "talent-browser-contract" };
    else if (p === "/project-companies") data = { companies: userId === hostId ? [{ id: companyId, name: "Кодова майстерня", role: "OWNER" }] : [], pendingMemberships: [], candidateCases: [] };
    else if (p === `/project-companies/${companyId}`) data = { company: { id: companyId, name: "Кодова майстерня", role: "OWNER" }, members: [{ id: "member", user_id: hostId, username: "olena.hr", role: "OWNER", status: "ACTIVE" }], assessments: [] };
    else if (p === "/talent/kits") data = { kits: [{ id: "kit-1", kit, builtIn: true }] };
    else if (p === "/talent/interviews") data = { interviews: [{ id: interviewId, company_id: companyId, company_name: "Кодова майстерня", title: "Python-розробник · перша розмова", status: state.status, scheduled_at: "2026-10-27T12:00:00Z", duration_minutes: 45, candidate_name: "marta.dev", host_name: "olena.hr", my_role: userId === hostId ? "OWNER" : "CANDIDATE", consent_status: state.consented ? "ACCEPTED" : "INVITED" }] };
    else if (p === `/talent/companies/${companyId}/interviews`) { scheduledPayload = body; status = 201; data = { id: interviewId }; }
    else if (p === `/talent/interviews/${interviewId}`) data = { interview: session(userId), ownNote: userId === hostId ? note : null, feedback, quizResult, executions: job ? [job] : [] };
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
    else if (p.endsWith("/release-feedback")) { feedback = [{ text: note.feedback, practice: note.practice, reviewer: "olena.hr" }]; note.releasedAt = new Date().toISOString(); }
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
    for (const page of [host, candidate]) { page.setDefaultTimeout(20000); page.on("pageerror", err => errors.push(err.message)); page.on("request", req => { if (/monaco|y-monaco|\/lsp\//i.test(req.url())) heavy.push(req.url()); }); }
    const appOrigin = origin.replace(/\/+$/, "");
    await host.goto(`${appOrigin}/companies?company=${companyId}`);
    try { await host.getByRole("heading", { name: "Проводьте співбесіди у StudyCod" }).waitFor(); }
    catch (error) { console.error({ url: host.url(), body: await host.locator("body").innerText().catch(() => "(body unavailable)"), errors, unexpected }); await capture(host, "interviews-load-failure.png"); throw error; }
    await capture(host, "interviews.png");
    await host.getByRole("button", { name: "Запланувати співбесіду", exact: true }).click();
    await host.getByRole("textbox", { name: "Username кандидата" }).fill("marta.dev");
    await host.getByRole("textbox", { name: "Роль / назва співбесіди" }).fill("Python-розробник · перша розмова");
    await host.getByRole("button", { name: "Створити співбесіду й надіслати запрошення" }).click();
    await host.getByRole("heading", { name: "Зрозумілий план для обох сторін" }).waitFor().catch(async error => { console.error({ url: host.url(), body: await host.locator("body").innerText(), errors, unexpected, scheduledPayload }); await capture(host, "failure.png"); throw error; });
    assert.equal(scheduledPayload.candidateUsername, "marta.dev"); assert.equal(scheduledPayload.useSelectedProject, false); assert.equal(scheduledPayload.assessmentId, undefined);
    await candidate.goto(`${appOrigin}/companies/interviews/${interviewId}`);
    await candidate.getByRole("button", { name: "Прийняти запрошення" }).waitFor();
    assert.equal(await candidate.locator(".interview-code-editor").count(), 0);
    await capture(candidate, "preparation-mobile.png");
    await candidate.locator(".interview-consent input").check(); await candidate.getByRole("button", { name: "Прийняти запрошення" }).click();
    await host.bringToFront();
    await host.getByRole("button", { name: "Почати співбесіду" }).click();
    await candidate.bringToFront();
    await candidate.getByRole("button", { name: "Спільний код", exact: true }).click();
    const editor = candidate.locator(".interview-code-editor"); await editor.waitFor();
    await assert.doesNotReject(() => editor.fill("print('candidate copy')\n"));
    await candidate.getByRole("button", { name: "Зберегти", exact: true }).click();
    await host.bringToFront();
    await host.getByRole("button", { name: "Спільний код", exact: true }).click();
    await host.waitForFunction(() => document.querySelector(".interview-code-editor")?.value.includes("candidate copy"));
    assert.equal(await host.locator(".interview-code-editor").getAttribute("readonly"), "");
    await candidate.bringToFront();
    await candidate.getByRole("button", { name: "Перевірити тести", exact: true }).click();
    await candidate.getByText("2/2 обов’язкових тестів пройдено").waitFor();
    await candidate.getByRole("button", { name: "Приєднатися до дзвінка", exact: true }).click();
    await candidate.getByText("Медіасервіс не налаштований або недоступний. Код, тести й чат залишаються доступними.", { exact: true }).waitFor();
    await candidate.getByRole("button", { name: "Тести", exact: true }).click(); await candidate.getByLabel("Ідемпотентність", { exact: true }).check();
    await candidate.getByRole("button", { name: "Подати відповіді", exact: true }).click();
    await host.bringToFront();
    await host.getByRole("combobox", { name: "Керування редактором" }).selectOption(String(hostId));
    await host.locator(".interview-code-editor").fill("print('final interview copy')\n");
    await host.getByRole("button", { name: "Зберегти", exact: true }).click();
    await host.getByRole("button", { name: "Мої приватні нотатки", exact: true }).click();
    await host.getByRole("textbox", { name: "Спостереження й приклади" }).fill("PRIVATE_ONLY_HOST");
    await host.getByRole("textbox", { name: "Відгук для кандидата" }).fill("Добре пояснила вибір структури. Перевіряй порожній ввід.");
    await host.getByRole("textbox", { name: "Що потренувати далі" }).fill("Додай регресійний тест повторного імпорту.");
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
    assert.match(await candidate.locator(".talent-code-view").innerText(), /final interview copy/);
    assert.equal(await candidate.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await capture(candidate, "feedback-mobile.png");
    // A permission prompt may resolve after leaving the room; stop those late tracks too.
    await candidate.evaluate(() => {
      window.__talentStoppedTracks = 0;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => new Promise(resolve => { window.__talentResolveDevices = () => resolve({ getTracks: () => [{ stop: () => window.__talentStoppedTracks++ }] }); }) } });
    });
    await candidate.getByRole("button", { name: "Перевірити обрані пристрої" }).click();
    await candidate.getByRole("link", { name: "Співбесіди", exact: true }).click();
    await candidate.evaluate(() => window.__talentResolveDevices());
    await candidate.waitForFunction(() => window.__talentStoppedTracks === 1);
    assert.deepEqual(errors, []); assert.deepEqual(heavy, []); assert.deepEqual(unexpected, []);
    console.log("TALENT UI CONTRACT PASS: standalone scheduling, consent, two-client code handover, saving, queued checks, quiz, private notes, frozen summary, feedback, mobile, no Monaco/LSP.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
