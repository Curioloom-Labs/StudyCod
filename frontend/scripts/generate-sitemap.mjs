import { promises as fs } from "node:fs";
import path from "node:path";

function normalizeBaseUrl(raw) {
  const base = String(raw || "").trim() || "http://localhost";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function main() {
  const distDir = path.resolve(process.cwd(), "dist");

  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) return;
  } catch {
    // No dist directory (e.g., build skipped) – do nothing.
    return;
  }

  const baseUrl = normalizeBaseUrl(process.env.SITE_URL || process.env.VITE_SITE_URL);

  // This app is an SPA; a minimal sitemap is enough.
  const urls = ["/"];
  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => {
      const loc = `${baseUrl}${u}`;
      return `  <url><loc>${loc}</loc><lastmod>${now}</lastmod></url>`;
    }).join("\n") +
    `\n</urlset>\n`;

  await fs.writeFile(path.join(distDir, "sitemap.xml"), xml, "utf8");
}

main().catch(err => {
  console.error("[generate-sitemap] failed:", err);
  process.exitCode = 1;
});
