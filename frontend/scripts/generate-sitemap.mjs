import { promises as fs } from "node:fs";
import path from "node:path";

function normalizeBaseUrl(raw) {
  const base = String(raw || "").trim() || "https://studycod.space";
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

  // Public crawlable routes for SPA shell.
  const urls = [
    { path: "/", changefreq: "daily", priority: "1.0" },
    { path: "/docs", changefreq: "weekly", priority: "0.8" },
    { path: "/pricing", changefreq: "weekly", priority: "0.8" },
    { path: "/privacy", changefreq: "monthly", priority: "0.5" },
    { path: "/terms", changefreq: "monthly", priority: "0.5" },
    { path: "/refunds", changefreq: "monthly", priority: "0.5" },
    { path: "/cookies", changefreq: "monthly", priority: "0.5" },
    ...[
      "welcome",
      "getting-started",
      "navigation",
      "ux-acceptance",
      "profile-progress-model",
      "personal",
      "personal-tasks",
      "playground",
      "edu-student",
      "edu-teacher",
      "edu-classes",
      "edu-courses",
      "edu-topics",
      "edu-tasks",
      "edu-controlworks",
      "edu-quizzes",
      "edu-gradebook",
      "edu-thematic",
      "edu-calendar",
      "edu-live",
      "edu-appeals",
      "edu-import-export",
      "edu-announcements",
      "grading",
      "faq",
      "troubleshooting",
      "privacy"
    ].map(path => ({ path: `/docs/${path}`, changefreq: "monthly", priority: "0.6" }))
  ];
  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => {
      const loc = `${baseUrl}${u.path}`;
      return `  <url><loc>${loc}</loc><lastmod>${now}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`;
    }).join("\n") +
    `\n</urlset>\n`;

  await fs.writeFile(path.join(distDir, "sitemap.xml"), xml, "utf8");
}

main().catch(err => {
  console.error("[generate-sitemap] failed:", err);
  process.exitCode = 1;
});
