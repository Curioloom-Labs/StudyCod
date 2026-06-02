import { chromium, Browser } from "playwright";
import fs from "fs";
import { CertificateRenderInput } from "./types";
import { CertificateTemplateEngine } from "./CertificateTemplateEngine";
import { logger } from "../../utils/logger";

let sharedBrowser: Browser | null = null;

function resolveExecutableCandidates(configuredExecutable: string): string[] {
  const envCandidates = [
    configuredExecutable,
    String(process.env.CHROME_BIN || "").trim(),
    String(process.env.GOOGLE_CHROME_BIN || "").trim(),
    String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim(),
  ].filter(Boolean);

  const linuxCandidates = process.platform === "linux"
    ? [
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/snap/bin/chromium",
      ]
    : [];

  const windowsCandidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Chromium\\Application\\chrome.exe",
      ]
    : [];

  const macCandidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : [];

  const all = [...envCandidates, ...linuxCandidates, ...windowsCandidates, ...macCandidates];
  const unique = Array.from(new Set(all.map((x) => String(x).trim()).filter(Boolean)));
  return unique.filter((candidate) => fs.existsSync(candidate));
}

function isMissingExecutableError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "");
  return (
    message.includes("Executable doesn't exist") ||
    message.includes("Please run the following command to download new browsers") ||
    message.includes("Failed to launch browser process")
  );
}

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser;
  const configuredExecutable = String(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || process.env.PLAYWRIGHT_EXECUTABLE_PATH
      || process.env.CHROMIUM_PATH
      || ""
  ).trim();

  const launchArgs: string[] = [];
  if (process.platform === "linux") {
    launchArgs.push("--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage");
  }

  const launch = async (executablePath?: string) => {
    return chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      ...(launchArgs.length ? { args: launchArgs } : {}),
    });
  };

  try {
    if (configuredExecutable) {
      sharedBrowser = await launch(configuredExecutable);
      return sharedBrowser;
    }

    // 1) default Playwright-managed Chromium
    try {
      sharedBrowser = await launch();
      return sharedBrowser;
    } catch (defaultError: unknown) {
      if (!isMissingExecutableError(defaultError)) throw defaultError;

      // 2) fallback to system chromium/chrome paths
      const fallbackCandidates = resolveExecutableCandidates(configuredExecutable);
      for (const candidate of fallbackCandidates) {
        try {
          sharedBrowser = await launch(candidate);
          logger.info("[certificates] Using fallback Chromium executable", { executablePath: candidate });
          return sharedBrowser;
        } catch {
          // try next candidate
        }
      }

      throw defaultError;
    }
  } catch (error: unknown) {
    const missingExecutable = isMissingExecutableError(error);

    if (missingExecutable) {
      const fallbackCandidates = resolveExecutableCandidates(configuredExecutable);
      logger.error("[certificates] Playwright chromium executable is missing", {
        hasCustomExecutablePath: Boolean(configuredExecutable),
        configuredExecutablePath: configuredExecutable || undefined,
        fallbackCandidates,
        hint: "Run 'npx playwright install chromium' on the server or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to system chromium",
      });

      throw new Error(
        "CERTIFICATE_RENDERER_BROWSER_MISSING: Playwright Chromium is not installed on this server. " +
          "Run 'npx playwright install chromium' in backend deployment or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/PLAYWRIGHT_EXECUTABLE_PATH/CHROMIUM_PATH."
      );
    }
    throw error;
  }

  const browser = sharedBrowser;
  if (!browser) {
    throw new Error("CERTIFICATE_RENDERER_BROWSER_UNAVAILABLE: Browser launch returned null instance.");
  }
  return browser!;
}

/**
 * Generic HTML -> PDF. Reuses the shared Chromium so callers other than
 * certificates (e.g. progress reports) don't each launch a browser.
 */
export async function renderHtmlToPdf(
  html: string,
  options: { landscape?: boolean; format?: "A4" | "Letter" } = {}
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    const data = await page.pdf({
      printBackground: true,
      format: options.format ?? "A4",
      landscape: options.landscape ?? false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: false,
    });
    return Buffer.from(data);
  } finally {
    await page.close();
  }
}

export class CertificateRenderer {
  private readonly engine = new CertificateTemplateEngine();

  async renderPdf(input: CertificateRenderInput): Promise<Buffer> {
    // The canvas editor compiles the layout (field positions, custom text/images,
    // background) into htmlTemplate+cssTemplate. Whenever a stored HTML template is
    // present we render it verbatim so the PDF matches the editor exactly (true WYSIWYG)
    // — regardless of mode. The hardcoded StudyCod layout stays only as a zero-config
    // fallback for templates that were never customized.
    const hasHtmlTemplate = Boolean(String(input.template?.htmlTemplate ?? "").trim());
    const html = hasHtmlTemplate
      ? this.engine.renderCustomTemplate({
          htmlTemplate: input.template!.htmlTemplate as string,
          cssTemplate: input.template?.cssTemplate,
          payload: input.payload,
        })
      : this.engine.renderStudyCodTemplate({
          payload: input.payload,
          fields: input.fields,
          cssTemplate: input.template?.cssTemplate,
        });

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "networkidle" });
      const data = await page.pdf({
        printBackground: true,
        format: "A4",
        landscape: true,
        margin: {
          top: "0",
          right: "0",
          bottom: "0",
          left: "0",
        },
        preferCSSPageSize: false,
      });
      return Buffer.from(data);
    } finally {
      await page.close();
    }
  }
}

process.on("exit", async () => {
  try {
    if (sharedBrowser) await sharedBrowser.close();
  } catch {}
});
