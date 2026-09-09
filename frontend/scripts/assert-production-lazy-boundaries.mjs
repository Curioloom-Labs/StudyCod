import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const entryPath = fileURLToPath(new URL("../dist/index.html", import.meta.url));
const distPath = path.dirname(entryPath);
const html = await readFile(entryPath, "utf8");

if (/monaco-/i.test(html)) {
  throw new Error("Production entry must not preload Monaco assets; keep the editor behind its dynamic import boundary.");
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

const editorAssets = (await readdir(path.join(distPath, "assets")))
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
console.log(`Lazy boundary check passed: no Monaco preload; initial JavaScript is ${entryBytes} bytes (budget ${entryBudgetBytes}); largest Monaco chunk is ${largestEditorAsset} bytes (budget ${editorChunkBudgetBytes}).`);
