const baseUrl = process.env.BROWSER_CONTRACT_BASE_URL;
const required = process.env.BROWSER_CONTRACT_REQUIRED === "1";

if (!baseUrl) {
  console.log("BROWSER CONTRACT UNVERIFIED: set BROWSER_CONTRACT_BASE_URL to run against a live frontend");
  process.exit(required ? 1 : 0);
}

(async () => {
  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response || response.status() >= 500) throw new Error(`frontend returned ${response?.status() ?? "no response"}`);
    const title = await page.title();
    if (!title.trim()) throw new Error("document title is empty");
    const inaccessibleButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => {
      const label = button.getAttribute("aria-label") || button.textContent || "";
      return !label.trim();
    }).length);
    if (inaccessibleButtons > 0) throw new Error(`${inaccessibleButtons} button(s) have no accessible name`);
    await browser.close();
    console.log("BROWSER CONTRACT PASS: public shell loads and buttons have accessible names");
  } catch (error) {
    console.error(`BROWSER CONTRACT ${required ? "FAILED" : "UNVERIFIED"}: ${error.message}`);
    process.exit(required ? 1 : 0);
  }
})();
