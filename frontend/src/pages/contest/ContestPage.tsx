import React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ListOrdered, Table2, KeyRound, RefreshCw, Trophy, Eye, Ban, RotateCcw, MessageSquare, Megaphone, Send, Flame, ShieldCheck, Users2, Award } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusChip, type StatusChipTone } from "../../components/ui/StatusChip";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { MarkdownView } from "../../components/MarkdownView";
import { CodeEditor } from "../../components/CodeEditor";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  addContestProblem,
  addContestOrganizer,
  answerContestCommunityQuestion,
  getContestCommunity,
  getContestDetails,
  generateContestAccounts,
  sendContestAccountsEmails,
  getContestMyProgress,
  getContestScoreboard,
  listContestOrganizers,
  listContestAnnulments,
  listContestAdminParticipants,
  listContestParticipantSubmissionsForAdmin,
  postContestCommunityAnnouncement,
  postContestCommunityQuestion,
  removeContestOrganizer,
  setContestAnnulment,
  setContestPaused,
  setContestParticipantDisqualified,
  joinContest,
  updateContestProblemSettings,
  updateContest,
  type ContestAdminParticipant,
  type ContestAdminSubmission,
  type ContestGeneratedAccount,
  type ContestCommunityData,
  type ContestDetails,
  type ContestAnnulmentItem,
  type ContestOrganizerListItem,
  type ContestMyProgressProblem,
  type ScoreboardProblem,
  type ScoreboardRow,
} from "../../lib/api/contests";
import {
  importLibraryTaskArchive,
  listApprovedLibraryTasks,
  listMyLibraryTasks,
  type LibraryTaskListItem,
} from "../../lib/api/library";
import {
  createCertificateTemplate,
  getCertificateTemplateById,
  listCertificateTemplates,
  generateContestCertificates,
  updateContestCertificateSettings,
} from "../../lib/api/certificates";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import {
  CERTIFICATE_CANVAS_HEIGHT,
  CERTIFICATE_CANVAS_WIDTH,
  isSupportedCertificateBackgroundFile,
  isSvgCertificateBackgroundFile,
  normalizeCertificateBackgroundSource,
  toCssUrlValue,
} from "../../lib/certificates/editorShared";

type ParsedTestInput = {
  input?: unknown;
  expectedOutput?: unknown;
  isHidden?: unknown;
  points?: unknown;
};

type CodeEditorLanguage = "JAVA" | "PYTHON" | "CPP" | "java" | "python" | "cpp" | "c" | "csharp" | "kotlin" | "html" | "css" | "javascript";

function toCodeEditorLanguage(value: unknown): CodeEditorLanguage {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "java") return "java";
  if (raw === "python") return "python";
  if (raw === "cpp") return "cpp";
  if (raw === "c") return "c";
  if (raw === "csharp") return "csharp";
  if (raw === "kotlin") return "kotlin";
  if (raw === "html") return "html";
  if (raw === "css") return "css";
  if (raw === "javascript" || raw === "js") return "javascript";
  if (raw === "JAVA") return "JAVA";
  if (raw === "PYTHON") return "PYTHON";
  if (raw === "CPP") return "CPP";
  return "java";
}

