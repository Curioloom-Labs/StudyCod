const baseUrl = process.env.BROWSER_CONTRACT_BASE_URL;
const required = process.env.BROWSER_CONTRACT_REQUIRED === "1";
const executablePath = String(process.env.BROWSER_CONTRACT_EXECUTABLE_PATH || "").trim();

if (!baseUrl) {
  console.log("BROWSER CONTRACT UNVERIFIED: set BROWSER_CONTRACT_BASE_URL to run against a live frontend");
  process.exit(required ? 1 : 0);
}

(async () => {
  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {})
    });
    const page = await browser.newPage();
    const waitForEditor = async (label) => {
      try {
        await page.locator(".monaco-editor").waitFor({ state: "attached", timeout: 30_000 });
      } catch (error) {
        const body = await page.locator("body").innerText().catch(() => "(body unavailable)");
        console.error(`${label} editor debug: ${page.url()}\n${body.slice(0, 1800)}\nRuntime errors: ${runtimeErrors.join(" | ")}`);
        throw error;
      }
    };
    let contestFinished = false;
    let contestEndsAt = Date.now() + 5 * 60_000;
    let contestCheckSubmitted = false;
    let extendDeadlineOnRecheck = false;
    let contestExtensionApplied = false;
    let earlyContestReviewRequests = 0;
    let eduReviewMode = false;
    let eduSubmitReceived = false;
    let eduSubmittedCode = "";
    // The browser contract runs against the static frontend preview and
    // deterministic API fixtures. It verifies rendered flows; backend route
    // and database contracts are covered by the backend suite.
    await page.route(url => new URL(String(url)).pathname.startsWith("/api/"), async route => {
      const pathname = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const isCsrf = pathname.endsWith("/csrf-token");
      const isProfileProbe = pathname.endsWith("/profile/me");
      let payload = isProfileProbe
        ? eduReviewMode ? {
            id: -998,
            username: "browser-contract-student",
            firstName: "Browser",
            lastName: "Student",
            activeRuntime: "PYTHON",
            difus: 0,
            avatarUrl: null,
            userMode: "EDUCATIONAL",
            role: "TEACHER",
            placementDone: true,
            placementLevel: "INTERMEDIATE",
            studentId: 3101,
            classId: 31,
            className: "10-A · Browser contract"
          } : {
            id: -999,
            username: "browser-contract",
            firstName: "Browser",
            lastName: "Contract",
            activeRuntime: "PYTHON",
            difus: 0,
            avatarUrl: null,
            userMode: "PERSONAL",
            role: "USER",
            placementDone: true,
            placementLevel: "INTERMEDIATE"
          }
        : pathname.endsWith("/geo")
          ? { geoBlocked: false, country: null }
          : pathname.endsWith("/auth/maintenance")
            ? { maintenance: false, title: "", message: "", until: null }
            : { current: null };
      if (pathname.endsWith("/contests/778/events")) {
        return route.fulfill({ status: 200, contentType: "text/event-stream", body: "event: ready\ndata: {}\n\n" });
      } else if (method === "GET" && pathname.endsWith("/contests/778")) {
        const now = Date.now();
        if (extendDeadlineOnRecheck && !contestExtensionApplied && now >= contestEndsAt) {
          contestExtensionApplied = true;
          contestEndsAt = now + 4_000;
        }
        const finished = contestFinished || now >= contestEndsAt;
        payload = {
          contest: {
            id: 778, title: "Generated Olympiad round", icon: "🏆", description: "A timed round built from newly generated course practice.", tags: ["olympiad"],
            difficulty: "MEDIUM", visibility: "PUBLIC", startsAt: new Date(now - 60_000).toISOString(),
            endsAt: new Date(finished ? now - 60_000 : contestEndsAt).toISOString(), isPublished: true, allowUpsolve: true,
            safetyAlertsEnabled: false, safetyAlertProviderReady: false, scoringMode: "IOI", scoreboardVisibility: "AFTER_END",
            participantAccessMode: "SELF_REGISTRATION", createdBy: { id: -999, username: "browser-contract" }, classId: null,
          },
          access: { canAccessContent: true, isJoined: true, joinRequired: false, accountRequired: false, canManage: false, canDelete: false, isPaused: false, personalEndsAt: null },
          problems: [{ id: 201, order: 0, label: "A", points: 100, title: "Generated prefix sums challenge", libraryTaskId: 1801 }],
          participantsCount: 1, serverTime: new Date(now).toISOString(), phase: { started: true, finished },
        };
      } else if (method === "GET" && pathname.endsWith("/contests/778/problems/201")) {
        payload = {
          problem: { id: 201, order: 0, label: "A" },
          task: {
            id: 1801, title: "Generated prefix sums challenge",
            description: "# Generated prefix sums challenge\n\nRead an array and answer inclusive range-sum queries.\n\n## Input\nThe first line contains n and q. The second line contains n integers. Each of the next q lines contains l and r.\n\n## Output\nPrint one sum per query.\n\n## Example\nInput\n```text\n5 2\n1 2 3 4 5\n1 3\n2 5\n```\nOutput\n```text\n6\n14\n```",
            template: "import sys\n\ndef solve():\n    data = list(map(int, sys.stdin.buffer.read().split()))\n    # Implement the generated task here.\n\nif __name__ == '__main__':\n    solve()\n",
            templatesByLanguage: { python: "import sys\n\ndef solve():\n    data = list(map(int, sys.stdin.buffer.read().split()))\n    # Implement the generated task here.\n\nif __name__ == '__main__':\n    solve()\n" },
            defaultLanguage: "python", allowedLanguages: ["python"], statementLanguage: "en",
            limitsByLanguage: { python: { timeLimitMs: 2000, memoryLimitMb: 256 } },
            timeLimitMs: 2000, memoryLimitMb: 256, outputLimitKb: 64, checkerSpec: null,
          },
        };
      } else if (method === "GET" && pathname.endsWith("/contests/778/problems/201/submissions")) {
        payload = { submissions: [] };
      } else if (method === "POST" && pathname.endsWith("/contests/778/problems/201/check")) {
        contestCheckSubmitted = true;
        contestFinished = false;
        contestEndsAt = Date.now() + 3_500;
        payload = {
          jobId: "browser-contract-contest-check", status: "completed", statusUrl: "/api/contests/jobs/browser-contract-contest-check",
          result: { submissionId: 1901, phase: "CONTEST", verdict: "AC", testsPassed: 12, testsTotal: 12, score: 100, maxScore: 100,
            compileError: null, compileErrorKind: null, groupScores: [{ group: "all", score: 100, maxScore: 100 }] },
        };
      } else if (method === "GET" && pathname.endsWith("/contests/778/my-progress")) {
        payload = { contestId: 778, participantId: 110, problems: [] };
      } else if (method === "GET" && pathname.endsWith("/contests/778/standings")) {
        payload = {
          contestId: 778, scoringMode: "IOI", problems: [{ id: 201, order: 0, label: "A", maxScore: 100 }],
          rows: [{ rank: 1, participantId: 110, displayName: "Browser learner", totalScore: 100, lastImprovementAt: null, problems: [] }],
          hidden: false, releaseAt: null, generatedAtMs: Date.now(),
        };
      } else if (method === "GET" && pathname.endsWith("/contests/778/community")) {
        payload = { contestId: 778, announcements: [], questions: [] };
      } else if (method === "GET" && pathname.endsWith("/contests/778/safety")) {
        payload = {
          enabled: false, providerReady: false, availableLocations: [], location: null, needsLocation: false, paused: false,
          pausedUntil: null, pauseSecondsRemaining: 0, extensionSeconds: 0, effectiveEndsAt: null, alertPending: false,
          alertActive: false, alertLevel: null, alertLocationName: null, globalLocked: false, globalLockReason: null,
          globalLockLocationName: null, manualLockActive: false, redLocation: null, redLockMode: "PAUSE_10_MIN",
        };
      } else if (method === "GET" && pathname.endsWith("/contests/778/learning-review")) {
        if (!contestFinished && Date.now() < contestEndsAt) earlyContestReviewRequests += 1;
        payload = {
          contestId: 778, finished: true,
          topics: [{ topicKey: "prefix-sums", courseId: 501, courseItemId: 601, problemCount: 1, solvedProblems: 1, attempts: 2, failures: 1,
            problems: [{ label: "A", title: "Generated prefix sums challenge", attempts: 2, bestScore: 100, solved: true, verdicts: ["WA", "AC"] }] }],
          recommendation: { topicKey: "prefix-sums", courseId: 501, courseItemId: 601, reason: "MOST_FAILED_GENERATED_TOPIC", suggestedAction: "Generate a fresh course practice variant for this topic, then solve it outside the timed round." },
        };
      } else if (pathname.endsWith("/learning/me")) {
        payload = {
          currentEnrollmentId: 991,
          current: { enrollmentId: 991, courseId: 990, courseKey: "browser-contract", title: "Quiz browser contract", runtime: "PYTHON", runtimeLabel: "Python", level: "FOUNDATION", status: "IN_PROGRESS", completionPercent: 0, finalAssessmentPassed: false, completedAt: null, gate: null },
          enrollments: []
        };
      } else if (method === "GET" && pathname.endsWith("/library/learning/evidence")) {
        payload = {
          totalAttempts: 2,
          practicedTasks: 1,
          solvedTasks: 1,
          solvedAfterFailure: 1,
          revisitedSolved: 1,
          hintedTasks: 1,
          hintLevelCounts: [{ level: 1, tasks: 0 }, { level: 2, tasks: 1 }, { level: 3, tasks: 0 }],
          overcomeCategories: [{ name: "logic", tasks: 1 }],
          topics: [{ name: "Prefix sums", practiced: 1, solved: 1, improving: true }],
          recentSkills: []
        };
      } else if (method === "GET" && pathname.endsWith("/learning/courses/990")) {
        payload = {
          course: {
            id: 990, key: "browser-contract", title: "Quiz browser contract", description: null, level: "FOUNDATION", isBase: true, runtime: "PYTHON",
            enrollment: { id: 991, variantId: 992, status: "IN_PROGRESS", completionPercent: 0, masteryScore: 0, finalAssessmentPassed: false },
            nextAction: { itemId: 993, title: "Quiz browser check", kind: "QUIZ", status: "IN_PROGRESS" },
            modules: [{ id: 994, title: "Knowledge checks", items: [{ id: 993, kind: "QUIZ", title: "Quiz browser check", order: 0,
              content: { quiz: [{ id: "question-1", question: "Select the prefix range formula.", options: ["P[r] - P[l]", "P[l] - P[r]"] }] },
              progress: { status: "IN_PROGRESS", score: null, completedAt: null } }] }]
          }
        };
      } else if (method === "GET" && pathname.endsWith("/learning/items/993/quiz")) {
        payload = { quiz: { itemId: 993, title: "Quiz browser check", passingScore: 60, questions: [{ id: "question-1", question: "Select the prefix range formula.", options: ["P[r] - P[l]", "P[l] - P[r]"] }], progress: { status: "IN_PROGRESS", score: null, completedAt: null } } };
      } else if (method === "POST" && pathname.endsWith("/learning/items/993/quiz/submit")) {
        payload = { result: { score: 100, correctCount: 1, total: 1, passed: true, passingScore: 60,
          review: [{ questionId: "question-1", question: "Select the prefix range formula.", options: ["P[r] - P[l]", "P[l] - P[r]"], selectedIndex: 0, correctIndex: 0 }],
          progress: { status: "COMPLETED", score: 100, completedAt: null },
          enrollment: { id: 991, status: "IN_PROGRESS", completionPercent: 100, masteryScore: 0 } } };
      } else if (method === "GET" && pathname.endsWith("/edu/tasks/501")) {
        payload = { task: {
          id: 501,
          title: "Boundary sum practice",
          description: "Given n, return the sum from 1 through n inclusive.\n\nExample input: 5\nExpected output: 15",
          template: "n = int(input())\ntotal = 0\nfor value in range(1, n):\n    total += value\nprint(total)\n",
          language: "PYTHON",
          testDataCount: 1,
          savedCode: "n = int(input())\ntotal = 0\nfor value in range(1, n):\n    total += value\nprint(total)\n",
          maxAttempts: 3,
          attemptsUsed: 0,
          isClosed: false,
          hasGrade: false,
          lesson: { id: 601, title: "Loop boundaries", type: "LESSON", hasTheory: false }
        } };
      } else if (method === "POST" && pathname.endsWith("/edu/tasks/501/submit")) {
        eduSubmitReceived = true;
        try { eduSubmittedCode = String(route.request().postDataJSON()?.code ?? ""); } catch { eduSubmittedCode = ""; }
        payload = {
          grade: { id: 2001, total: 0, testsPassed: 0, testsTotal: 1, isManuallyGraded: false },
          testResults: [{ testId: 17, passed: false, verdict: "WA", errorKind: "off_by_one", input: "5", expected: "15", actual: "10" }],
          hints: ["Compare the inclusive task boundary with Python's range endpoint.", "Check whether the loop should include n."],
          scoring: { score: 0, maxScore: 100, groupScores: [{ group: "public", score: 0, maxScore: 100 }] },
          learningFeedback: {
            verdict: "WA",
            firstFailure: { testPublicIndex: 1, testId: 17, inputPreview: "5", expectedPreview: "15", actualPreview: "10", errorKind: "off_by_one" },
            analysis: null
          },
          learningAttempt: { id: 2201, outcome: "failed", failureCategory: "off_by_one", firstFailedTestId: 17, highestHintLevelShown: 0, solvedAfterFailure: false },
          submissionMeta: { submissionId: "2001", clientSubmissionId: "browser-contract-edu", codeHash: "browser-contract-edu-hash" }
        };
      }
      await route.fulfill({
        status: isCsrf ? 204 : 200,
        contentType: isCsrf ? undefined : "application/json",
        body: isCsrf ? "" : JSON.stringify(payload)
      });
    });
    const runtimeErrors = [];
    page.on("pageerror", error => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response || response.status() >= 500) throw new Error(`frontend returned ${response?.status() ?? "no response"}`);
    const title = await page.title();
    if (!title.trim()) throw new Error("document title is empty");
    const inaccessibleButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => {
      const label = button.getAttribute("aria-label") || button.textContent || "";
      return !label.trim();
    }).length);
    if (inaccessibleButtons > 0) throw new Error(`${inaccessibleButtons} button(s) have no accessible name`);
    const editorUrl = new URL("__dev/editor", baseUrl).toString();
    const editorResponse = await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!editorResponse || editorResponse.status() >= 500) throw new Error(`editor route returned ${editorResponse?.status() ?? "no response"}`);
    await waitForEditor("dev editor");
    const pathUrl = new URL("learning/course/990/path", baseUrl).toString();
    const pathResponse = await page.goto(pathUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!pathResponse || pathResponse.status() >= 500) throw new Error(`course path route returned ${pathResponse?.status() ?? "no response"}`);
    await page.locator("button").filter({ hasText: "Quiz browser check" }).first().waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("button").filter({ hasText: "Quiz browser check" }).first().click();
    await page.getByRole("button", { name: /open quiz|відкрити квіз/i }).click();
    await page.locator('input[type="radio"]').first().waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('input[type="radio"]').first().check();
    await page.getByRole("button", { name: /check answers|перевірити відповіді/i }).click();
    await page.getByText(/quiz passed|квіз зараховано/i).waitFor({ state: "visible", timeout: 10_000 });
    const progressUrl = new URL("learning/course/990/progress", baseUrl).toString();
    const progressResponse = await page.goto(progressUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!progressResponse || progressResponse.status() >= 500) throw new Error(`course progress route returned ${progressResponse?.status() ?? "no response"}`);
    const attemptCountCard = page.getByText(/Judge attempts|Спроб у Judge/i).locator("..");
    await attemptCountCard.getByText("2", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    eduReviewMode = true;
    const eduTaskUrl = new URL("edu/tasks/501", baseUrl).toString();
    const eduTaskResponse = await page.goto(eduTaskUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!eduTaskResponse || eduTaskResponse.status() >= 500) throw new Error(`EDU task route returned ${eduTaskResponse?.status() ?? "no response"}`);
    await page.getByText("Boundary sum practice", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForEditor("EDU task");
    const retainedEduCode = "n = 5\ntotal = sum(range(1, n + 1))\nprint(total)\n";
    const eduEditorInput = page.getByRole("textbox", { name: "Editor content" });
    await eduEditorInput.evaluate((element) => element.focus());
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(retainedEduCode);
    const editorTextBeforeSubmit = (await page.locator(".monaco-editor .view-lines").innerText()).replace(/\u00a0/g, " ");
    if (!editorTextBeforeSubmit.includes("sum(range(1, n + 1))")) {
      throw new Error(`EDU editor did not accept the test input: ${editorTextBeforeSubmit}`);
    }
    await page.getByRole("button", { name: /^check$|^перевірити$/i }).click();
    const eduFailureReview = page.locator(".failure-recovery-card");
    await eduFailureReview.getByText(/Compare the inclusive task boundary/i).waitFor({ state: "visible", timeout: 10_000 });
    await eduFailureReview.getByText("15", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await eduFailureReview.getByText("10", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    if (!eduSubmitReceived || !eduSubmittedCode.includes("total = sum(range(1, n + 1))")) {
      throw new Error(`EDU submit did not preserve and send the learner's edited code (received=${eduSubmitReceived}, code=${JSON.stringify(eduSubmittedCode)})`);
    }
    await page.getByRole("button", { name: /return to code|повернутися до коду|до свого коду/i }).click();
    const retainedEditorText = (await page.locator(".monaco-editor .view-lines").innerText()).replace(/\u00a0/g, " ");
    if (!retainedEditorText.includes("total = sum(range(1, n + 1))")) throw new Error("returning to the EDU code lost the learner's input");
    const contestProblemUrl = new URL("contest/contests/778/problems/201", baseUrl).toString();
    const contestProblemResponse = await page.goto(contestProblemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!contestProblemResponse || contestProblemResponse.status() >= 500) throw new Error(`contest problem route returned ${contestProblemResponse?.status() ?? "no response"}`);
    try {
      await page.getByText(/Generated prefix sums challenge/i).first().waitFor({ state: "visible", timeout: 30_000 });
    } catch (error) {
      console.error(`CONTEST WORKSPACE DEBUG: ${page.url()}\n${(await page.locator("body").innerText()).slice(0, 1600)}\nAPI errors: ${runtimeErrors.join(" | ")}`);
      throw error;
    }
    await waitForEditor("contest problem");
    await page.getByText(/Time left|Залишилось/i).waitFor({ state: "visible", timeout: 10_000 });
    if (await page.getByRole("tab", { name: /Mentor|Ментор/i }).count() !== 0) {
      throw new Error("AI mentor was visible while the contest was active");
    }
    await page.getByRole("button", { name: /^submit|^check|^надіслати|^перевірити/i }).last().click();
    await page.locator(".ide-test-results").getByText("AC", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    if (!contestCheckSubmitted) throw new Error("contest submission did not reach the Judge contract");
    const contestUrl = new URL("contest/contests/778", baseUrl).toString();
    const contestResponse = await page.goto(contestUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!contestResponse || contestResponse.status() >= 500) throw new Error(`contest overview route returned ${contestResponse?.status() ?? "no response"}`);
    await page.getByText(/Time remaining|До фінішу/i).waitFor({ state: "visible", timeout: 10_000 });
    if (await page.getByRole("heading", { name: /Post-contest review|Розбір після туру/i }).count()) throw new Error("post-contest review appeared before the contest ended");
    try {
      await page.getByRole("heading", { name: /Post-contest review|Розбір після туру/i }).waitFor({ state: "visible", timeout: 30_000 });
    } catch (error) {
      console.error(`CONTEST REVIEW DEBUG: finished=${contestFinished} submitted=${contestCheckSubmitted} ${page.url()}\n${(await page.locator("body").innerText()).slice(0, 1800)}\nAPI errors: ${runtimeErrors.join(" | ")}`);
      throw error;
    }
    await page.getByText(/fresh generated problem|новій згенерованій задачі/i).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: /Start fresh practice|Почати нову практику/i }).waitFor({ state: "visible", timeout: 10_000 });
    if (earlyContestReviewRequests > 0) throw new Error(`post-contest review was requested ${earlyContestReviewRequests} time(s) before the deadline`);

    contestFinished = false;
    extendDeadlineOnRecheck = true;
    contestExtensionApplied = false;
    contestEndsAt = Date.now() + 6_000;
    const endedProblemResponse = await page.goto(contestProblemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!endedProblemResponse || endedProblemResponse.status() >= 500) throw new Error(`final contest workspace returned ${endedProblemResponse?.status() ?? "no response"}`);
    const mentorTab = page.getByRole("tab", { name: /Mentor|Ментор/i });
    await page.getByText(/Generated prefix sums challenge/i).first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForEditor("ended contest problem");
    if (await mentorTab.count() !== 0) throw new Error("AI mentor was visible before the contest deadline on the open workspace");
    await mentorTab.waitFor({ state: "visible", timeout: 20_000 });
    await mentorTab.click();
    await page.getByRole("button", { name: /Ask the mentor|Запитати ментора/i }).click();
    if (!contestExtensionApplied) throw new Error("browser fixture did not extend the contest at its original deadline");
    const mentorLevels = page.getByRole("group", { name: /Help levels|Рівні допомоги/i });
    await mentorLevels.waitFor({ state: "visible", timeout: 10_000 });
    const mentorLevelLabels = await mentorLevels.locator("button").allTextContents();
    if (mentorLevelLabels.length !== 4) throw new Error(`AI mentor exposed ${mentorLevelLabels.length} help levels instead of four`);
    if (!mentorLevelLabels.some(label => /Question|Запитання/i.test(label))
      || !mentorLevelLabels.some(label => /Idea|Ідея/i.test(label))
      || !mentorLevelLabels.some(label => /Plan|План/i.test(label))
      || !mentorLevelLabels.some(label => /Full walkthrough|Повний розбір/i.test(label))) {
      throw new Error(`AI mentor help levels are incomplete: ${mentorLevelLabels.join(" | ")}`);
    }

    if (runtimeErrors.length > 0) throw new Error(`browser runtime errors: ${runtimeErrors.join(" | ")}`);
    await browser.close();
    console.log("BROWSER CONTRACT PASS: public shell, accessible buttons, Monaco, course quiz and Judge-attempt progress, EDU public-test failure evidence and hint with retained editor code, timed contest workspace submission, generated-topic post-contest review, and mentor controls hidden through an extended deadline before appearing with four help levels load without runtime errors");
  } catch (error) {
    console.error(`BROWSER CONTRACT ${required ? "FAILED" : "UNVERIFIED"}: ${error.message}`);
    process.exit(required ? 1 : 0);
  }
})();
