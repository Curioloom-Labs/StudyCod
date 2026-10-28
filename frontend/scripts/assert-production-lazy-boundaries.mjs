import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outputDir = process.env.STUDYCOD_BUILD_OUT_DIR?.trim() || "dist";
const entryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", outputDir, "index.html");
const distPath = path.dirname(entryPath);
const html = await readFile(entryPath, "utf8");

if (/monaco-/i.test(html)) {
  throw new Error("Production entry must not preload Monaco assets; keep the editor behind its dynamic import boundary.");
}

// Keep the entry compatible with the production CSP. Runtime bootstraps must
// be same-origin files (or module bundles), never anonymous inline scripts that
// require a brittle hash/nonce in Nginx configuration.
const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)];
if (inlineScripts.length > 0) {
  throw new Error(`Production entry contains ${inlineScripts.length} inline script(s); move them to same-origin assets.`);
}

const entryJavaScript = [...html.matchAll(/(?:href|src)="(\/assets\/[^\"]+\.js)"/g)]
  .map(match => match[1])
  .filter((asset, index, assets) => assets.indexOf(asset) === index);
const entryBytes = (await Promise.all(entryJavaScript.map(async asset => {
  const assetPath = path.join(distPath, asset.replace(/^\//, ""));
  return (await stat(assetPath)).size;
}))).reduce((total, size) => total + size, 0);
const entryBudgetBytes = 900_000;

if (entryBytes > entryBudgetBytes) {
  throw new Error(`Production entry JavaScript is ${entryBytes} bytes; budget is ${entryBudgetBytes} bytes.`);
}

const assetNames = await readdir(path.join(distPath, "assets"));
// The workspace relies on Tailwind's generated layout utilities. A build
// from a different working directory must not silently ship an incomplete CSS
// bundle: that removes spacing and collapses layouts across multiple routes.
const cssAssets = await Promise.all(assetNames.filter(asset => asset.endsWith(".css"))
  .map(asset => readFile(path.join(distPath, "assets", asset), "utf8")));
const workspaceCss = cssAssets.find(css => css.includes(".max-w-7xl{") && css.includes(".px-4{"));
if (!workspaceCss || !/--spacing\s*:\s*(?:0?\.25rem)/.test(workspaceCss)
  || !workspaceCss.includes(".mx-auto{") || !workspaceCss.includes(".w-full{")) {
  throw new Error("Production workspace CSS is missing essential width or spacing utilities.");
}
const editorAssets = assetNames
  .filter((asset) => /^monaco-.*\.js$/i.test(asset));
const editorAssetSizes = await Promise.all(editorAssets.map(async (asset) => ({
  asset,
  bytes: (await stat(path.join(distPath, "assets", asset))).size,
})));
// Monaco's editor API has intentional circular references. It must stay in a
// single lazy chunk to avoid cross-chunk temporal-dead-zone failures. The
// chunk is gzip-compressed in production and is still excluded from the entry.
const editorChunkBudgetBytes = 4_500_000;
const oversizedEditorAssets = editorAssetSizes.filter(({ bytes }) => bytes > editorChunkBudgetBytes);
if (oversizedEditorAssets.length > 0) {
  throw new Error(`Monaco chunks exceed the ${editorChunkBudgetBytes} byte budget: ${oversizedEditorAssets.map(({ asset, bytes }) => `${asset} (${bytes} bytes)`).join(", ")}`);
}

const largestEditorAsset = Math.max(0, ...editorAssetSizes.map(({ bytes }) => bytes));
// Check the entry and each lazy page's static graph. Excluding preload links
// alone does not prevent a shared helper from importing an editor chunk.
const routeRoots = [
  ...entryJavaScript.map(asset => path.join(distPath, asset.replace(/^\//, ""))),
  ...assetNames
    .filter(asset => /^(App|PortfolioProjectsPage|PortfolioDashboardPage|PublicPortfolioPage|EvidencePackPage|AssessWorkspacePage|AssessInterviewRoom|PortfolioPublicationPage|PortfolioReviewInboxPage|PortfolioReviewQueuePage)-.*\.js$/.test(asset))
    .map(asset => path.join(distPath, "assets", asset)),
];
const visited = new Set();
async function checkStaticImports(file, trail = []) {
  if (/^monaco-/i.test(path.basename(file))) throw new Error(`Route statically imports Monaco: ${[...trail, path.basename(file)].join(" → ")}`);
  if (visited.has(file)) return;
  visited.add(file);
  const source = await readFile(file, "utf8");
  const imports = [...source.matchAll(/\b(?:import|export)\s*(?:[^;"'()]*?\bfrom\s*)?["'](\.[^"']+\.js)["']/g)];
  for (const match of imports) await checkStaticImports(path.resolve(path.dirname(file), match[1]), [...trail, path.basename(file)]);
}
for (const root of routeRoots) await checkStaticImports(root);
console.log(`Lazy boundary check passed: no Monaco preload; initial JavaScript is ${entryBytes} bytes (budget ${entryBudgetBytes}); largest Monaco chunk is ${largestEditorAsset} bytes (budget ${editorChunkBudgetBytes}).`);