function getErrorMessage(error: unknown): string {
  return getErrorMessageFromUnknown(error, "");
}

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function toDateTimeLocalInput(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalInput(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseTestsJson(raw: string): Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }> {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("TESTS_JSON_MUST_BE_ARRAY");
  return parsed.map((item) => {
    const t: ParsedTestInput = item && typeof item === "object" ? (item as ParsedTestInput) : {};
    return {
      input: String(t.input ?? ""),
      expectedOutput: String(t.expectedOutput ?? ""),
      isHidden: Boolean(t.isHidden),
      points: t.points != null ? Number(t.points) : undefined,
    };
  });
}

function inferDifficultyFromTests(tests: Array<{ points?: number }>): "EASY" | "MEDIUM" | "HARD" | undefined {
  if (!Array.isArray(tests) || tests.length === 0) return undefined;
  const total = tests.reduce((sum, t) => sum + (Number.isFinite(Number(t?.points)) ? Math.max(1, Number(t?.points)) : 1), 0);
  if (total >= 250 || tests.length >= 16) return "HARD";
  if (total >= 120 || tests.length >= 8) return "MEDIUM";
  return "EASY";
}

function parseRosterInput(raw: string): Array<{ fullName: string; email: string }> {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const out: Array<{ fullName: string; email: string }> = [];
  for (const line of lines) {
    const parts = line.split(/[;,\t]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const email = String(parts[parts.length - 1] ?? "").trim();
    const fullName = parts.slice(0, -1).join(" ").trim();
    if (!fullName || !email) continue;
    out.push({ fullName, email });
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => String(x ?? "").trim());
}

type RosterCsvParseResult = {
  entries: Array<{ fullName: string; email: string }>;
  invalidLines: string[];
  duplicateEmails: string[];
};

function parseRosterCsvTextDetailed(raw: string): RosterCsvParseResult {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const entries: Array<{ fullName: string; email: string }> = [];
  const invalidLines: string[] = [];
  const emailHit = new Map<string, number>();

  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (cells.length < 2) {
      invalidLines.push(line);
      continue;
    }

    const first = String(cells[0] ?? "").toLowerCase();
    const second = String(cells[1] ?? "").toLowerCase();
    const isHeader =
      first.includes("fullname") ||
      first.includes("full_name") ||
      first.includes("піб") ||
      first.includes("name") ||
      second.includes("email");
    if (isHeader) continue;

    const fullName = String(cells[0] ?? "").trim();
    const email = String(cells[1] ?? "").trim();
    const emailOk = /\S+@\S+\.\S+/.test(email);
    if (!fullName || !email || !emailOk) {
      invalidLines.push(line);
      continue;
    }

    const emailKey = email.toLowerCase();
    emailHit.set(emailKey, (emailHit.get(emailKey) ?? 0) + 1);
    entries.push({ fullName, email });
  }

  const duplicateEmails = Array.from(emailHit.entries())
    .filter(([, count]) => count > 1)
    .map(([email]) => email);

  return { entries, invalidLines, duplicateEmails };
}

type RosterInputAnalysis = {
  entries: Array<{ fullName: string; email: string }>;
  invalidLines: string[];
  duplicateEmails: string[];
};

function analyzeRosterInput(raw: string): RosterInputAnalysis {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const entries: Array<{ fullName: string; email: string }> = [];
  const invalidLines: string[] = [];
  const emailHit = new Map<string, number>();

  for (const line of lines) {
    const parts = line.split(/[;,\t]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      invalidLines.push(line);
      continue;
    }

    const email = String(parts[parts.length - 1] ?? "").trim();
    const fullName = parts.slice(0, -1).join(" ").trim();
    const emailOk = /\S+@\S+\.\S+/.test(email);
    if (!fullName || !email || !emailOk) {
      invalidLines.push(line);
      continue;
    }

    const emailKey = email.toLowerCase();
    emailHit.set(emailKey, (emailHit.get(emailKey) ?? 0) + 1);
    entries.push({ fullName, email });
  }

  const duplicateEmails = Array.from(emailHit.entries())
    .filter(([, count]) => count > 1)
    .map(([email]) => email);

  return { entries, invalidLines, duplicateEmails };
}

function makeRosterRowKey(row: { fullName: string; email: string }): string {
  return `${row.email.trim().toLowerCase()}|${row.fullName.trim().toLowerCase()}`;
}

function mergeRosterRows(
  existing: Array<{ fullName: string; email: string }>,
  incoming: Array<{ fullName: string; email: string }>
): Array<{ fullName: string; email: string }> {
  const dedup = new Map<string, { fullName: string; email: string }>();
  for (const row of [...existing, ...incoming]) {
    const key = makeRosterRowKey(row);
    dedup.set(key, { fullName: row.fullName.trim(), email: row.email.trim() });
  }
  return Array.from(dedup.values());
}

type TrFn = (uk: string, en: string) => string;

type CertificateFieldKey =
  | "contest_name"
  | "name"
  | "full_name"
  | "place"
  | "score"
  | "max_score"
  | "date"
  | "organizer"
  | "signature"
  | "certificate_id"
  | "qr_code";

const CERTIFICATE_FIELD_KEYS: CertificateFieldKey[] = [
  "contest_name",
  "name",
  "full_name",
  "place",
  "score",
  "max_score",
  "date",
  "organizer",
  "signature",
  "certificate_id",
  "qr_code",
];

type CertificateFieldLayout = {
  x: number;
  y: number;
  fontSize: number;
  align: "left" | "center" | "right";
  fontWeight: number;
  width: number;
};

type CertificateLayoutState = Record<CertificateFieldKey, CertificateFieldLayout>;

const defaultCertificateFieldsState = (): Record<CertificateFieldKey, { isEnabled: boolean; isRequired: boolean }> => ({
  contest_name: { isEnabled: true, isRequired: false },
  name: { isEnabled: true, isRequired: true },
  full_name: { isEnabled: false, isRequired: false },
  place: { isEnabled: true, isRequired: false },
  score: { isEnabled: true, isRequired: true },
  max_score: { isEnabled: true, isRequired: false },
  date: { isEnabled: true, isRequired: false },
  organizer: { isEnabled: true, isRequired: false },
  signature: { isEnabled: true, isRequired: true },
  certificate_id: { isEnabled: true, isRequired: false },
  qr_code: { isEnabled: true, isRequired: false },
});

const defaultCertificateLayoutState = (): CertificateLayoutState => ({
  contest_name: { x: 50, y: 18, fontSize: 28, align: "center", fontWeight: 700, width: 76 },
  name: { x: 50, y: 34, fontSize: 34, align: "center", fontWeight: 700, width: 80 },
  full_name: { x: 50, y: 40, fontSize: 42, align: "center", fontWeight: 700, width: 84 },
  place: { x: 50, y: 45, fontSize: 26, align: "center", fontWeight: 600, width: 52 },
  score: { x: 50, y: 53, fontSize: 22, align: "center", fontWeight: 600, width: 44 },
  max_score: { x: 62, y: 53, fontSize: 18, align: "left", fontWeight: 500, width: 20 },
  date: { x: 12, y: 87, fontSize: 16, align: "left", fontWeight: 500, width: 24 },
  organizer: { x: 50, y: 87, fontSize: 16, align: "center", fontWeight: 500, width: 40 },
  signature: { x: 84, y: 87, fontSize: 16, align: "right", fontWeight: 500, width: 24 },
  certificate_id: { x: 12, y: 93, fontSize: 12, align: "left", fontWeight: 500, width: 30 },
  qr_code: { x: 86, y: 93, fontSize: 12, align: "right", fontWeight: 500, width: 12 },
});

type CertificateLayoutPresetItem = {
  id: string;
  name: string;
  createdAt: string;
  bgUrl: string;
  layout: CertificateLayoutState;
};

type CertificateLayoutSnapshot = {
  layout: CertificateLayoutState;
  bgUrl: string;
};

type CertificateLayoutGuide = {
  axis: "x" | "y";
  value: number;
  source: "center" | "field";
};

type CertificateExtraObjectType = "text" | "image" | "shape";

type CertificateExtraObject = {
  id: string;
  type: CertificateExtraObjectType;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  align: "left" | "center" | "right";
  fontSize: number;
  fontWeight: number;
  text: string;
  imageUrl: string;
  color: string;
  backgroundColor: string;
  opacity: number;
  borderRadius: number;
  rotation: number;
};

function cssClassSafeId(input: string): string {
  return String(input ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function escapeHtmlText(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createDefaultCertificateExtraObject(type: CertificateExtraObjectType, x = 50, y = 50): CertificateExtraObject {
  const id = `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (type === "image") {
    return {
      id,
      type,
      zIndex: 20,
      x,
      y,
      width: 18,
      height: 18,
      align: "center",
      fontSize: 18,
      fontWeight: 500,
      text: "",
      imageUrl: "",
      color: "#0f172a",
      backgroundColor: "rgba(255,255,255,0.0)",
      opacity: 1,
      borderRadius: 6,
      rotation: 0,
    };
  }
  if (type === "shape") {
    return {
      id,
      type,
      zIndex: 20,
      x,
      y,
      width: 16,
      height: 10,
      align: "center",
      fontSize: 14,
      fontWeight: 500,
      text: "",
      imageUrl: "",
      color: "#0f172a",
      backgroundColor: "rgba(59,130,246,0.25)",
      opacity: 1,
      borderRadius: 6,
      rotation: 0,
    };
  }
  return {
    id,
    type,
    zIndex: 20,
    x,
    y,
    width: 28,
    height: 8,
    align: "center",
    fontSize: 22,
    fontWeight: 600,
    text: "Additional text",
    imageUrl: "",
    color: "#0f172a",
    backgroundColor: "rgba(255,255,255,0.0)",
    opacity: 1,
    borderRadius: 0,
    rotation: 0,
  };
}

function certificateExtraObjectTypeLabel(type: CertificateExtraObjectType, tr: TrFn): string {
  switch (type) {
    case "text":
      return tr("Текст", "Text");
    case "image":
      return tr("Картинка", "Image");
    case "shape":
      return tr("Фігура", "Shape");
    default:
      return type;
  }
}

function normalizeCertificateLayoutState(layout: CertificateLayoutState): CertificateLayoutState {
  const base = defaultCertificateLayoutState();
  const safe = { ...base };
  for (const key of CERTIFICATE_FIELD_KEYS) {
    const src = layout?.[key] ?? base[key];
    const rawX = Number(src?.x ?? base[key].x);
    const rawY = Number(src?.y ?? base[key].y);
    const normalizedX = rawX > 100 ? (rawX / CERTIFICATE_CANVAS_WIDTH) * 100 : rawX;
    const normalizedY = rawY > 100 ? (rawY / CERTIFICATE_CANVAS_HEIGHT) * 100 : rawY;
    safe[key] = {
      x: normalizedX,
      y: normalizedY,
      fontSize: Number(src?.fontSize ?? base[key].fontSize),
      align: src?.align === "right" || src?.align === "center" ? src.align : "left",
      fontWeight: Number(src?.fontWeight ?? base[key].fontWeight),
      width: Number(src?.width ?? base[key].width),
    };
  }
  return safe;
}

function certificateLayoutPresetStorageKey(contestId: number | null): string {
  return `studycod:capture:certificate-layout-presets:${Number.isFinite(Number(contestId)) ? Number(contestId) : "global"}`;
}

function readCertificateLayoutPresets(contestId: number | null): CertificateLayoutPresetItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(certificateLayoutPresetStorageKey(contestId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const anyPreset = p as Partial<CertificateLayoutPresetItem>;
        const name = String(anyPreset.name ?? "").trim();
        const id = String(anyPreset.id ?? "").trim();
        if (!name || !id) return null;
        return {
          id,
          name,
          createdAt: String(anyPreset.createdAt ?? new Date().toISOString()),
          bgUrl: String((anyPreset as { bgUrl?: unknown }).bgUrl ?? (anyPreset as { backgroundUrl?: unknown }).backgroundUrl ?? ""),
          layout: normalizeCertificateLayoutState(anyPreset.layout as CertificateLayoutState),
        } as CertificateLayoutPresetItem;
      })
      .filter((p): p is CertificateLayoutPresetItem => Boolean(p));
  } catch {
    return [];
  }
}

function writeCertificateLayoutPresets(contestId: number | null, presets: CertificateLayoutPresetItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(certificateLayoutPresetStorageKey(contestId), JSON.stringify(presets));
  } catch {
    // ignore storage write errors
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function snapByStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function areCertificateLayoutSnapshotsEqual(a: CertificateLayoutSnapshot | null | undefined, b: CertificateLayoutSnapshot | null | undefined): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function certificateFieldLabel(key: CertificateFieldKey, tr: TrFn): string {
  switch (key) {
    case "contest_name":
      return tr("Назва контесту", "Contest name");
    case "name":
      return tr("Нікнейм", "Nickname");
    case "full_name":
      return tr("Ім'я Прізвище", "Full name");
    case "place":
      return tr("Місце", "Place");
    case "score":
      return tr("Бали", "Score");
    case "max_score":
      return tr("Макс. бали", "Max score");
    case "date":
      return tr("Дата", "Date");
    case "organizer":
      return tr("Організатор", "Organizer");
    case "signature":
      return tr("Підпис", "Signature");
    case "certificate_id":
      return tr("ID сертифіката", "Certificate ID");
    case "qr_code":
      return tr("QR-код", "QR code");
    default:
      return key;
  }
}

function certificateCanvasSampleValue(key: CertificateFieldKey): string {
  switch (key) {
    case "contest_name":
      return "StudyCod Open 2026";
    case "name":
      return "nikitosruban007_";
    case "full_name":
      return "Ada Lovelace";
    case "place":
      return "1 place";
    case "score":
      return "95";
    case "max_score":
      return "100";
    case "date":
      return "2026-03-15";
    case "organizer":
      return "StudyCod";
    case "signature":
      return "StudyCod Team";
    case "certificate_id":
      return "SC-DEMO-0001";
    case "qr_code":
      return "[QR]";
    default:
      return key;
  }
}

function renderCertificatePreviewHtml(params: {
  htmlTemplate: string;
  cssTemplate: string;
  fields: Record<CertificateFieldKey, { isEnabled: boolean; isRequired: boolean }>;
  fitToCanvas?: boolean;
}) {
  const fallbackScoreLine = (() => {
    const hasScore = Boolean(params.fields.score?.isEnabled);
    const hasMaxScore = Boolean(params.fields.max_score?.isEnabled);
    if (hasScore && hasMaxScore) return `<p>Score: <b>{{score}}</b> / {{max_score}}</p>`;
    if (hasScore) return `<p>Score: <b>{{score}}</b></p>`;
    if (hasMaxScore) return `<p>Max score: <b>{{max_score}}</b></p>`;
    return "";
  })();

  const fallbackTemplate = `
<div class="cert-wrap">
  <h1>Certificate of Achievement</h1>
  <p>This certifies that <b>{{name}}</b> participated in <b>{{contest_name}}</b>.</p>
  ${fallbackScoreLine}
  <p>Date: {{date}}</p>
  <p>Organizer: {{organizer}}</p>
  <p>ID: {{certificate_id}}</p>
  <img src="{{qr_code}}" alt="QR" style="width:120px;height:120px;object-fit:contain;border:1px solid #334155;border-radius:8px;background:#fff;" />
</div>
`;

  const sampleValues: Record<CertificateFieldKey, string> = {
    contest_name: "StudyCod Open 2026",
    name: "nikitosruban007_",
    full_name: "Ada Lovelace",
    place: "1",
    score: "100",
    max_score: "100",
    date: "2026-03-15",
    organizer: "StudyCod",
    signature: "StudyCod Team",
    certificate_id: "SC-DEMO-0001",
    qr_code: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='white'/%3E%3Cpath d='M10 10h30v30H10zM80 10h30v30H80zM10 80h30v30H10z' fill='%231f2937'/%3E%3Cpath d='M55 55h10v10H55zM70 70h10v10H70zM55 85h10v10H55zM85 55h10v10H85z' fill='%230f172a'/%3E%3C/svg%3E",
  };

  let html = String(params.htmlTemplate || "").trim() || fallbackTemplate;
  html = html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, rawKey: string) => {
    const key = String(rawKey ?? "") as CertificateFieldKey;
    if (!Object.prototype.hasOwnProperty.call(sampleValues, key)) return "";
    if (!params.fields[key]?.isEnabled) return "";
    return sampleValues[key] ?? "";
  });

  const css = String(params.cssTemplate || "").trim();
  const fitToCanvas = params.fitToCanvas !== false;

  if (!fitToCanvas) {
    return `<!doctype html><html><head><meta charset=\"utf-8\" /><style>
    body { margin: 0; padding: 20px; font-family: Inter, Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
    .cert-wrap { border: 2px solid #334155; border-radius: 12px; padding: 24px; background: #111827; }
    h1 { margin: 0 0 16px; font-size: 30px; }
    p { margin: 8px 0; line-height: 1.4; }
    ${css}
    </style></head><body>${html}</body></html>`;
  }

  return `<!doctype html><html><head><meta charset=\"utf-8\" /><style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0f172a; }
  body { font-family: Inter, Arial, sans-serif; }
  #preview-viewport {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  #preview-scale-root {
    width: 1123px;
    height: 794px;
    transform-origin: top left;
    will-change: transform;
  }
  .cert-wrap {
    box-sizing: border-box;
  }
  ${css}
  </style></head><body>
  <div id="preview-viewport"><div id="preview-scale-root">${html}</div></div>
  <script>
    (function () {
      var BASE_W = 1123;
      var BASE_H = 794;
      var root = document.getElementById('preview-scale-root');
      function applyScale() {
        if (!root) return;
        var scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
        if (!isFinite(scale) || scale <= 0) scale = 1;
        root.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', applyScale);
      applyScale();
    })();
  </script>
  </body></html>`;
}

function extractTemplatePlaceholders(template: string): string[] {
  const text = String(template ?? "");
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const key = String(match[1] ?? "").trim();
    if (key) keys.add(key);
  }
  return Array.from(keys.values());
}

function buildCustomAutoLayoutHtml(
  fields: Record<CertificateFieldKey, { isEnabled: boolean; isRequired: boolean }>,
  extraObjects: CertificateExtraObject[]
): string {
  const lines = CERTIFICATE_FIELD_KEYS
    .filter((key) => Boolean(fields[key]?.isEnabled))
    .map((key) => key === "qr_code"
      ? `<img class="cf-field cf-${key} cf-qr-image" src="{{${key}}}" alt="qr" />`
      : `<div class="cf-field cf-${key}">{{${key}}}</div>`);

  const extraLines = extraObjects.map((obj) => {
    const cls = `cf-extra-${cssClassSafeId(obj.id)}`;
    if (obj.type === "image") {
      const src = String(obj.imageUrl ?? "").trim();
      const safeAlt = escapeHtmlText("certificate-image");
      return `<img class="cf-extra ${cls}" src="${escapeHtmlText(src)}" alt="${safeAlt}" />`;
    }
    if (obj.type === "shape") {
      return `<div class="cf-extra ${cls}" aria-hidden="true"></div>`;
    }
    return `<div class="cf-extra ${cls}">${escapeHtmlText(obj.text || "Additional text")}</div>`;
  });

  return `<div class="cert-wrap">\n${lines.join("\n")}\n${extraLines.join("\n")}\n</div>`;
}

function buildCustomAutoLayoutCss(params: { layouts: CertificateLayoutState; backgroundImageUrl: string; extraObjects: CertificateExtraObject[] }): string {
  const safeBgUrl = String(params.backgroundImageUrl ?? "").trim();
  const backgroundImageValue = safeBgUrl
    ? `${toCssUrlValue(safeBgUrl)}, linear-gradient(135deg, #ffffff, #f1f5f9)`
    : "linear-gradient(135deg, #ffffff, #f1f5f9)";

  const fieldRules = CERTIFICATE_FIELD_KEYS.map((key) => {
    const l = params.layouts[key];
    const x = Math.max(0, Math.min(100, Number(l?.x ?? 50)));
    const y = Math.max(0, Math.min(100, Number(l?.y ?? 50)));
    const size = Math.max(10, Math.min(72, Number(l?.fontSize ?? 18)));
    const weight = Math.max(300, Math.min(900, Number(l?.fontWeight ?? 500)));
    const width = Math.max(8, Math.min(96, Number(l?.width ?? 40)));
    const align = l?.align === "right" || l?.align === "center" ? l.align : "left";
    const translate = align === "center" ? "translate(-50%, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
    return `.cf-${key} { left: ${x}%; top: ${y}%; width: ${width}%; font-size: ${size}px; font-weight: ${weight}; text-align: ${align}; transform: ${translate}; }`;
  });

  const extraRules = params.extraObjects.map((obj) => {
    const cls = `.cf-extra-${cssClassSafeId(obj.id)}`;
    const x = clampNumber(Number(obj.x ?? 50), 0, 100);
    const y = clampNumber(Number(obj.y ?? 50), 0, 100);
    const width = clampNumber(Number(obj.width ?? 20), 2, 96);
    const height = clampNumber(Number(obj.height ?? 10), 2, 96);
    const fontSize = clampNumber(Number(obj.fontSize ?? 16), 8, 96);
    const fontWeight = clampNumber(Number(obj.fontWeight ?? 500), 300, 900);
    const align = obj.align === "left" || obj.align === "right" ? obj.align : "center";
    const opacity = clampNumber(Number(obj.opacity ?? 1), 0.05, 1);
    const radius = clampNumber(Number(obj.borderRadius ?? 0), 0, 48);
    const rotation = clampNumber(Number(obj.rotation ?? 0), -180, 180);
    const zIndex = clampNumber(Number(obj.zIndex ?? 20), 1, 999);
    const transform = align === "left"
      ? `translate(0, -50%) rotate(${rotation}deg)`
      : align === "right"
        ? `translate(-100%, -50%) rotate(${rotation}deg)`
        : `translate(-50%, -50%) rotate(${rotation}deg)`;

    const base = `${cls} { left: ${x}%; top: ${y}%; width: ${width}%; height: ${height}%; text-align: ${align}; transform: ${transform}; opacity: ${opacity}; border-radius: ${radius}px; z-index: ${Math.round(zIndex)}; }`;

    if (obj.type === "image") {
      return [
        base,
        `${cls} { object-fit: contain; background: transparent; }`,
      ].join("\n");
    }
    if (obj.type === "shape") {
      return [
        base,
        `${cls} { background: ${String(obj.backgroundColor || "rgba(59,130,246,0.25)")}; border: 1px solid rgba(15,23,42,0.2); }`,
      ].join("\n");
    }
    return [
      base,
      `${cls} { color: ${String(obj.color || "#0f172a")}; font-size: ${fontSize}px; font-weight: ${fontWeight}; line-height: 1.2; white-space: pre-wrap; background: ${String(obj.backgroundColor || "transparent")}; padding: 2px 6px; }`,
    ].join("\n");
  });

  return [
    "/* AUTOLAYOUT_START */",
    ".cert-wrap {",
    "  position: relative;",
    "  width: 1123px;",
    "  height: 794px;",
    "  box-sizing: border-box;",
    `  background-image: ${backgroundImageValue};`,
    "  background-repeat: no-repeat;",
    "  background-position: center;",
    "  background-size: 100% 100%;",
    "  image-rendering: auto;",
    "  -webkit-print-color-adjust: exact;",
    "  print-color-adjust: exact;",
    "  border: 2px solid #334155;",
    "  border-radius: 12px;",
    "  overflow: hidden;",
    "}",
    ".cf-field {",
    "  position: absolute;",
    "  max-width: 96%;",
    "  color: #0f172a;",
    "  white-space: normal;",
    "  line-height: 1.2;",
    "}",
    ".cf-qr-image {",
    "  object-fit: contain;",
    "  height: auto;",
    "}",
    ".cf-extra {",
    "  position: absolute;",
    "  max-width: 96%;",
    "  box-sizing: border-box;",
    "}",
    ...fieldRules,
    ...extraRules,
    "/* AUTOLAYOUT_END */",
  ].join("\n");
}

function mergeAutoLayoutCss(existingCss: string, autoCss: string): string {
  const text = String(existingCss ?? "");
  const start = text.indexOf("/* AUTOLAYOUT_START */");
  const end = text.indexOf("/* AUTOLAYOUT_END */");
  if (start >= 0 && end > start) {
    const afterEnd = end + "/* AUTOLAYOUT_END */".length;
    return `${text.slice(0, start).trimEnd()}\n\n${autoCss}\n\n${text.slice(afterEnd).trimStart()}`.trim();
  }
  return [text.trim(), autoCss.trim()].filter(Boolean).join("\n\n");
}

function contestPhaseChip(params: { started: boolean; finished: boolean; paused?: boolean; tr: TrFn }) {
  if (params.paused) {
    return {
      glyph: "⏸",
      label: params.tr("Пауза", "Paused"),
      tone: "warn" as StatusChipTone,
    };
  }
  if (params.finished) {
    return {
      glyph: "■",
      label: params.tr("Завершено", "Finished"),
      tone: "error" as StatusChipTone,
    };
  }
  if (params.started) {
    return {
      glyph: "▶",
      label: params.tr("Йде", "Running"),
      tone: "success" as StatusChipTone,
    };
  }
  return {
    glyph: "⏱",
    label: params.tr("Скоро", "Upcoming"),
    tone: "info" as StatusChipTone,
  };
}

function submissionPhaseChip(phase: "CONTEST" | "UPSOLVE", tr: TrFn) {
  if (phase === "UPSOLVE") {
    return {
      glyph: "↺",
      label: tr("Дорішування", "Upsolve"),
      tone: "info" as StatusChipTone,
    };
  }
  return {
    glyph: "◆",
    label: tr("Контест", "Contest"),
    tone: "primary" as StatusChipTone,
  };
}

function verdictChip(verdictRaw: string | null | undefined, tr: TrFn) {
  const verdict = String(verdictRaw ?? "").trim().toUpperCase();
  if (!verdict) {
    return {
      glyph: "·",
      label: tr("Н/Д", "N/A"),
      tone: "neutral" as StatusChipTone,
    };
  }

  if (verdict === "AC") {
    return {
      glyph: "✓",
      label: "AC",
      tone: "success" as StatusChipTone,
    };
  }
  if (verdict === "WA") {
    return {
      glyph: "≈",
      label: "WA",
      tone: "warn" as StatusChipTone,
    };
  }
  if (verdict === "TLE") {
    return {
      glyph: "⏱",
      label: "TLE",
      tone: "warn" as StatusChipTone,
    };
  }
  if (verdict === "CE") {
    return {
      glyph: "⚙",
      label: "CE",
      tone: "error" as StatusChipTone,
    };
  }
  if (verdict === "RE") {
    return {
      glyph: "💥",
      label: "RE",
      tone: "error" as StatusChipTone,
    };
  }

  return {
    glyph: "•",
    label: verdict,
    tone: "neutral" as StatusChipTone,
  };
}

function problemScoreTone(score: number | null | undefined, hasSubmission: boolean): string {
  if (!hasSubmission) return "border-border bg-bg-surface text-text-secondary";
  const value = Number(score ?? 0);
  if (value >= 100) return "border-accent-success/60 bg-accent-success/10 text-accent-success";
  if (value >= 50) return "border-accent-warn/60 bg-accent-warn/10 text-accent-warn";
  if (value >= 1) return "border-accent-error/60 bg-accent-error/10 text-accent-error";
  // 0 with a real submission is a valid score, not an error state.
  return "border-primary/40 bg-primary/10 text-primary";
}

function submissionScoreTone(score: number | null | undefined): StatusChipTone {
  if (score == null || !Number.isFinite(Number(score))) return "neutral";
  const value = Number(score);
  if (value >= 100) return "success";
  if (value >= 50) return "warn";
  if (value >= 1) return "error";
  // 0 with an existing submission is valid and should stay non-error.
  return "info";
}

const Scoreboard: React.FC<{ contestId: number; canManage?: boolean }> = ({ contestId, canManage }) => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);

  const [loading, setLoading] = React.useState(true);
  const [problems, setProblems] = React.useState<ScoreboardProblem[]>([]);
  const [rows, setRows] = React.useState<ScoreboardRow[]>([]);
  const [disqualifiedCount, setDisqualifiedCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    getContestScoreboard(contestId)
      .then((r) => {
        setProblems(Array.isArray(r.problems) ? r.problems : []);
        setRows(Array.isArray(r.rows) ? r.rows : []);
        setDisqualifiedCount(Number(r.disqualifiedCount ?? 0) || 0);
      })
      .catch((e: unknown) => {
        const msg = getErrorMessage(e);
        setError(msg || tr("Не вдалося завантажити таблицю", "Failed to load standings"));
        setProblems([]);
        setRows([]);
        setDisqualifiedCount(0);
      })
      .finally(() => setLoading(false));
  }, [contestId, tr]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="p-4 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-text-primary flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          {tr("Таблиця", "Standings")}
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {tr("Оновити", "Refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-accent-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-text-secondary">{tr("Поки що немає учасників.", "No participants yet.")}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.participantId} className="rounded-xl border border-border bg-bg-base/80 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-lg border border-primary/50 bg-primary/10 text-primary text-xs font-bold">
                    #{r.rank}
                  </span>
                  <span className="text-sm font-mono text-text-primary truncate">{r.displayName}</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg border border-accent-success/40 bg-accent-success/10 px-2 py-1 text-xs font-mono text-accent-success">
                  <Trophy className="w-3.5 h-3.5" /> {tr("Сума", "Total")}: {r.totalScore}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {problems.map((p) => {
                  const hit = r.problems.find((x) => x.problemId === p.id);
                  const score = Number(hit?.score ?? 0);
                  const hasSubmission = Boolean(hit?.bestAt);
                  const scoreTone = problemScoreTone(score, hasSubmission);
                  return (
                    <span key={p.id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono ${scoreTone}`}>
                      <span className="opacity-80">{p.label}</span>
                      <span>{hasSubmission ? score : "—"}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="text-xs text-text-secondary mt-2">
            {tr(
              "Таблиця рахує лише подачі в межах контесту. Дорішування не впливає на результат.",
              "Standings include only official contest submissions. Upsolving does not affect results."
            )}
            {canManage && disqualifiedCount > 0 ? (
              <span className="ml-2">
                {tr(`Дискваліфіковано: ${disqualifiedCount}`, `Disqualified: ${disqualifiedCount}`)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
};

export const ContestPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const contestId = React.useMemo(() => {
    const v = Number(params.id);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const hasToken = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<ContestDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<"problems" | "standings" | "community">("problems");
  const [standingsVersion, setStandingsVersion] = React.useState(0);

  const [communityQuestionText, setCommunityQuestionText] = React.useState("");
  const [communityAnnouncementText, setCommunityAnnouncementText] = React.useState("");
  const [communityLoading, setCommunityLoading] = React.useState(false);
  const [communityError, setCommunityError] = React.useState<string | null>(null);
  const [communityData, setCommunityData] = React.useState<ContestCommunityData>({
    contestId: Number(contestId ?? 0),
    questions: [],
    announcements: [],
  });

  const [joinCode, setJoinCode] = React.useState("");
  const [joining, setJoining] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsTitle, setSettingsTitle] = React.useState("");
  const [settingsDescription, setSettingsDescription] = React.useState("");
  const [settingsStartsAt, setSettingsStartsAt] = React.useState("");
  const [settingsEndsAt, setSettingsEndsAt] = React.useState("");
  const [settingsAllowUpsolve, setSettingsAllowUpsolve] = React.useState(true);

  const [addOpen, setAddOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addMode, setAddMode] = React.useState<"CREATE" | "COPY" | "IMPORT">("CREATE");
  const [addTitle, setAddTitle] = React.useState("");
  const [addDescription, setAddDescription] = React.useState("");
  const [addTemplate, setAddTemplate] = React.useState("public class Main {\n  public static void main(String[] args) {\n    // TODO\n  }\n}\n");
  const [addTestsJson, setAddTestsJson] = React.useState("");
  const [addMaxAttempts, setAddMaxAttempts] = React.useState<number>(3);
  const [copyLibraryTaskId, setCopyLibraryTaskId] = React.useState("");
  const [copyQuery, setCopyQuery] = React.useState("");
  const [copyLoading, setCopyLoading] = React.useState(false);
  const [copyItems, setCopyItems] = React.useState<LibraryTaskListItem[]>([]);
  const [archiveFile, setArchiveFile] = React.useState<File | null>(null);
  const [importingArchive, setImportingArchive] = React.useState(false);

  const [manageOpen, setManageOpen] = React.useState(false);
  const [savingProblemSettingsId, setSavingProblemSettingsId] = React.useState<number | null>(null);
  const [problemSettingsError, setProblemSettingsError] = React.useState<string | null>(null);
  const [problemSettingsDraft, setProblemSettingsDraft] = React.useState<Record<number, { label: string; points: string; order: string }>>({});

  const [progressLoading, setProgressLoading] = React.useState(false);
  const [progressError, setProgressError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<ContestMyProgressProblem[] | null>(null);

  const [adminParticipantsLoading, setAdminParticipantsLoading] = React.useState(false);
  const [adminParticipantsError, setAdminParticipantsError] = React.useState<string | null>(null);
  const [adminParticipants, setAdminParticipants] = React.useState<ContestAdminParticipant[]>([]);
  const [adminParticipantsActionMessage, setAdminParticipantsActionMessage] = React.useState<string | null>(null);
  const [adminParticipantsActionTone, setAdminParticipantsActionTone] = React.useState<"success" | "warn" | "error">("success");
  const [accountRosterText, setAccountRosterText] = React.useState("");
  const [accountRosterImportKey, setAccountRosterImportKey] = React.useState(0);
  const [accountRosterImportPreviewOpen, setAccountRosterImportPreviewOpen] = React.useState(false);
  const [accountRosterImportFileName, setAccountRosterImportFileName] = React.useState("");
  const [accountRosterImportEntries, setAccountRosterImportEntries] = React.useState<Array<{ fullName: string; email: string }>>([]);
  const [accountRosterImportInvalidLines, setAccountRosterImportInvalidLines] = React.useState<string[]>([]);
  const [accountRosterImportDuplicateEmails, setAccountRosterImportDuplicateEmails] = React.useState<string[]>([]);
  const [accountGenLoading, setAccountGenLoading] = React.useState(false);
  const [accountGenError, setAccountGenError] = React.useState<string | null>(null);
  const [accountGenMessage, setAccountGenMessage] = React.useState<string | null>(null);
  const [generatedAccounts, setGeneratedAccounts] = React.useState<ContestGeneratedAccount[]>([]);
  const [accountMailLoading, setAccountMailLoading] = React.useState(false);
  const [accountMailError, setAccountMailError] = React.useState<string | null>(null);
  const [accountMailResult, setAccountMailResult] = React.useState<string | null>(null);
  const [accountMailCustomMessage, setAccountMailCustomMessage] = React.useState("");

  const [certificateMode, setCertificateMode] = React.useState<"none" | "studycod" | "custom">("studycod");
  const [certificateUiSimpleMode, setCertificateUiSimpleMode] = React.useState(true);
  const [certificateUiAdvancedOpen, setCertificateUiAdvancedOpen] = React.useState(false);
  const [certificateAutoSyncLayout, setCertificateAutoSyncLayout] = React.useState(true);
  const [certificateCanvasFocusMode, setCertificateCanvasFocusMode] = React.useState(true);
  const [certificateGlobalSettingsOpen, setCertificateGlobalSettingsOpen] = React.useState(false);
  const [certificateSendEmailEnabled, setCertificateSendEmailEnabled] = React.useState(true);
  const [certificateForceRegenerate, setCertificateForceRegenerate] = React.useState(false);
  const [certificateTemplateId, setCertificateTemplateId] = React.useState("");
  const [certificateTemplateName, setCertificateTemplateName] = React.useState("Custom template");
  const [certificateTemplateHtml, setCertificateTemplateHtml] = React.useState("");
  const [certificateTemplateCss, setCertificateTemplateCss] = React.useState("");
  const [certificateLayoutBackgroundUrl, setCertificateLayoutBackgroundUrl] = React.useState<string>("");
  const [certificateLayout, setCertificateLayout] = React.useState<CertificateLayoutState>(() => defaultCertificateLayoutState());
  const [certificateLayoutSelectedField, setCertificateLayoutSelectedField] = React.useState<CertificateFieldKey | null>(null);
  const [certificateLayoutExtraObjects, setCertificateLayoutExtraObjects] = React.useState<CertificateExtraObject[]>([]);
  const [certificateLayoutSelectedExtraObjectId, setCertificateLayoutSelectedExtraObjectId] = React.useState<string | null>(null);
  const [certificateLayoutDraggingExtraObjectId, setCertificateLayoutDraggingExtraObjectId] = React.useState<string | null>(null);
  const [certificateLayoutResizingExtraObjectId, setCertificateLayoutResizingExtraObjectId] = React.useState<string | null>(null);
  const [certificateLayoutDraggingField, setCertificateLayoutDraggingField] = React.useState<CertificateFieldKey | null>(null);
  const [certificateLayoutResizingField, setCertificateLayoutResizingField] = React.useState<CertificateFieldKey | null>(null);
  const [certificateLayoutResizeStart, setCertificateLayoutResizeStart] = React.useState<{
    clientX: number;
    clientY: number;
    width: number;
    fontSize: number;
    x: number;
    align: "left" | "center" | "right";
    edge: "left" | "right" | "top" | "bottom";
  } | null>(null);
  const [certificateLayoutExtraResizeStart, setCertificateLayoutExtraResizeStart] = React.useState<{
    clientX: number;
    clientY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    align: "left" | "center" | "right";
    edge: "left" | "right" | "top" | "bottom";
  } | null>(null);
  const [certificateLayoutSnapEnabled, setCertificateLayoutSnapEnabled] = React.useState(true);
  const [certificateLayoutSnapStep, setCertificateLayoutSnapStep] = React.useState(2);
  const [certificateLayoutShowGuides, setCertificateLayoutShowGuides] = React.useState(true);
  const [certificateLayoutActiveGuides, setCertificateLayoutActiveGuides] = React.useState<CertificateLayoutGuide[]>([]);
  const [certificateLayoutContextMenu, setCertificateLayoutContextMenu] = React.useState<{
    left: number;
    top: number;
    x: number;
    y: number;
  } | null>(null);
  const [certificateLayoutPresetName, setCertificateLayoutPresetName] = React.useState("");
  const [certificateLayoutPresets, setCertificateLayoutPresets] = React.useState<CertificateLayoutPresetItem[]>([]);
  const [certificateLayoutPresetId, setCertificateLayoutPresetId] = React.useState("");
  const [certificateLayoutHistory, setCertificateLayoutHistory] = React.useState<CertificateLayoutSnapshot[]>(() => [
    {
      layout: defaultCertificateLayoutState(),
      bgUrl: "",
    },
  ]);
  const [certificateLayoutHistoryIndex, setCertificateLayoutHistoryIndex] = React.useState(0);
  const [certificateLayoutBackgroundStatus, setCertificateLayoutBackgroundStatus] = React.useState<"none" | "loading" | "ready" | "error">("none");
  const [certificateLayoutBackgroundError, setCertificateLayoutBackgroundError] = React.useState<string | null>(null);
  const certificateLayoutCanvasRef = React.useRef<HTMLDivElement | null>(null);
  const [certificateFields, setCertificateFields] = React.useState<Record<CertificateFieldKey, { isEnabled: boolean; isRequired: boolean }>>(() => defaultCertificateFieldsState());
  const [certificateSaving, setCertificateSaving] = React.useState(false);
  const [certificateCreatingTemplate, setCertificateCreatingTemplate] = React.useState(false);
  const [certificateGenerating, setCertificateGenerating] = React.useState(false);
  const [certificateTemplateChecking, setCertificateTemplateChecking] = React.useState(false);
  const [certificateTemplateCheckResult, setCertificateTemplateCheckResult] = React.useState<{
    ok: boolean;
    message: string;
    type?: "studycod" | "custom";
  } | null>(null);
  const [certificateError, setCertificateError] = React.useState<string | null>(null);
  const [certificateMessage, setCertificateMessage] = React.useState<string | null>(null);
  const [certificatePreviewOpen, setCertificatePreviewOpen] = React.useState(false);
  const [certificatePreviewFitCanvas, setCertificatePreviewFitCanvas] = React.useState(true);
  const [certificateTemplatesCatalog, setCertificateTemplatesCatalog] = React.useState<Array<{ id: number; contestId: number | null; name: string; type: "studycod" | "custom"; isActive: boolean; version: number }>>([]);
  const [certificateTemplatesCatalogLoading, setCertificateTemplatesCatalogLoading] = React.useState(false);

  const [pauseSaving, setPauseSaving] = React.useState(false);
  const [organizersLoading, setOrganizersLoading] = React.useState(false);
  const [organizersError, setOrganizersError] = React.useState<string | null>(null);
  const [organizers, setOrganizers] = React.useState<ContestOrganizerListItem[]>([]);
  const [newOrganizerUserId, setNewOrganizerUserId] = React.useState("");
  const [annulmentsLoading, setAnnulmentsLoading] = React.useState(false);
  const [annulmentsError, setAnnulmentsError] = React.useState<string | null>(null);
  const [annulments, setAnnulments] = React.useState<ContestAnnulmentItem[]>([]);
  const [annulProblemId, setAnnulProblemId] = React.useState("");
  const [annulParticipantId, setAnnulParticipantId] = React.useState("");
  const [annulReason, setAnnulReason] = React.useState("");
  const [annulledActive, setAnnulledActive] = React.useState(true);

  const [adminSubsLoading, setAdminSubsLoading] = React.useState(false);
  const [adminSubsError, setAdminSubsError] = React.useState<string | null>(null);
  const [adminSubsParticipant, setAdminSubsParticipant] = React.useState<ContestAdminParticipant | null>(null);
  const [adminSubsFullPage, setAdminSubsFullPage] = React.useState(true);
  const [adminSubsRows, setAdminSubsRows] = React.useState<ContestAdminSubmission[]>([]);
  const [adminSubsVerdictFilter, setAdminSubsVerdictFilter] = React.useState<string>("ALL");
  const [adminSubsProblemFilter, setAdminSubsProblemFilter] = React.useState<string>("ALL");
  const [adminSubsCodeViewer, setAdminSubsCodeViewer] = React.useState<ContestAdminSubmission | null>(null);

  const load = React.useCallback(() => {
    if (!contestId) return;
    setLoading(true);
    setError(null);
    getContestDetails(contestId)
      .then((r) => setData(r))
      .catch((e: unknown) => {
        const msg = getErrorMessage(e);
        setError(msg || tr("Не вдалося завантажити контест", "Failed to load contest"));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [contestId, tr]);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadProgress = React.useCallback(() => {
    if (!contestId) return;
    if (!hasToken) {
      setProgress(null);
      return;
    }
    if (!data?.access?.canAccessContent) {
      setProgress(null);
      return;
    }

    setProgressLoading(true);
    setProgressError(null);
    getContestMyProgress(contestId)
      .then((r) => {
        setProgress(Array.isArray(r.problems) ? r.problems : []);
      })
      .catch((e: unknown) => {
        const msg = getErrorMessage(e);
        setProgressError(msg || tr("Не вдалося завантажити прогрес", "Failed to load progress"));
        setProgress(null);
      })
      .finally(() => setProgressLoading(false));
  }, [contestId, hasToken, data?.access?.canAccessContent, tr]);

  React.useEffect(() => {
    if (tab !== "problems") return;
    loadProgress();
  }, [tab, loadProgress]);

  const loadCommunity = React.useCallback(async () => {
    if (!contestId) return;
    if (!data?.access?.canAccessContent) {
      setCommunityData({ contestId, questions: [], announcements: [] });
      setCommunityError(null);
      return;
    }
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const r = await getContestCommunity(contestId);
      setCommunityData({
        contestId,
        questions: Array.isArray(r?.questions) ? r.questions : [],
        announcements: Array.isArray(r?.announcements) ? r.announcements : [],
      });
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCommunityError(msg || tr("Не вдалося завантажити ком'юніті", "Failed to load community"));
      setCommunityData({ contestId, questions: [], announcements: [] });
    } finally {
      setCommunityLoading(false);
    }
  }, [contestId, data?.access?.canAccessContent, tr]);

  React.useEffect(() => {
    if (tab !== "community") return;
    loadCommunity();
  }, [tab, loadCommunity]);

  const postContestQuestion = async () => {
    if (!contestId || !data?.access?.canAccessContent) return;
    const text = communityQuestionText.trim();
    if (!text) return;
    try {
      const r = await postContestCommunityQuestion(contestId, text);
      setCommunityData((prev) => ({
        ...prev,
        questions: [...prev.questions, r.question],
      }));
      setCommunityQuestionText("");
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCommunityError(msg || tr("Не вдалося надіслати питання", "Failed to send question"));
    }
  };

  const answerContestQuestion = async (qid: number) => {
    if (!contestId || !data?.access?.canManage) return;
    const answer = typeof window !== "undefined"
      ? window.prompt(tr("Введіть відповідь організатора", "Enter organizer answer"), "")
      : null;
    if (!answer || !answer.trim()) return;
    try {
      const r = await answerContestCommunityQuestion(contestId, qid, answer.trim());
      setCommunityData((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === qid ? r.question : q)),
      }));
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCommunityError(msg || tr("Не вдалося зберегти відповідь", "Failed to save answer"));
    }
  };

  const postContestAnnouncement = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const text = communityAnnouncementText.trim();
    if (!text) return;
    try {
      const r = await postContestCommunityAnnouncement(contestId, text);
      setCommunityData((prev) => ({
        ...prev,
        announcements: [r.announcement, ...prev.announcements],
      }));
      setCommunityAnnouncementText("");
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCommunityError(msg || tr("Не вдалося опублікувати оголошення", "Failed to publish announcement"));
    }
  };

  const loadAdminParticipants = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setAdminParticipants([]);
      setAdminParticipantsError(null);
      return;
    }
    setAdminParticipantsLoading(true);
    setAdminParticipantsError(null);
    try {
      const r = await listContestAdminParticipants(contestId);
      setAdminParticipants(Array.isArray(r.participants) ? r.participants : []);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAdminParticipantsError(msg || tr("Не вдалося завантажити учасників", "Failed to load participants"));
      setAdminParticipants([]);
    } finally {
      setAdminParticipantsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "standings") return;
    loadAdminParticipants();
  }, [tab, loadAdminParticipants]);

  React.useEffect(() => {
    if (!adminParticipantsActionMessage) return;
    const timer = window.setTimeout(() => {
      setAdminParticipantsActionMessage(null);
    }, 7000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [adminParticipantsActionMessage]);

  const loadOrganizers = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setOrganizers([]);
      setOrganizersError(null);
      return;
    }
    setOrganizersLoading(true);
    setOrganizersError(null);
    try {
      const r = await listContestOrganizers(contestId);
      setOrganizers(Array.isArray(r.organizers) ? r.organizers : []);
      setData((prev) => (prev ? { ...prev, access: { ...prev.access, isPaused: !!r.isPaused } } : prev));
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setOrganizersError(msg || tr("Не вдалося завантажити організаторів", "Failed to load organizers"));
      setOrganizers([]);
    } finally {
      setOrganizersLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "standings") return;
    loadOrganizers();
  }, [tab, loadOrganizers]);

  const loadAnnulments = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setAnnulments([]);
      setAnnulmentsError(null);
      return;
    }
    setAnnulmentsLoading(true);
    setAnnulmentsError(null);
    try {
      const r = await listContestAnnulments(contestId);
      setAnnulments(Array.isArray(r.annulments) ? r.annulments : []);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAnnulmentsError(msg || tr("Не вдалося завантажити анулювання", "Failed to load annulments"));
      setAnnulments([]);
    } finally {
      setAnnulmentsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "standings") return;
    loadAnnulments();
  }, [tab, loadAnnulments]);

  const toggleContestPaused = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const targetPaused = !Boolean(data.access.isPaused);
    setPauseSaving(true);
    try {
      const r = await setContestPaused(contestId, targetPaused);
      setData((prev) => (prev ? { ...prev, access: { ...prev.access, isPaused: !!r.isPaused } } : prev));
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || tr("Не вдалося змінити стан паузи", "Failed to change pause state"));
    } finally {
      setPauseSaving(false);
    }
  };

  const buildCurrentCustomTemplateDraft = React.useCallback(() => {
    if (certificateAutoSyncLayout) {
      const autoHtml = buildCustomAutoLayoutHtml(certificateFields, certificateLayoutExtraObjects);
      const autoCss = buildCustomAutoLayoutCss({
        layouts: certificateLayout,
        backgroundImageUrl: certificateLayoutBackgroundUrl,
        extraObjects: certificateLayoutExtraObjects,
      });
      const mergedCss = mergeAutoLayoutCss(certificateTemplateCss, autoCss);
      return {
        htmlTemplate: autoHtml,
        cssTemplate: mergedCss,
      };
    }
    return {
      htmlTemplate: String(certificateTemplateHtml ?? "").trim(),
      cssTemplate: String(certificateTemplateCss ?? "").trim(),
    };
  }, [certificateAutoSyncLayout, certificateFields, certificateLayout, certificateLayoutBackgroundUrl, certificateLayoutExtraObjects, certificateTemplateCss, certificateTemplateHtml]);

  const createCustomCertificateTemplate = async (): Promise<number | null> => {
    if (!contestId) return null;
    const draft = buildCurrentCustomTemplateDraft();
    const htmlTemplate = draft.htmlTemplate;
    const cssTemplate = draft.cssTemplate;
    if (certificateAutoSyncLayout) {
      setCertificateTemplateHtml(htmlTemplate);
      setCertificateTemplateCss(cssTemplate);
    }
    if (!htmlTemplate) {
      setCertificateError(tr("Для custom-шаблону потрібен HTML", "Custom template requires HTML"));
      return null;
    }
    const placeholders = extractTemplatePlaceholders(htmlTemplate);
    const allowed = new Set<string>(CERTIFICATE_FIELD_KEYS);
    const unknownPlaceholders = placeholders.filter((key) => !allowed.has(key));
    const inTemplate = new Set<string>(placeholders);
    const missingRequired = CERTIFICATE_FIELD_KEYS.filter((key) => {
      const field = certificateFields[key];
      return Boolean(field?.isEnabled && field?.isRequired) && !inTemplate.has(key);
    });

    if (unknownPlaceholders.length > 0) {
      setCertificateError(
        tr(
          `Невідомі placeholders: ${unknownPlaceholders.join(", ")}`,
          `Unknown placeholders: ${unknownPlaceholders.join(", ")}`
        )
      );
      return null;
    }
    if (missingRequired.length > 0) {
      setCertificateError(
        tr(
          `У шаблоні відсутні обов'язкові placeholders: ${missingRequired.join(", ")}`,
          `Template is missing required placeholders: ${missingRequired.join(", ")}`
        )
      );
      return null;
    }

    setCertificateCreatingTemplate(true);
    setCertificateError(null);
    try {
      const created = await createCertificateTemplate({
        contestId,
        name: certificateTemplateName.trim() || "Custom template",
        type: "custom",
        htmlTemplate,
        cssTemplate: cssTemplate || undefined,
        fields: CERTIFICATE_FIELD_KEYS.map((fieldKey) => ({
          fieldKey,
          isEnabled: Boolean(certificateFields[fieldKey]?.isEnabled),
          isRequired: Boolean(certificateFields[fieldKey]?.isRequired),
        })),
      });
      setCertificateTemplateId(String(created.templateId));
      setCertificateMessage(
        tr(
          `Шаблон створено. ID: ${created.templateId}`,
          `Template created. ID: ${created.templateId}`
        )
      );
      return created.templateId;
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCertificateError(msg || tr("Не вдалося створити шаблон", "Failed to create template"));
      return null;
    } finally {
      setCertificateCreatingTemplate(false);
    }
  };

  const saveCertificateSettings = async () => {
    if (!contestId) return;
    if (certificateMode === "custom" && certificateAutoSyncLayout) {
      const draft = buildCurrentCustomTemplateDraft();
      setCertificateTemplateHtml(draft.htmlTemplate);
      setCertificateTemplateCss(draft.cssTemplate);
    }
    if (certificateMode === "custom" && certificateUnknownPlaceholders.length > 0) {
      setCertificateError(
        tr(
          `Невідомі placeholders: ${certificateUnknownPlaceholders.join(", ")}`,
          `Unknown placeholders: ${certificateUnknownPlaceholders.join(", ")}`
        )
      );
      return;
    }
    if (certificateMode === "custom" && certificateMissingRequiredPlaceholders.length > 0) {
      setCertificateError(
        tr(
          `У шаблоні відсутні обов'язкові placeholders: ${certificateMissingRequiredPlaceholders.join(", ")}`,
          `Template is missing required placeholders: ${certificateMissingRequiredPlaceholders.join(", ")}`
        )
      );
      return;
    }
    setCertificateSaving(true);
    setCertificateError(null);
    setCertificateMessage(null);
    try {
      let defaultTemplateId: number | null = null;
      const typedTemplateId = Number(certificateTemplateId);
      if (Number.isFinite(typedTemplateId) && typedTemplateId > 0) {
        defaultTemplateId = typedTemplateId;
      }

      if (certificateMode === "custom" && !defaultTemplateId && certificateTemplateHtml.trim()) {
        defaultTemplateId = await createCustomCertificateTemplate();
        if (!defaultTemplateId) {
          setCertificateSaving(false);
          return;
        }
      }

      if (certificateMode === "studycod" && !defaultTemplateId) {
        setCertificateError(
          tr(
            "Вкажіть Template ID, створений у Admin Panel → Certificates",
            "Please provide a Template ID created in Admin Panel → Certificates"
          )
        );
        setCertificateSaving(false);
        return;
      }

      await updateContestCertificateSettings(contestId, {
        mode: certificateMode,
        defaultTemplateId,
        sendEmailEnabled: certificateSendEmailEnabled,
      });

      setCertificateMessage(tr("Налаштування сертифікатів збережено", "Certificate settings saved"));
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCertificateError(msg || tr("Не вдалося зберегти налаштування сертифікатів", "Failed to save certificate settings"));
    } finally {
      setCertificateSaving(false);
    }
  };

  const validateCertificateTemplateId = async () => {
    if (certificateTemplateChecking) return;
    const typedTemplateId = Number(certificateTemplateId);
    if (!Number.isFinite(typedTemplateId) || typedTemplateId <= 0) {
      setCertificateTemplateCheckResult({
        ok: false,
        message: tr("Вкажіть коректний числовий Template ID", "Provide a valid numeric Template ID"),
      });
      return;
    }

    setCertificateTemplateChecking(true);
    setCertificateTemplateCheckResult(null);
    try {
      const result = await getCertificateTemplateById(typedTemplateId);
      if (result.template.type !== "studycod" && certificateMode === "studycod") {
        setCertificateTemplateCheckResult({
          ok: false,
          message: tr("Це не StudyCod шаблон", "This is not a StudyCod template"),
          type: result.template.type,
        });
        return;
      }

      setCertificateTemplateCheckResult({
        ok: true,
        message: tr(
          `Шаблон знайдено: ${result.template.name}`,
          `Template found: ${result.template.name}`
        ),
        type: result.template.type,
      });
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCertificateTemplateCheckResult({
        ok: false,
        message: msg || tr("Template ID не знайдено", "Template ID not found"),
      });
    } finally {
      setCertificateTemplateChecking(false);
    }
  };

  const autoValidateCertificateTemplateId = () => {
    const typedTemplateId = Number(certificateTemplateId);
    if (!Number.isFinite(typedTemplateId) || typedTemplateId <= 0) {
      setCertificateTemplateCheckResult(null);
      return;
    }
    void validateCertificateTemplateId();
  };

  React.useEffect(() => {
    setCertificateTemplateCheckResult(null);
  }, [certificateTemplateId, certificateMode]);

  const enqueueCertificateGeneration = async () => {
    if (!contestId) return;
    setCertificateGenerating(true);
    setCertificateError(null);
    setCertificateMessage(null);
    try {
      const r = await generateContestCertificates(contestId, {
        forceRegenerate: certificateForceRegenerate,
      });
      setCertificateMessage(
        tr(
          `Генерацію поставлено в чергу. Job ID: ${r.jobId}`,
          `Generation queued. Job ID: ${r.jobId}`
        )
      );
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setCertificateError(msg || tr("Не вдалося запустити генерацію сертифікатів", "Failed to start certificate generation"));
    } finally {
      setCertificateGenerating(false);
    }
  };

  const certificatePreviewSrcDoc = React.useMemo(
    () =>
      renderCertificatePreviewHtml({
        htmlTemplate: certificateTemplateHtml,
        cssTemplate: certificateTemplateCss,
        fields: certificateFields,
        fitToCanvas: certificatePreviewFitCanvas,
      }),
    [certificateTemplateHtml, certificateTemplateCss, certificateFields, certificatePreviewFitCanvas]
  );
  const certificateTemplatePlaceholders = React.useMemo(
    () => extractTemplatePlaceholders(certificateTemplateHtml),
    [certificateTemplateHtml]
  );
  const certificateUnknownPlaceholders = React.useMemo(() => {
    const allowed = new Set<string>(CERTIFICATE_FIELD_KEYS);
    return certificateTemplatePlaceholders.filter((key) => !allowed.has(key));
  }, [certificateTemplatePlaceholders]);
  const certificateMissingRequiredPlaceholders = React.useMemo(() => {
    const inTemplate = new Set<string>(certificateTemplatePlaceholders);
    return CERTIFICATE_FIELD_KEYS.filter((key) => {
      const field = certificateFields[key];
      return Boolean(field?.isEnabled && field?.isRequired) && !inTemplate.has(key);
    });
  }, [certificateFields, certificateTemplatePlaceholders]);
  const certificateDisabledReferencedPlaceholders = React.useMemo(() => {
    return certificateTemplatePlaceholders.filter((key) => {
      if (!CERTIFICATE_FIELD_KEYS.includes(key as CertificateFieldKey)) return false;
      return !certificateFields[key as CertificateFieldKey]?.isEnabled;
    });
  }, [certificateFields, certificateTemplatePlaceholders]);

  const enableReferencedCertificateFields = () => {
    if (certificateDisabledReferencedPlaceholders.length === 0) return;
    setCertificateFields((prev) => {
      const next = { ...prev };
      for (const rawKey of certificateDisabledReferencedPlaceholders) {
        const key = rawKey as CertificateFieldKey;
        const current = next[key];
        if (!current) continue;
        next[key] = {
          ...current,
          isEnabled: true,
        };
      }
      return next;
    });
  };

  const insertMissingRequiredCertificatePlaceholders = () => {
    if (certificateMissingRequiredPlaceholders.length === 0) return;
    const toInsert = certificateMissingRequiredPlaceholders
      .map((key) => `<div>{{${key}}}</div>`)
      .join("\n");
    setCertificateTemplateHtml((prev) => {
      const base = String(prev ?? "").trimEnd();
      if (!base) return toInsert;
      const sep = base.endsWith("\n") ? "" : "\n";
      return `${base}${sep}${toInsert}`;
    });
  };

  const applyAutoLayoutToTemplate = () => {
    const autoHtml = buildCustomAutoLayoutHtml(certificateFields, certificateLayoutExtraObjects);
    const autoCss = buildCustomAutoLayoutCss({
      layouts: certificateLayout,
      backgroundImageUrl: certificateLayoutBackgroundUrl,
      extraObjects: certificateLayoutExtraObjects,
    });

    setCertificateTemplateHtml(autoHtml);
    setCertificateTemplateCss((prev) => mergeAutoLayoutCss(prev, autoCss));
  };

  const autoSyncLayoutToTemplate = React.useCallback(() => {
    const autoHtml = buildCustomAutoLayoutHtml(certificateFields, certificateLayoutExtraObjects);
    const autoCss = buildCustomAutoLayoutCss({
      layouts: certificateLayout,
      backgroundImageUrl: certificateLayoutBackgroundUrl,
      extraObjects: certificateLayoutExtraObjects,
    });
    setCertificateTemplateHtml((prev) => (prev === autoHtml ? prev : autoHtml));
    setCertificateTemplateCss((prev) => {
      const merged = mergeAutoLayoutCss(prev, autoCss);
      return prev === merged ? prev : merged;
    });
  }, [certificateFields, certificateLayout, certificateLayoutBackgroundUrl, certificateLayoutExtraObjects]);

  React.useEffect(() => {
    if (certificateMode !== "custom") return;
    if (!certificateAutoSyncLayout) return;
    autoSyncLayoutToTemplate();
  }, [autoSyncLayoutToTemplate, certificateAutoSyncLayout, certificateMode]);

  const loadCertificateTemplatesCatalog = React.useCallback(async () => {
    setCertificateTemplatesCatalogLoading(true);
    try {
      const result = await listCertificateTemplates({ includeInactive: true, limit: 300 });
      setCertificateTemplatesCatalog(Array.isArray(result.templates) ? result.templates : []);
    } catch {
      setCertificateTemplatesCatalog([]);
    } finally {
      setCertificateTemplatesCatalogLoading(false);
    }
  }, []);

  const applyTemplateFromCatalog = React.useCallback(
    async (tpl: {
      id: number;
      name: string;
      type: "studycod" | "custom";
    }) => {
      const nextMode: "studycod" | "custom" = tpl.type === "studycod" ? "studycod" : "custom";
      setCertificateMode(nextMode);
      setCertificateTemplateId(String(tpl.id));
      setCertificateTemplateCheckResult({
        ok: true,
        message: tr(`Вибрано шаблон: ${tpl.name}`, `Selected template: ${tpl.name}`),
        type: tpl.type,
      });

      if (nextMode !== "custom") {
        setCertificateMessage(tr(`Шаблон #${tpl.id} вибрано`, `Template #${tpl.id} selected`));
        return;
      }

      try {
        const result = await getCertificateTemplateById(tpl.id);
        const template = result.template;
        setCertificateTemplateName(String(template.name ?? "").trim() || "Custom template");
        setCertificateTemplateHtml(String(template.htmlTemplate ?? ""));
        setCertificateTemplateCss(String(template.cssTemplate ?? ""));
        setCertificateAutoSyncLayout(false);

        const defaults = defaultCertificateFieldsState();
        const mapped = { ...defaults };
        for (const row of Array.isArray(template.fields) ? template.fields : []) {
          if (!Object.prototype.hasOwnProperty.call(mapped, row.fieldKey)) continue;
          mapped[row.fieldKey as keyof typeof mapped] = {
            isEnabled: Boolean(row.isEnabled),
            isRequired: Boolean(row.isRequired),
          };
        }
        setCertificateFields(mapped);
        setCertificateMessage(tr(`Кастомний шаблон #${tpl.id} завантажено`, `Custom template #${tpl.id} loaded`));
      } catch (e: unknown) {
        setCertificateError(
          getErrorMessage(e) || tr("Не вдалося завантажити шаблон з бібліотеки", "Failed to load template from library")
        );
      }
    },
    [tr]
  );

  React.useEffect(() => {
    if (tab !== "standings") return;
    if (!data?.access?.canManage) return;
    void loadCertificateTemplatesCatalog();
  }, [data?.access?.canManage, loadCertificateTemplatesCatalog, tab]);

  const resetCertificateLayout = () => {
    const nextLayout = defaultCertificateLayoutState();
    setCertificateLayout(nextLayout);
    setCertificateLayoutSelectedField(null);
    setCertificateLayoutSelectedExtraObjectId(null);
    setCertificateLayoutDraggingExtraObjectId(null);
    setCertificateLayoutDraggingField(null);
    setCertificateLayoutResizingField(null);
    setCertificateLayoutResizeStart(null);
    setCertificateLayoutHistory((prev) => {
      const base = prev.slice(0, certificateLayoutHistoryIndex + 1);
      const snapshot: CertificateLayoutSnapshot = {
        layout: normalizeCertificateLayoutState(nextLayout),
        bgUrl: certificateLayoutBackgroundUrl,
      };
      const last = base[base.length - 1];
      if (areCertificateLayoutSnapshotsEqual(last, snapshot)) return prev;
      const appended = [...base, snapshot];
      const trimmed = appended.length > 80 ? appended.slice(appended.length - 80) : appended;
      setCertificateLayoutHistoryIndex(trimmed.length - 1);
      return trimmed;
    });
  };

  const pushCertificateLayoutSnapshot = React.useCallback(
    (nextLayout: CertificateLayoutState, nextBackgroundUrl?: string) => {
      const snapshot: CertificateLayoutSnapshot = {
        layout: normalizeCertificateLayoutState(nextLayout),
        bgUrl: String(nextBackgroundUrl ?? certificateLayoutBackgroundUrl),
      };
      setCertificateLayoutHistory((prev) => {
        const base = prev.slice(0, certificateLayoutHistoryIndex + 1);
        const last = base[base.length - 1];
        if (areCertificateLayoutSnapshotsEqual(last, snapshot)) return prev;
        const appended = [...base, snapshot];
        const trimmed = appended.length > 80 ? appended.slice(appended.length - 80) : appended;
        setCertificateLayoutHistoryIndex(trimmed.length - 1);
        return trimmed;
      });
    },
    [certificateLayoutBackgroundUrl, certificateLayoutHistoryIndex]
  );

  const updateCertificateLayout = React.useCallback(
    (updater: (prev: CertificateLayoutState) => CertificateLayoutState, options?: { commit?: boolean; backgroundUrl?: string }) => {
      setCertificateLayout((prev) => {
        const next = normalizeCertificateLayoutState(updater(prev));
        if (options?.commit !== false) {
          pushCertificateLayoutSnapshot(next, options?.backgroundUrl);
        }
        return next;
      });
    },
    [pushCertificateLayoutSnapshot]
  );

  const updateCertificateLayoutBackgroundUrl = React.useCallback(
    (nextValue: string, options?: { commit?: boolean; layout?: CertificateLayoutState }) => {
      const normalized = normalizeCertificateBackgroundSource(String(nextValue ?? ""));
      setCertificateLayoutBackgroundUrl(normalized);
      if (options?.commit !== false) {
        pushCertificateLayoutSnapshot(options?.layout ?? certificateLayout, normalized);
      }
    },
    [certificateLayout, pushCertificateLayoutSnapshot]
  );

  React.useEffect(() => {
    const src = String(certificateLayoutBackgroundUrl ?? "").trim();
    if (!src) {
      setCertificateLayoutBackgroundStatus("none");
      setCertificateLayoutBackgroundError(null);
      return;
    }

    let disposed = false;
    setCertificateLayoutBackgroundStatus("loading");
    setCertificateLayoutBackgroundError(null);

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      setCertificateLayoutBackgroundStatus("ready");
      setCertificateLayoutBackgroundError(null);
    };
    image.onerror = () => {
      if (disposed) return;
      setCertificateLayoutBackgroundStatus("error");
      setCertificateLayoutBackgroundError(
        tr(
          "Фон не вдалося завантажити. Використовую fallback-градієнт.",
          "Background failed to load. Using gradient fallback."
        )
      );
    };
    image.src = src;

    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [certificateLayoutBackgroundUrl, tr]);

  const uploadCertificateLayoutBackgroundFile = (file: File | null) => {
    if (!file) return;
    if (!isSupportedCertificateBackgroundFile(file)) {
      setCertificateError(tr("Оберіть файл зображення", "Please select an image file"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setCertificateError(tr("Не вдалося прочитати файл", "Failed to read file"));
        return;
      }
      const normalized = isSvgCertificateBackgroundFile(file)
        ? normalizeCertificateBackgroundSource(result)
        : result;
      updateCertificateLayoutBackgroundUrl(normalized);
      setCertificateError(null);
      setCertificateMessage(tr("Фон завантажено з файлу", "Background uploaded from file"));
    };
    reader.onerror = () => {
      setCertificateError(tr("Не вдалося прочитати файл", "Failed to read file"));
    };
    if (isSvgCertificateBackgroundFile(file)) {
      reader.readAsText(file);
      return;
    }
    reader.readAsDataURL(file);
  };

  React.useEffect(() => {
    setCertificateLayoutPresets(readCertificateLayoutPresets(contestId));
    setCertificateLayoutPresetId("");
    setCertificateLayoutHistory([
      {
        layout: normalizeCertificateLayoutState(certificateLayout),
        bgUrl: certificateLayoutBackgroundUrl,
      },
    ]);
    setCertificateLayoutHistoryIndex(0);
  }, [contestId]);

  const applySnap = React.useCallback(
    (value: number) => {
      const bounded = clampNumber(value, 0, 100);
      if (!certificateLayoutSnapEnabled) return Math.round(bounded * 10) / 10;
      return Math.round(snapByStep(bounded, clampNumber(certificateLayoutSnapStep, 0.5, 20)) * 10) / 10;
    },
    [certificateLayoutSnapEnabled, certificateLayoutSnapStep]
  );

  const clampFontSize = React.useCallback((value: number) => clampNumber(value, 10, 72), []);
  const clampFieldWidth = React.useCallback((value: number) => clampNumber(value, 8, 96), []);

  const applySmartGuideSnap = React.useCallback(
    (field: CertificateFieldKey, currentX: number, currentY: number) => {
      const threshold = 1.25;
      const enabledOthers = CERTIFICATE_FIELD_KEYS.filter((key) => key !== field && certificateFields[key]?.isEnabled);
      const xCandidates: Array<{ value: number; source: "center" | "field"; edge: "left" | "center" | "right" }> = [
        { value: 50, source: "center", edge: "center" },
      ];
      const yCandidates: Array<{ value: number; source: "center" | "field" }> = [{ value: 50, source: "center" }];

      const edgeValuesForX = (anchorX: number, width: number, align: "left" | "center" | "right") => {
        if (align === "center") {
          return {
            left: anchorX - width / 2,
            center: anchorX,
            right: anchorX + width / 2,
          };
        }
        if (align === "right") {
          return {
            left: anchorX - width,
            center: anchorX - width / 2,
            right: anchorX,
          };
        }
        return {
          left: anchorX,
          center: anchorX + width / 2,
          right: anchorX + width,
        };
      };

      const movingLayout = certificateLayout[field];
      const movingAlign = movingLayout?.align === "center" || movingLayout?.align === "right" ? movingLayout.align : "left";
      const movingWidth = clampFieldWidth(Number(movingLayout?.width ?? 40));
      const movingEdges = edgeValuesForX(currentX, movingWidth, movingAlign);

      for (const key of enabledOthers) {
        const layout = certificateLayout[key];
        if (!layout) continue;
        const otherAlign = layout.align === "center" || layout.align === "right" ? layout.align : "left";
        const otherWidth = clampFieldWidth(Number(layout.width ?? 40));
        const otherEdges = edgeValuesForX(clampNumber(Number(layout.x), 0, 100), otherWidth, otherAlign);
        xCandidates.push({ value: clampNumber(otherEdges.left, 0, 100), source: "field", edge: "left" });
        xCandidates.push({ value: clampNumber(otherEdges.center, 0, 100), source: "field", edge: "center" });
        xCandidates.push({ value: clampNumber(otherEdges.right, 0, 100), source: "field", edge: "right" });
        yCandidates.push({ value: clampNumber(Number(layout.y), 0, 100), source: "field" });
      }

      const chooseClosest = (value: number, candidates: Array<{ value: number; source: "center" | "field" }>) => {
        let best: { value: number; source: "center" | "field"; delta: number } | null = null;
        for (const candidate of candidates) {
          const delta = Math.abs(value - candidate.value);
          if (delta > threshold) continue;
          if (!best || delta < best.delta) {
            best = { ...candidate, delta };
          }
        }
        return best;
      };

      const xHit = (() => {
        let best:
          | {
              value: number;
              source: "center" | "field";
              edge: "left" | "center" | "right";
              delta: number;
            }
          | null = null;
        const movingEdgeKeys: Array<"left" | "center" | "right"> = ["left", "center", "right"];
        for (const movingEdge of movingEdgeKeys) {
          const movingValue = movingEdges[movingEdge];
          for (const candidate of xCandidates) {
            const delta = Math.abs(movingValue - candidate.value);
            if (delta > threshold) continue;
            if (!best || delta < best.delta) {
              best = {
                value: candidate.value,
                source: candidate.source,
                edge: movingEdge,
                delta,
              };
            }
          }
        }
        return best;
      })();
      const yHit = chooseClosest(currentY, yCandidates);
      const guides: CertificateLayoutGuide[] = [];
      const x = xHit ? currentX + (xHit.value - movingEdges[xHit.edge]) : currentX;
      const y = yHit ? yHit.value : currentY;
      if (xHit) guides.push({ axis: "x", value: xHit.value, source: xHit.source });
      if (yHit) guides.push({ axis: "y", value: yHit.value, source: yHit.source });
      return {
        x: clampNumber(x, 0, 100),
        y,
        guides,
      };
    },
    [certificateFields, certificateLayout, clampFieldWidth]
  );

  const updateLayoutByPointer = (field: CertificateFieldKey, clientX: number, clientY: number, target: EventTarget & HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    const rawX = applySnap(Number.isFinite(x) ? x : 0);
    const rawY = applySnap(Number.isFinite(y) ? y : 0);
    const guided = applySmartGuideSnap(field, rawX, rawY);
    const nextX = guided.x;
    const nextY = guided.y;
    setCertificateLayoutActiveGuides(guided.guides);

    updateCertificateLayout((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        x: nextX,
        y: nextY,
      },
    }), { commit: false });
  };

  const updateLayoutResizeByPointer = (
    field: CertificateFieldKey,
    clientX: number,
    clientY: number,
    target: EventTarget & HTMLDivElement,
    start: {
      clientX: number;
      clientY: number;
      width: number;
      fontSize: number;
      x: number;
      align: "left" | "center" | "right";
      edge: "left" | "right" | "top" | "bottom";
    },
    options?: { oneSidedToRight?: boolean }
  ) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaXPercent = ((clientX - start.clientX) / rect.width) * 100;
    const deltaY = clientY - start.clientY;

    const horizontalDelta = start.edge === "left" ? -deltaXPercent : start.edge === "right" ? deltaXPercent : 0;
    const verticalDelta = start.edge === "top" ? -deltaY : start.edge === "bottom" ? deltaY : deltaY;

    const rawWidth = start.width + horizontalDelta;
    const rawFontSize = start.fontSize + verticalDelta * 0.15;

    const nextWidth = certificateLayoutSnapEnabled
      ? snapByStep(clampFieldWidth(rawWidth), clampNumber(certificateLayoutSnapStep, 0.5, 20))
      : clampFieldWidth(rawWidth);
    const nextFontSize = certificateLayoutSnapEnabled
      ? snapByStep(clampFontSize(rawFontSize), 1)
      : clampFontSize(rawFontSize);

    const roundedWidth = Math.round(nextWidth * 10) / 10;
    const roundedFontSize = Math.round(nextFontSize * 10) / 10;

    updateCertificateLayout((prev) => {
      const current = prev[field];
      if (!current) return prev;

      if (!options?.oneSidedToRight || (start.edge !== "left" && start.edge !== "right")) {
        return {
          ...prev,
          [field]: {
            ...current,
            width: roundedWidth,
            fontSize: roundedFontSize,
          },
        };
      }

      const initialLeftEdge = start.align === "center"
        ? start.x - start.width / 2
        : start.align === "right"
          ? start.x - start.width
          : start.x;

      const initialRightEdge = initialLeftEdge + start.width;

      const anchoredLeft = start.edge === "right";
      const nextLeftEdge = anchoredLeft ? initialLeftEdge : initialRightEdge - roundedWidth;

      const nextX = start.align === "center"
        ? nextLeftEdge + roundedWidth / 2
        : start.align === "right"
          ? nextLeftEdge + roundedWidth
          : nextLeftEdge;

      return {
        ...prev,
        [field]: {
          ...current,
          x: applySnap(nextX),
          width: roundedWidth,
          fontSize: roundedFontSize,
        },
      };
    }, { commit: false });
  };

  const stopCertificateLayoutInteractions = React.useCallback(
    (options?: { commit?: boolean }) => {
      const wasActive = Boolean(
        certificateLayoutDraggingField
        || certificateLayoutResizingField
        || certificateLayoutDraggingExtraObjectId
        || certificateLayoutResizingExtraObjectId
      );
      setCertificateLayoutDraggingField(null);
      setCertificateLayoutDraggingExtraObjectId(null);
      setCertificateLayoutResizingExtraObjectId(null);
      setCertificateLayoutResizingField(null);
      setCertificateLayoutResizeStart(null);
      setCertificateLayoutExtraResizeStart(null);
      setCertificateLayoutActiveGuides([]);
      if (wasActive && options?.commit !== false) {
        pushCertificateLayoutSnapshot(certificateLayout);
      }
    },
    [
      certificateLayout,
      certificateLayoutDraggingExtraObjectId,
      certificateLayoutDraggingField,
      certificateLayoutResizingExtraObjectId,
      certificateLayoutResizingField,
      pushCertificateLayoutSnapshot,
    ]
  );

  const addCertificateFieldAtPosition = (key: CertificateFieldKey, x: number, y: number) => {
    const nextX = applySnap(x);
    const nextY = applySnap(y);
    setCertificateFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        isEnabled: true,
      },
    }));
    updateCertificateLayout((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        x: nextX,
        y: nextY,
      },
    }));
    setCertificateLayoutSelectedField(key);
    setCertificateLayoutContextMenu(null);
  };

  const moveSelectedCertificateFieldToPosition = (x: number, y: number) => {
    if (!certificateLayoutSelectedField) return;
    const key = certificateLayoutSelectedField;
    updateCertificateLayout((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        x: applySnap(x),
        y: applySnap(y),
      },
    }));
    setCertificateLayoutContextMenu(null);
  };

  const hideSelectedCertificateField = () => {
    if (!certificateLayoutSelectedField) return;
    const key = certificateLayoutSelectedField;
    setCertificateFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        isEnabled: false,
        isRequired: false,
      },
    }));
    setCertificateLayoutSelectedField(null);
    setCertificateLayoutContextMenu(null);
  };

  React.useEffect(() => {
    if (
      !certificateLayoutDraggingField
      && !certificateLayoutResizingField
      && !certificateLayoutDraggingExtraObjectId
      && !certificateLayoutResizingExtraObjectId
    ) return;
    const onRelease = () => stopCertificateLayoutInteractions();
    window.addEventListener("mouseup", onRelease);
    window.addEventListener("blur", onRelease);
    return () => {
      window.removeEventListener("mouseup", onRelease);
      window.removeEventListener("blur", onRelease);
    };
  }, [
    certificateLayoutDraggingExtraObjectId,
    certificateLayoutDraggingField,
    certificateLayoutResizingExtraObjectId,
    certificateLayoutResizingField,
    stopCertificateLayoutInteractions,
  ]);

  const addCertificateExtraObjectAtPosition = (type: CertificateExtraObjectType, x: number, y: number) => {
    const obj = createDefaultCertificateExtraObject(type, applySnap(x), applySnap(y));
    const maxZ = certificateLayoutExtraObjects.reduce((m, o) => Math.max(m, Number(o.zIndex ?? 0)), 0);
    obj.zIndex = Math.max(1, maxZ + 1);
    setCertificateLayoutExtraObjects((prev) => [...prev, obj]);
    setCertificateLayoutSelectedField(null);
    setCertificateLayoutSelectedExtraObjectId(obj.id);
    setCertificateLayoutContextMenu(null);
  };

  const duplicateSelectedCertificateExtraObject = React.useCallback(() => {
    if (!certificateLayoutSelectedExtraObjectId) return;
    const current = certificateLayoutExtraObjects.find((obj) => obj.id === certificateLayoutSelectedExtraObjectId);
    if (!current) return;
    const duplicated = {
      ...current,
      id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: clampNumber(current.x + 2, 0, 100),
      y: clampNumber(current.y + 2, 0, 100),
      zIndex: clampNumber(Number(current.zIndex ?? 20) + 1, 1, 999),
    };
    setCertificateLayoutExtraObjects((prev) => [...prev, duplicated]);
    setCertificateLayoutSelectedExtraObjectId(duplicated.id);
    setCertificateLayoutSelectedField(null);
  }, [certificateLayoutExtraObjects, certificateLayoutSelectedExtraObjectId]);

  const changeSelectedCertificateExtraObjectLayer = (delta: number) => {
    if (!certificateLayoutSelectedExtraObjectId) return;
    setCertificateLayoutExtraObjects((prev) => prev.map((obj) => {
      if (obj.id !== certificateLayoutSelectedExtraObjectId) return obj;
      return {
        ...obj,
        zIndex: clampNumber(Number(obj.zIndex ?? 20) + delta, 1, 999),
      };
    }));
  };

  const uploadSelectedCertificateExtraImageFile = (file: File | null) => {
    if (!file || !certificateLayoutSelectedExtraObjectId) return;
    if (!String(file.type ?? "").toLowerCase().startsWith("image/")) {
      setCertificateError(tr("Оберіть файл зображення", "Please select an image file"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setCertificateError(tr("Не вдалося прочитати файл", "Failed to read file"));
        return;
      }
      setCertificateLayoutExtraObjects((prev) => prev.map((obj) => (
        obj.id === certificateLayoutSelectedExtraObjectId
          ? { ...obj, imageUrl: result }
          : obj
      )));
      setCertificateError(null);
      setCertificateMessage(tr("Зображення об'єкта завантажено", "Object image uploaded"));
    };
    reader.onerror = () => setCertificateError(tr("Не вдалося прочитати файл", "Failed to read file"));
    reader.readAsDataURL(file);
  };

  const moveSelectedCertificateObjectToPosition = (x: number, y: number) => {
    const nextX = applySnap(x);
    const nextY = applySnap(y);
    if (certificateLayoutSelectedExtraObjectId) {
      setCertificateLayoutExtraObjects((prev) =>
        prev.map((obj) => (obj.id === certificateLayoutSelectedExtraObjectId ? { ...obj, x: nextX, y: nextY } : obj))
      );
      setCertificateLayoutContextMenu(null);
      return;
    }
    moveSelectedCertificateFieldToPosition(nextX, nextY);
  };

  const removeSelectedCertificateObject = () => {
    if (certificateLayoutSelectedExtraObjectId) {
      setCertificateLayoutExtraObjects((prev) => prev.filter((obj) => obj.id !== certificateLayoutSelectedExtraObjectId));
      setCertificateLayoutSelectedExtraObjectId(null);
      setCertificateLayoutContextMenu(null);
      return;
    }
    hideSelectedCertificateField();
  };

  const updateCertificateExtraObjectByPointer = (id: string, clientX: number, clientY: number, target: EventTarget & HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    const nextX = applySnap(x);
    const nextY = applySnap(y);
    setCertificateLayoutExtraObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, x: nextX, y: nextY } : obj)));
  };

  const updateCertificateExtraResizeByPointer = (
    id: string,
    clientX: number,
    clientY: number,
    target: EventTarget & HTMLDivElement,
    start: {
      clientX: number;
      clientY: number;
      width: number;
      height: number;
      x: number;
      y: number;
      align: "left" | "center" | "right";
      edge: "left" | "right" | "top" | "bottom";
    },
    options?: { oneSided?: boolean }
  ) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaXPercent = ((clientX - start.clientX) / rect.width) * 100;
    const deltaYPercent = ((clientY - start.clientY) / rect.height) * 100;

    const horizontalDelta = start.edge === "left" ? -deltaXPercent : start.edge === "right" ? deltaXPercent : 0;
    const verticalDelta = start.edge === "top" ? -deltaYPercent : start.edge === "bottom" ? deltaYPercent : 0;

    const rawWidth = start.width + horizontalDelta;
    const rawHeight = start.height + verticalDelta;

    const nextWidth = certificateLayoutSnapEnabled
      ? snapByStep(clampNumber(rawWidth, 2, 96), clampNumber(certificateLayoutSnapStep, 0.5, 20))
      : clampNumber(rawWidth, 2, 96);
    const nextHeight = certificateLayoutSnapEnabled
      ? snapByStep(clampNumber(rawHeight, 2, 96), clampNumber(certificateLayoutSnapStep, 0.5, 20))
      : clampNumber(rawHeight, 2, 96);

    const roundedWidth = Math.round(nextWidth * 10) / 10;
    const roundedHeight = Math.round(nextHeight * 10) / 10;

    setCertificateLayoutExtraObjects((prev) => prev.map((obj) => {
      if (obj.id !== id) return obj;

      if (!options?.oneSided) {
        return {
          ...obj,
          width: roundedWidth,
          height: roundedHeight,
        };
      }

      let nextX = obj.x;
      let nextY = obj.y;

      if (start.edge === "left" || start.edge === "right") {
        const initialLeftEdge = start.align === "center"
          ? start.x - start.width / 2
          : start.align === "right"
            ? start.x - start.width
            : start.x;
        const initialRightEdge = initialLeftEdge + start.width;
        const anchoredLeft = start.edge === "right";
        const nextLeftEdge = anchoredLeft ? initialLeftEdge : initialRightEdge - roundedWidth;
        nextX = start.align === "center"
          ? nextLeftEdge + roundedWidth / 2
          : start.align === "right"
            ? nextLeftEdge + roundedWidth
            : nextLeftEdge;
      }

      if (start.edge === "top" || start.edge === "bottom") {
        const initialTopEdge = start.y - start.height / 2;
        const initialBottomEdge = start.y + start.height / 2;
        const anchoredTop = start.edge === "bottom";
        const nextTopEdge = anchoredTop ? initialTopEdge : initialBottomEdge - roundedHeight;
        nextY = nextTopEdge + roundedHeight / 2;
      }

      return {
        ...obj,
        x: applySnap(nextX),
        y: applySnap(nextY),
        width: roundedWidth,
        height: roundedHeight,
      };
    }));
  };

  const canUndoCertificateLayout = certificateLayoutHistoryIndex > 0;
  const canRedoCertificateLayout = certificateLayoutHistoryIndex < certificateLayoutHistory.length - 1;
  const sortedCertificateLayoutExtraObjects = React.useMemo(
    () => [...certificateLayoutExtraObjects].sort((a, b) => Number(a.zIndex ?? 0) - Number(b.zIndex ?? 0)),
    [certificateLayoutExtraObjects]
  );

  const undoCertificateLayout = () => {
    if (!canUndoCertificateLayout) return;
    const nextIndex = certificateLayoutHistoryIndex - 1;
    const snap = certificateLayoutHistory[nextIndex];
    if (!snap) return;
    setCertificateLayout(normalizeCertificateLayoutState(snap.layout));
    setCertificateLayoutBackgroundUrl(String(snap.bgUrl ?? ""));
    setCertificateLayoutHistoryIndex(nextIndex);
    stopCertificateLayoutInteractions({ commit: false });
  };

  const redoCertificateLayout = () => {
    if (!canRedoCertificateLayout) return;
    const nextIndex = certificateLayoutHistoryIndex + 1;
    const snap = certificateLayoutHistory[nextIndex];
    if (!snap) return;
    setCertificateLayout(normalizeCertificateLayoutState(snap.layout));
    setCertificateLayoutBackgroundUrl(String(snap.bgUrl ?? ""));
    setCertificateLayoutHistoryIndex(nextIndex);
    stopCertificateLayoutInteractions({ commit: false });
  };

  const nudgeCertificateLayoutSelection = (dx: number, dy: number) => {
    if (certificateLayoutSelectedExtraObjectId) {
      setCertificateLayoutExtraObjects((prev) =>
        prev.map((obj) => {
          if (obj.id !== certificateLayoutSelectedExtraObjectId) return obj;
          return {
            ...obj,
            x: applySnap(obj.x + dx),
            y: applySnap(obj.y + dy),
          };
        })
      );
      return;
    }
    if (!certificateLayoutSelectedField) return;
    updateCertificateLayout((prev) => {
      const current = prev[certificateLayoutSelectedField];
      if (!current) return prev;
      return {
        ...prev,
        [certificateLayoutSelectedField]: {
          ...current,
          x: applySnap(current.x + dx),
          y: applySnap(current.y + dy),
        },
      };
    });
  };

  const saveCertificateLayoutPreset = () => {
    const name = String(certificateLayoutPresetName ?? "").trim();
    if (!name) {
      setCertificateError(tr("Вкажіть назву пресета", "Enter preset name"));
      return;
    }

    const preset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      createdAt: new Date().toISOString(),
      bgUrl: certificateLayoutBackgroundUrl,
      layout: normalizeCertificateLayoutState(certificateLayout),
    } as CertificateLayoutPresetItem;
    const next = [preset, ...certificateLayoutPresets].slice(0, 40);
    setCertificateLayoutPresets(next);
    setCertificateLayoutPresetId(preset.id);
    setCertificateLayoutPresetName("");
    writeCertificateLayoutPresets(contestId, next);
    setCertificateMessage(tr(`Пресет "${preset.name}" збережено`, `Preset "${preset.name}" saved`));
    setCertificateError(null);
  };

  const loadCertificateLayoutPreset = () => {
    const selected = certificateLayoutPresets.find((p) => p.id === certificateLayoutPresetId);
    if (!selected) return;
    const nextLayout = normalizeCertificateLayoutState(selected.layout);
    setCertificateLayout(nextLayout);
    setCertificateLayoutBackgroundUrl(selected.bgUrl);
    setCertificateLayoutSelectedField(null);
    setCertificateLayoutDraggingField(null);
    setCertificateLayoutResizingField(null);
    setCertificateLayoutResizeStart(null);
    pushCertificateLayoutSnapshot(nextLayout, selected.bgUrl);
    setCertificateMessage(tr(`Пресет "${selected.name}" завантажено`, `Preset "${selected.name}" loaded`));
    setCertificateError(null);
  };

  const deleteCertificateLayoutPreset = () => {
    if (!certificateLayoutPresetId) return;
    const next = certificateLayoutPresets.filter((p) => p.id !== certificateLayoutPresetId);
    setCertificateLayoutPresets(next);
    writeCertificateLayoutPresets(contestId, next);
    setCertificateLayoutPresetId("");
    setCertificateMessage(tr("Пресет видалено", "Preset deleted"));
  };

  const addOrganizer = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const uid = Number(newOrganizerUserId);
    if (!Number.isFinite(uid) || uid <= 0) {
      setOrganizersError(tr("Вкажіть коректний user ID", "Provide a valid user ID"));
      return;
    }
    try {
      await addContestOrganizer(contestId, uid);
      setNewOrganizerUserId("");
      await loadOrganizers();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setOrganizersError(msg || tr("Не вдалося додати організатора", "Failed to add organizer"));
    }
  };

  const removeOrganizer = async (userId: number) => {
    if (!contestId || !data?.access?.canManage) return;
    try {
      await removeContestOrganizer(contestId, userId);
      await loadOrganizers();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setOrganizersError(msg || tr("Не вдалося видалити організатора", "Failed to remove organizer"));
    }
  };

  const applyAnnulment = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const problemId = Number(annulProblemId);
    const participantId = String(annulParticipantId).trim() ? Number(annulParticipantId) : null;
    if (!Number.isFinite(problemId) || problemId <= 0) {
      setAnnulmentsError(tr("Вкажіть коректний problem ID", "Provide a valid problem ID"));
      return;
    }
    if (participantId != null && (!Number.isFinite(participantId) || participantId <= 0)) {
      setAnnulmentsError(tr("Некоректний participant ID", "Invalid participant ID"));
      return;
    }
    try {
      await setContestAnnulment(contestId, {
        problemId,
        participantId,
        annulled: annulledActive,
        reason: annulReason.trim() ? annulReason.trim() : null,
      });
      await loadAnnulments();
      setAnnulReason("");
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAnnulmentsError(msg || tr("Не вдалося застосувати анулювання", "Failed to apply annulment"));
    }
  };

  const closeAdminInspector = React.useCallback(() => {
    setAdminSubsParticipant(null);
    setAdminSubsRows([]);
    setAdminSubsCodeViewer(null);
    setAdminSubsError(null);
  }, []);

  const openAdminSubmissions = async (p: ContestAdminParticipant, opts?: { fullPage?: boolean }) => {
    if (!contestId) return;
    if (typeof opts?.fullPage === "boolean") setAdminSubsFullPage(opts.fullPage);
    setAdminSubsParticipant(p);
    setAdminSubsRows([]);
    setAdminSubsVerdictFilter("ALL");
    setAdminSubsProblemFilter("ALL");
    setAdminSubsError(null);
    setAdminSubsLoading(true);
    try {
      const r = await listContestParticipantSubmissionsForAdmin(contestId, p.id, 200);
      const rows = Array.isArray(r.submissions) ? r.submissions : [];
      setAdminSubsRows(rows);
      setAdminSubsCodeViewer(rows[0] ?? null);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAdminSubsError(msg || tr("Не вдалося завантажити подачі", "Failed to load submissions"));
      setAdminSubsRows([]);
      setAdminSubsCodeViewer(null);
    } finally {
      setAdminSubsLoading(false);
    }
  };

  const generateAccounts = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const entries = parseRosterInput(accountRosterText);
    if (entries.length === 0) {
      setAccountGenError(tr("Додайте хоча б 1 рядок у форматі: ПІБ, email", "Add at least one row in format: Full name, email"));
      return;
    }

    setAccountGenLoading(true);
    setAccountGenError(null);
    setAccountGenMessage(null);
    setAccountMailError(null);
    setAccountMailResult(null);
    try {
      const r = await generateContestAccounts(contestId, { entries });
      setGeneratedAccounts(Array.isArray(r.created) ? r.created : []);
      setAccountGenMessage(tr(`Згенеровано акаунтів: ${Array.isArray(r.created) ? r.created.length : 0}`, `Generated accounts: ${Array.isArray(r.created) ? r.created.length : 0}`));
      await loadAdminParticipants();
      setStandingsVersion((v) => v + 1);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAccountGenError(msg || tr("Не вдалося згенерувати акаунти", "Failed to generate accounts"));
    } finally {
      setAccountGenLoading(false);
    }
  };

  const importRosterCsvFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseRosterCsvTextDetailed(text);
      if (parsed.entries.length === 0) {
        setAccountGenError(tr("CSV не містить валідних рядків ПІБ,email", "CSV has no valid fullName,email rows"));
        return;
      }
      setAccountRosterImportFileName(String(file.name ?? ""));
      setAccountRosterImportEntries(parsed.entries);
      setAccountRosterImportInvalidLines(parsed.invalidLines);
      setAccountRosterImportDuplicateEmails(parsed.duplicateEmails);
      setAccountRosterImportPreviewOpen(true);
      setAccountGenError(null);
      setAccountGenMessage(null);
    } catch {
      setAccountGenError(tr("Не вдалося прочитати CSV файл", "Failed to read CSV file"));
    } finally {
      setAccountRosterImportKey((k) => k + 1);
    }
  };

  const cancelRosterCsvImportPreview = () => {
    setAccountRosterImportPreviewOpen(false);
    setAccountRosterImportFileName("");
    setAccountRosterImportEntries([]);
    setAccountRosterImportInvalidLines([]);
    setAccountRosterImportDuplicateEmails([]);
  };

  const applyRosterCsvImportPreview = () => {
    if (!accountRosterImportEntries.length) {
      cancelRosterCsvImportPreview();
      return;
    }

    const existing = parseRosterInput(accountRosterText);
    const beforeUniqueCount = mergeRosterRows(existing, []).length;
    const merged = mergeRosterRows(existing, accountRosterImportEntries);
    const lines = merged.map((r) => `${r.fullName}, ${r.email}`);
    const addedCount = Math.max(0, merged.length - beforeUniqueCount);

    setAccountRosterText(lines.join("\n"));
    setAccountGenError(null);
    setAccountGenMessage(
      tr(
        `Імпортовано з CSV: ${accountRosterImportEntries.length}. Додано нових: ${addedCount}. Всього в списку: ${lines.length}`,
        `Imported from CSV: ${accountRosterImportEntries.length}. Added new: ${addedCount}. Total in roster: ${lines.length}`
      )
    );
    cancelRosterCsvImportPreview();
  };

  const generatedAccountsCsv = React.useMemo(() => {
    if (!generatedAccounts.length) return "";
    const header = "fullName,email,username,password,userId,participantId";
    const rows = generatedAccounts.map((a) => [a.fullName ?? "", a.email ?? "", a.username, a.password, String(a.userId), String(a.participantId)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","));
    return [header, ...rows].join("\n");
  }, [generatedAccounts]);

  const rosterInputAnalysis = React.useMemo(() => analyzeRosterInput(accountRosterText), [accountRosterText]);
  const rosterPreviewRows = React.useMemo(() => rosterInputAnalysis.entries.slice(0, 8), [rosterInputAnalysis.entries]);
  const existingRosterEntries = React.useMemo(() => parseRosterInput(accountRosterText), [accountRosterText]);
  const existingRosterKeySet = React.useMemo(() => {
    return new Set(existingRosterEntries.map((row) => makeRosterRowKey(row)));
  }, [existingRosterEntries]);
  const accountRosterImportDiff = React.useMemo(() => {
    const seenImport = new Set<string>();
    let duplicateWithinImport = 0;

    const rows = accountRosterImportEntries.map((row) => {
      const key = makeRosterRowKey(row);
      const isDuplicateInImport = seenImport.has(key);
      if (isDuplicateInImport) duplicateWithinImport += 1;
      else seenImport.add(key);

      const isExisting = existingRosterKeySet.has(key);
      return { ...row, key, isExisting, isDuplicateInImport };
    });

    const uniqueImportKeys = Array.from(seenImport);
    const existingCount = uniqueImportKeys.filter((key) => existingRosterKeySet.has(key)).length;
    const newCount = Math.max(0, uniqueImportKeys.length - existingCount);

    return {
      rows,
      uniqueImportCount: uniqueImportKeys.length,
      newCount,
      existingCount,
      duplicateWithinImport,
    };
  }, [accountRosterImportEntries, existingRosterKeySet]);
  const accountRosterImportPreviewRows = React.useMemo(() => accountRosterImportDiff.rows.slice(0, 10), [accountRosterImportDiff.rows]);

  const clearRosterInput = () => {
    setAccountRosterText("");
    setAccountRosterImportKey((k) => k + 1);
    cancelRosterCsvImportPreview();
    setAccountGenError(null);
    setAccountGenMessage(null);
  };

  const clearGeneratedAccounts = () => {
    setGeneratedAccounts([]);
    setAccountMailCustomMessage("");
    setAccountMailError(null);
    setAccountMailResult(null);
  };

  const sendGeneratedAccountsByEmail = async () => {
    if (!contestId || !generatedAccounts.length) return;
    setAccountMailLoading(true);
    setAccountMailError(null);
    setAccountMailResult(null);
    try {
      const recipients = generatedAccounts
        .filter((a) => String(a.email ?? "").trim())
        .map((a) => ({
          fullName: String(a.fullName ?? a.username).trim(),
          email: String(a.email ?? "").trim(),
          username: a.username,
          password: a.password,
        }));

      if (!recipients.length) {
        setAccountMailError(tr("У згенерованих акаунтах немає email для розсилки", "No emails found in generated accounts"));
        return;
      }

      const r = await sendContestAccountsEmails(contestId, {
        recipients,
        includeContestInfo: true,
        customMessage: accountMailCustomMessage.trim() || undefined,
      });

      setAccountMailResult(
        tr(
          `Надіслано: ${r.sentCount}, помилок: ${r.failedCount}`,
          `Sent: ${r.sentCount}, failed: ${r.failedCount}`
        )
      );

      if (Array.isArray(r.failed) && r.failed.length > 0) {
        const preview = r.failed.slice(0, 5).map((f) => `${f.email}: ${f.reason}`).join("; ");
        setAccountMailError(
          tr(`Частина листів не надіслана: ${preview}`, `Some emails failed: ${preview}`)
        );
      }
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAccountMailError(msg || tr("Не вдалося надіслати листи", "Failed to send emails"));
    } finally {
      setAccountMailLoading(false);
    }
  };

  const copyGeneratedAccounts = async () => {
    if (!generatedAccountsCsv || typeof window === "undefined") return;
    try {
      await navigator.clipboard?.writeText(generatedAccountsCsv);
    } catch {
      // ignore clipboard errors
    }
  };

  const downloadGeneratedAccountsCsv = () => {
    if (!generatedAccountsCsv || typeof window === "undefined") return;
    const blob = new Blob([generatedAccountsCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contest-${contestId}-accounts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const adminSubsProblemOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; label: string }> = [];
    for (const s of adminSubsRows) {
      const key = String(s.problem?.id ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: String(s.problem?.label ?? `P${s.problem?.order ?? "?"}`) });
    }
    return out;
  }, [adminSubsRows]);

  const adminSubsVerdictOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of adminSubsRows) {
      const verdict = String(s.verdict ?? "N/A").toUpperCase();
      if (seen.has(verdict)) continue;
      seen.add(verdict);
      out.push(verdict);
    }
    return out;
  }, [adminSubsRows]);

  const adminSubsFilteredRows = React.useMemo(() => {
    return adminSubsRows.filter((s) => {
      const byProblem = adminSubsProblemFilter === "ALL" || String(s.problem?.id ?? "") === adminSubsProblemFilter;
      const verdict = String(s.verdict ?? "N/A").toUpperCase();
      const byVerdict = adminSubsVerdictFilter === "ALL" || verdict === adminSubsVerdictFilter;
      return byProblem && byVerdict;
    });
  }, [adminSubsRows, adminSubsProblemFilter, adminSubsVerdictFilter]);

  const adminInspectorBody = (
    <>
      {!adminSubsLoading && adminSubsRows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <div className="border border-border bg-bg-base rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">{tr("Задача", "Problem")}</div>
            <select
              value={adminSubsProblemFilter}
              onChange={(e) => setAdminSubsProblemFilter(e.target.value)}
              className="w-full bg-bg-base text-text-primary text-xs font-mono border border-border rounded px-2 py-1"
            >
              <option value="ALL">{tr("Усі", "All")}</option>
              {adminSubsProblemOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="border border-border bg-bg-base rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">{tr("Вердикт", "Verdict")}</div>
            <select
              value={adminSubsVerdictFilter}
              onChange={(e) => setAdminSubsVerdictFilter(e.target.value)}
              className="w-full bg-bg-base text-text-primary text-xs font-mono border border-border rounded px-2 py-1"
            >
              <option value="ALL">{tr("Усі", "All")}</option>
              {adminSubsVerdictOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="border border-border bg-bg-base rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-text-secondary">{tr("Показано", "Shown")}</span>
            <span className="text-sm font-mono text-text-primary">{adminSubsFilteredRows.length}/{adminSubsRows.length}</span>
          </div>
        </div>
      ) : null}

      {adminSubsError ? <div className="text-sm text-accent-error mb-3">{adminSubsError}</div> : null}

      {adminSubsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : adminSubsFilteredRows.length === 0 ? (
        <div className="text-sm text-text-secondary">{tr("Немає подач", "No submissions")}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
          <div className={`border border-border overflow-auto ${adminSubsFullPage ? "max-h-[calc(100vh-250px)]" : "max-h-[72vh]"}`}>
            <table className="min-w-[700px] w-full text-xs font-mono">
              <thead className="bg-bg-hover sticky top-0">
                <tr>
                  <th className="p-2 border-b border-border text-left">#</th>
                  <th className="p-2 border-b border-border text-left">{tr("Час", "Time")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Задача", "Problem")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Фаза", "Phase")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Вердикт", "Verdict")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Бали", "Score")}</th>
                </tr>
              </thead>
              <tbody>
                {adminSubsFilteredRows.map((s) => (
                  <tr
                    key={s.id}
                    className={`cursor-pointer odd:bg-bg-base even:bg-bg-surface hover:bg-bg-hover ${adminSubsCodeViewer?.id === s.id ? "!bg-primary/10" : ""}`}
                    onClick={() => setAdminSubsCodeViewer(s)}
                  >
                    <td className="p-2 border-b border-border">{s.id}</td>
                    <td className="p-2 border-b border-border">{fmtDateTime(s.createdAt, i18n.language)}</td>
                    <td className="p-2 border-b border-border text-center">{s.problem?.label ?? "—"}</td>
                    <td className="p-2 border-b border-border text-center">
                      {(() => {
                        const p = submissionPhaseChip(s.phase, tr);
                        return <StatusChip glyph={p.glyph} label={p.label} tone={p.tone} />;
                      })()}
                    </td>
                    <td className="p-2 border-b border-border text-center">
                      {(() => {
                        const v = verdictChip(s.verdict, tr);
                        return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} />;
                      })()}
                    </td>
                    <td className="p-2 border-b border-border text-center">
                      {s.score != null && s.maxScore != null ? (
                        <StatusChip
                          glyph="◉"
                          label={`${s.score}/${s.maxScore}`}
                          tone={submissionScoreTone(s.score)}
                        />
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-border bg-bg-base/70 p-2">
            {adminSubsCodeViewer ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary font-mono">
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">#{adminSubsCodeViewer.id}</span>
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">{adminSubsCodeViewer.problem?.label ?? "—"}</span>
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">{adminSubsCodeViewer.language ?? "—"}</span>
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">{fmtDateTime(adminSubsCodeViewer.createdAt, i18n.language)}</span>
                  {adminSubsCodeViewer.score != null && adminSubsCodeViewer.maxScore != null ? (
                    <span className="px-2 py-1 rounded border border-border bg-bg-base">{adminSubsCodeViewer.score}/{adminSubsCodeViewer.maxScore}</span>
                  ) : null}
                </div>
                <div className={`border border-border overflow-hidden ${adminSubsFullPage ? "h-[calc(100vh-280px)] min-h-[480px]" : "h-[62vh] min-h-[420px]"}`}>
                  <CodeEditor
                    language={toCodeEditorLanguage(adminSubsCodeViewer.language)}
                    value={adminSubsCodeViewer.submittedCode || ""}
                    readOnly
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-secondary p-4">{tr("Виберіть подачу зліва, щоб переглянути код.", "Pick a submission on the left to inspect code.")}</div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const toggleParticipantDisqualification = async (p: ContestAdminParticipant) => {
    if (!contestId) return;
    try {
      const reason = p.isDisqualified
        ? null
        : (typeof window !== "undefined"
            ? (window.prompt(tr("Причина дискваліфікації (необов'язково)", "Disqualification reason (optional)"), p.disqualificationReason ?? "") ?? "")
            : "");

      const nextDisqualified = !p.isDisqualified;
      const response = await setContestParticipantDisqualified(contestId, p.id, {
        disqualified: !p.isDisqualified,
        reason: p.isDisqualified ? null : (String(reason).trim() || null),
      });

      if (!nextDisqualified) {
        setAdminParticipantsActionTone("success");
        setAdminParticipantsActionMessage(
          tr(
            `Учасника ${p.displayName} повернуто до заліку.`,
            `Participant ${p.displayName} has been restored.`
          )
        );
      } else {
        const n = response?.notification;
        if (n?.sent && n.recipientEmail) {
          setAdminParticipantsActionTone("success");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано. Лист надіслано: ${n.recipientEmail}.`,
              `Participant ${p.displayName} disqualified. Email sent to: ${n.recipientEmail}.`
            )
          );
        } else if (n?.reason === "EMAIL_NOT_AVAILABLE") {
          setAdminParticipantsActionTone("warn");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано, але email для сповіщення відсутній.`,
              `Participant ${p.displayName} disqualified, but no email is available for notification.`
            )
          );
        } else if (n?.reason === "EMAIL_SEND_FAILED") {
          setAdminParticipantsActionTone("warn");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано, але лист не вдалося надіслати.`,
              `Participant ${p.displayName} disqualified, but email sending failed.`
            )
          );
        } else {
          setAdminParticipantsActionTone("warn");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано. Статус сповіщення невідомий.`,
              `Participant ${p.displayName} disqualified. Notification status is unknown.`
            )
          );
        }
      }

      await loadAdminParticipants();
      setStandingsVersion((v) => v + 1);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAdminParticipantsActionTone("error");
      setAdminParticipantsActionMessage(msg || tr("Не вдалося змінити статус дискваліфікації", "Failed to update disqualification status"));
      setError(msg || tr("Не вдалося змінити статус дискваліфікації", "Failed to update disqualification status"));
    }
  };

  const progressByProblemId = React.useMemo(() => {
    const m = new Map<number, ContestMyProgressProblem>();
    for (const p of progress || []) {
      if (p && Number.isFinite(p.problemId)) m.set(p.problemId, p);
    }
    return m;
  }, [progress]);

  const onJoin = async () => {
    if (!contestId) return;
    setJoining(true);
    try {
      await joinContest(contestId, joinCode.trim());
      setJoinCode("");
      load();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || tr("Невірний код", "Invalid code"));
    } finally {
      setJoining(false);
    }
  };

  const togglePublished = async () => {
    if (!contestId || !data?.access?.canManage) return;
    setPublishing(true);
    try {
      await updateContest(contestId, { isPublished: !data.contest.isPublished });
      await load();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || tr("Не вдалося оновити публікацію", "Failed to update publication status"));
    } finally {
      setPublishing(false);
    }
  };

  React.useEffect(() => {
    if (!settingsOpen || !data?.contest) return;
    setSettingsError(null);
    setSettingsTitle(String(data.contest.title ?? ""));
    setSettingsDescription(String(data.contest.description ?? ""));
    setSettingsStartsAt(toDateTimeLocalInput(data.contest.startsAt));
    setSettingsEndsAt(toDateTimeLocalInput(data.contest.endsAt));
    setSettingsAllowUpsolve(Boolean(data.contest.allowUpsolve));
  }, [settingsOpen, data?.contest]);

  const saveContestSettings = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const title = settingsTitle.trim();
    if (title.length < 3) {
      setSettingsError(tr("Назва контесту занадто коротка", "Contest title is too short"));
      return;
    }

    const startsAtIso = fromDateTimeLocalInput(settingsStartsAt);
    const endsAtIso = fromDateTimeLocalInput(settingsEndsAt);
    if (startsAtIso && endsAtIso && new Date(endsAtIso).getTime() < new Date(startsAtIso).getTime()) {
      setSettingsError(tr("Кінець не може бути раніше старту", "End cannot be before start"));
      return;
    }

    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await updateContest(contestId, {
        title,
        description: settingsDescription.trim() ? settingsDescription.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        allowUpsolve: settingsAllowUpsolve,
      });
      setSettingsOpen(false);
      await load();
      if (tab === "problems") loadProgress();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setSettingsError(msg || tr("Не вдалося зберегти налаштування контесту", "Failed to save contest settings"));
    } finally {
      setSettingsSaving(false);
    }
  };

  const resetAddForm = React.useCallback(() => {
    setAddError(null);
    setAddMode("CREATE");
    setAddTitle("");
    setAddDescription("");
    setAddTemplate("public class Main {\n  public static void main(String[] args) {\n    // TODO\n  }\n}\n");
    setAddTestsJson("");
    setAddMaxAttempts(3);
    setCopyLibraryTaskId("");
    setCopyQuery("");
    setCopyItems([]);
    setArchiveFile(null);
  }, []);

  const loadCopyItems = React.useCallback(async () => {
    setCopyLoading(true);
    try {
      const [mine, approved] = await Promise.all([
        listMyLibraryTasks().catch(() => ({ tasks: [] as LibraryTaskListItem[] })),
        listApprovedLibraryTasks({ q: copyQuery.trim() || undefined, page: 1, pageSize: 50 }).catch(() => ({ tasks: [] as LibraryTaskListItem[] })),
      ]);
      const map = new Map<number, LibraryTaskListItem>();
      for (const t of [...(mine.tasks || []), ...(approved.tasks || [])]) {
        if (!t || !Number.isFinite(t.id)) continue;
        if (copyQuery.trim()) {
          const n = copyQuery.trim().toLowerCase();
          if (!`${t.title} ${t.problemCode ?? ""} ${t.slug ?? ""}`.toLowerCase().includes(n)) continue;
        }
        map.set(t.id, t);
      }
      const arr = Array.from(map.values()).sort((a, b) => Number(b.id) - Number(a.id));
      setCopyItems(arr.slice(0, 100));
    } finally {
      setCopyLoading(false);
    }
  }, [copyQuery]);

  const importArchiveAndAttach = async () => {
    if (!contestId) return;
    if (!archiveFile) {
      setAddError(tr("Оберіть zip-архів", "Select a zip archive"));
      return;
    }
    setImportingArchive(true);
    setAddError(null);
    try {
      const imported = await importLibraryTaskArchive(archiveFile, { hideFromLibrary: true });
      const taskId = Number(imported?.task?.id);
      if (!Number.isFinite(taskId) || taskId <= 0) {
        setAddError(tr("Не вдалося імпортувати задачу", "Failed to import task"));
        return;
      }
      await addContestProblem(contestId, { mode: "COPY", libraryTaskId: taskId });
      setAddOpen(false);
      resetAddForm();
      await load();
      if (tab === "problems") loadProgress();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAddError(msg || tr("Помилка імпорту архіву", "Archive import failed"));
    } finally {
      setImportingArchive(false);
    }
  };

  const submitAddProblem = async () => {
    if (!contestId) return;
    setAddError(null);

    try {
      setAdding(true);
      if (addMode === "CREATE") {
        const title = addTitle.trim();
        const description = addDescription.trim();
        const template = addTemplate;
        if (title.length < 3) {
          setAddError(tr("Назва задачі занадто коротка", "Problem title is too short"));
          return;
        }
        if (!description) {
          setAddError(tr("Опис задачі обовʼязковий", "Problem description is required"));
          return;
        }
        if (!template.trim()) {
          setAddError(tr("Шаблон обовʼязковий", "Template is required"));
          return;
        }

        const tests = parseTestsJson(addTestsJson);
        const inferredDifficulty = inferDifficultyFromTests(tests);
        await addContestProblem(contestId, {
          mode: "CREATE",
          title,
          description,
          template,
          maxAttempts: Math.max(1, Math.min(100, Math.floor(Number(addMaxAttempts) || 3))),
          ...(inferredDifficulty ? { difficulty: inferredDifficulty } : {}),
          ...(tests.length ? { tests } : {}),
        });
      } else if (addMode === "COPY") {
        const libraryTaskId = Number(copyLibraryTaskId);
        if (!Number.isFinite(libraryTaskId) || libraryTaskId <= 0) {
          setAddError(tr("Вкажіть коректний Library Task ID", "Provide a valid Library Task ID"));
          return;
        }
        await addContestProblem(contestId, { mode: "COPY", libraryTaskId });
      } else {
        await importArchiveAndAttach();
        return;
      }

      setAddOpen(false);
      resetAddForm();
      load();
      if (tab === "problems") loadProgress();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAddError(msg || tr("Не вдалося додати задачу", "Failed to add problem"));
    } finally {
      setAdding(false);
    }
  };

  React.useEffect(() => {
    if (!addOpen) return;
    if (addMode !== "COPY") return;
    loadCopyItems();
  }, [addOpen, addMode, copyQuery, loadCopyItems]);

  React.useEffect(() => {
    if (!manageOpen || !data?.problems) return;
    const next: Record<number, { label: string; points: string; order: string }> = {};
    for (const p of data.problems) {
      next[p.id] = {
        label: String(p.label ?? ""),
        points: p.points != null ? String(p.points) : "",
        order: String(p.order ?? 0),
      };
    }
    setProblemSettingsDraft(next);
    setProblemSettingsError(null);
  }, [manageOpen, data?.problems]);

  const saveProblemSettings = async (problemId: number) => {
    if (!contestId) return;
    const d = problemSettingsDraft[problemId];
    if (!d) return;

    setSavingProblemSettingsId(problemId);
    setProblemSettingsError(null);
    try {
      const label = String(d.label ?? "").trim();
      const pointsRaw = String(d.points ?? "").trim();
      const orderRaw = String(d.order ?? "").trim();
      const points = pointsRaw ? Number(pointsRaw) : null;
      const order = orderRaw ? Number(orderRaw) : undefined;
      await updateContestProblemSettings(contestId, problemId, {
        label: label ? label : null,
        points: points != null ? points : null,
        ...(Number.isFinite(order) ? { order: Math.max(0, Math.floor(order as number)) } : {}),
      });
      await load();
      if (tab === "problems") loadProgress();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setProblemSettingsError(msg || tr("Не вдалося зберегти налаштування задачі", "Failed to save problem settings"));
    } finally {
      setSavingProblemSettingsId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Button variant="ghost" onClick={() => navigate("/contests")}
          title={tr("Назад до списку", "Back to list")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {tr("Контести", "Contests")}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant={tab === "problems" ? "secondary" : "ghost"} onClick={() => setTab("problems")}
            title={tr("Задачі", "Problems")}
          >
            <ListOrdered className="w-4 h-4 mr-2" />
            {tr("Задачі", "Problems")}
          </Button>
          <Button variant={tab === "standings" ? "secondary" : "ghost"} onClick={() => setTab("standings")}
            title={tr("Таблиця", "Standings")}
          >
            <Table2 className="w-4 h-4 mr-2" />
            {tr("Таблиця", "Standings")}
          </Button>
          <Button variant={tab === "community" ? "secondary" : "ghost"} onClick={() => setTab("community")}
            title={tr("Ком'юніті", "Community")}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {tr("Ком'юніті", "Community")}
          </Button>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddError(null);
        }}
        title={tr("Додати задачу", "Add problem")}
      >
        <div className="space-y-4">
          {addError ? <div className="text-sm text-accent-error">{addError}</div> : null}

          <div className="flex items-center gap-2">
            <Button variant={addMode === "CREATE" ? "secondary" : "ghost"} onClick={() => setAddMode("CREATE")}>
              {tr("Нова", "Create")}
            </Button>
            <Button variant={addMode === "COPY" ? "secondary" : "ghost"} onClick={() => setAddMode("COPY")}>
              {tr("Копія", "Copy")}
            </Button>
            <Button variant={addMode === "IMPORT" ? "secondary" : "ghost"} onClick={() => setAddMode("IMPORT")}>
              {tr("Імпорт", "Import")}
            </Button>
          </div>

          {addMode === "CREATE" ? (
            <>
              <Input label={tr("Назва", "Title")} value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
              <Input
                label={tr("Макс. спроб", "Max attempts")}
                value={String(addMaxAttempts)}
                onChange={(e) => setAddMaxAttempts(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))}
                inputMode="numeric"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Опис", "Description")}</label>
                <textarea
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  rows={7}
                  className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Шаблон", "Template")}</label>
                <textarea
                  value={addTemplate}
                  onChange={(e) => setAddTemplate(e.target.value)}
                  rows={9}
                  className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Тести JSON (з points)", "Tests JSON (with points)")}</label>
                <textarea
                  value={addTestsJson}
                  onChange={(e) => setAddTestsJson(e.target.value)}
                  rows={8}
                  className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
                  placeholder={tr(
                    "Приклад: [{\"input\":\"1 2\",\"expectedOutput\":\"3\",\"isHidden\":true,\"points\":75}]",
                    "Example: [{\"input\":\"1 2\",\"expectedOutput\":\"3\",\"isHidden\":true,\"points\":75}]"
                  )}
                />
                <div className="text-xs text-text-secondary">
                  {tr("Саме points у тестах задають вагу та часткове оцінювання задачі.", "Test points define problem weight and partial scoring.")}
                </div>
              </div>
            </>
          ) : addMode === "COPY" ? (
            <div className="space-y-3">
              <Input
                label={tr("Пошук задач", "Search tasks")}
                value={copyQuery}
                onChange={(e) => setCopyQuery(e.target.value)}
                placeholder={tr("Назва / code / slug", "Title / code / slug")}
              />
              <Input
                label={tr("Library Task ID", "Library Task ID")}
                value={copyLibraryTaskId}
                onChange={(e) => setCopyLibraryTaskId(e.target.value)}
                inputMode="numeric"
                placeholder="123"
              />
              <div className="border border-border max-h-52 overflow-auto">
                {copyLoading ? (
                  <div className="p-3 text-sm text-text-secondary">{tr("Завантаження...", "Loading...")}</div>
                ) : copyItems.length === 0 ? (
                  <div className="p-3 text-sm text-text-secondary">{tr("Задачі не знайдено", "No tasks found")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {copyItems.map((t) => (
                      <button
                        key={t.id}
                        className={`w-full text-left p-2 hover:bg-bg-hover ${String(t.id) === String(copyLibraryTaskId) ? "bg-bg-hover" : ""}`}
                        onClick={() => setCopyLibraryTaskId(String(t.id))}
                      >
                        <div className="text-sm font-mono text-text-primary">#{t.id} — {t.title}</div>
                        <div className="text-xs text-text-secondary">{t.problemCode ?? t.slug ?? ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block">{tr("Імпорт архіву .zip", "Import .zip archive")}</label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setArchiveFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-text-secondary"
              />
              <div className="text-xs text-text-secondary">
                {tr("Архів імпортується в бібліотеку як чернетка і одразу додається в контест.", "Archive is imported to library as draft and then attached to this contest.")}
              </div>
              <div>
                <Button variant="secondary" onClick={importArchiveAndAttach} disabled={importingArchive || !archiveFile}>
                  {importingArchive ? tr("Імпорт...", "Importing...") : tr("Імпортувати й додати", "Import and add")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={adding}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={submitAddProblem} disabled={adding}>
              {adding ? tr("Додавання...", "Adding...") : tr("Додати", "Add")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title={tr("Меню задач контесту", "Contest problem settings")}
      >
        <div className="space-y-3">
          {problemSettingsError ? <div className="text-sm text-accent-error">{problemSettingsError}</div> : null}
          {!data?.problems?.length ? (
            <div className="text-sm text-text-secondary">{tr("У контесті ще немає задач.", "No problems in this contest yet.")}</div>
          ) : (
            <div className="overflow-auto border border-border">
              <table className="min-w-[760px] w-full text-sm font-mono">
                <thead className="bg-bg-hover">
                  <tr>
                    <th className="p-2 border-b border-border text-left">ID</th>
                    <th className="p-2 border-b border-border text-left">{tr("Назва", "Title")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Літера", "Label")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Порядок", "Order")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Бали", "Points")}</th>
                    <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.problems.map((p) => {
                    const draft = problemSettingsDraft[p.id] ?? { label: p.label, points: p.points != null ? String(p.points) : "", order: String(p.order) };
                    const savingThis = savingProblemSettingsId === p.id;
                    return (
                      <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                        <td className="p-2 border-b border-border">{p.id}</td>
                        <td className="p-2 border-b border-border">{p.title}</td>
                        <td className="p-2 border-b border-border text-center">
                          <input
                            value={draft.label}
                            onChange={(e) => setProblemSettingsDraft((s) => ({ ...s, [p.id]: { ...draft, label: e.target.value } }))}
                            className="w-16 px-2 py-1 bg-bg-base border border-border text-text-primary text-center"
                          />
                        </td>
                        <td className="p-2 border-b border-border text-center">
                          <input
                            value={draft.order}
                            onChange={(e) => setProblemSettingsDraft((s) => ({ ...s, [p.id]: { ...draft, order: e.target.value } }))}
                            className="w-20 px-2 py-1 bg-bg-base border border-border text-text-primary text-center"
                            inputMode="numeric"
                          />
                        </td>
                        <td className="p-2 border-b border-border text-center">
                          <input
                            value={draft.points}
                            onChange={(e) => setProblemSettingsDraft((s) => ({ ...s, [p.id]: { ...draft, points: e.target.value } }))}
                            className="w-24 px-2 py-1 bg-bg-base border border-border text-text-primary text-center"
                            inputMode="numeric"
                            placeholder="100"
                          />
                        </td>
                        <td className="p-2 border-b border-border text-right">
                          <Button variant="secondary" onClick={() => saveProblemSettings(p.id)} disabled={savingThis}>
                            {savingThis ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => {
          if (!settingsSaving) setSettingsOpen(false);
        }}
        title={tr("Налаштування контесту", "Contest settings")}
      >
        <div className="space-y-4">
          {settingsError ? <div className="text-sm text-accent-error">{settingsError}</div> : null}

          <Input label={tr("Назва", "Title")} value={settingsTitle} onChange={(e) => setSettingsTitle(e.target.value)} />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Опис", "Description")}</label>
            <textarea
              value={settingsDescription}
              onChange={(e) => setSettingsDescription(e.target.value)}
              rows={6}
              className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Старт", "Start")}</label>
              <input
                type="datetime-local"
                value={settingsStartsAt}
                onChange={(e) => setSettingsStartsAt(e.target.value)}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Фініш", "End")}</label>
              <input
                type="datetime-local"
                value={settingsEndsAt}
                onChange={(e) => setSettingsEndsAt(e.target.value)}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-mono text-text-primary">
            <input type="checkbox" checked={settingsAllowUpsolve} onChange={(e) => setSettingsAllowUpsolve(e.target.checked)} />
            {tr("Дозволити дорішування після завершення", "Allow upsolve after finish")}
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={saveContestSettings} disabled={settingsSaving}>
              {settingsSaving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={accountRosterImportPreviewOpen}
        onClose={cancelRosterCsvImportPreview}
        title={tr("Перевірка CSV перед імпортом", "CSV import preview")}
      >
        <div className="space-y-3">
          <div className="text-xs text-text-secondary">
            {accountRosterImportFileName
              ? tr(`Файл: ${accountRosterImportFileName}`, `File: ${accountRosterImportFileName}`)
              : tr("Файл CSV", "CSV file")}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs font-mono">
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Валідні рядки", "Valid rows")}</div>
              <div className="text-text-primary">{accountRosterImportEntries.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Нові до імпорту", "New to import")}</div>
              <div className="text-accent-success">{accountRosterImportDiff.newCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Вже в ростері", "Already in roster")}</div>
              <div className="text-accent-warn">{accountRosterImportDiff.existingCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Невалідні рядки", "Invalid rows")}</div>
              <div className="text-text-primary">{accountRosterImportInvalidLines.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Дублікати email", "Duplicate emails")}</div>
              <div className="text-text-primary">{accountRosterImportDuplicateEmails.length}</div>
            </div>
          </div>

          {accountRosterImportInvalidLines.length > 0 ? (
            <div className="text-xs text-accent-error">
              {tr(
                `Пропущені рядки (перші 4): ${accountRosterImportInvalidLines.slice(0, 4).join(" | ")}`,
                `Skipped rows (first 4): ${accountRosterImportInvalidLines.slice(0, 4).join(" | ")}`
              )}
            </div>
          ) : null}

          {accountRosterImportDuplicateEmails.length > 0 ? (
            <div className="text-xs text-accent-warn">
              {tr(
                `Повтори email (перші 6): ${accountRosterImportDuplicateEmails.slice(0, 6).join(", ")}`,
                `Duplicate emails (first 6): ${accountRosterImportDuplicateEmails.slice(0, 6).join(", ")}`
              )}
            </div>
          ) : null}

          <div className="border border-border bg-bg-surface/60 rounded-lg overflow-auto max-h-[240px]">
            <table className="min-w-[560px] w-full text-xs font-mono">
              <thead className="bg-bg-hover">
                <tr>
                  <th className="p-2 border-b border-border text-left">{tr("ПІБ", "Full name")}</th>
                  <th className="p-2 border-b border-border text-left">email</th>
                  <th className="p-2 border-b border-border text-left">{tr("Статус", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {accountRosterImportPreviewRows.map((row, idx) => (
                  <tr key={`${row.email}-${idx}`} className="odd:bg-bg-base even:bg-bg-surface">
                    <td className="p-2 border-b border-border">{row.fullName}</td>
                    <td className="p-2 border-b border-border">{row.email}</td>
                    <td className="p-2 border-b border-border">
                      {row.isDuplicateInImport ? (
                        <span className="inline-flex items-center rounded px-2 py-0.5 border border-accent-warn/60 bg-accent-warn/10 text-accent-warn">
                          {tr("Дубль у CSV", "Duplicate in CSV")}
                        </span>
                      ) : row.isExisting ? (
                        <span className="inline-flex items-center rounded px-2 py-0.5 border border-primary/50 bg-primary/10 text-primary">
                          {tr("Вже є", "Existing")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded px-2 py-0.5 border border-accent-success/60 bg-accent-success/10 text-accent-success">
                          {tr("Новий", "New")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accountRosterImportEntries.length > accountRosterImportPreviewRows.length ? (
              <div className="px-2 py-1 text-[11px] text-text-secondary border-t border-border">
                {tr(
                  `Показано ${accountRosterImportPreviewRows.length} з ${accountRosterImportEntries.length}`,
                  `Showing ${accountRosterImportPreviewRows.length} of ${accountRosterImportEntries.length}`
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={cancelRosterCsvImportPreview}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={applyRosterCsvImportPreview} disabled={!accountRosterImportDiff.uniqueImportCount}>
              {tr("Імпортувати в список", "Import to roster")}
            </Button>
          </div>
        </div>
      </Modal>

      

      {loading ? (
        <Card className="p-4">
          <Skeleton className="h-8 w-2/3 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-6" />
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : error ? (
        <Card className="p-4">
          <div className="text-sm text-accent-error">{error}</div>
        </Card>
      ) : !data ? null : (
        <div className="space-y-4">
          <Card className="p-4 border border-border/70 bg-[linear-gradient(145deg,rgba(99,102,241,0.12),rgba(16,185,129,0.08)_45%,rgba(15,23,42,0.5))]">
            <div className="flex flex-wrap items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <Badge color="info">StudyCod Arena</Badge>
              <div className="text-lg font-mono text-text-primary">{data.contest.title}</div>
              {(() => {
                const chip = contestPhaseChip({
                  started: data.phase.started,
                  finished: data.phase.finished,
                  paused: !!data.access.isPaused,
                  tr,
                });
                return <StatusChip glyph={chip.glyph} label={chip.label} tone={chip.tone} />;
              })()}
              {data.contest.visibility === "PUBLIC" ? <Badge color="info">Public</Badge> : data.contest.visibility === "PRIVATE_CODE" ? <Badge color="warn">{tr("За кодом", "Code")}</Badge> : <Badge color="info">Class</Badge>}
              {data.contest.isPublished ? <Badge color="success">{tr("Опубліковано", "Published")}</Badge> : <Badge color="warn">{tr("Чернетка", "Draft")}</Badge>}
              {data.contest.allowUpsolve ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : null}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-bg-base/70 px-3 py-2">
                <div className="text-text-secondary">{tr("Формат", "Format")}</div>
                <div className="text-text-primary font-mono">{tr("IOI-стиль · partial scoring", "IOI-style · partial scoring")}</div>
              </div>
              <div className="rounded-lg border border-border bg-bg-base/70 px-3 py-2">
                <div className="text-text-secondary">{tr("Режим", "Mode")}</div>
                <div className="text-text-primary font-mono">{data.access.isPaused ? tr("Пауза", "Paused") : tr("Змагальний", "Competitive")}</div>
              </div>
              <div className="rounded-lg border border-border bg-bg-base/70 px-3 py-2">
                <div className="text-text-secondary">{tr("Платформа", "Platform")}</div>
                <div className="text-text-primary font-mono">StudyCod Contests</div>
              </div>
            </div>

            {hasToken && data.access.canManage ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                  {tr("Налаштування", "Settings")}
                </Button>
                <Button variant="secondary" onClick={togglePublished} disabled={publishing}>
                  {publishing
                    ? tr("Оновлення...", "Updating...")
                    : data.contest.isPublished
                      ? tr("Зняти з публікації", "Unpublish")
                      : tr("Опублікувати", "Publish")}
                </Button>
                <Button variant="secondary" onClick={toggleContestPaused} disabled={pauseSaving}>
                  {pauseSaving
                    ? tr("Оновлення...", "Updating...")
                    : data.access.isPaused
                      ? tr("Продовжити контест", "Resume contest")
                      : tr("Поставити на паузу", "Pause contest")}
                </Button>
              </div>
            ) : null}

            <div className="text-xs text-text-secondary mt-2 flex flex-wrap gap-3">
              <span>
                {tr("Старт", "Start")}: {fmtDateTime(data.contest.startsAt, i18n.language)}
              </span>
              <span>
                {tr("Фініш", "End")}: {fmtDateTime(data.contest.endsAt, i18n.language)}
              </span>
            </div>

            {data.phase.finished && data.contest.allowUpsolve ? (
              <div className="mt-3 text-sm text-text-secondary">
                {tr(
                  "Контест завершено. Режим дорішування увімкнено — можете продовжувати відправляти розв’язки, але таблиця не зміниться.",
                  "Contest is finished. Upsolving is enabled — you can still submit, but standings won’t change."
                )}
              </div>
            ) : null}

            {data.access.joinRequired ? (
              <div className="mt-4 border border-border bg-bg-base p-3">
                <div className="flex items-center gap-2 mb-2 text-sm font-mono text-text-primary">
                  <KeyRound className="w-4 h-4" />
                  {tr("Потрібен код доступу", "Join code required")}
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="flex-1 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                    placeholder={tr("Введіть код...", "Enter code...")}
                  />
                  <Button onClick={onJoin} disabled={joining || !joinCode.trim()}>
                    {joining ? tr("Приєднання...", "Joining...") : tr("Приєднатися", "Join")}
                  </Button>
                </div>
                <div className="text-xs text-text-secondary mt-2">
                  {tr("Після приєднання відкриються задачі та таблиця.", "After joining you will see problems and standings.")}
                </div>
              </div>
            ) : null}

            {data.contest.description ? (
              <div className="mt-4">
                <MarkdownView content={data.contest.description} />
              </div>
            ) : null}
          </Card>

          {tab === "problems" ? (
            <>
              <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-mono text-text-primary">{tr("Задачі", "Problems")}</div>
                <div className="flex items-center gap-2">
                  {hasToken && data.access.canAccessContent ? (
                    <Button variant="secondary" onClick={loadProgress} disabled={progressLoading}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {tr("Оновити", "Refresh")}
                    </Button>
                  ) : null}
                  {hasToken && data.access.canManage ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAddMode("CREATE");
                          setAddOpen(true);
                          setAddError(null);
                        }}
                      >
                        {tr("Додати задачу", "Add problem")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAddMode("IMPORT");
                          setAddOpen(true);
                          setAddError(null);
                        }}
                      >
                        {tr("Імпорт архіву", "Import archive")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setManageOpen(true)}
                      >
                        {tr("Меню задач", "Problem menu")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {!data.access.canAccessContent ? null : !hasToken ? (
                <div className="text-sm text-text-secondary mb-3">
                  {tr(
                    "Увійдіть, щоб бачити ваш прогрес (кращий результат і останню подачу).",
                    "Log in to see your progress (best score and last submission)."
                  )}
                </div>
              ) : progressError ? (
                <div className="text-sm text-accent-error mb-3">{progressError}</div>
              ) : null}

              {progressLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-[860px] w-full text-sm font-mono border border-border">
                    <thead className="bg-bg-hover">
                      <tr>
                        <th className="p-2 border-b border-border text-left">{tr("Задача", "Problem")}</th>
                        <th className="p-2 border-b border-border text-left">{tr("Назва", "Title")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Бали", "Points")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Кращий", "Best")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Остання подача", "Last")}</th>
                        <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.problems.map((p) => {
                        const disabled = !p.libraryTaskId;
                        const pr = progressByProblemId.get(p.id) ?? null;
                        const bestText = pr
                          ? pr.maxScore != null
                            ? `${pr.bestContestScore}/${pr.maxScore}`
                            : String(pr.bestContestScore)
                          : "—";
                        const last = pr?.last ?? null;
                        const lastScoreText = last
                          ? last.score != null && last.maxScore != null
                            ? `${last.score}/${last.maxScore}`
                            : last.score != null
                              ? String(last.score)
                              : "—"
                          : "—";

                        return (
                          <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                            <td className="p-2 border-b border-border">
                              <button
                                className="text-primary hover:underline"
                                disabled={disabled}
                                onClick={() => navigate(`/contests/${data.contest.id}/problems/${p.id}`)}
                                title={tr("Відкрити задачу", "Open problem")}
                              >
                                {p.label}
                              </button>
                            </td>
                            <td className="p-2 border-b border-border">
                              <div className="truncate max-w-[520px]">{p.title}</div>
                            </td>
                            <td className="p-2 border-b border-border text-center">{p.points != null ? p.points : "—"}</td>
                            <td className="p-2 border-b border-border text-center">{bestText}</td>
                            <td className="p-2 border-b border-border text-center">
                              {last ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const v = verdictChip(last.verdict, tr);
                                      return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} size="sm" />;
                                    })()}
                                    {(() => {
                                      const p = submissionPhaseChip(last.phase, tr);
                                      return <StatusChip glyph={p.glyph} label={p.label} tone={p.tone} size="sm" />;
                                    })()}
                                    <span className="text-text-secondary">{lastScoreText}</span>
                                  </div>
                                  <div className="text-xs text-text-secondary">{fmtDateTime(last.createdAt, i18n.language)}</div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-2 border-b border-border text-right">
                              <div className="flex items-center justify-end gap-2">
                                {hasToken && data.access.canManage && p.libraryTaskId ? (
                                  <Button
                                    variant="ghost"
                                    onClick={() => navigate(`/library?view=mine&sel=${p.libraryTaskId}&edit=1`)}
                                    title={tr("Редагувати тести/бали", "Edit tests/points")}
                                  >
                                    {tr("Бали/тести", "Points/tests")}
                                  </Button>
                                ) : null}
                                <Button
                                  variant={disabled ? "secondary" : "primary"}
                                  disabled={disabled}
                                  onClick={() => navigate(`/contests/${data.contest.id}/problems/${p.id}`)}
                                >
                                  {tr("Відкрити", "Open")}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="text-xs text-text-secondary mt-2">
                    {tr(
                      "“Кращий” рахується лише за офіційні подачі в межах контесту. “Остання” може бути як з контесту, так і з дорішування.",
                      "“Best” counts only official contest submissions. “Last” may be from contest or upsolve."
                    )}
                  </div>
                </div>
              )}

              {!data.access.canAccessContent ? (
                <div className="text-sm text-text-secondary mt-4">
                  {data.contest.visibility === "PRIVATE_CODE"
                    ? tr("Щоб бачити задачі, приєднайтесь за кодом.", "Join with a code to see problems.")
                    : tr("Немає доступу до задач цього контесту.", "You don’t have access to this contest.")}
                </div>
              ) : null}
              </Card>
            </>
          ) : tab === "standings" ? (
            <div className="space-y-4">
              <Scoreboard key={`sb-${standingsVersion}`} contestId={data.contest.id} canManage={!!data.access.canManage} />

              {hasToken && data.access.canManage ? (
                <>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary flex items-center gap-2"><Award className="w-4 h-4 text-primary" />{tr("Сертифікати", "Certificates")}</div>
                      <div className="flex items-center gap-2">
                        {certificateUiSimpleMode ? (
                          <Button
                            variant={certificateGlobalSettingsOpen ? "secondary" : "ghost"}
                            onClick={() => setCertificateGlobalSettingsOpen((v) => !v)}
                          >
                            {certificateGlobalSettingsOpen ? tr("Сховати загальні налаштування", "Hide global settings") : tr("Загальні налаштування", "Global settings")}
                          </Button>
                        ) : null}
                        <Button
                          variant={certificateUiSimpleMode ? "secondary" : "ghost"}
                          onClick={() => {
                            setCertificateUiSimpleMode(true);
                            setCertificateUiAdvancedOpen(false);
                            setCertificateCanvasFocusMode(true);
                            setCertificateGlobalSettingsOpen(false);
                          }}
                        >
                          {tr("Візуальний", "Visual")}
                        </Button>
                        <Button
                          variant={!certificateUiSimpleMode ? "secondary" : "ghost"}
                          onClick={() => {
                            setCertificateUiSimpleMode(false);
                            setCertificateUiAdvancedOpen(true);
                            setCertificateCanvasFocusMode(false);
                            setCertificateGlobalSettingsOpen(true);
                          }}
                        >
                          {tr("Розширено", "Advanced")}
                        </Button>
                      </div>
                    </div>

                    {certificateUiSimpleMode ? (
                      <div className="mb-3 text-xs text-text-secondary rounded border border-border bg-bg-surface/60 px-2 py-1.5">
                        {tr("Режим", "Mode")}: {certificateMode === "none" ? tr("Вимкнено", "Disabled") : certificateMode === "studycod" ? "StudyCod" : "Custom"}
                        {" · "}
                        {certificateSendEmailEnabled
                          ? tr("Email-розсилка увімкнена", "Email sending enabled")
                          : tr("Email-розсилка вимкнена", "Email sending disabled")}
                      </div>
                    ) : null}

                    {!certificateUiSimpleMode || certificateGlobalSettingsOpen ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div className="space-y-1.5">
                          <label className="text-xs text-text-secondary">{tr("Режим", "Mode")}</label>
                          <select
                            value={certificateMode}
                            onChange={(e) => setCertificateMode(e.target.value as "none" | "studycod" | "custom")}
                            className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                          >
                            <option value="none">{tr("Вимкнено", "Disabled")}</option>
                            <option value="studycod">StudyCod</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>

                        <label className="flex items-center gap-2 text-sm font-mono text-text-primary mt-6">
                          <input
                            type="checkbox"
                            checked={certificateSendEmailEnabled}
                            onChange={(e) => setCertificateSendEmailEnabled(e.target.checked)}
                          />
                          {tr("Надсилати PDF сертифіката на email", "Send certificate PDF by email")}
                        </label>
                      </div>
                    ) : null}

                    {certificateMode === "studycod" ? (
                      <div className="space-y-2 mb-3 border border-border bg-bg-base p-3">
                        <div className="rounded border border-border bg-bg-surface/60 px-3 py-2 text-xs text-text-secondary">
                          {tr(
                            "Базовий StudyCod сертифікат налаштовується централізовано в Admin Panel → Certificates. У контесті задається лише Template ID для прив'язки.",
                            "Base StudyCod certificate is configured centrally in Admin Panel → Certificates. Contest page only links Template ID."
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                          <Input
                            label={tr("Template ID (з Admin Panel)", "Template ID (from Admin Panel)")}
                            value={certificateTemplateId}
                            onChange={(e) => setCertificateTemplateId(e.target.value)}
                            onBlur={autoValidateCertificateTemplateId}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                autoValidateCertificateTemplateId();
                              }
                            }}
                            inputMode="numeric"
                          />
                          <div className="flex items-center gap-2">
                            <Button variant="secondary" onClick={() => void validateCertificateTemplateId()} disabled={certificateTemplateChecking}>
                              {certificateTemplateChecking ? tr("Перевірка...", "Checking...") : tr("Перевірити ID", "Validate ID")}
                            </Button>
                            <Button variant="ghost" onClick={() => navigate("/admin")}>{tr("Відкрити Admin Panel", "Open Admin Panel")}</Button>
                          </div>
                        </div>
                        {certificateTemplateCheckResult ? (
                          <div className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${certificateTemplateCheckResult.ok ? "bg-accent-success" : "bg-accent-error"}`}
                              aria-hidden="true"
                            />
                            <span>
                              {certificateTemplateCheckResult.ok
                                ? tr("Template ID валідний", "Template ID is valid")
                                : tr("Template ID невалідний", "Template ID is invalid")}
                            </span>
                          </div>
                        ) : null}
                        {certificateTemplateCheckResult ? (
                          <div className={`text-xs ${certificateTemplateCheckResult.ok ? "text-accent-success" : "text-accent-error"}`}>
                            {certificateTemplateCheckResult.message}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {certificateMode === "custom" ? (
                      <div className="space-y-2 mb-3 border border-border bg-bg-base p-3">
                        {certificateUiSimpleMode ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-bg-surface/60 px-2 py-1.5 text-xs text-text-secondary">
                            <span>{tr("Візуальний режим: drag, guides, resize, presets", "Visual mode: drag, guides, resize, presets")}</span>
                            <div className="flex items-center gap-2">
                              <Button variant={certificateCanvasFocusMode ? "secondary" : "ghost"} onClick={() => setCertificateCanvasFocusMode((v) => !v)}>
                                {certificateCanvasFocusMode ? tr("Focus Canvas: ON", "Focus Canvas: ON") : tr("Focus Canvas: OFF", "Focus Canvas: OFF")}
                              </Button>
                              <Button variant="ghost" onClick={() => setCertificateUiAdvancedOpen((v) => !v)}>
                                {certificateUiAdvancedOpen ? tr("Сховати технічні панелі", "Hide technical panels") : tr("Показати технічні панелі", "Show technical panels")}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {certificateUiSimpleMode ? (
                          <div className="rounded border border-border bg-bg-surface/60 px-2 py-2 space-y-2">
                            <div className="text-xs text-text-secondary">
                              {tr("Як працювати: 1) Додай об'єкти кнопками нижче або ПКМ по Canvas, 2) Перетягуй їх на Canvas, 3) Змінюй розмір за правий-нижній маркер.", "How it works: 1) Add objects with toggles below or right-click on Canvas, 2) Drag them on Canvas, 3) Resize with bottom-right handle.")}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {CERTIFICATE_FIELD_KEYS.map((key) => {
                                const enabled = Boolean(certificateFields[key]?.isEnabled);
                                return (
                                  <button
                                    key={`quick-field-${key}`}
                                    type="button"
                                    onClick={() =>
                                      setCertificateFields((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...prev[key],
                                          isEnabled: !prev[key].isEnabled,
                                          isRequired: !prev[key].isEnabled ? prev[key].isRequired : false,
                                        },
                                      }))
                                    }
                                    className={`px-2 py-1 rounded border text-[11px] font-mono ${enabled ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-bg-base text-text-secondary"}`}
                                  >
                                    {enabled ? "✓ " : "+ "}
                                    {certificateFieldLabel(key, tr)}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/60">
                              <button
                                type="button"
                                onClick={() => addCertificateExtraObjectAtPosition("text", 50, 50)}
                                className="px-2 py-1 rounded border border-border bg-bg-base text-text-primary text-[11px] font-mono"
                              >
                                + {tr("Текст", "Text")}
                              </button>
                              <button
                                type="button"
                                onClick={() => addCertificateExtraObjectAtPosition("image", 50, 50)}
                                className="px-2 py-1 rounded border border-border bg-bg-base text-text-primary text-[11px] font-mono"
                              >
                                + {tr("Картинка", "Image")}
                              </button>
                              <button
                                type="button"
                                onClick={() => addCertificateExtraObjectAtPosition("shape", 50, 50)}
                                className="px-2 py-1 rounded border border-border bg-bg-base text-text-primary text-[11px] font-mono"
                              >
                                + {tr("Фігура", "Shape")}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {!certificateCanvasFocusMode || !certificateUiSimpleMode ? (
                          <Input
                            label={tr("Назва шаблону", "Template name")}
                            value={certificateTemplateName}
                            onChange={(e) => setCertificateTemplateName(e.target.value)}
                          />
                        ) : null}
                        {!certificateUiSimpleMode || certificateUiAdvancedOpen ? (
                          <>
                            <Input
                              label={tr("Template ID (опційно)", "Template ID (optional)")}
                              value={certificateTemplateId}
                              onChange={(e) => setCertificateTemplateId(e.target.value)}
                              inputMode="numeric"
                            />
                            <div className="border border-border rounded-lg p-3 bg-bg-surface/60">
                              <div className="text-xs text-text-secondary mb-2">{tr("Поля сертифіката", "Certificate fields")}</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {CERTIFICATE_FIELD_KEYS.map((key) => {
                                  const field = certificateFields[key];
                                  return (
                                    <div key={key} className="border border-border rounded px-2 py-1.5">
                                      <div className="text-xs font-mono text-text-primary mb-1">{certificateFieldLabel(key, tr)}</div>
                                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                                        <label className="inline-flex items-center gap-1.5">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(field?.isEnabled)}
                                            onChange={(e) =>
                                              setCertificateFields((prev) => ({
                                                ...prev,
                                                [key]: {
                                                  ...prev[key],
                                                  isEnabled: e.target.checked,
                                                  isRequired: e.target.checked ? prev[key].isRequired : false,
                                                },
                                              }))
                                            }
                                          />
                                          {tr("Показувати", "Show")}
                                        </label>
                                        <label className="inline-flex items-center gap-1.5">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(field?.isRequired)}
                                            disabled={!field?.isEnabled}
                                            onChange={(e) =>
                                              setCertificateFields((prev) => ({
                                                ...prev,
                                                [key]: {
                                                  ...prev[key],
                                                  isRequired: e.target.checked,
                                                },
                                              }))
                                            }
                                          />
                                          {tr("Обов'язково", "Required")}
                                        </label>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        ) : null}
                        <div className="space-y-1.5">
                          <Input
                            label={tr("Фон layout-превʼю (опційно)", "Layout preview background (optional)")}
                            value={certificateLayoutBackgroundUrl}
                            onChange={(e) => updateCertificateLayoutBackgroundUrl(e.target.value)}
                            placeholder="https://..."
                          />
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <label className="inline-flex items-center gap-2 px-2 py-1 border border-border rounded bg-bg-base text-text-secondary cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  uploadCertificateLayoutBackgroundFile(e.target.files?.[0] ?? null);
                                  e.currentTarget.value = "";
                                }}
                              />
                              {tr("Завантажити фон файлом", "Upload background file")}
                            </label>
                            <Button
                              variant="ghost"
                              onClick={() => updateCertificateLayoutBackgroundUrl("")}
                              disabled={!certificateLayoutBackgroundUrl}
                            >
                              {tr("Очистити фон", "Clear background")}
                            </Button>
                          </div>
                          {certificateLayoutBackgroundStatus === "loading" ? (
                            <div className="text-[11px] text-text-secondary">
                              {tr("Перевіряю фон…", "Checking background…")}
                            </div>
                          ) : null}
                          {certificateLayoutBackgroundStatus === "error" && certificateLayoutBackgroundError ? (
                            <div className="text-[11px] text-accent-error">
                              {certificateLayoutBackgroundError}
                            </div>
                          ) : null}
                          {certificateLayoutBackgroundStatus === "ready" ? (
                            <div className="text-[11px] text-accent-success">
                              {tr("Фон успішно завантажено", "Background loaded successfully")}
                            </div>
                          ) : null}
                        </div>

                        <div className="border border-border rounded-lg p-3 bg-bg-surface/60 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-text-secondary">{tr("Візуальний layout полів", "Visual field layout")}</div>
                            <div className="flex items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary border border-border rounded px-2 py-1 bg-bg-base">
                                <input
                                  type="checkbox"
                                  checked={certificateAutoSyncLayout}
                                  onChange={(e) => setCertificateAutoSyncLayout(e.target.checked)}
                                />
                                {tr("Автосинк HTML/CSS", "Auto-sync HTML/CSS")}
                              </label>
                              <Button variant="ghost" onClick={undoCertificateLayout} disabled={!canUndoCertificateLayout}>
                                {tr("Undo", "Undo")}
                              </Button>
                              <Button variant="ghost" onClick={redoCertificateLayout} disabled={!canRedoCertificateLayout}>
                                {tr("Redo", "Redo")}
                              </Button>
                              <Button variant="ghost" onClick={resetCertificateLayout}>
                                {tr("Скинути layout", "Reset layout")}
                              </Button>
                              <Button variant="ghost" onClick={applyAutoLayoutToTemplate}>
                                {tr("Відобразити в HTML + CSS", "Apply to HTML + CSS")}
                              </Button>
                            </div>
                          </div>

                          {!certificateCanvasFocusMode || !certificateUiSimpleMode ? (
                            <div className="text-[11px] text-text-secondary">
                            {tr("Порада: drag + resize на canvas, або задавайте точні X/Y/Width вручну. Shift не потрібен — снап працює автоматично.", "Tip: drag + resize directly on canvas, or set exact X/Y/Width manually. Snap works automatically.")}
                            </div>
                          ) : null}
                          {!certificateCanvasFocusMode || !certificateUiSimpleMode ? (
                            <div className="text-[11px] text-text-secondary">
                            {tr("Шорткати: ↑↓←→ — рух вибраного поля, Shift+стрілки — крок ×5, Ctrl/Cmd+Z — Undo, Ctrl/Cmd+Shift+Z — Redo, Ctrl/Cmd+D — дублювати об'єкт.", "Shortcuts: ↑↓←→ move selected field, Shift+arrows step ×5, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+D duplicate object.")}
                            </div>
                          ) : null}

                          <div className={`grid grid-cols-1 ${certificateCanvasFocusMode && certificateUiSimpleMode ? "md:grid-cols-3" : "md:grid-cols-4"} gap-2`}>
                            <label className="inline-flex items-center gap-2 text-[11px] text-text-secondary border border-border rounded px-2 py-1.5 bg-bg-base">
                              <input
                                type="checkbox"
                                checked={certificateLayoutSnapEnabled}
                                onChange={(e) => setCertificateLayoutSnapEnabled(e.target.checked)}
                              />
                              {tr("Snap to grid", "Snap to grid")}
                            </label>
                            {!certificateCanvasFocusMode || !certificateUiSimpleMode ? (
                              <label className="text-[11px] text-text-secondary border border-border rounded px-2 py-1.5 bg-bg-base">
                                {tr("Крок снапу (%)", "Snap step (%)")}
                                <input
                                  type="number"
                                  min={0.5}
                                  max={20}
                                  step={0.5}
                                  value={certificateLayoutSnapStep}
                                  onChange={(e) => setCertificateLayoutSnapStep(clampNumber(Number(e.target.value) || 2, 0.5, 20))}
                                  className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                />
                              </label>
                            ) : null}
                            <label className="inline-flex items-center gap-2 text-[11px] text-text-secondary border border-border rounded px-2 py-1.5 bg-bg-base">
                              <input
                                type="checkbox"
                                checked={certificateLayoutShowGuides}
                                onChange={(e) => setCertificateLayoutShowGuides(e.target.checked)}
                              />
                              {tr("Показувати гайдлайни", "Show guides")}
                            </label>
                            <div className="text-[11px] text-text-secondary border border-border rounded px-2 py-1.5 bg-bg-base flex items-center">
                              {tr("Bounds: 0..100%", "Bounds: 0..100%")}
                            </div>
                          </div>

                          {!certificateCanvasFocusMode || !certificateUiSimpleMode ? (
                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 items-end">
                            <Input
                              label={tr("Назва пресета", "Preset name")}
                              value={certificateLayoutPresetName}
                              onChange={(e) => setCertificateLayoutPresetName(e.target.value)}
                              placeholder={tr("Напр. Diploma v1", "e.g. Diploma v1")}
                            />
                            <Button variant="secondary" onClick={saveCertificateLayoutPreset}>
                              {tr("Зберегти пресет", "Save preset")}
                            </Button>
                            <select
                              value={certificateLayoutPresetId}
                              onChange={(e) => setCertificateLayoutPresetId(e.target.value)}
                              className="h-[42px] min-w-[180px] px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                            >
                              <option value="">{tr("Оберіть пресет", "Select preset")}</option>
                              {certificateLayoutPresets.map((preset) => (
                                <option key={preset.id} value={preset.id}>{preset.name}</option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" onClick={loadCertificateLayoutPreset} disabled={!certificateLayoutPresetId}>
                                {tr("Завантажити", "Load")}
                              </Button>
                              <Button variant="ghost" onClick={deleteCertificateLayoutPreset} disabled={!certificateLayoutPresetId}>
                                {tr("Видалити", "Delete")}
                              </Button>
                            </div>
                            </div>
                          ) : null}

                          {!certificateUiSimpleMode || certificateUiAdvancedOpen ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {CERTIFICATE_FIELD_KEYS.filter((k) => certificateFields[k]?.isEnabled).map((key) => {
                                const l = certificateLayout[key];
                                return (
                                  <div key={`layout-${key}`} className="border border-border rounded px-2 py-2 space-y-1.5">
                                  <div className="text-xs font-mono text-text-primary">{certificateFieldLabel(key, tr)}</div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <label className="text-[11px] text-text-secondary">
                                      X%
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={l.x}
                                        onChange={(e) => {
                                          const value = applySnap(Number(e.target.value) || 0);
                                          updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], x: value } }));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">
                                      Y%
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={l.y}
                                        onChange={(e) => {
                                          const value = applySnap(Number(e.target.value) || 0);
                                          updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], y: value } }));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">
                                      {tr("Розмір", "Size")}
                                      <input
                                        type="number"
                                        min={10}
                                        max={72}
                                        value={l.fontSize}
                                        onChange={(e) => {
                                          const value = clampFontSize(Number(e.target.value) || 10);
                                          updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], fontSize: value } }));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">
                                      {tr("Вага", "Weight")}
                                      <input
                                        type="number"
                                        min={300}
                                        max={900}
                                        step={100}
                                        value={l.fontWeight}
                                        onChange={(e) => {
                                          const value = clampNumber(Number(e.target.value) || 500, 300, 900);
                                          updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], fontWeight: value } }));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                    <label className="text-[11px] text-text-secondary col-span-2">
                                      {tr("Ширина (%)", "Width (%)")}
                                      <input
                                        type="number"
                                        min={8}
                                        max={96}
                                        value={l.width}
                                        onChange={(e) => {
                                          const raw = clampFieldWidth(Number(e.target.value) || 8);
                                          const value = certificateLayoutSnapEnabled
                                            ? snapByStep(raw, clampNumber(certificateLayoutSnapStep, 0.5, 20))
                                            : raw;
                                          updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], width: Math.round(value * 10) / 10 } }));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                  </div>
                                  <label className="text-[11px] text-text-secondary block">
                                    {tr("Вирівнювання", "Alignment")}
                                    <select
                                      value={l.align}
                                      onChange={(e) => {
                                        const value = e.target.value as "left" | "center" | "right";
                                        updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], align: value } }));
                                      }}
                                      className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                    >
                                      <option value="left">{tr("Ліво", "Left")}</option>
                                      <option value="center">{tr("Центр", "Center")}</option>
                                      <option value="right">{tr("Право", "Right")}</option>
                                    </select>
                                  </label>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}

                          <div className="border border-border rounded-lg bg-bg-base p-2">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="text-[11px] text-text-secondary">{tr("Canvas превʼю", "Canvas preview")}</div>
                              <div className="text-[11px] text-text-secondary font-mono">
                                {tr("Розмір", "Size")}: 1123×794 px · A4 L (297×210 mm)
                              </div>
                            </div>
                            <div
                              ref={certificateLayoutCanvasRef}
                              className="relative w-full overflow-hidden rounded border border-border/70"
                              tabIndex={0}
                              style={{
                                aspectRatio: "1123 / 794",
                                backgroundImage: certificateLayoutBackgroundUrl
                                  ? `${toCssUrlValue(certificateLayoutBackgroundUrl)}, linear-gradient(135deg, #ffffff, #f1f5f9)`
                                  : "linear-gradient(135deg, #ffffff, #f1f5f9)",
                                backgroundSize: "100% 100%",
                                backgroundPosition: "center",
                                backgroundRepeat: "no-repeat",
                              }}
                              onMouseMove={(e) => {
                                if (!(e.currentTarget instanceof HTMLDivElement)) return;
                                if (certificateLayoutDraggingField) {
                                  updateLayoutByPointer(certificateLayoutDraggingField, e.clientX, e.clientY, e.currentTarget);
                                  return;
                                }
                                if (certificateLayoutDraggingExtraObjectId) {
                                  updateCertificateExtraObjectByPointer(certificateLayoutDraggingExtraObjectId, e.clientX, e.clientY, e.currentTarget);
                                  return;
                                }
                                if (certificateLayoutResizingExtraObjectId && certificateLayoutExtraResizeStart) {
                                  updateCertificateExtraResizeByPointer(
                                    certificateLayoutResizingExtraObjectId,
                                    e.clientX,
                                    e.clientY,
                                    e.currentTarget,
                                    certificateLayoutExtraResizeStart,
                                    { oneSided: e.ctrlKey || e.metaKey }
                                  );
                                  return;
                                }
                                if (certificateLayoutResizingField && certificateLayoutResizeStart) {
                                  updateLayoutResizeByPointer(
                                    certificateLayoutResizingField,
                                    e.clientX,
                                    e.clientY,
                                    e.currentTarget,
                                    certificateLayoutResizeStart,
                                    { oneSidedToRight: e.ctrlKey || e.metaKey }
                                  );
                                }
                              }}
                              onMouseUp={() => {
                                stopCertificateLayoutInteractions();
                              }}
                              onMouseLeave={() => {
                                stopCertificateLayoutInteractions();
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (!(e.currentTarget instanceof HTMLDivElement)) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                if (rect.width <= 0 || rect.height <= 0) return;
                                const x = ((e.clientX - rect.left) / rect.width) * 100;
                                const y = ((e.clientY - rect.top) / rect.height) * 100;
                                const left = clampNumber(e.clientX - rect.left, 6, Math.max(6, rect.width - 220));
                                const top = clampNumber(e.clientY - rect.top, 6, Math.max(6, rect.height - 240));
                                setCertificateLayoutContextMenu({
                                  left,
                                  top,
                                  x: clampNumber(x, 0, 100),
                                  y: clampNumber(y, 0, 100),
                                });
                              }}
                              onClick={() => {
                                if (certificateLayoutContextMenu) setCertificateLayoutContextMenu(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  if (e.key.toLowerCase() === "d") {
                                    e.preventDefault();
                                    duplicateSelectedCertificateExtraObject();
                                    return;
                                  }
                                  if (e.key.toLowerCase() === "z" && !e.shiftKey) {
                                    e.preventDefault();
                                    undoCertificateLayout();
                                    return;
                                  }
                                  if (e.key.toLowerCase() === "z" && e.shiftKey) {
                                    e.preventDefault();
                                    redoCertificateLayout();
                                    return;
                                  }
                                }
                                const baseStep = certificateLayoutSnapEnabled
                                  ? clampNumber(certificateLayoutSnapStep, 0.5, 20)
                                  : 1;
                                const step = e.shiftKey ? baseStep * 5 : baseStep;
                                if (e.key === "ArrowLeft") {
                                  e.preventDefault();
                                  nudgeCertificateLayoutSelection(-step, 0);
                                } else if (e.key === "ArrowRight") {
                                  e.preventDefault();
                                  nudgeCertificateLayoutSelection(step, 0);
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  nudgeCertificateLayoutSelection(0, -step);
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  nudgeCertificateLayoutSelection(0, step);
                                } else if (e.key === "Delete" || e.key === "Backspace") {
                                  e.preventDefault();
                                  removeSelectedCertificateObject();
                                }
                              }}
                            >
                              {certificateLayoutShowGuides ? (
                                <>
                                  <div className="absolute inset-y-0 left-1/2 w-px bg-primary/20 pointer-events-none" />
                                  <div className="absolute inset-x-0 top-1/2 h-px bg-primary/20 pointer-events-none" />
                                  {certificateLayoutActiveGuides.map((guide, index) =>
                                    guide.axis === "x" ? (
                                      <div
                                        key={`guide-x-${guide.value}-${index}`}
                                        className={`absolute inset-y-0 w-px pointer-events-none ${guide.source === "center" ? "bg-primary/50" : "bg-accent-success/55"}`}
                                        style={{ left: `${guide.value}%` }}
                                      />
                                    ) : (
                                      <div
                                        key={`guide-y-${guide.value}-${index}`}
                                        className={`absolute inset-x-0 h-px pointer-events-none ${guide.source === "center" ? "bg-primary/50" : "bg-accent-success/55"}`}
                                        style={{ top: `${guide.value}%` }}
                                      />
                                    )
                                  )}
                                  {certificateLayoutSelectedField ? (
                                    <>
                                      <div
                                        className="absolute inset-x-0 h-px bg-accent-success/40 pointer-events-none"
                                        style={{ top: `${certificateLayout[certificateLayoutSelectedField].y}%` }}
                                      />
                                      <div
                                        className="absolute inset-y-0 w-px bg-accent-success/40 pointer-events-none"
                                        style={{ left: `${certificateLayout[certificateLayoutSelectedField].x}%` }}
                                      />
                                    </>
                                  ) : null}
                                </>
                              ) : null}
                              {CERTIFICATE_FIELD_KEYS.filter((k) => certificateFields[k]?.isEnabled).map((key) => {
                                const l = certificateLayout[key];
                                const transform = l.align === "center" ? "translate(-50%, -50%)" : l.align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
                                const selected = certificateLayoutSelectedField === key;
                                return (
                                  <div
                                    key={`canvas-${key}`}
                                    className={`absolute text-[#0f172a] cursor-move select-none border rounded px-1 py-0.5 ${selected ? "border-primary bg-primary/15" : "border-transparent bg-transparent"}`}
                                    style={{
                                      left: `${l.x}%`,
                                      top: `${l.y}%`,
                                      transform,
                                      fontSize: `${Math.max(10, l.fontSize)}px`,
                                      fontWeight: l.fontWeight,
                                      textAlign: l.align,
                                      width: `${clampFieldWidth(l.width)}%`,
                                      maxWidth: "96%",
                                      whiteSpace: "normal",
                                    }}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setCertificateLayoutSelectedField(key);
                                      setCertificateLayoutSelectedExtraObjectId(null);
                                      setCertificateLayoutDraggingField(key);
                                      certificateLayoutCanvasRef.current?.focus();
                                      if (e.currentTarget.parentElement instanceof HTMLDivElement) {
                                        updateLayoutByPointer(key, e.clientX, e.clientY, e.currentTarget.parentElement);
                                      }
                                    }}
                                  >
                                    {certificateCanvasSampleValue(key)}
                                    {["left", "right", "top", "bottom"].map((edge) => {
                                      const edgeKey = edge as "left" | "right" | "top" | "bottom";
                                      const baseClass = "absolute w-3.5 h-3.5 rounded-sm border border-primary bg-bg-base";
                                      const edgeClass = edgeKey === "left"
                                        ? "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize"
                                        : edgeKey === "right"
                                          ? "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize"
                                          : edgeKey === "top"
                                            ? "left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize"
                                            : "left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize";
                                      return (
                                        <button
                                          key={`resize-${key}-${edgeKey}`}
                                          type="button"
                                          className={`${baseClass} ${edgeClass}`}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCertificateLayoutSelectedField(key);
                                            setCertificateLayoutDraggingField(null);
                                            certificateLayoutCanvasRef.current?.focus();
                                            setCertificateLayoutResizingField(key);
                                            setCertificateLayoutResizeStart({
                                              clientX: e.clientX,
                                              clientY: e.clientY,
                                              width: clampFieldWidth(l.width),
                                              fontSize: clampFontSize(l.fontSize),
                                              x: clampNumber(l.x, 0, 100),
                                              align: l.align,
                                              edge: edgeKey,
                                            });
                                          }}
                                          title={tr("Змінити розмір (Ctrl: фіксувати протилежний бік)", "Resize (Ctrl: keep opposite side fixed)")}
                                        />
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              {sortedCertificateLayoutExtraObjects.map((obj) => {
                                const transformBase = obj.align === "left"
                                  ? "translate(0, -50%)"
                                  : obj.align === "right"
                                    ? "translate(-100%, -50%)"
                                    : "translate(-50%, -50%)";
                                const transform = `${transformBase} rotate(${clampNumber(obj.rotation, -180, 180)}deg)`;
                                const selected = certificateLayoutSelectedExtraObjectId === obj.id;
                                return (
                                  <div
                                    key={`canvas-extra-${obj.id}`}
                                    className={`absolute select-none border rounded px-1 py-0.5 ${selected ? "border-accent-success bg-accent-success/10" : "border-transparent bg-transparent"} ${obj.type === "shape" ? "cursor-move" : "cursor-move"}`}
                                    style={{
                                      left: `${obj.x}%`,
                                      top: `${obj.y}%`,
                                      transform,
                                      width: `${clampNumber(obj.width, 2, 96)}%`,
                                      height: `${clampNumber(obj.height, 2, 96)}%`,
                                      opacity: clampNumber(obj.opacity, 0.05, 1),
                                      textAlign: obj.align,
                                      fontSize: `${Math.max(8, obj.fontSize)}px`,
                                      fontWeight: obj.fontWeight,
                                      color: obj.color,
                                      background: obj.type === "shape" ? obj.backgroundColor : obj.type === "text" ? obj.backgroundColor : "transparent",
                                      borderRadius: `${clampNumber(obj.borderRadius, 0, 48)}px`,
                                      zIndex: clampNumber(Number(obj.zIndex ?? 20), 1, 999),
                                      overflow: "hidden",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: obj.align === "left" ? "flex-start" : obj.align === "right" ? "flex-end" : "center",
                                    }}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setCertificateLayoutSelectedField(null);
                                      setCertificateLayoutSelectedExtraObjectId(obj.id);
                                      setCertificateLayoutDraggingField(null);
                                      setCertificateLayoutResizingExtraObjectId(null);
                                      setCertificateLayoutDraggingExtraObjectId(obj.id);
                                      certificateLayoutCanvasRef.current?.focus();
                                      if (e.currentTarget.parentElement instanceof HTMLDivElement) {
                                        updateCertificateExtraObjectByPointer(obj.id, e.clientX, e.clientY, e.currentTarget.parentElement);
                                      }
                                    }}
                                  >
                                    {obj.type === "image" ? (
                                      obj.imageUrl ? (
                                        <img src={obj.imageUrl} alt="extra" className="w-full h-full object-contain pointer-events-none" />
                                      ) : (
                                        <div className="w-full h-full border border-dashed border-border text-[10px] text-text-secondary flex items-center justify-center">
                                          {tr("Встав URL картинки", "Set image URL")}
                                        </div>
                                      )
                                    ) : obj.type === "shape" ? null : (
                                      <span className="pointer-events-none whitespace-pre-wrap leading-tight">{obj.text || tr("Додатковий текст", "Additional text")}</span>
                                    )}
                                    {selected ? ["left", "right", "top", "bottom"].map((edge) => {
                                      const edgeKey = edge as "left" | "right" | "top" | "bottom";
                                      const baseClass = "absolute w-3.5 h-3.5 rounded-sm border border-accent-success bg-bg-base";
                                      const edgeClass = edgeKey === "left"
                                        ? "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize"
                                        : edgeKey === "right"
                                          ? "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize"
                                          : edgeKey === "top"
                                            ? "left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize"
                                            : "left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize";
                                      return (
                                        <button
                                          key={`resize-extra-${obj.id}-${edgeKey}`}
                                          type="button"
                                          className={`${baseClass} ${edgeClass}`}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCertificateLayoutSelectedField(null);
                                            setCertificateLayoutSelectedExtraObjectId(obj.id);
                                            setCertificateLayoutDraggingExtraObjectId(null);
                                            setCertificateLayoutResizingExtraObjectId(obj.id);
                                            setCertificateLayoutExtraResizeStart({
                                              clientX: e.clientX,
                                              clientY: e.clientY,
                                              width: clampNumber(obj.width, 2, 96),
                                              height: clampNumber(obj.height, 2, 96),
                                              x: clampNumber(obj.x, 0, 100),
                                              y: clampNumber(obj.y, 0, 100),
                                              align: obj.align,
                                              edge: edgeKey,
                                            });
                                            certificateLayoutCanvasRef.current?.focus();
                                          }}
                                          title={tr("Змінити розмір (Ctrl: фіксувати протилежний бік)", "Resize (Ctrl: keep opposite side fixed)")}
                                        />
                                      );
                                    }) : null}
                                  </div>
                                );
                              })}
                              {certificateLayoutContextMenu ? (
                                <div
                                  className="absolute z-20 w-[220px] rounded border border-border bg-bg-base shadow-xl"
                                  style={{ left: `${certificateLayoutContextMenu.left}px`, top: `${certificateLayoutContextMenu.top}px` }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <div className="px-2 py-1 text-[11px] font-mono text-text-secondary border-b border-border">
                                    {tr("Додати об'єкт у цю точку", "Add object at this point")}
                                  </div>
                                  <div className="max-h-[220px] overflow-auto p-1">
                                    {certificateLayoutSelectedField ? (
                                      <>
                                        <button
                                          type="button"
                                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                          onClick={() => moveSelectedCertificateObjectToPosition(certificateLayoutContextMenu.x, certificateLayoutContextMenu.y)}
                                        >
                                          ↦ {tr("Перемістити вибраний сюди", "Move selected here")}
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-accent-error"
                                          onClick={removeSelectedCertificateObject}
                                        >
                                          ✕ {tr("Прибрати вибраний об'єкт", "Remove selected object")}
                                        </button>
                                        <div className="my-1 border-t border-border" />
                                      </>
                                    ) : null}
                                    {certificateLayoutSelectedExtraObjectId ? (
                                      <>
                                        <button
                                          type="button"
                                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                          onClick={duplicateSelectedCertificateExtraObject}
                                        >
                                          ⧉ {tr("Дублювати об'єкт", "Duplicate object")}
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                          onClick={() => moveSelectedCertificateObjectToPosition(certificateLayoutContextMenu.x, certificateLayoutContextMenu.y)}
                                        >
                                          ↦ {tr("Перемістити вибраний сюди", "Move selected here")}
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-accent-error"
                                          onClick={removeSelectedCertificateObject}
                                        >
                                          ✕ {tr("Прибрати вибраний об'єкт", "Remove selected object")}
                                        </button>
                                        <div className="my-1 border-t border-border" />
                                      </>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                      onClick={() => addCertificateExtraObjectAtPosition("text", certificateLayoutContextMenu.x, certificateLayoutContextMenu.y)}
                                    >
                                      + {tr("Додатковий текст", "Additional text")}
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                      onClick={() => addCertificateExtraObjectAtPosition("image", certificateLayoutContextMenu.x, certificateLayoutContextMenu.y)}
                                    >
                                      + {tr("Картинка", "Image")}
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                      onClick={() => addCertificateExtraObjectAtPosition("shape", certificateLayoutContextMenu.x, certificateLayoutContextMenu.y)}
                                    >
                                      + {tr("Фігура", "Shape")}
                                    </button>
                                    <div className="my-1 border-t border-border" />
                                    {CERTIFICATE_FIELD_KEYS.filter((k) => !certificateFields[k]?.isEnabled).length === 0 ? (
                                      <div className="px-2 py-1 text-[11px] text-text-secondary">
                                        {tr("Усі об'єкти вже додані", "All objects are already added")}
                                      </div>
                                    ) : (
                                      CERTIFICATE_FIELD_KEYS.filter((k) => !certificateFields[k]?.isEnabled).map((key) => (
                                        <button
                                          key={`ctx-add-${key}`}
                                          type="button"
                                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-surface text-[11px] font-mono text-text-primary"
                                          onClick={() => addCertificateFieldAtPosition(key, certificateLayoutContextMenu.x, certificateLayoutContextMenu.y)}
                                        >
                                          + {certificateFieldLabel(key, tr)}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {certificateCanvasFocusMode && certificateUiSimpleMode ? (() => {
                            const key = certificateLayoutSelectedField;
                            const selectedExtra = certificateLayoutExtraObjects.find((obj) => obj.id === certificateLayoutSelectedExtraObjectId) ?? null;
                            if (!key && !selectedExtra) {
                              return (
                                <div className="text-[11px] text-text-secondary border border-border rounded px-2 py-1.5 bg-bg-base">
                                  {tr("Оберіть елемент на canvas, щоб редагувати його властивості", "Select an element on canvas to edit its properties")}
                                </div>
                              );
                            }
                            if (!key && selectedExtra) {
                              return (
                                <div className="border border-border rounded px-2 py-2 bg-bg-base space-y-2">
                                  <div className="text-xs font-mono text-text-primary">{certificateExtraObjectTypeLabel(selectedExtra.type, tr)}</div>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
                                    <label className="text-[11px] text-text-secondary">X%
                                      <input type="number" min={0} max={100} value={selectedExtra.x} onChange={(e) => {
                                        const value = applySnap(Number(e.target.value) || 0);
                                        setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, x: value } : obj));
                                      }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">Y%
                                      <input type="number" min={0} max={100} value={selectedExtra.y} onChange={(e) => {
                                        const value = applySnap(Number(e.target.value) || 0);
                                        setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, y: value } : obj));
                                      }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">{tr("Width", "Width")}%
                                      <input type="number" min={2} max={96} value={selectedExtra.width} onChange={(e) => {
                                        const value = clampNumber(Number(e.target.value) || 2, 2, 96);
                                        setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, width: value } : obj));
                                      }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">{tr("Height", "Height")}%
                                      <input type="number" min={2} max={96} value={selectedExtra.height} onChange={(e) => {
                                        const value = clampNumber(Number(e.target.value) || 2, 2, 96);
                                        setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, height: value } : obj));
                                      }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">{tr("Rotate", "Rotate")}
                                      <input type="number" min={-180} max={180} value={selectedExtra.rotation} onChange={(e) => {
                                        const value = clampNumber(Number(e.target.value) || 0, -180, 180);
                                        setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, rotation: value } : obj));
                                      }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
                                    <label className="text-[11px] text-text-secondary">Z-index
                                      <input
                                        type="number"
                                        min={1}
                                        max={999}
                                        value={selectedExtra.zIndex}
                                        onChange={(e) => {
                                          const value = clampNumber(Number(e.target.value) || 1, 1, 999);
                                          setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, zIndex: value } : obj));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                    <label className="text-[11px] text-text-secondary">{tr("Opacity", "Opacity")}
                                      <input
                                        type="number"
                                        min={0.05}
                                        max={1}
                                        step={0.05}
                                        value={selectedExtra.opacity}
                                        onChange={(e) => {
                                          const value = clampNumber(Number(e.target.value) || 0.05, 0.05, 1);
                                          setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, opacity: value } : obj));
                                        }}
                                        className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono"
                                      />
                                    </label>
                                    <div className="col-span-2 md:col-span-3 flex items-end gap-1.5">
                                      <Button variant="ghost" onClick={() => changeSelectedCertificateExtraObjectLayer(-1)}>
                                        {tr("Шар вниз", "Layer down")}
                                      </Button>
                                      <Button variant="ghost" onClick={() => changeSelectedCertificateExtraObjectLayer(1)}>
                                        {tr("Шар вгору", "Layer up")}
                                      </Button>
                                      <Button variant="ghost" onClick={duplicateSelectedCertificateExtraObject}>
                                        {tr("Дублювати", "Duplicate")}
                                      </Button>
                                    </div>
                                  </div>
                                  {selectedExtra.type === "text" ? (
                                    <>
                                      <textarea
                                        value={selectedExtra.text}
                                        onChange={(e) => setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, text: e.target.value } : obj))}
                                        className="w-full min-h-[64px] px-2 py-1 bg-bg-base border border-border text-text-primary font-mono text-xs"
                                        placeholder={tr("Текст об'єкта", "Object text")}
                                      />
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                        <label className="text-[11px] text-text-secondary">{tr("Size", "Size")}
                                          <input type="number" min={8} max={96} value={selectedExtra.fontSize} onChange={(e) => {
                                            const value = clampNumber(Number(e.target.value) || 8, 8, 96);
                                            setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, fontSize: value } : obj));
                                          }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                        </label>
                                        <label className="text-[11px] text-text-secondary">{tr("Weight", "Weight")}
                                          <input type="number" min={300} max={900} step={100} value={selectedExtra.fontWeight} onChange={(e) => {
                                            const value = clampNumber(Number(e.target.value) || 500, 300, 900);
                                            setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, fontWeight: value } : obj));
                                          }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                        </label>
                                        <label className="text-[11px] text-text-secondary">Color
                                          <input type="text" value={selectedExtra.color} onChange={(e) => setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, color: e.target.value } : obj))} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                        </label>
                                        <label className="text-[11px] text-text-secondary">BG
                                          <input type="text" value={selectedExtra.backgroundColor} onChange={(e) => setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, backgroundColor: e.target.value } : obj))} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                        </label>
                                      </div>
                                    </>
                                  ) : null}
                                  {selectedExtra.type === "image" ? (
                                    <div className="space-y-1.5">
                                      <Input
                                        label={tr("URL картинки", "Image URL")}
                                        value={selectedExtra.imageUrl}
                                        onChange={(e) => setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, imageUrl: e.target.value } : obj))}
                                        placeholder="https://..."
                                      />
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <label className="inline-flex items-center gap-2 px-2 py-1 border border-border rounded bg-bg-base text-text-secondary cursor-pointer">
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              uploadSelectedCertificateExtraImageFile(e.target.files?.[0] ?? null);
                                              e.currentTarget.value = "";
                                            }}
                                          />
                                          {tr("Завантажити файлом", "Upload file")}
                                        </label>
                                        <Button
                                          variant="ghost"
                                          onClick={() => setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, imageUrl: "" } : obj))}
                                          disabled={!selectedExtra.imageUrl}
                                        >
                                          {tr("Очистити", "Clear")}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}
                                  {selectedExtra.type === "shape" ? (
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <label className="text-[11px] text-text-secondary">BG
                                        <input type="text" value={selectedExtra.backgroundColor} onChange={(e) => setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, backgroundColor: e.target.value } : obj))} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                      </label>
                                      <label className="text-[11px] text-text-secondary">Radius
                                        <input type="number" min={0} max={48} value={selectedExtra.borderRadius} onChange={(e) => {
                                          const value = clampNumber(Number(e.target.value) || 0, 0, 48);
                                          setCertificateLayoutExtraObjects((prev) => prev.map((obj) => obj.id === selectedExtra.id ? { ...obj, borderRadius: value } : obj));
                                        }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                      </label>
                                    </div>
                                  ) : null}
                                  <div className="flex items-center justify-end">
                                    <Button variant="ghost" onClick={removeSelectedCertificateObject}>
                                      {tr("Видалити об'єкт", "Delete object")}
                                    </Button>
                                  </div>
                                </div>
                              );
                            }
                            if (!key) return null;
                            const l = certificateLayout[key];
                            return (
                              <div className="border border-border rounded px-2 py-2 bg-bg-base space-y-2">
                                <div className="text-xs font-mono text-text-primary">{certificateFieldLabel(key, tr)}</div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
                                  <label className="text-[11px] text-text-secondary">X%
                                    <input type="number" min={0} max={100} value={l.x} onChange={(e) => {
                                      const value = applySnap(Number(e.target.value) || 0);
                                      updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], x: value } }));
                                    }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                  </label>
                                  <label className="text-[11px] text-text-secondary">Y%
                                    <input type="number" min={0} max={100} value={l.y} onChange={(e) => {
                                      const value = applySnap(Number(e.target.value) || 0);
                                      updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], y: value } }));
                                    }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                  </label>
                                  <label className="text-[11px] text-text-secondary">{tr("Size", "Size")}
                                    <input type="number" min={10} max={72} value={l.fontSize} onChange={(e) => {
                                      const value = clampFontSize(Number(e.target.value) || 10);
                                      updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], fontSize: value } }));
                                    }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                  </label>
                                  <label className="text-[11px] text-text-secondary">{tr("Width", "Width")}
                                    <input type="number" min={8} max={96} value={l.width} onChange={(e) => {
                                      const raw = clampFieldWidth(Number(e.target.value) || 8);
                                      const value = certificateLayoutSnapEnabled
                                        ? snapByStep(raw, clampNumber(certificateLayoutSnapStep, 0.5, 20))
                                        : raw;
                                      updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], width: Math.round(value * 10) / 10 } }));
                                    }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono" />
                                  </label>
                                  <label className="text-[11px] text-text-secondary">{tr("Align", "Align")}
                                    <select value={l.align} onChange={(e) => {
                                      const value = e.target.value as "left" | "center" | "right";
                                      updateCertificateLayout((prev) => ({ ...prev, [key]: { ...prev[key], align: value } }));
                                    }} className="mt-1 w-full px-2 py-1 bg-bg-base border border-border text-text-primary font-mono">
                                      <option value="left">{tr("Ліво", "Left")}</option>
                                      <option value="center">{tr("Центр", "Center")}</option>
                                      <option value="right">{tr("Право", "Right")}</option>
                                    </select>
                                  </label>
                                </div>
                              </div>
                            );
                          })() : null}
                        </div>

                        {!certificateUiSimpleMode || certificateUiAdvancedOpen ? (
                          <>
                            <div className="space-y-1.5">
                              <label className="text-xs text-text-secondary">HTML</label>
                              <textarea
                                value={certificateTemplateHtml}
                                onChange={(e) => setCertificateTemplateHtml(e.target.value)}
                                className="w-full min-h-[120px] px-3 py-2 bg-bg-code border border-border text-text-primary font-mono"
                                placeholder="<div>{{name}}</div>"
                              />
                              <div className="text-[11px] text-text-secondary">
                                {tr("Доступні placeholders", "Available placeholders")}: {CERTIFICATE_FIELD_KEYS.map((k) => `{{${k}}}`).join(", ")}
                              </div>
                              {certificateTemplatePlaceholders.length > 0 ? (
                                <div className="text-[11px] text-text-secondary">
                                  {tr("Знайдено в шаблоні", "Found in template")}: {certificateTemplatePlaceholders.map((k) => `{{${k}}}`).join(", ")}
                                </div>
                              ) : null}
                              {certificateUnknownPlaceholders.length > 0 ? (
                                <div className="text-[11px] text-accent-error">
                                  {tr("Невідомі placeholders", "Unknown placeholders")}: {certificateUnknownPlaceholders.map((k) => `{{${k}}}`).join(", ")}
                                </div>
                              ) : null}
                              {certificateMissingRequiredPlaceholders.length > 0 ? (
                                <div className="text-[11px] text-accent-error flex flex-wrap items-center gap-2">
                                  <span>
                                    {tr("Відсутні обов'язкові placeholders", "Missing required placeholders")}: {certificateMissingRequiredPlaceholders.map((k) => `{{${k}}}`).join(", ")}
                                  </span>
                                  <Button variant="ghost" onClick={insertMissingRequiredCertificatePlaceholders}>
                                    {tr("Вставити в HTML", "Insert into HTML")}
                                  </Button>
                                </div>
                              ) : null}
                              {certificateDisabledReferencedPlaceholders.length > 0 ? (
                                <div className="text-[11px] text-accent-warn flex flex-wrap items-center gap-2">
                                  <span>
                                    {tr("У шаблоні використані вимкнені поля", "Template uses disabled fields")}: {certificateDisabledReferencedPlaceholders.map((k) => `{{${k}}}`).join(", ")}
                                  </span>
                                  <Button variant="ghost" onClick={enableReferencedCertificateFields}>
                                    {tr("Увімкнути поля", "Enable fields")}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs text-text-secondary">CSS</label>
                              <textarea
                                value={certificateTemplateCss}
                                onChange={(e) => setCertificateTemplateCss(e.target.value)}
                                className="w-full min-h-[90px] px-3 py-2 bg-bg-code border border-border text-text-primary font-mono"
                                placeholder="body { font-family: sans-serif; }"
                              />
                            </div>
                          </>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="secondary" onClick={() => void createCustomCertificateTemplate()} disabled={certificateCreatingTemplate || certificateUnknownPlaceholders.length > 0 || certificateMissingRequiredPlaceholders.length > 0}>
                            {certificateCreatingTemplate ? tr("Створення...", "Creating...") : tr("Створити шаблон", "Create template")}
                          </Button>
                          <Button variant="ghost" onClick={() => setCertificatePreviewOpen((v) => !v)}>
                            {certificatePreviewOpen ? tr("Сховати прев'ю", "Hide preview") : tr("Показати прев'ю", "Show preview")}
                          </Button>
                          <Button variant={certificatePreviewFitCanvas ? "secondary" : "ghost"} onClick={() => setCertificatePreviewFitCanvas((v) => !v)}>
                            {certificatePreviewFitCanvas ? tr("Fit до Canvas: ON", "Fit to canvas: ON") : tr("Fit до Canvas: OFF", "Fit to canvas: OFF")}
                          </Button>
                        </div>
                        {certificatePreviewOpen ? (
                          <div className="border border-border bg-bg-base rounded-lg overflow-hidden">
                            <div className="px-2 py-1 text-xs text-text-secondary border-b border-border">
                              {tr("Локальне прев'ю шаблону", "Local template preview")}
                            </div>
                            <iframe
                              title="certificate-template-preview"
                              className="w-full h-[520px] bg-white"
                              sandbox="allow-scripts"
                              srcDoc={certificatePreviewSrcDoc}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2 mb-3 border border-border bg-bg-base p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-text-secondary">{tr("Бібліотека шаблонів", "Template library")}</div>
                        <Button variant="ghost" onClick={() => void loadCertificateTemplatesCatalog()} disabled={certificateTemplatesCatalogLoading}>
                          {certificateTemplatesCatalogLoading ? tr("Оновлення...", "Refreshing...") : tr("Оновити", "Refresh")}
                        </Button>
                      </div>
                      <div className="max-h-[240px] overflow-auto border border-border rounded bg-bg-base">
                        <table className="min-w-[620px] w-full text-[11px] font-mono">
                          <thead className="bg-bg-hover">
                            <tr>
                              <th className="p-1.5 border-b border-border text-left">ID</th>
                              <th className="p-1.5 border-b border-border text-left">{tr("Назва", "Name")}</th>
                              <th className="p-1.5 border-b border-border text-left">{tr("Тип", "Type")}</th>
                              <th className="p-1.5 border-b border-border text-left">{tr("Контест", "Contest")}</th>
                              <th className="p-1.5 border-b border-border text-left">{tr("Статус", "Status")}</th>
                              <th className="p-1.5 border-b border-border text-right">{tr("Дія", "Action")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {certificateTemplatesCatalog.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-2 text-text-secondary">
                                  {certificateTemplatesCatalogLoading
                                    ? tr("Завантаження шаблонів...", "Loading templates...")
                                    : tr("Шаблони не знайдено", "No templates found")}
                                </td>
                              </tr>
                            ) : (
                              certificateTemplatesCatalog.map((tpl) => (
                                <tr key={`cert-tpl-${tpl.id}`} className="odd:bg-bg-base even:bg-bg-surface">
                                  <td className="p-1.5 border-b border-border">{tpl.id}</td>
                                  <td className="p-1.5 border-b border-border truncate max-w-[250px]" title={tpl.name}>{tpl.name}</td>
                                  <td className="p-1.5 border-b border-border">{tpl.type}</td>
                                  <td className="p-1.5 border-b border-border">{tpl.contestId ?? "—"}</td>
                                  <td className="p-1.5 border-b border-border">{tpl.isActive ? tr("Активний", "Active") : tr("Неактивний", "Inactive")}</td>
                                  <td className="p-1.5 border-b border-border text-right">
                                    <Button variant="ghost" onClick={() => void applyTemplateFromCatalog(tpl)}>
                                      {tr("Вибрати", "Use")}
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Button variant="secondary" onClick={saveCertificateSettings} disabled={certificateSaving || (certificateMode === "custom" && (certificateUnknownPlaceholders.length > 0 || certificateMissingRequiredPlaceholders.length > 0))}>
                        {certificateSaving ? tr("Збереження...", "Saving...") : tr("Зберегти налаштування", "Save settings")}
                      </Button>
                      <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={certificateForceRegenerate}
                          onChange={(e) => setCertificateForceRegenerate(e.target.checked)}
                        />
                        {tr("Перегенерувати вже існуючі", "Regenerate existing")}
                      </label>
                      <Button onClick={enqueueCertificateGeneration} disabled={certificateGenerating}>
                        {certificateGenerating ? tr("Запуск...", "Starting...") : tr("Згенерувати сертифікати", "Generate certificates")}
                      </Button>
                    </div>

                    {certificateError ? <div className="text-sm text-accent-error">{certificateError}</div> : null}
                    {certificateMessage ? <div className="text-sm text-accent-success">{certificateMessage}</div> : null}

                    <div className="text-xs text-text-secondary mt-2">
                      {tr(
                        "Підказка: якщо Template ID порожній — для custom буде створено шаблон з HTML/CSS, а для StudyCod — зі стилем/полями з цієї форми.",
                        "Tip: if Template ID is empty, custom mode creates a template from HTML/CSS and StudyCod mode creates one from the style/fields form above."
                      )}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" />{tr("Генерація контест-акаунтів", "Contest account generation")}</div>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <input
                          key={accountRosterImportKey}
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => void importRosterCsvFile(e.target.files?.[0] ?? null)}
                          className="block text-xs text-text-secondary"
                        />
                      </div>
                      <textarea
                        value={accountRosterText}
                        onChange={(e) => setAccountRosterText(e.target.value)}
                        className="w-full min-h-[120px] px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("Формат рядка: ПІБ, email\nПриклад: Іван Петренко, ivan@example.com", "Row format: Full name, email\nExample: John Smith, john@example.com")}
                      />
                      <div className="text-xs text-text-secondary">
                        {tr(
                          `Розпізнано: ${rosterInputAnalysis.entries.length}. Невалідних рядків: ${rosterInputAnalysis.invalidLines.length}.`,
                          `Parsed: ${rosterInputAnalysis.entries.length}. Invalid rows: ${rosterInputAnalysis.invalidLines.length}.`
                        )}
                      </div>
                      {rosterInputAnalysis.duplicateEmails.length > 0 ? (
                        <div className="text-xs text-accent-warn">
                          {tr(
                            `Увага: повторювані email (${rosterInputAnalysis.duplicateEmails.length}): ${rosterInputAnalysis.duplicateEmails.slice(0, 5).join(", ")}`,
                            `Warning: duplicate emails (${rosterInputAnalysis.duplicateEmails.length}): ${rosterInputAnalysis.duplicateEmails.slice(0, 5).join(", ")}`
                          )}
                        </div>
                      ) : null}
                      {rosterInputAnalysis.invalidLines.length > 0 ? (
                        <div className="text-xs text-accent-error">
                          {tr(
                            `Некоректні рядки (перші 3): ${rosterInputAnalysis.invalidLines.slice(0, 3).join(" | ")}`,
                            `Invalid rows (first 3): ${rosterInputAnalysis.invalidLines.slice(0, 3).join(" | ")}`
                          )}
                        </div>
                      ) : null}

                      {rosterPreviewRows.length > 0 ? (
                        <div className="border border-border bg-bg-surface/60 rounded-lg overflow-auto max-h-[180px]">
                          <table className="min-w-[560px] w-full text-xs font-mono">
                            <thead className="bg-bg-hover">
                              <tr>
                                <th className="p-2 border-b border-border text-left">{tr("ПІБ", "Full name")}</th>
                                <th className="p-2 border-b border-border text-left">email</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rosterPreviewRows.map((row, idx) => (
                                <tr key={`${row.email}-${idx}`} className="odd:bg-bg-base even:bg-bg-surface">
                                  <td className="p-2 border-b border-border">{row.fullName}</td>
                                  <td className="p-2 border-b border-border">{row.email}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {rosterInputAnalysis.entries.length > rosterPreviewRows.length ? (
                            <div className="px-2 py-1 text-[11px] text-text-secondary border-t border-border">
                              {tr(
                                `Показано ${rosterPreviewRows.length} з ${rosterInputAnalysis.entries.length}`,
                                `Showing ${rosterPreviewRows.length} of ${rosterInputAnalysis.entries.length}`
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" onClick={generateAccounts} disabled={accountGenLoading}>
                          {accountGenLoading ? tr("Генерація...", "Generating...") : tr("Згенерувати акаунти", "Generate accounts")}
                        </Button>
                        <Button variant="ghost" onClick={clearRosterInput} disabled={!accountRosterText.trim()}>
                          {tr("Очистити список", "Clear roster")}
                        </Button>
                        <Button variant="ghost" onClick={clearGeneratedAccounts} disabled={!generatedAccounts.length}>
                          {tr("Очистити згенеровані", "Clear generated")}
                        </Button>
                        <Button variant="ghost" onClick={copyGeneratedAccounts} disabled={!generatedAccounts.length}>
                          {tr("Скопіювати CSV", "Copy CSV")}
                        </Button>
                        <Button variant="ghost" onClick={downloadGeneratedAccountsCsv} disabled={!generatedAccounts.length}>
                          {tr("Завантажити CSV", "Download CSV")}
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs text-text-secondary mb-2">
                      {tr("Система видає CSV у форматі: ПІБ, email, username, password. Паролі показуються лише один раз після генерації.", "System returns CSV in format: fullName, email, username, password. Passwords are shown only once after generation.")}
                    </div>

                    {accountGenError ? <div className="text-sm text-accent-error mb-3">{accountGenError}</div> : null}
                    {accountGenMessage ? <div className="text-sm text-accent-success mb-3">{accountGenMessage}</div> : null}

                    {generatedAccounts.length > 0 ? (
                      <>
                      <div className="overflow-auto border border-border max-h-[260px] mb-3">
                        <table className="min-w-[760px] w-full text-sm font-mono">
                          <thead className="bg-bg-hover">
                            <tr>
                              <th className="p-2 border-b border-border text-left">{tr("ПІБ", "Full name")}</th>
                              <th className="p-2 border-b border-border text-left">email</th>
                              <th className="p-2 border-b border-border text-left">username</th>
                              <th className="p-2 border-b border-border text-left">password</th>
                              <th className="p-2 border-b border-border text-left">userId</th>
                              <th className="p-2 border-b border-border text-left">participantId</th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedAccounts.map((a) => (
                              <tr key={`${a.userId}-${a.participantId}-${a.email ?? ""}`} className="odd:bg-bg-base even:bg-bg-surface">
                                <td className="p-2 border-b border-border">{a.fullName ?? "—"}</td>
                                <td className="p-2 border-b border-border">{a.email ?? "—"}</td>
                                <td className="p-2 border-b border-border">{a.username}</td>
                                <td className="p-2 border-b border-border">{a.password}</td>
                                <td className="p-2 border-b border-border">{a.userId}</td>
                                <td className="p-2 border-b border-border">{a.participantId}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2">
                        <textarea
                          value={accountMailCustomMessage}
                          onChange={(e) => setAccountMailCustomMessage(e.target.value)}
                          className="w-full min-h-[84px] px-3 py-2 bg-bg-base border border-border text-text-primary"
                          placeholder={tr("Додаткове повідомлення для листа (опційно)", "Additional email message (optional)")}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="secondary" onClick={sendGeneratedAccountsByEmail} disabled={accountMailLoading}>
                            {accountMailLoading ? tr("Розсилка...", "Sending...") : tr("Розіслати дані та контест через пошту", "Send credentials and contest info by email")}
                          </Button>
                        </div>
                        {accountMailError ? <div className="text-sm text-accent-error">{accountMailError}</div> : null}
                        {accountMailResult ? <div className="text-sm text-accent-success">{accountMailResult}</div> : null}
                      </div>
                      </>
                    ) : null}
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />{tr("Організатори та пауза", "Organizers and pause")}</div>
                      <Button variant="secondary" onClick={loadOrganizers} disabled={organizersLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Button variant="secondary" onClick={toggleContestPaused} disabled={pauseSaving}>
                        {data.access.isPaused ? tr("Зняти з паузи", "Resume") : tr("Пауза", "Pause")}
                      </Button>
                      <Badge color={data.access.isPaused ? "warn" : "success"}>
                        {data.access.isPaused ? tr("Контест на паузі", "Contest is paused") : tr("Контест активний", "Contest is active")}
                      </Badge>
                    </div>

                    <div className="flex flex-col md:flex-row gap-2 mb-3">
                      <input
                        value={newOrganizerUserId}
                        onChange={(e) => setNewOrganizerUserId(e.target.value)}
                        className="md:w-56 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("User ID організатора", "Organizer user ID")}
                        inputMode="numeric"
                      />
                      <Button variant="secondary" onClick={addOrganizer}>
                        {tr("Додати організатора", "Add organizer")}
                      </Button>
                    </div>

                    {organizersError ? <div className="text-sm text-accent-error mb-3">{organizersError}</div> : null}

                    {organizersLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : organizers.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("Додаткових організаторів ще немає", "No additional organizers yet")}</div>
                    ) : (
                      <div className="space-y-2">
                        {organizers.map((o) => (
                          <div key={o.userId} className="flex items-center justify-between gap-2 border border-border bg-bg-base px-3 py-2">
                            <div className="text-sm font-mono text-text-primary">
                              #{o.userId} · {o.username} {" "}
                              <Link to={`/u/${encodeURIComponent(o.username)}`} className="text-primary hover:underline">
                                {tr("профіль", "profile")}
                              </Link>
                            </div>
                            <Button variant="ghost" onClick={() => removeOrganizer(o.userId)}>
                              {tr("Прибрати", "Remove")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary">{tr("Анулювання задач", "Problem annulments")}</div>
                      <Button variant="secondary" onClick={loadAnnulments} disabled={annulmentsLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                      <input
                        value={annulProblemId}
                        onChange={(e) => setAnnulProblemId(e.target.value)}
                        className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("Problem ID", "Problem ID")}
                        inputMode="numeric"
                      />
                      <input
                        value={annulParticipantId}
                        onChange={(e) => setAnnulParticipantId(e.target.value)}
                        className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("Participant ID (опц.)", "Participant ID (opt)")}
                        inputMode="numeric"
                      />
                      <input
                        value={annulReason}
                        onChange={(e) => setAnnulReason(e.target.value)}
                        className="px-3 py-2 bg-bg-base border border-border text-text-primary"
                        placeholder={tr("Причина (опц.)", "Reason (opt)")}
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={annulledActive ? "1" : "0"}
                          onChange={(e) => setAnnulledActive(e.target.value === "1")}
                          className="px-3 py-2 bg-bg-base border border-border text-text-primary"
                        >
                          <option value="1">{tr("Анулювати", "Annul")}</option>
                          <option value="0">{tr("Скасувати анулювання", "Un-annul")}</option>
                        </select>
                        <Button variant="secondary" onClick={applyAnnulment}>
                          {tr("Застосувати", "Apply")}
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs text-text-secondary mb-2">
                      {tr("Якщо Participant ID порожній — дія застосовується для всіх учасників.", "If Participant ID is empty, action applies to all participants.")}
                    </div>

                    {annulmentsError ? <div className="text-sm text-accent-error mb-2">{annulmentsError}</div> : null}

                    {annulmentsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : annulments.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("Немає записів анулювання", "No annulment records")}</div>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-auto">
                        {annulments.map((a) => (
                          <div key={a.id} className="border border-border bg-bg-base px-3 py-2 text-sm font-mono">
                            <div>#{a.id} · P{a.problemId} · {a.participantId ? `U${a.participantId}` : tr("для всіх", "for all")}</div>
                            <div className="text-xs text-text-secondary">
                              {a.isActive ? tr("активне", "active") : tr("неактивне", "inactive")} · {fmtDateTime(a.updatedAt ?? a.createdAt, i18n.language)}
                              {a.reason ? ` · ${a.reason}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary flex items-center gap-2"><Users2 className="w-4 h-4 text-primary" />{tr("Модерація учасників", "Participant moderation")}</div>
                      <Button variant="secondary" onClick={loadAdminParticipants} disabled={adminParticipantsLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    {adminParticipantsError ? (
                      <div className="text-sm text-accent-error mb-3">{adminParticipantsError}</div>
                    ) : null}

                    {adminParticipantsActionMessage ? (
                      <div
                        className={`text-sm mb-3 ${
                          adminParticipantsActionTone === "success"
                            ? "text-accent-success"
                            : adminParticipantsActionTone === "warn"
                              ? "text-accent-warn"
                              : "text-accent-error"
                        }`}
                      >
                        {adminParticipantsActionMessage}
                      </div>
                    ) : null}

                    {adminParticipantsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : adminParticipants.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("Поки що немає учасників", "No participants yet")}</div>
                    ) : (
                      <div className="overflow-auto border border-border">
                        <table className="min-w-[860px] w-full text-sm font-mono">
                          <thead className="bg-bg-hover">
                            <tr>
                              <th className="p-2 border-b border-border text-left">#</th>
                              <th className="p-2 border-b border-border text-left">{tr("Учасник", "Participant")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Тип", "Type")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Контест-акаунт", "Contest account")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Статус", "Status")}</th>
                              <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminParticipants.map((p) => (
                              <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                                <td className="p-2 border-b border-border">{p.id}</td>
                                <td className="p-2 border-b border-border">{p.displayName}</td>
                                <td className="p-2 border-b border-border">{p.principalType}</td>
                                <td className="p-2 border-b border-border">{p.contestAccountHandle ? p.contestAccountHandle : "—"}</td>
                                <td className="p-2 border-b border-border">
                                  {p.isDisqualified ? (
                                    <Badge color="warn">{tr("Дискваліфіковано", "Disqualified")}</Badge>
                                  ) : (
                                    <Badge color="success">{tr("У заліку", "Active")}</Badge>
                                  )}
                                </td>
                                <td className="p-2 border-b border-border text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button variant="secondary" onClick={() => openAdminSubmissions(p, { fullPage: true })}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      {tr("Подачі", "Submissions")}
                                    </Button>
                                    <Button variant="secondary" onClick={() => toggleParticipantDisqualification(p)}>
                                      {p.isDisqualified ? (
                                        <>
                                          <RotateCcw className="w-4 h-4 mr-2" />
                                          {tr("Повернути", "Restore")}
                                        </>
                                      ) : (
                                        <>
                                          <Ban className="w-4 h-4 mr-2" />
                                          {tr("Дискваліфікувати", "Disqualify")}
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  {adminSubsParticipant && !adminSubsFullPage ? (
                    <Card className="p-4 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="font-mono text-text-primary">
                          {tr("Інспектор подач", "Submission inspector")}: {adminSubsParticipant.displayName} (#{adminSubsParticipant.id})
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" onClick={() => openAdminSubmissions(adminSubsParticipant)} disabled={adminSubsLoading}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {tr("Оновити", "Refresh")}
                          </Button>
                          <Button variant="secondary" onClick={() => setAdminSubsFullPage(true)}>
                            {tr("На весь екран", "Full page")}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={closeAdminInspector}
                          >
                            {tr("Закрити інспектор", "Close inspector")}
                          </Button>
                        </div>
                      </div>

                      {adminInspectorBody}
                    </Card>
                  ) : null}

                  {adminSubsParticipant && adminSubsFullPage ? (
                    <div className="fixed inset-0 z-50 bg-bg-base">
                      <div className="h-full flex flex-col">
                        <div className="border-b border-border bg-bg-surface/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
                          <div className="font-mono text-text-primary text-sm md:text-base">
                            {tr("Інспектор подач", "Submission inspector")}: {adminSubsParticipant.displayName} (#{adminSubsParticipant.id})
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="secondary" onClick={() => openAdminSubmissions(adminSubsParticipant)} disabled={adminSubsLoading}>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              {tr("Оновити", "Refresh")}
                            </Button>
                            <Button variant="secondary" onClick={() => setAdminSubsFullPage(false)}>
                              {tr("Згорнути", "Minimize")}
                            </Button>
                            <Button variant="ghost" onClick={closeAdminInspector}>
                              {tr("Закрити", "Close")}
                            </Button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                          {adminInspectorBody}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-text-secondary">
                    {tr("Питання та оголошення зберігаються на сервері в межах цього контесту.", "Questions and announcements are persisted on the server for this contest.")}
                  </div>
                  <Button variant="secondary" onClick={loadCommunity} disabled={communityLoading || !data.access.canAccessContent}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {tr("Оновити", "Refresh")}
                  </Button>
                </div>
                {communityError ? <div className="text-sm text-accent-error mt-2">{communityError}</div> : null}
                {!data.access.canAccessContent ? (
                  <div className="text-sm text-text-secondary mt-2">{tr("Немає доступу до ком'юніті цього контесту.", "You don't have access to this contest community.")}</div>
                ) : null}
              </Card>

              <Card className="p-4">
                <div className="text-sm font-mono text-text-primary mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> {tr("Питання до організатора", "Questions to organizer")}
                </div>
                <div className="text-xs text-text-secondary mb-3">
                  {tr(
                    "Це приватні звернення: учасник бачить лише власні питання та відповіді організаторів.",
                    "These are private requests: each participant sees only their own questions and organizer answers."
                  )}
                </div>

                <div className="space-y-2 mb-3 max-h-[360px] overflow-auto pr-1">
                  {communityLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : communityData.questions.length === 0 ? (
                    <div className="text-sm text-text-secondary">{tr("Питань ще немає.", "No questions yet.")}</div>
                  ) : (
                    communityData.questions.map((q) => (
                      <div key={q.id} className="rounded-xl border border-border bg-bg-base p-3">
                        <div className="text-xs text-text-secondary mb-1 flex items-center gap-2 flex-wrap">
                          <span>{q.author} · {fmtDateTime(q.createdAt, i18n.language)}</span>
                          <StatusChip
                            glyph={q.answer ? "✓" : "…"}
                            label={q.answer ? tr("Відповідь є", "Answered") : tr("Очікує відповіді", "Waiting")}
                            tone={q.answer ? "success" : "warn"}
                            size="sm"
                          />
                        </div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{q.text}</div>
                        {q.answer ? (
                          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/10 p-2">
                            <div className="text-[11px] text-primary mb-1">{tr("Відповідь організатора", "Organizer answer")}</div>
                            <div className="text-xs text-text-primary whitespace-pre-wrap">{q.answer}</div>
                            {q.answeredAt ? <div className="text-[10px] text-text-secondary mt-1">{fmtDateTime(q.answeredAt, i18n.language)}</div> : null}
                          </div>
                        ) : data.access.canManage ? (
                          <div className="mt-2">
                            <Button variant="secondary" onClick={() => answerContestQuestion(q.id)}>
                              {tr("Відповісти", "Answer")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                {hasToken && data.access.canAccessContent ? (
                  <div className="space-y-2">
                    <textarea
                      value={communityQuestionText}
                      onChange={(e) => setCommunityQuestionText(e.target.value)}
                      className="w-full min-h-[90px] rounded-xl bg-bg-code border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                      placeholder={tr("Постав запитання щодо задач, правил або тестів...", "Ask about tasks, rules, or tests...")}
                    />
                    <div className="flex justify-end">
                      <Button onClick={postContestQuestion} disabled={!communityQuestionText.trim()}>
                        <Send className="w-4 h-4 mr-2" /> {tr("Надіслати питання", "Send question")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-text-secondary">{tr("Увійдіть і отримайте доступ до контесту, щоб ставити питання.", "Log in and join the contest to ask questions.")}</div>
                )}
              </Card>

              <Card className="p-4">
                <div className="text-sm font-mono text-text-primary mb-2 flex items-center gap-2">
                  <Megaphone className="w-4 h-4" /> {tr("Оголошення", "Announcements")}
                </div>

                {data.access.canManage ? (
                  <div className="space-y-2 mb-3">
                    <textarea
                      value={communityAnnouncementText}
                      onChange={(e) => setCommunityAnnouncementText(e.target.value)}
                      className="w-full min-h-[80px] rounded-xl bg-bg-code border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                      placeholder={tr("Наприклад: о 18:00 оновлено умову задачі B", "Example: at 18:00 problem B statement updated")}
                    />
                    <div className="flex justify-end">
                      <Button variant="secondary" onClick={postContestAnnouncement} disabled={!communityAnnouncementText.trim()}>
                        {tr("Опублікувати оголошення", "Publish announcement")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  {communityLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : communityData.announcements.length === 0 ? (
                    <div className="text-sm text-text-secondary">{tr("Оголошень ще немає.", "No announcements yet.")}</div>
                  ) : (
                    communityData.announcements.map((a) => (
                      <div key={a.id} className="rounded-xl border border-border bg-bg-base p-3">
                        <div className="text-xs text-text-secondary mb-1">{a.author} · {fmtDateTime(a.createdAt, i18n.language)}</div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{a.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
