/**
 * Student progress report — pure model + HTML generation.
 *
 * The data aggregation (DB) and the HTML->PDF rasterization (Playwright) are
 * done elsewhere; this module is the deterministic, testable middle: turn raw
 * per-topic progress into a report model, then into a self-contained,
 * print-ready A4 HTML document.
 */
export interface ProgressTopicInput {
  title: string;
  masteryPct: number;       // 0..1
  status?: string;          // NOT_STARTED | IN_PROGRESS | COMPLETED
  practiceAverage?: number | null; // 0..100
  controlGrade?: number | null;    // 0..100
}

export interface ProgressReportInput {
  studentName: string;
  className?: string | null;
  generatedAt: Date;
  topics: ProgressTopicInput[];
}

export interface ProgressReportModel {
  studentName: string;
  className: string | null;
  generatedAtIso: string;
  topics: Array<{ title: string; masteryPct: number; status: string; practiceAverage: number | null; controlGrade: number | null }>;
  overall: { totalTopics: number; masteredTopics: number; inProgressTopics: number; avgMasteryPct: number };
}

const MASTERED_THRESHOLD = 0.8;

function clamp01(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function buildProgressReportModel(input: ProgressReportInput): ProgressReportModel {
  const topics = (input.topics ?? []).map((t) => ({
    title: String(t.title ?? "").trim() || "—",
    masteryPct: clamp01(t.masteryPct),
    status: String(t.status ?? "").toUpperCase() || "NOT_STARTED",
    practiceAverage: t.practiceAverage == null ? null : Math.round(Number(t.practiceAverage)),
    controlGrade: t.controlGrade == null ? null : Math.round(Number(t.controlGrade)),
  }));

  const masteredTopics = topics.filter((t) => t.masteryPct >= MASTERED_THRESHOLD).length;
  const inProgressTopics = topics.filter((t) => t.masteryPct > 0 && t.masteryPct < MASTERED_THRESHOLD).length;
  const avgMasteryPct = topics.length
    ? Math.round((topics.reduce((s, t) => s + t.masteryPct, 0) / topics.length) * 100)
    : 0;

  return {
    studentName: String(input.studentName ?? "").trim() || "—",
    className: input.className ? String(input.className) : null,
    generatedAtIso: input.generatedAt.toISOString(),
    topics,
    overall: { totalTopics: topics.length, masteredTopics, inProgressTopics, avgMasteryPct },
  };
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bar(pct: number): string {
  const w = Math.round(pct * 100);
  const color = pct >= MASTERED_THRESHOLD ? "#16a34a" : pct > 0 ? "#f59e0b" : "#cbd5e1";
  return `<div class="bar"><div class="fill" style="width:${w}%;background:${color}"></div></div>`;
}

export function renderProgressReportHtml(model: ProgressReportModel): string {
  const date = model.generatedAtIso.slice(0, 10);
  const rows = model.topics
    .map(
      (t) => `<tr>
        <td>${esc(t.title)}</td>
        <td class="num">${Math.round(t.masteryPct * 100)}%</td>
        <td>${bar(t.masteryPct)}</td>
        <td class="num">${t.practiceAverage ?? "—"}</td>
        <td class="num">${t.controlGrade ?? "—"}</td>
      </tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#0f172a; margin:0; padding:32px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:#64748b; font-size:13px; margin-bottom:20px; }
  .cards { display:flex; gap:12px; margin-bottom:20px; }
  .card { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; }
  .card .k { color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .card .v { font-size:24px; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #eef2f7; }
  th { color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .bar { width:120px; height:8px; background:#eef2f7; border-radius:6px; overflow:hidden; }
  .fill { height:100%; }
  .footer { margin-top:24px; color:#94a3b8; font-size:11px; }
</style></head>
<body>
  <h1>Звіт про прогрес</h1>
  <div class="sub">${esc(model.studentName)}${model.className ? " · " + esc(model.className) : ""} · ${esc(date)}</div>
  <div class="cards">
    <div class="card"><div class="k">Середнє засвоєння</div><div class="v">${model.overall.avgMasteryPct}%</div></div>
    <div class="card"><div class="k">Опановано тем</div><div class="v">${model.overall.masteredTopics}/${model.overall.totalTopics}</div></div>
    <div class="card"><div class="k">У процесі</div><div class="v">${model.overall.inProgressTopics}</div></div>
  </div>
  <table>
    <thead><tr><th>Тема</th><th class="num">Засвоєння</th><th>Прогрес</th><th class="num">Практика</th><th class="num">Контроль</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">Немає тем.</td></tr>`}</tbody>
  </table>
  <div class="footer">Згенеровано StudyCod · ${esc(model.generatedAtIso)}</div>
</body></html>`;
}
