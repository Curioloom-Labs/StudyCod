import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import QRCode from "qrcode";
import { createTournamentDiploma, type TournamentDiplomaVariant } from "../../../shared/tournamentDiplomas";
import { CertificateTemplateEngine } from "../services/certificates/CertificateTemplateEngine";
import { fitTournamentDiploma } from "../services/certificates/fitTournamentDiploma";

async function main() {
  const destination = path.resolve(__dirname, "../../../design/diplomas/code-form");
  const signatureArg = process.argv.indexOf("--signature");
  const organizerArg = process.argv.indexOf("--organizer");
  const organizerName = organizerArg >= 0 ? process.argv[organizerArg + 1] : undefined;
  const signatureDataUrl = signatureArg >= 0 ? `data:image/png;base64,${fs.readFileSync(path.resolve(process.argv[signatureArg + 1])).toString("base64")}` : undefined;
  fs.mkdirSync(destination, { recursive: true });
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const engine = new CertificateTemplateEngine();
  const qr = await QRCode.toDataURL("StudyCod — зразок диплома", { margin: 1, width: 200 });
  const samples: Array<{ name: string; html: string; head: { x: number; y: number; width: number; height: number } }> = [];
  try {
    for (const variant of ["participant", "1", "2", "3", "automatic"] as TournamentDiplomaVariant[]) {
      const template = createTournamentDiploma(variant, { signatureDataUrl, organizerName });
      const filename = variant === "participant" ? "participant" : variant === "automatic" ? "automatic" : `place-${variant}`;
      fs.writeFileSync(path.join(destination, `${filename}.json`), JSON.stringify(template, null, 2) + "\n");
      const payload = {
        contest_name: "Турнір із програмування StudyCod",
        name: "Ім’я та прізвище учасника", full_name: "Ім’я та прізвище учасника",
        place: variant === "participant" ? null : variant === "automatic" ? "1" : variant,
        score: 300, max_score: 300, date: "22.10.2026", organizer: "StudyCod",
        signature: "StudyCod", certificate_id: "SC-SAMPLE · ЗРАЗОК", qr_code: qr,
      };
      const html = engine.renderCustomTemplate({ ...template, payload });
      fs.writeFileSync(path.join(destination, `${filename}.html`), html);
      const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 1.5 });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate("document.fonts.ready");
      await fitTournamentDiploma(page);
      await page.pdf({ path: path.join(destination, `${filename}.pdf`), format: "A4", landscape: true, printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
      if (variant !== "automatic") {
        await page.screenshot({ path: path.join(destination, `${filename}.png`) });
        const head = await page.locator(".sc-ordinal").boundingBox();
        if (!head || head.x < 0 || head.y < 0 || head.x + head.width > 1124 || head.y + head.height > 794) throw new Error(`Diploma head placement: ${variant}`);
        samples.push({ name: filename, html, head });
      }
      const name = await page.locator(".sc-name").boundingBox();
      const merit = await page.locator(".sc-merit").boundingBox();
      const graphic = await page.locator(".sc-ordinal").boundingBox();
      const recipient = await page.locator(".sc-recipient").boundingBox();
      const award = await page.locator(".sc-award").boundingBox();
      const title = await page.locator(".sc-title-row").boundingBox();
      const verification = await page.locator(".sc-verification").boundingBox();
      const signature = await page.locator(".sc-signature").boundingBox();
      const overflow = await page.evaluate<boolean>("document.body.scrollWidth > 1124 || document.body.scrollHeight > 795");
      if (!name || !merit || name.y + name.height >= merit.y || overflow) throw new Error(`Diploma layout overflow: ${variant}`);
      if (!graphic || !recipient || !award || !title || !verification || !signature || graphic.x < 0 || graphic.x + graphic.width > 1124 || graphic.y < 0 || graphic.y + graphic.height > 794) throw new Error(`Diploma graphic placement: ${variant}`);
      // The award occupies the right column; all text and footer content stays to its left.
      if ([title, award, recipient, merit, verification, signature].some(box => box && box.x + box.width >= graphic.x)) throw new Error(`Diploma text overlaps the sculpture: ${variant}`);
      const longHtml = engine.renderCustomTemplate({ ...template, payload: {
        ...payload, name: "Дуже довге ім’я та прізвище учасника змагання ".repeat(5).slice(0, 180),
        contest_name: "Відкритий турнір із програмування для учнів закладів освіти ".repeat(5).slice(0, 255),
      } });
      await page.setContent(longHtml, { waitUntil: "load" });
      await page.evaluate("document.fonts.ready");
      await fitTournamentDiploma(page);
      const recipientBox = await page.locator(".sc-recipient").boundingBox();
      const meritBox = await page.locator(".sc-merit").boundingBox();
      const signatureImage = await page.locator(".sc-signature-image").count() ? await page.locator(".sc-signature-image").boundingBox() : null;
      if (!recipientBox || !meritBox || recipientBox.y + recipientBox.height >= Math.min(meritBox.y, signatureImage?.y ?? Infinity)) throw new Error(`Long diploma text overflow: ${variant}`);
      await page.close();
    }
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 1220 }, deviceScaleFactor: 1 });
    const tiles = samples.map(s => `<article><h2>${s.name === "participant" ? "УЧАСНИК" : `${s.name.slice(-1)} МІСЦЕ`}</h2><iframe srcdoc="${s.html.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe></article>`).join("");
    await sheet.setContent(`<html><head><meta charset="utf-8"><style>body{margin:0;padding:30px 40px;background:#e6e9e6;color:#1c383e;font-family:Arial}h1{font-size:25px;margin:0 0 4px}p{font-size:13px;color:#536c70;margin:0 0 24px}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}article{position:relative;min-width:0;height:560px;overflow:hidden}h2{font-size:10px;letter-spacing:2px;font-weight:500;margin:0 0 12px}iframe{width:1123px;height:794px;border:0;transform:scale(.66);transform-origin:top left;box-shadow:0 10px 45px #122e3620;pointer-events:none}</style></head><body><h1>StudyCod · Код форми</h1><p>Дипломи турніру з програмування · A4 · графіка нагород · зразки</p><div class="grid">${tiles}</div></body></html>`, { waitUntil: "load" });
    await sheet.screenshot({ path: path.join(destination, "preview.png"), fullPage: true });
    await sheet.close();
    const joints = await browser.newPage({ viewport: { width: 1600, height: 1220 }, deviceScaleFactor: 1 });
    const jointTiles = samples.map(s => {
      const artOnly = s.html.replace("</head>", "<style>.sc-header,.sc-title-row,.sc-award,.sc-recipient,.sc-footer{visibility:hidden}</style></head>");
      const scale = Math.min(1.5, 660 / s.head.width, 430 / s.head.height);
      return `<article><h2>${s.name === "participant" ? "УЧАСНИК" : `${s.name.slice(-1)} МІСЦЕ`}</h2><iframe style="left:${(740 - s.head.width * scale) / 2 - s.head.x * scale}px;top:${50 - s.head.y * scale}px;transform:scale(${scale})" srcdoc="${artOnly.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe></article>`;
    }).join("");
    await joints.setContent(`<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:30px 40px;background:#e6e9e6;color:#1c383e;font-family:Arial}h1{font-size:25px;margin:0 0 4px}p{font-size:13px;color:#536c70;margin:0 0 24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{position:relative;height:530px;overflow:hidden;background:#fffefa}h2{position:absolute;z-index:1;left:24px;top:15px;margin:0;font-size:11px;letter-spacing:2px;font-weight:500;background:#fffefa;padding:5px}iframe{position:absolute;width:1123px;height:794px;border:0;transform-origin:top left;pointer-events:none}</style></head><body><h1>StudyCod · Графіка дипломів</h1><p>Векторні куби та медальйон учасника</p><div class="grid">${jointTiles}</div></body></html>`, { waitUntil: "load" });
    await joints.screenshot({ path: path.join(destination, "artwork-detail.png"), fullPage: true });
    await joints.close();
    console.log(`Exported diploma templates and previews to ${destination}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
