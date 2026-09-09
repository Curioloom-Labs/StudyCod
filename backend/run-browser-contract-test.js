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
    // The browser contract intentionally runs against the static frontend
    // preview, without a backend or database. Keep API availability out of
    // this test so failures point at frontend boot/CSP/editor regressions.
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const isCsrf = pathname.endsWith("/csrf-token");
      const isProfileProbe = pathname.endsWith("/profile/me");
      await route.fulfill({
        status: isCsrf ? 204 : 200,
        contentType: isCsrf ? undefined : "application/json",
        body: isCsrf ? "" : JSON.stringify(isProfileProbe
          ? {
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
              : { current: null })
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
    await page.locator(".monaco-editor").waitFor({ state: "attached", timeout: 30_000 });
    if (runtimeErrors.length > 0) throw new Error(`browser runtime errors: ${runtimeErrors.join(" | ")}`);
    await browser.close();
    console.log("BROWSER CONTRACT PASS: public shell, accessible buttons, and Monaco editor load without runtime errors");
  } catch (error) {
    console.error(`BROWSER CONTRACT ${required ? "FAILED" : "UNVERIFIED"}: ${error.message}`);
    process.exit(required ? 1 : 0);
  }
})();
