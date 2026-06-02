import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { createCertificateTemplate, getCertificateTemplateById, listCertificateTemplates } from "../../lib/api/certificates";
import { AdminMailWorkspace } from "../../components/admin/AdminMailWorkspace";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { getAdminUsers, getAdminUser, createAdminUser, updateAdminUser, updateUserRole, deleteAdminUser, getAdminClasses, createAdminClass, updateAdminClass, deleteAdminClass, getAdminStats, getAdminJudgeLoad, getAdminJudgeDeadLetter, replayAdminJudgeDeadLetter, getAdminSupportTickets, replyAdminSupportTicket, getAdminMaintenance, enableAdminMaintenance, disableAdminMaintenance, getAdminSupportConversations, getAdminSupportConversation, postAdminSupportConversationMessage, getAdminLibraryTasks, approveAdminLibraryTask, rejectAdminLibraryTask, getAdminMaterialTopics, getAdminMaterialsDiagnostics, createAdminMaterialTopic, updateAdminMaterialTopic, deleteAdminMaterialTopic, reorderAdminMaterialTopics, importAdminMaterialTopicsYaml, syncAdminMaterialTopicsFromRepo, importAdminMaterialTopicsLegacy, exportAdminMaterialTopicsYaml, sendAdminBroadcastEmail, type AdminBroadcastDryRunResult, type AdminBroadcastSendResult, getAdminTheoryBlockRevisions, getAdminTheoryBlockRevision, rollbackAdminTheoryBlockRevision, translateAdminTheoryBlockToEn, type AdminTheoryBlockRevision, type MaintenanceState, type AdminUser, type AdminClass, type AdminStats, type AdminJudgeLoad, type AdminJudgeDeadLetterItem, type AdminJudgeDeadLetterReplayResult, type AdminSupportTicket, type CreateUserData, type UpdateUserData, type CreateClassData, type AdminSupportChatConversation, type AdminSupportChatMessage, type AdminLibraryTask, type AdminLibraryTaskStatus, type AdminMaterialTopic, type AdminMaterialsDiagnostics, type AdminMaterialsLanguage } from "../../lib/api/admin";
import { downloadSupportChatAttachment } from "../../lib/api/support";
import { MarkdownView } from "../../components/MarkdownView";
import { showToast } from "../../lib/toast";
import {
  buildCustomAutoLayoutCss,
  buildCustomAutoLayoutHtml,
  defaultCertificateLayoutState,
  isSupportedCertificateBackgroundFile,
  isSvgCertificateBackgroundFile,
  mergeAutoLayoutCss,
  normalizeCertificateBackgroundSource,
  toCssUrlValue,
} from "../../lib/certificates/editorShared";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Users, BookOpen, BarChart3, Plus, Edit, Trash2, Shield, User as UserIcon, GraduationCap, Search, Wrench, CheckCircle, XCircle, Library, FileText, Save, GripVertical, History, Mail, RefreshCcw, Languages, Award } from "lucide-react";
type Tab = "stats" | "users" | "classes" | "materials" | "library" | "emails" | "mailbox" | "support" | "maintenance" | "certificates";

type StudyCodThemePreset = "classic" | "gold" | "dark";
type ResizeMode = "proportional" | "free";
type GlobalCertTemplateFieldKey =
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
type CertificateTemplateListItem = {
  id: number;
  contestId: number | null;
  name: string;
  type: "studycod" | "custom";
  isActive: boolean;
  version: number;
};

type MaterialsLanguage = AdminMaterialsLanguage;
type UserRole = NonNullable<CreateUserData["role"]>;
type UserMode = NonNullable<CreateUserData["userMode"]>;
type UserLanguage = NonNullable<CreateUserData["lang"]>;
type ClassLanguage = CreateClassData["language"];
type EmailDelivery = "MARKETING" | "NOTIFICATION";
type EmailAudience = "ALL" | "USERS" | "STUDENTS";
type MaterialsYamlMode = "merge" | "replace";
type ApiErrorLike = {
  message?: unknown;
  response?: {
    status?: unknown;
    data?: {
      message?: unknown;
      hint?: unknown;
      detail?: unknown;
      details?: unknown;
      filePath?: unknown;
      code?: unknown;
      errors?: unknown;
    };
  };
};

const toApiErrorLike = (value: unknown): ApiErrorLike | null => {
  if (!value || typeof value !== "object") return null;
  return value;
};

const extractSourceFilePath = (source: unknown): string | null => {
  if (!source || typeof source !== "object") return null;
  const filePath = Reflect.get(source, "filePath");
  return typeof filePath === "string" && filePath.trim() ? filePath : null;
};

const isAdminBroadcastSendResult = (
  value: AdminBroadcastDryRunResult | AdminBroadcastSendResult | null
): value is AdminBroadcastSendResult => {
  return !!value && value.dryRun === false;
};

const parseMaterialsLanguage = (value: string): MaterialsLanguage | null => {
  if (value === "JAVA" || value === "PYTHON" || value === "CPP") return value;
  return null;
};

const parseUserRole = (value: string): UserRole | null => {
  if (value === "USER" || value === "TEACHER" || value === "SYSTEM_ADMIN") return value;
  return null;
};

const parseUserMode = (value: string): UserMode | null => {
  if (value === "PERSONAL" || value === "EDUCATIONAL") return value;
  return null;
};

const parseUserLanguage = (value: string): UserLanguage | null => {
  if (value === "JAVA" || value === "PYTHON" || value === "CPP") return value;
  return null;
};

const parseClassLanguage = (value: string): ClassLanguage | null => {
  if (value === "JAVA" || value === "PYTHON" || value === "CPP") return value;
  return null;
};

const parseLibraryStatus = (value: string): AdminLibraryTaskStatus | null => {
  if (value === "DRAFT" || value === "PENDING" || value === "APPROVED" || value === "REJECTED") return value;
  return null;
};

const parseEmailDelivery = (value: string): EmailDelivery | null => {
  if (value === "MARKETING" || value === "NOTIFICATION") return value;
  return null;
};

const parseEmailAudience = (value: string): EmailAudience | null => {
  if (value === "ALL" || value === "USERS" || value === "STUDENTS") return value;
  return null;
};

const parseMaterialsYamlMode = (value: string): MaterialsYamlMode | null => {
  if (value === "merge" || value === "replace") return value;
  return null;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  const apiError = toApiErrorLike(error);
  const responseMessage = apiError?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) return responseMessage;
  const directMessage = apiError?.message;
  if (typeof directMessage === "string" && directMessage.trim()) return directMessage;
  return fallback;
};

const getErrorStatus = (error: unknown): number | null => {
  const status = toApiErrorLike(error)?.response?.status;
  return typeof status === "number" ? status : null;
};

const getErrorData = (error: unknown): ApiErrorLike["response"] extends infer R
  ? R extends { data?: infer D }
    ? D | undefined
    : never
  : never => {
  return toApiErrorLike(error)?.response?.data;
};

const formatErrorIssues = (errors: unknown): string => {
  if (!Array.isArray(errors) || errors.length === 0) return "";
  return errors
    .map((e) => {
      if (typeof e === "object" && e !== null) {
        const msg = Reflect.get(e, "message");
        if (typeof msg === "string") return msg;
        const code = Reflect.get(e, "code");
        if (typeof code === "string") return code;
      }
      return JSON.stringify(e);
    })
    .join(", ");
};

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

function buildStudyCodPresetCss(theme: StudyCodThemePreset, backgroundImageUrl: string): string {
  const safeBgUrl = String(backgroundImageUrl ?? "").trim();

  const baseByTheme: Record<StudyCodThemePreset, string> = {
    classic: [
      ".certificate { border-color: #0f2f5f; background: linear-gradient(135deg, #ffffff 0%, #eef5ff 100%); }",
      ".brand, .title, .signature { color: #0f2f5f; }",
      ".subtitle, .meta { color: #375b93; }",
      ".name { color: #041a3a; }",
      ".score { color: #1d3f74; }",
    ].join("\n"),
    gold: [
      ".certificate { border-color: #7a5a00; background: linear-gradient(135deg, #fffdf3 0%, #fff2c9 100%); }",
      ".brand, .title, .signature { color: #7a5a00; }",
      ".subtitle, .meta { color: #8d6a00; }",
      ".name { color: #4a3600; }",
      ".score { color: #7a5a00; }",
    ].join("\n"),
    dark: [
      "body { background: #0b1220; }",
      ".certificate { border-color: #243b6b; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); }",
      ".brand, .title, .signature { color: #dbeafe; }",
      ".subtitle, .meta, .id { color: #c7d2fe; }",
      ".name { color: #f8fafc; }",
      ".score { color: #bfdbfe; }",
    ].join("\n"),
  };

  const withImage = safeBgUrl
    ? [
        ".certificate {",
        `  background-image: ${toCssUrlValue(safeBgUrl)}, linear-gradient(135deg, #ffffff 0%, #eef5ff 100%);`,
        "  background-size: 100% 100%;",
        "  background-position: center center;",
        "  background-repeat: no-repeat;",
        "  image-rendering: auto;",
        "  -webkit-print-color-adjust: exact;",
        "  print-color-adjust: exact;",
        "}",
      ].join("\n")
    : "";

  return [baseByTheme[theme], withImage].filter(Boolean).join("\n").trim();
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

type GlobalCertBlockKey = "brand" | "title" | "subtitle" | "name" | "full_name" | "score" | "max_score" | "meta" | "signature" | "id" | "qr";

type GlobalCertBlockLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  align: "left" | "center" | "right";
  sizeMode: "fixed" | "auto" | "stretch";
};

type GlobalCertLayoutState = Record<GlobalCertBlockKey, GlobalCertBlockLayout>;

type GlobalCertExtraObjectType = "text" | "image" | "shape";

type GlobalCertExtraObject = {
  id: string;
  type: GlobalCertExtraObjectType;
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

const GLOBAL_CERT_TEMPLATE_FIELD_KEYS: GlobalCertTemplateFieldKey[] = [
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

function defaultGlobalCertTemplateFieldsState(): Record<GlobalCertTemplateFieldKey, { isEnabled: boolean; isRequired: boolean }> {
  return {
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
  };
}

function globalCertTemplateFieldLabel(key: GlobalCertTemplateFieldKey): string {
  switch (key) {
    case "contest_name": return "Contest name";
    case "name": return "Nickname";
    case "full_name": return "Full name";
    case "place": return "Place";
    case "score": return "Score";
    case "max_score": return "Max score";
    case "date": return "Date";
    case "organizer": return "Organizer";
    case "signature": return "Signature";
    case "certificate_id": return "Certificate ID";
    case "qr_code": return "QR code";
    default: return key;
  }
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

// Thin wrappers over the shared canonical engine (../../lib/certificates/editorShared)
// so the admin global-template editor and the contest editor produce identical output.
function buildGlobalContestStyleAutoLayoutHtml(
  fields: Record<GlobalCertTemplateFieldKey, { isEnabled: boolean; isRequired: boolean }>
): string {
  return buildCustomAutoLayoutHtml(fields, []);
}

function buildGlobalContestStyleAutoLayoutCss(backgroundImageUrl: string): string {
  return buildCustomAutoLayoutCss({
    layouts: defaultCertificateLayoutState(),
    backgroundImageUrl,
    extraObjects: [],
  });
}

function mergeGlobalAutoLayoutCss(existingCss: string, autoCss: string): string {
  return mergeAutoLayoutCss(existingCss, autoCss);
}

function renderGlobalCertificatePreviewHtml(params: {
  htmlTemplate: string;
  cssTemplate: string;
  fields: Record<GlobalCertTemplateFieldKey, { isEnabled: boolean; isRequired: boolean }>;
}): string {
  const sampleValues: Record<GlobalCertTemplateFieldKey, string> = {
    contest_name: "StudyCod Open 2026",
    name: "nikitosruban007_",
    full_name: "Ada Lovelace",
    place: "1",
    score: "95",
    max_score: "100",
    date: "2026-03-15",
    organizer: "StudyCod",
    signature: "StudyCod Team",
    certificate_id: "SC-DEMO-0001",
    qr_code: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='white'/%3E%3Cpath d='M10 10h30v30H10zM80 10h30v30H80zM10 80h30v30H10z' fill='%231f2937'/%3E%3Cpath d='M55 55h10v10H55zM70 70h10v10H70zM55 85h10v10H55zM85 55h10v10H85z' fill='%230f172a'/%3E%3C/svg%3E",
  };

  const fallbackTemplate = buildGlobalContestStyleAutoLayoutHtml(params.fields);
  let html = String(params.htmlTemplate || "").trim() || fallbackTemplate;
  html = html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, rawKey: string) => {
    const key = String(rawKey ?? "") as GlobalCertTemplateFieldKey;
    if (!Object.prototype.hasOwnProperty.call(sampleValues, key)) return "";
    if (!params.fields[key]?.isEnabled) return "";
    return sampleValues[key] ?? "";
  });

  const css = String(params.cssTemplate || "").trim();
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0f172a; }
  body { font-family: Inter, Arial, sans-serif; }
  #preview-viewport { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  #preview-scale-root { width: 1123px; height: 794px; transform-origin: top left; will-change: transform; }
  .cert-wrap { box-sizing: border-box; }
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

function createDefaultGlobalCertExtraObject(type: GlobalCertExtraObjectType, x = 50, y = 50): GlobalCertExtraObject {
  const id = `gc-extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      fontSize: 16,
      fontWeight: 500,
      text: "",
      imageUrl: "",
      color: "#0f172a",
      backgroundColor: "transparent",
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
      width: 14,
      height: 8,
      align: "center",
      fontSize: 14,
      fontWeight: 500,
      text: "",
      imageUrl: "",
      color: "#0f172a",
      backgroundColor: "rgba(59,130,246,0.24)",
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
    width: 24,
    height: 8,
    align: "center",
    fontSize: 20,
    fontWeight: 600,
    text: "Additional text",
    imageUrl: "",
    color: "#0f2f5f",
    backgroundColor: "transparent",
    opacity: 1,
    borderRadius: 0,
    rotation: 0,
  };
}

function globalCertExtraObjectLabel(type: GlobalCertExtraObjectType): string {
  switch (type) {
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "shape":
      return "Shape";
    default:
      return type;
  }
}

function encodeSvgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildGlobalCertExtraObjectsOverlayCss(extraObjects: GlobalCertExtraObject[]): string {
  if (!extraObjects.length) return "";

  const layers: string[] = [];
  const sizes: string[] = [];
  const positions: string[] = [];
  const repeats: string[] = [];

  const sorted = [...extraObjects].sort((a, b) => Number(a.zIndex ?? 0) - Number(b.zIndex ?? 0));
  for (const obj of sorted) {
    const x = clampNumber(Number(obj.x ?? 50), 0, 100);
    const y = clampNumber(Number(obj.y ?? 50), 0, 100);
    const width = clampNumber(Number(obj.width ?? 20), 2, 96);
    const height = clampNumber(Number(obj.height ?? 10), 2, 96);
    const align = obj.align === "left" || obj.align === "right" ? obj.align : "center";
    const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    const top = y - height / 2;
    const clampedLeft = clampNumber(left, 0, 100);
    const clampedTop = clampNumber(top, 0, 100);

    if (obj.type === "image") {
      const src = String(obj.imageUrl ?? "").trim();
      if (!src) continue;
      layers.push(toCssUrlValue(src));
    } else if (obj.type === "shape") {
      const color = String(obj.backgroundColor || "rgba(59,130,246,0.24)");
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000'><rect x='0' y='0' width='1000' height='1000' rx='${Math.round(clampNumber(obj.borderRadius, 0, 48) * 10)}' fill='${color}'/></svg>`;
      layers.push(`url("${encodeSvgDataUri(svg)}")`);
    } else {
      const safeText = String(obj.text || "Additional text")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
      const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
      const textX = align === "left" ? 0 : align === "right" ? 1000 : 500;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 240'><text x='${textX}' y='140' text-anchor='${anchor}' font-family='Inter,Arial,sans-serif' font-size='${Math.round(clampNumber(obj.fontSize, 8, 96) * 7)}' font-weight='${Math.round(clampNumber(obj.fontWeight, 300, 900))}' fill='${String(obj.color || "#0f2f5f")}'>${safeText}</text></svg>`;
      layers.push(`url("${encodeSvgDataUri(svg)}")`);
    }

    sizes.push(`${width}% ${height}%`);
    positions.push(`${clampedLeft}% ${clampedTop}%`);
    repeats.push("no-repeat");
  }

  if (!layers.length) return "";

  return [
    ".certificate::after {",
    "  content: \"\";",
    "  position: absolute;",
    "  inset: 0;",
    "  pointer-events: none;",
    "  z-index: 2;",
    `  background-image: ${layers.join(", ")};`,
    `  background-size: ${sizes.join(", ")};`,
    `  background-position: ${positions.join(", ")};`,
    `  background-repeat: ${repeats.join(", ")};`,
    "}",
  ].join("\n");
}

const GLOBAL_CERT_BLOCK_KEYS: GlobalCertBlockKey[] = ["brand", "title", "subtitle", "name", "full_name", "score", "max_score", "meta", "signature", "id", "qr"];

const GLOBAL_CERT_TEMPLATE_FIELDS: Array<{
  fieldKey: GlobalCertTemplateFieldKey;
  isEnabled: boolean;
  isRequired: boolean;
}> = [
  { fieldKey: "contest_name", isEnabled: true, isRequired: false },
  { fieldKey: "name", isEnabled: true, isRequired: true },
  { fieldKey: "full_name", isEnabled: false, isRequired: false },
  { fieldKey: "place", isEnabled: true, isRequired: false },
  { fieldKey: "score", isEnabled: true, isRequired: true },
  { fieldKey: "max_score", isEnabled: true, isRequired: false },
  { fieldKey: "date", isEnabled: true, isRequired: false },
  { fieldKey: "organizer", isEnabled: true, isRequired: false },
  { fieldKey: "signature", isEnabled: true, isRequired: true },
  { fieldKey: "certificate_id", isEnabled: true, isRequired: false },
  { fieldKey: "qr_code", isEnabled: true, isRequired: false },
];

function globalCertBlockLabel(key: GlobalCertBlockKey): string {
  switch (key) {
    case "brand": return "Brand";
    case "title": return "Title";
    case "subtitle": return "Subtitle";
    case "name": return "Name";
    case "full_name": return "Full name";
    case "score": return "Score";
    case "max_score": return "Max score";
    case "meta": return "Meta";
    case "signature": return "Signature";
    case "id": return "Certificate ID";
    case "qr": return "QR";
    default: return key;
  }
}

function globalCertCanvasSampleValue(key: GlobalCertBlockKey): string {
  switch (key) {
    case "brand":
      return "StudyCod";
    case "title":
      return "Certificate of Achievement";
    case "subtitle":
      return "This certificate is proudly presented to";
    case "name":
      return "nikitosruban007_";
    case "full_name":
      return "Ada Lovelace";
    case "score":
      return "Score: 95";
    case "max_score":
      return "/ 100";
    case "meta":
      return "Contest: Spring Contest\nDate: 2026-03-15";
    case "signature":
      return "Signature: StudyCod";
    case "id":
      return "ID: SC-2026-DEMO";
    case "qr":
      return "QR";
    default:
      return key;
  }
}

function globalCertPreviewColor(theme: StudyCodThemePreset, key: GlobalCertBlockKey): string {
  if (theme === "dark") {
    if (key === "subtitle" || key === "meta" || key === "id") return "#c7d2fe";
    if (key === "name") return "#f8fafc";
    if (key === "score") return "#bfdbfe";
    return "#dbeafe";
  }
  if (theme === "gold") {
    if (key === "subtitle" || key === "meta") return "#8d6a00";
    if (key === "name") return "#4a3600";
    return "#7a5a00";
  }
  if (key === "subtitle" || key === "meta") return "#375b93";
  if (key === "name") return "#041a3a";
  if (key === "score") return "#1d3f74";
  return "#0f2f5f";
}

function defaultGlobalCertLayoutState(): GlobalCertLayoutState {
  return {
    brand: { x: 8, y: 8, width: 28, height: 6, fontSize: 22, fontWeight: 700, align: "left", sizeMode: "auto" },
    title: { x: 8, y: 15, width: 58, height: 10, fontSize: 44, fontWeight: 800, align: "left", sizeMode: "auto" },
    subtitle: { x: 8, y: 23, width: 64, height: 6, fontSize: 18, fontWeight: 500, align: "left", sizeMode: "auto" },
    name: { x: 50, y: 31, width: 80, height: 8, fontSize: 32, fontWeight: 700, align: "center", sizeMode: "auto" },
    full_name: { x: 50, y: 39, width: 84, height: 10, fontSize: 48, fontWeight: 700, align: "center", sizeMode: "auto" },
    score: { x: 42, y: 46, width: 18, height: 8, fontSize: 28, fontWeight: 600, align: "right", sizeMode: "auto" },
    max_score: { x: 58, y: 46, width: 26, height: 8, fontSize: 24, fontWeight: 600, align: "left", sizeMode: "auto" },
    meta: { x: 8, y: 60, width: 60, height: 12, fontSize: 16, fontWeight: 500, align: "left", sizeMode: "fixed" },
    signature: { x: 92, y: 88, width: 22, height: 6, fontSize: 18, fontWeight: 600, align: "right", sizeMode: "auto" },
    id: { x: 8, y: 94, width: 36, height: 4, fontSize: 12, fontWeight: 500, align: "left", sizeMode: "auto" },
    qr: { x: 90, y: 13, width: 10, height: 14, fontSize: 12, fontWeight: 600, align: "left", sizeMode: "fixed" },
  };
}

function buildStudyCodVisualCss(params: {
  theme: StudyCodThemePreset;
  backgroundImageUrl: string;
  layout: GlobalCertLayoutState;
  hiddenBlocks: Record<GlobalCertBlockKey, boolean>;
  extraObjects: GlobalCertExtraObject[];
  extraCss: string;
}): string {
  const base = buildStudyCodPresetCss(params.theme, params.backgroundImageUrl);
  const selectorMap: Record<GlobalCertBlockKey, string> = {
    brand: ".brand",
    title: ".title",
    subtitle: ".subtitle",
    name: ".name",
    full_name: ".full_name",
    score: ".score",
    max_score: ".max_score",
    meta: ".meta",
    signature: ".signature",
    id: ".id",
    qr: ".qr",
  };

  const rules = GLOBAL_CERT_BLOCK_KEYS.map((key) => {
    const l = params.layout[key];
    const x = clampNumber(Number(l?.x ?? 0), 0, 100);
    const y = clampNumber(Number(l?.y ?? 0), 0, 100);
    const width = clampNumber(Number(l?.width ?? 20), 6, 96);
    const height = clampNumber(Number(l?.height ?? 6), 2, 80);
    const fontSize = clampNumber(Number(l?.fontSize ?? 16), 10, 96);
    const fontWeight = clampNumber(Number(l?.fontWeight ?? 500), 300, 900);
    const align = l?.align === "center" || l?.align === "right" ? l.align : "left";
    const sizeMode = l?.sizeMode === "auto" || l?.sizeMode === "stretch" ? l.sizeMode : "fixed";
    const transform = align === "center" ? "translate(-50%, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
    const selector = selectorMap[key];
    if (params.hiddenBlocks[key]) {
      return `${selector} { display: none !important; }`;
    }
    if (key === "qr") {
      return `${selector} { position: absolute; left: ${x}%; top: ${y}%; width: ${width}%; height: ${height}%; object-fit: contain; transform: ${transform}; margin: 0; }`;
    }
    if (sizeMode === "stretch") {
      return `${selector} { position: absolute; left: ${x}%; top: ${y}%; width: ${width}%; min-height: ${height}%; display: block; transform: ${transform}; text-align: ${align}; margin: 0; font-size: ${fontSize}px; font-weight: ${fontWeight}; line-height: 1.2; white-space: pre-wrap; overflow-wrap: anywhere; }`;
    }
    if (sizeMode === "auto") {
      return `${selector} { position: absolute; left: ${x}%; top: ${y}%; width: auto; min-width: 0; max-width: ${width}%; height: auto; min-height: ${height}%; display: block; transform: ${transform}; text-align: ${align}; margin: 0; font-size: ${fontSize}px; font-weight: ${fontWeight}; line-height: 1.2; white-space: pre-wrap; overflow-wrap: anywhere; }`;
    }
    return `${selector} { position: absolute; left: ${x}%; top: ${y}%; width: ${width}%; min-height: ${height}%; display: block; transform: ${transform}; text-align: ${align}; margin: 0; font-size: ${fontSize}px; font-weight: ${fontWeight}; line-height: 1.2; white-space: pre-wrap; overflow-wrap: anywhere; }`;
  });

  const visualScaffold = [
    ".certificate { position: relative; overflow: hidden; }",
    ".meta { line-height: 1.5; }",
    ...rules,
  ].join("\n");
  const extrasOverlayCss = buildGlobalCertExtraObjectsOverlayCss(params.extraObjects);

  return [base, visualScaffold, extrasOverlayCss, String(params.extraCss ?? "").trim()].filter(Boolean).join("\n\n");
}

function buildGlobalStudyCodPreviewSrcDoc(css: string): string {
  const html = `
<div class="certificate">
  <div class="brand">StudyCod</div>
  <div class="title">Certificate of Achievement</div>
  <div class="subtitle">This certificate is proudly presented to</div>
  <div class="name">nikitosruban007_</div>
  <div class="full_name">Ada Lovelace</div>
  <div class="score">Score: 95</div>
  <div class="max_score">/ 100</div>
  <div class="meta">Contest: StudyCod Open 2026\nDate: 2026-03-15</div>
  <div class="signature">Signature: StudyCod Team</div>
  <div class="id">ID: SC-DEMO-0001</div>
  <img class="qr" alt="qr" src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='white'/%3E%3Cpath d='M10 10h30v30H10zM80 10h30v30H80zM10 80h30v30H10z' fill='%231f2937'/%3E%3Cpath d='M55 55h10v10H55zM70 70h10v10H70zM55 85h10v10H55zM85 55h10v10H85z' fill='%230f172a'/%3E%3C/svg%3E" />
</div>`;

  return `<!doctype html><html><head><meta charset="utf-8" /><style>
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
.certificate {
  position: relative;
  width: 1123px;
  height: 794px;
  box-sizing: border-box;
  border: 2px solid #334155;
  border-radius: 12px;
  overflow: hidden;
}
${String(css ?? "")}
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

function extractCssRuleBlock(css: string, selector: string): string {
  const safeSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${safeSelector}\\s*\\{([\\s\\S]*?)\\}`, "gi");
  let last = "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    last = String(match[1] ?? "");
  }
  return last;
}

function extractCssRuleBySelectors(css: string, selectors: string[]): string {
  for (const selector of selectors) {
    const block = extractCssRuleBlock(css, selector);
    if (block.trim()) return block;
  }
  return "";
}

function extractCssDeclaration(ruleBlock: string, prop: string): string {
  const safeProp = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${safeProp}\\s*:\\s*([^;]+);?`, "i");
  const m = re.exec(String(ruleBlock ?? ""));
  return m ? String(m[1] ?? "").trim() : "";
}

function parseNumberFromCss(value: string): number | null {
  const n = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseCssPercent(ruleBlock: string, prop: string): number | null {
  const raw = extractCssDeclaration(ruleBlock, prop);
  const m = /^(-?\d+(?:\.\d+)?)%$/i.exec(raw);
  return m ? parseNumberFromCss(m[1] ?? "") : null;
}

function parseCssPixel(ruleBlock: string, prop: string): number | null {
  const raw = extractCssDeclaration(ruleBlock, prop);
  const m = /^(-?\d+(?:\.\d+)?)px$/i.exec(raw);
  return m ? parseNumberFromCss(m[1] ?? "") : null;
}

function detectAlignFromCss(ruleBlock: string): "left" | "center" | "right" {
  const transform = extractCssDeclaration(ruleBlock, "transform");
  if (transform.includes("translate(-100%")) return "right";
  if (transform.includes("translate(-50%")) return "center";
  const align = extractCssDeclaration(ruleBlock, "text-align");
  if (align === "center" || align === "right") return align;
  return "left";
}

function detectThemeFromCss(css: string): StudyCodThemePreset {
  const text = String(css ?? "").toLowerCase();
  if (text.includes("#0f172a 0%") || text.includes("background: #0b1220") || text.includes("#1e293b 100%")) return "dark";
  if (text.includes("#fff2c9") || text.includes("#7a5a00")) return "gold";
  return "classic";
}

function extractBackgroundUrlFromCss(css: string): string {
  const certRule = extractCssRuleBlock(css, ".certificate");
  const bgImage = extractCssDeclaration(certRule, "background-image");
  const m = /url\((['"]?)(.*?)\1\)/i.exec(bgImage);
  return m ? String(m[2] ?? "").trim() : "";
}

function buildBlockRuleMapFromTemplateCss(css: string): Record<GlobalCertBlockKey, string> {
  const cfBase = extractCssRuleBlock(css, ".cf-field");
  const byKey: Record<GlobalCertBlockKey, string> = {
    brand: extractCssRuleBySelectors(css, [".brand", ".cf-contest_name"]),
    title: extractCssRuleBySelectors(css, [".title"]),
    subtitle: extractCssRuleBySelectors(css, [".subtitle"]),
    name: extractCssRuleBySelectors(css, [".name", ".cf-name"]),
    full_name: extractCssRuleBySelectors(css, [".full_name", ".cf-full_name"]),
    score: extractCssRuleBySelectors(css, [".score", ".cf-score"]),
    max_score: extractCssRuleBySelectors(css, [".max_score", ".cf-max_score"]),
    meta: extractCssRuleBySelectors(css, [".meta", ".cf-organizer", ".cf-date", ".cf-place"]),
    signature: extractCssRuleBySelectors(css, [".signature", ".cf-signature"]),
    id: extractCssRuleBySelectors(css, [".id", ".cf-certificate_id"]),
    qr: extractCssRuleBySelectors(css, [".qr", ".cf-qr_code"]),
  };

  for (const key of Object.keys(byKey) as GlobalCertBlockKey[]) {
    if (!byKey[key] && cfBase) byKey[key] = cfBase;
  }
  return byKey;
}

function detectFieldsFromTemplate(html: string): Record<GlobalCertTemplateFieldKey, { isEnabled: boolean; isRequired: boolean }> {
  const nextFields = defaultGlobalCertTemplateFieldsState();
  for (const fieldKey of GLOBAL_CERT_TEMPLATE_FIELD_KEYS) {
    const hasPlaceholder = html.includes(`{{${fieldKey}}}`);
    nextFields[fieldKey] = {
      isEnabled: hasPlaceholder,
      isRequired: hasPlaceholder && nextFields[fieldKey].isRequired,
    };
  }
  return nextFields;
}

function parseCfMetaBounds(css: string): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  fontSize: number;
  fontWeight: number;
  align: "left" | "center" | "right";
} | null {
  const selectors = [".cf-place", ".cf-date", ".cf-organizer"];
  const blocks = selectors
    .map((selector) => extractCssRuleBlock(css, selector))
    .filter((v) => String(v ?? "").trim().length > 0);

  if (!blocks.length) return null;

  type Rect = {
    left: number;
    top: number;
    width: number;
    height: number;
    align: "left" | "center" | "right";
    fontSize: number;
    fontWeight: number;
  };

  const rects: Rect[] = [];
  for (const block of blocks) {
    const x = parseCssPercent(block, "left");
    const y = parseCssPercent(block, "top");
    const width = parseCssPercent(block, "width");
    if (x == null || y == null || width == null) continue;
    const height = parseCssPercent(block, "height") ?? 6;
    const align = detectAlignFromCss(block);
    const fontSize = parseCssPixel(block, "font-size") ?? 16;
    const fontWeight = parseNumberFromCss(extractCssDeclaration(block, "font-weight")) ?? 500;

    let left = x;
    if (align === "center") left = x - width / 2;
    if (align === "right") left = x - width;
    const top = y - height / 2;

    rects.push({
      left: clampNumber(left, 0, 100),
      top: clampNumber(top, 0, 100),
      width: clampNumber(width, 2, 100),
      height: clampNumber(height, 2, 100),
      align,
      fontSize,
      fontWeight,
    });
  }

  if (!rects.length) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let fontSizeSum = 0;
  let fontWeightSum = 0;
  let centerCount = 0;
  let rightCount = 0;
  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
    fontSizeSum += r.fontSize;
    fontWeightSum += r.fontWeight;
    if (r.align === "center") centerCount += 1;
    if (r.align === "right") rightCount += 1;
  }

  const align: "left" | "center" | "right" = centerCount >= rightCount && centerCount >= 1
    ? "center"
    : rightCount > centerCount
      ? "right"
      : "left";

  return {
    left: clampNumber(left, 0, 100),
    top: clampNumber(top, 0, 100),
    right: clampNumber(right, 0, 100),
    bottom: clampNumber(bottom, 0, 100),
    fontSize: clampNumber(fontSizeSum / rects.length, 10, 96),
    fontWeight: clampNumber(fontWeightSum / rects.length, 300, 900),
    align,
  };
}

function parseCfScoreBounds(css: string): {
  score: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
  maxScore: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
} | null {
  const scoreBlock = extractCssRuleBlock(css, ".cf-score");
  const maxBlock = extractCssRuleBlock(css, ".cf-max_score");
  if (!scoreBlock.trim() || !maxBlock.trim()) return null;

  const toLayoutLike = (block: string) => {
    const x = parseCssPercent(block, "left");
    const y = parseCssPercent(block, "top");
    const width = parseCssPercent(block, "width");
    if (x == null || y == null || width == null) return null;
    const height = parseCssPercent(block, "height") ?? 8;
    const align = detectAlignFromCss(block);
    const fontSize = parseCssPixel(block, "font-size") ?? 22;
    const fontWeight = parseNumberFromCss(extractCssDeclaration(block, "font-weight")) ?? 600;
    return {
      x: clampNumber(x, 0, 100),
      y: clampNumber(y, 0, 100),
      width: clampNumber(width, 6, 96),
      height: clampNumber(height, 2, 80),
      fontSize: clampNumber(fontSize, 10, 96),
      fontWeight: clampNumber(fontWeight, 300, 900),
      align,
    };
  };

  const score = toLayoutLike(scoreBlock);
  const maxScore = toLayoutLike(maxBlock);
  if (!score || !maxScore) return null;

  return { score, maxScore };
}

function parseCfNameBounds(css: string): {
  name: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
  fullName: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
} | null {
  const nameBlock = extractCssRuleBlock(css, ".cf-name");
  const fullNameBlock = extractCssRuleBlock(css, ".cf-full_name");
  if (!nameBlock.trim() || !fullNameBlock.trim()) return null;

  const toLayoutLike = (block: string, fallbackSize: number) => {
    const x = parseCssPercent(block, "left");
    const y = parseCssPercent(block, "top");
    const width = parseCssPercent(block, "width");
    if (x == null || y == null || width == null) return null;
    const height = parseCssPercent(block, "height") ?? 8;
    const align = detectAlignFromCss(block);
    const fontSize = parseCssPixel(block, "font-size") ?? fallbackSize;
    const fontWeight = parseNumberFromCss(extractCssDeclaration(block, "font-weight")) ?? 700;
    return {
      x: clampNumber(x, 0, 100),
      y: clampNumber(y, 0, 100),
      width: clampNumber(width, 6, 96),
      height: clampNumber(height, 2, 80),
      fontSize: clampNumber(fontSize, 10, 96),
      fontWeight: clampNumber(fontWeight, 300, 900),
      align,
    };
  };

  const name = toLayoutLike(nameBlock, 34);
  const fullName = toLayoutLike(fullNameBlock, 42);
  if (!name || !fullName) return null;
  return { name, fullName };
}

function parseCfAnchorBounds(css: string): {
  brand?: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
  signature?: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
  id?: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
  qr?: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    align: "left" | "center" | "right";
  };
} {
  const toLayoutLike = (block: string, fallbackSize: number, fallbackWeight: number) => {
    const x = parseCssPercent(block, "left");
    const y = parseCssPercent(block, "top");
    const width = parseCssPercent(block, "width");
    if (x == null || y == null || width == null) return null;
    const height = parseCssPercent(block, "height") ?? 6;
    const align = detectAlignFromCss(block);
    const fontSize = parseCssPixel(block, "font-size") ?? fallbackSize;
    const fontWeight = parseNumberFromCss(extractCssDeclaration(block, "font-weight")) ?? fallbackWeight;
    return {
      x: clampNumber(x, 0, 100),
      y: clampNumber(y, 0, 100),
      width: clampNumber(width, 6, 96),
      height: clampNumber(height, 2, 80),
      fontSize: clampNumber(fontSize, 10, 96),
      fontWeight: clampNumber(fontWeight, 300, 900),
      align,
    };
  };

  const brandBlock = extractCssRuleBlock(css, ".cf-contest_name");
  const signatureBlock = extractCssRuleBlock(css, ".cf-signature");
  const idBlock = extractCssRuleBlock(css, ".cf-certificate_id");
  const qrBlock = extractCssRuleBlock(css, ".cf-qr_code");

  return {
    brand: brandBlock.trim() ? toLayoutLike(brandBlock, 28, 700) ?? undefined : undefined,
    signature: signatureBlock.trim() ? toLayoutLike(signatureBlock, 16, 500) ?? undefined : undefined,
    id: idBlock.trim() ? toLayoutLike(idBlock, 12, 500) ?? undefined : undefined,
    qr: qrBlock.trim() ? toLayoutLike(qrBlock, 12, 600) ?? undefined : undefined,
  };
}

function defaultGlobalCertHiddenBlocksState(): Record<GlobalCertBlockKey, boolean> {
  return {
    brand: false,
    title: false,
    subtitle: false,
    name: false,
    full_name: false,
    score: false,
    max_score: false,
    meta: false,
    signature: false,
    id: false,
    qr: false,
  };
}

function buildGlobalStudyCodTemplateHtmlWithVisibility(
  fields: Record<GlobalCertTemplateFieldKey, { isEnabled: boolean; isRequired: boolean }>,
  hiddenBlocks: Record<GlobalCertBlockKey, boolean>
): string {
  const visible = (key: GlobalCertBlockKey): boolean => !Boolean(hiddenBlocks[key]);
  return `<div class="certificate">
  ${visible("brand") ? (fields.contest_name.isEnabled ? '<div class="brand">{{contest_name}}</div>' : '<div class="brand">StudyCod</div>') : ""}
  ${visible("title") ? '<div class="title">Certificate of Achievement</div>' : ""}
  ${visible("subtitle") ? '<div class="subtitle">This certificate is proudly presented to</div>' : ""}
  ${(fields.name.isEnabled && visible("name")) ? '<div class="name">{{name}}</div>' : ""}
  ${(fields.full_name.isEnabled && visible("full_name")) ? '<div class="full_name">{{full_name}}</div>' : ""}
  ${(fields.score.isEnabled && visible("score")) ? '<div class="score">Score: {{score}}</div>' : ""}
  ${(fields.max_score.isEnabled && visible("max_score")) ? '<div class="max_score">/ {{max_score}}</div>' : ""}
  ${visible("meta") ? `<div class="meta">${fields.place.isEnabled ? "Place: {{place}}<br />" : ""}${fields.date.isEnabled ? "Date: {{date}}<br />" : ""}${fields.organizer.isEnabled ? "Organizer: {{organizer}}" : ""}</div>` : ""}
  ${(fields.signature.isEnabled && visible("signature")) ? '<div class="signature">Signature: {{signature}}</div>' : ""}
  ${(fields.certificate_id.isEnabled && visible("id")) ? '<div class="id">ID: {{certificate_id}}</div>' : ""}
  ${(fields.qr_code.isEnabled && visible("qr")) ? '<img class="qr" alt="qr" src="{{qr_code}}" />' : ""}
</div>`;
}

const SortableMaterialTopicRow: React.FC<{
  topic: AdminMaterialTopic;
  selected: boolean;
  onSelect: () => void;
}> = ({ topic, selected, onSelect }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: topic.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-stretch gap-2 rounded-md border transition-fast ${selected ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
      <button onClick={onSelect} className="flex-1 text-left px-3 py-2 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-mono text-text-primary truncate">{topic.order}. {topic.title}</div>
            <div className="mt-0.5 text-[11px] font-mono text-text-secondary truncate">
              {topic.theoryBlock ? `Theory v${topic.theoryBlock.version}` : "No theory"}
            </div>
          </div>
        </div>
      </button>

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="px-2 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </div>
  );
};

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    t
  } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [judgeLoad, setJudgeLoad] = useState<AdminJudgeLoad | null>(null);
  const [judgeDeadLetterItems, setJudgeDeadLetterItems] = useState<AdminJudgeDeadLetterItem[]>([]);
  const [judgeDeadLetterTotal, setJudgeDeadLetterTotal] = useState(0);
  const [judgeDeadLetterLimit, setJudgeDeadLetterLimit] = useState("20");
  const [judgeDeadLetterLoading, setJudgeDeadLetterLoading] = useState(false);
  const [judgeDeadLetterReplaying, setJudgeDeadLetterReplaying] = useState(false);
  const [judgeDeadLetterLastReplay, setJudgeDeadLetterLastReplay] = useState<AdminJudgeDeadLetterReplayResult | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersFilter, setUsersFilter] = useState<{
    role?: string;
    userMode?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState<AdminClass | null>(null);
  const [showDeleteClassConfirm, setShowDeleteClassConfirm] = useState(false);
  const [classToDelete, setClassToDelete] = useState<number | null>(null);

  // Materials (global topics & theory by language)
  const [materialsLanguage, setMaterialsLanguage] = useState<MaterialsLanguage>("JAVA");
  const [materialsTopics, setMaterialsTopics] = useState<AdminMaterialTopic[]>([]);
  const [materialsSelectedTopicId, setMaterialsSelectedTopicId] = useState<number | null>(null);
  const [materialsSelectedTopic, setMaterialsSelectedTopic] = useState<AdminMaterialTopic | null>(null);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsTranslatingEn, setMaterialsTranslatingEn] = useState(false);
  const [materialsDirty, setMaterialsDirty] = useState(false);
  const [materialsReordering, setMaterialsReordering] = useState(false);
  const [materialsRepoSyncing, setMaterialsRepoSyncing] = useState(false);

  const [materialsDiagnostics, setMaterialsDiagnostics] = useState<AdminMaterialsDiagnostics | null>(null);
  const [materialsLegacyImporting, setMaterialsLegacyImporting] = useState(false);

  const [materialsTheoryDirty, setMaterialsTheoryDirty] = useState(false);
  const [materialsAutoSaveState, setMaterialsAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const materialsAutoSaveSeq = useRef(0);

  const [showTheoryHistory, setShowTheoryHistory] = useState(false);
  const [theoryHistoryLoading, setTheoryHistoryLoading] = useState(false);
  const [theoryRevisions, setTheoryRevisions] = useState<AdminTheoryBlockRevision[]>([]);
  const [theorySelectedVersion, setTheorySelectedVersion] = useState<number | null>(null);
  const [theorySelectedSnapshot, setTheorySelectedSnapshot] = useState<{ title: string; content: string; level: number | null; tags: unknown } | null>(null);
  const [theoryRollbackBusy, setTheoryRollbackBusy] = useState(false);
  const [theoryRollbackComment, setTheoryRollbackComment] = useState("");

  const [showCreateMaterialTopic, setShowCreateMaterialTopic] = useState(false);
  const [creatingMaterialTopic, setCreatingMaterialTopic] = useState(false);
  const [newMaterialTopic, setNewMaterialTopic] = useState<{
    title: string;
    description: string;
    order: string;
    language: MaterialsLanguage;
    theoryContent: string;
  }>({
    title: "",
    description: "",
    order: "",
    language: "JAVA",
    theoryContent: ""
  });
  const [showDeleteMaterialConfirm, setShowDeleteMaterialConfirm] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<AdminMaterialTopic | null>(null);
  const [materialDraft, setMaterialDraft] = useState<{
    title: string;
    description: string;
    order: string;
    language: MaterialsLanguage;
    theoryTitle: string;
    theoryContent: string;
  } | null>(null);
  const [materialPreview, setMaterialPreview] = useState(false);

  const [showImportMaterialsYaml, setShowImportMaterialsYaml] = useState(false);
  const [materialsYamlText, setMaterialsYamlText] = useState<string>("");
  const [materialsYamlMode, setMaterialsYamlMode] = useState<"merge" | "replace">("merge");
  const [materialsYamlImporting, setMaterialsYamlImporting] = useState(false);
  const [materialsYamlFileKey, setMaterialsYamlFileKey] = useState(0);

  const [libraryStatus, setLibraryStatus] = useState<AdminLibraryTaskStatus>("PENDING");
  const [libraryTasks, setLibraryTasks] = useState<AdminLibraryTask[]>([]);
  const [librarySelectedTaskId, setLibrarySelectedTaskId] = useState<number | null>(null);
  const [librarySelectedTask, setLibrarySelectedTask] = useState<AdminLibraryTask | null>(null);
  const [libraryRejectReason, setLibraryRejectReason] = useState("");
  const [libraryActing, setLibraryActing] = useState(false);

  const [supportTickets, setSupportTickets] = useState<AdminSupportTicket[]>([]);
  const [supportView, setSupportView] = useState<"chat" | "legacy">("chat");
  const [supportConversations, setSupportConversations] = useState<AdminSupportChatConversation[]>([]);
  const [supportSelectedConversationId, setSupportSelectedConversationId] = useState<number | null>(null);
  const [supportMessages, setSupportMessages] = useState<AdminSupportChatMessage[]>([]);
  const [supportChatLoading, setSupportChatLoading] = useState(false);
  const [supportChatReplyText, setSupportChatReplyText] = useState("");
  const [supportChatSendEmail, setSupportChatSendEmail] = useState(true);
  const [showSupportTicket, setShowSupportTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState | null>(null);
  const [maintenanceTitle, setMaintenanceTitle] = useState("Технічне обслуговування");
  const [maintenanceMessage, setMaintenanceMessage] = useState("Ми тимчасово виконуємо оновлення. Спробуйте трохи пізніше.");
  const [maintenanceUntil, setMaintenanceUntil] = useState<string>("");
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  // Emails (admin broadcast)
  const [emailSubject, setEmailSubject] = useState("");
  const [emailTitle, setEmailTitle] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [emailDelivery, setEmailDelivery] = useState<"MARKETING" | "NOTIFICATION">("MARKETING");
  const [emailAudience, setEmailAudience] = useState<"ALL" | "USERS" | "STUDENTS">("ALL");
  const [emailIncludeSubscribed, setEmailIncludeSubscribed] = useState(true);
  const [emailNotifyAllUsers, setEmailNotifyAllUsers] = useState(false);
  const [emailNotifyAllUsersConfirm, setEmailNotifyAllUsersConfirm] = useState("");
  const [emailRecipientUserIds, setEmailRecipientUserIds] = useState("");
  const [emailRecipientEmails, setEmailRecipientEmails] = useState("");
  const [emailSelectedClassIds, setEmailSelectedClassIds] = useState<number[]>([]);
  const [emailDryRun, setEmailDryRun] = useState(true);
  const [emailLimit, setEmailLimit] = useState("5000");
  const [emailSending, setEmailSending] = useState(false);
  const [emailLastResult, setEmailLastResult] = useState<AdminBroadcastDryRunResult | AdminBroadcastSendResult | null>(null);

  // Global certificates (StudyCod base template)
  const [globalCertTheme, setGlobalCertTheme] = useState<StudyCodThemePreset>("classic");
  const [globalCertBackgroundUrl, setGlobalCertBackgroundUrl] = useState("");
  const [globalCertExtraCss, setGlobalCertExtraCss] = useState("");
  const [globalCertFields, setGlobalCertFields] = useState<Record<GlobalCertTemplateFieldKey, { isEnabled: boolean; isRequired: boolean }>>(() => defaultGlobalCertTemplateFieldsState());
  const [globalCertTemplateHtml, setGlobalCertTemplateHtml] = useState("");
  const [globalCertTemplateCss, setGlobalCertTemplateCss] = useState("");
  const [globalCertEditorMode, setGlobalCertEditorMode] = useState<"visual" | "advanced">("visual");
  const [globalCertLayout, setGlobalCertLayout] = useState<GlobalCertLayoutState>(() => defaultGlobalCertLayoutState());
  const [globalCertHiddenBlocks, setGlobalCertHiddenBlocks] = useState<Record<GlobalCertBlockKey, boolean>>(() => defaultGlobalCertHiddenBlocksState());
  const [globalCertSelectedBlock, setGlobalCertSelectedBlock] = useState<GlobalCertBlockKey>("name");
  const [globalCertExtraObjects, setGlobalCertExtraObjects] = useState<GlobalCertExtraObject[]>([]);
  const [globalCertSelectedExtraObjectId, setGlobalCertSelectedExtraObjectId] = useState<string | null>(null);
  const [globalCertDraggingExtraObjectId, setGlobalCertDraggingExtraObjectId] = useState<string | null>(null);
  const [globalCertResizingExtraObjectId, setGlobalCertResizingExtraObjectId] = useState<string | null>(null);
  const [globalCertDraggingBlock, setGlobalCertDraggingBlock] = useState<GlobalCertBlockKey | null>(null);
  const [globalCertResizingBlock, setGlobalCertResizingBlock] = useState<GlobalCertBlockKey | null>(null);
  const [globalCertResizeMode, setGlobalCertResizeMode] = useState<ResizeMode>("proportional");
  const [globalCertResizeStart, setGlobalCertResizeStart] = useState<{ clientX: number; clientY: number; width: number; height: number } | null>(null);
  const [globalCertExtraResizeStart, setGlobalCertExtraResizeStart] = useState<{
    clientX: number;
    clientY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    align: "left" | "center" | "right";
    edge: "left" | "right" | "top" | "bottom";
  } | null>(null);
  const [globalCertCanvasContextMenu, setGlobalCertCanvasContextMenu] = useState<{ left: number; top: number; x: number; y: number } | null>(null);
  const [globalCertSnapEnabled, setGlobalCertSnapEnabled] = useState(true);
  const [globalCertSnapStep, setGlobalCertSnapStep] = useState(2);
  const globalCertCanvasRef = useRef<HTMLDivElement | null>(null);
  const globalCertDragOriginRef = useRef<{
    kind: "block" | "extra";
    keyOrId: string;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);
  const [globalCertCreating, setGlobalCertCreating] = useState(false);
  const [globalCertTemplateId, setGlobalCertTemplateId] = useState("");
  const [globalCertMessage, setGlobalCertMessage] = useState<string | null>(null);
  const [globalCertPublishOpen, setGlobalCertPublishOpen] = useState(false);
  const [globalCertPublishName, setGlobalCertPublishName] = useState("StudyCod Global Template");
  const [globalCertPublishBusy, setGlobalCertPublishBusy] = useState(false);
  const [certificateTemplateLibrary, setCertificateTemplateLibrary] = useState<CertificateTemplateListItem[]>([]);
  const [certificateTemplateLibraryLoading, setCertificateTemplateLibraryLoading] = useState(false);
  const [certificateTemplateLibraryError, setCertificateTemplateLibraryError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState<CreateUserData>({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "USER",
    userMode: "PERSONAL",
    lang: "JAVA"
  });
  const [editUser, setEditUser] = useState<UpdateUserData>({});
  const [newClass, setNewClass] = useState<CreateClassData>({
    name: "",
    language: "JAVA",
    teacherId: 0
  });
  const [editClass, setEditClass] = useState<Partial<CreateClassData>>({});
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  useEffect(() => {
    loadData();
  }, [activeTab, usersPage, usersFilter, supportView, libraryStatus, materialsLanguage]);

  const syncMaterialsFromRepoMenu = async () => {
    if (materialsRepoSyncing) return;

    if ((materialsDirty || materialsTheoryDirty) && activeTab === "materials") {
      const ok = window.confirm("You have unsaved changes in the materials editor. Sync will reload topics from the repo menu and may overwrite your draft. Continue?");
      if (!ok) return;
    }

    setMaterialsRepoSyncing(true);
    try {
      const res = await syncAdminMaterialTopicsFromRepo({
        language: materialsLanguage,
        mode: "merge"
      });

      const list = res.topics || [];
      setMaterialsTopics(list);

      const selected = materialsSelectedTopicId ? list.find(t => t.id === materialsSelectedTopicId) : list[0];
      setMaterialsSelectedTopic(selected || null);
      setMaterialsSelectedTopicId(selected?.id ?? null);
      setMaterialDraft(selected ? {
        title: selected.title,
        description: selected.description || "",
        order: String(selected.order ?? 0),
        language: selected.language,
        theoryTitle: selected.theoryBlock?.title || selected.title,
        theoryContent: selected.theoryBlock?.content || ""
      } : null);
      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");

      try {
        const diag = await getAdminMaterialsDiagnostics({ language: materialsLanguage });
        setMaterialsDiagnostics(diag);
      } catch {
        // ignore
      }

      const sourceFilePath = extractSourceFilePath(res?.source);
      const src = sourceFilePath ? ` (${sourceFilePath})` : "";
      showToast({
        type: "success",
        message: `Synced from repo menu${src}. created=${res.created}, updated=${res.updated}, skipped=${res.skipped}`
      });
    } catch (error: unknown) {
      const data = getErrorData(error);
      const msg = data?.message || "Failed to sync from repo menu";
      const hint = data?.hint ? `\n\nHint: ${String(data.hint)}` : "";
      const detail = data?.detail ? `\n\nDetail: ${String(data.detail)}` : "";
      const details = data?.details
        ? `\n\nDetails: ${typeof data.details === "string" ? String(data.details) : JSON.stringify(data.details)}`
        : "";
      const fp = data?.filePath ? `\n\nFile: ${String(data.filePath)}` : "";
      const code = data?.code ? `\n\nCode: ${String(data.code)}` : "";
      const issuesText = formatErrorIssues(data?.errors);
      const issues = issuesText
        ? `\n\nErrors: ${issuesText}`
        : "";
      showToast({
        type: "error",
        message: String(msg) + hint + detail + details + fp + code + issues,
        durationMs: 6500
      });
    } finally {
      setMaterialsRepoSyncing(false);
    }
  };

  const importMaterialsFromLegacyDb = async () => {
    if (materialsLegacyImporting) return;
    if (materialsLanguage === "CPP") {
      showToast({
        type: "info",
        message: "Legacy import is only available for JAVA/PYTHON (EDU tables). For CPP, use 'Sync from repo' or 'Import YAML'."
      });
      return;
    }
    setMaterialsLegacyImporting(true);
    try {
      const res = await importAdminMaterialTopicsLegacy({
        language: materialsLanguage,
        mode: "merge"
      });
      const list = res.topics || [];
      setMaterialsTopics(list);

      const selected = list[0] || null;
      setMaterialsSelectedTopic(selected);
      setMaterialsSelectedTopicId(selected?.id ?? null);
      setMaterialDraft(selected ? {
        title: selected.title,
        description: selected.description || "",
        order: String(selected.order ?? 0),
        language: selected.language,
        theoryTitle: selected.theoryBlock?.title || selected.title,
        theoryContent: selected.theoryBlock?.content || ""
      } : null);
      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");

      try {
        const diag = await getAdminMaterialsDiagnostics({ language: materialsLanguage });
        setMaterialsDiagnostics(diag);
      } catch {
        // ignore
      }

      showToast({
        type: "success",
        message: `Imported from legacy DB. created=${res.created}, updated=${res.updated}, skipped=${res.skipped}`
      });
    } catch (error: unknown) {
      showToast({
        type: "error",
        message: getErrorMessage(error, "Failed to import legacy topics")
      });
    } finally {
      setMaterialsLegacyImporting(false);
    }
  };
  useEffect(() => {
    if (activeTab === "classes") {
      loadTeachers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "materials") return;
    if (!materialsSelectedTopic || !materialDraft) return;
    if (!materialsTheoryDirty) return;
    if (materialsSaving || materialsReordering) return;

    const content = materialDraft.theoryContent.trim();
    const title = (materialDraft.theoryTitle || materialDraft.title).trim();
    if (!content || !title) return;

    const seq = ++materialsAutoSaveSeq.current;
    const timer = window.setTimeout(async () => {
      // Ignore if a newer autosave request is scheduled.
      if (seq !== materialsAutoSaveSeq.current) return;

      setMaterialsAutoSaveState("saving");
      try {
        const res = await updateAdminMaterialTopic(materialsSelectedTopic.id, {
          theory: {
            title,
            content
          },
          theoryRevisionAction: "AUTO"
        });
        if (seq !== materialsAutoSaveSeq.current) return;

        const updated = res.topic;
        setMaterialsTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
        setMaterialsSelectedTopic(updated);
        setMaterialsTheoryDirty(false);
        setMaterialsAutoSaveState("saved");
        window.setTimeout(() => {
          setMaterialsAutoSaveState(s => s === "saved" ? "idle" : s);
        }, 1500);
      } catch (error: unknown) {
        if (seq !== materialsAutoSaveSeq.current) return;
        setMaterialsAutoSaveState("error");
      }
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTab, materialsSelectedTopic?.id, materialDraft?.theoryTitle, materialDraft?.theoryContent, materialsTheoryDirty, materialsSaving, materialsReordering]);

  const parseJudgeDeadLetterLimit = (max = 200): number => {
    const parsed = Number.parseInt(judgeDeadLetterLimit, 10);
    if (!Number.isFinite(parsed)) return 20;
    return Math.max(1, Math.min(max, parsed));
  };

  const refreshJudgeDeadLetter = async (silent = false) => {
    const limit = parseJudgeDeadLetterLimit(200);
    if (!silent) setJudgeDeadLetterLoading(true);
    try {
      const data = await getAdminJudgeDeadLetter({ limit });
      setJudgeDeadLetterItems(data.items || []);
      setJudgeDeadLetterTotal(Number.isFinite(data.total) ? data.total : (data.items || []).length);
    } catch (error: unknown) {
      if (!silent) {
        showToast({ type: "error", message: getErrorMessage(error, "Failed to load dead-letter queue") });
      }
    } finally {
      if (!silent) setJudgeDeadLetterLoading(false);
    }
  };

  const handleReplayJudgeDeadLetter = async () => {
    const limit = parseJudgeDeadLetterLimit(500);
    setJudgeDeadLetterReplaying(true);
    try {
      const replay = await replayAdminJudgeDeadLetter({ limit });
      setJudgeDeadLetterLastReplay(replay);

      const [latestLoad, latestDeadLetter] = await Promise.all([
        getAdminJudgeLoad().catch(() => null),
        getAdminJudgeDeadLetter({ limit: parseJudgeDeadLetterLimit(200) }).catch(() => null)
      ]);

      if (latestLoad) {
        setJudgeLoad(latestLoad);
      }

      if (latestDeadLetter) {
        setJudgeDeadLetterItems(latestDeadLetter.items || []);
        setJudgeDeadLetterTotal(Number.isFinite(latestDeadLetter.total) ? latestDeadLetter.total : (latestDeadLetter.items || []).length);
      }

      if (replay.mode !== "distributed") {
        showToast({
          type: "info",
          message: "Dead-letter replay is available only in distributed queue mode"
        });
      } else {
        showToast({
          type: replay.moved > 0 ? "success" : "info",
          message: `DLQ replay: moved=${replay.moved}, skipped=${replay.skipped}, remaining=${replay.remaining}`
        });
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to replay dead-letter jobs") });
    } finally {
      setJudgeDeadLetterReplaying(false);
    }
  };

  const loadTeachers = async () => {
    try {
      const teachersData = await getAdminUsers({
        role: "TEACHER",
        limit: 100
      });
      setTeachers(teachersData.users);
    } catch (error) {
      console.error("Failed to load teachers:", error);
      showToast({ type: "error", message: getErrorMessage(error, "Failed to load teachers") });
    }
  };
  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "stats") {
        const deadLetterLimit = parseJudgeDeadLetterLimit(200);
        const [statsData, judgeLoadData, deadLetterData] = await Promise.all([
          getAdminStats(),
          getAdminJudgeLoad().catch(() => null),
          getAdminJudgeDeadLetter({ limit: deadLetterLimit }).catch(() => null)
        ]);
        setStats(statsData);
        setJudgeLoad(judgeLoadData);
        setJudgeDeadLetterItems(deadLetterData?.items || []);
        setJudgeDeadLetterTotal(
          Number.isFinite(deadLetterData?.total ?? NaN)
            ? Number(deadLetterData?.total)
            : (deadLetterData?.items || []).length
        );
      } else if (activeTab === "users") {
        const usersData = await getAdminUsers({
          page: usersPage,
          limit: 20,
          ...usersFilter
        });
        setUsers(usersData.users);
        setUsersTotal(usersData.pagination.total);
      } else if (activeTab === "classes") {
        const classesData = await getAdminClasses();
        setClasses(classesData.classes);
      } else if (activeTab === "materials") {
        const data = await getAdminMaterialTopics({
          language: materialsLanguage
        });
        const list = data.topics || [];
        setMaterialsTopics(list);

        // Diagnostics: helps explain why list is empty (legacy topics, class topics, etc.)
        try {
          const diag = await getAdminMaterialsDiagnostics({ language: materialsLanguage });
          setMaterialsDiagnostics(diag);
        } catch {
          setMaterialsDiagnostics(null);
        }

        const selected = materialsSelectedTopicId ? list.find(t => t.id === materialsSelectedTopicId) : list[0];
        setMaterialsSelectedTopic(selected || null);
        setMaterialsSelectedTopicId(selected?.id ?? null);
        setMaterialDraft(selected ? {
          title: selected.title,
          description: selected.description || "",
          order: String(selected.order ?? 0),
          language: selected.language,
          theoryTitle: selected.theoryBlock?.title || selected.title,
          theoryContent: selected.theoryBlock?.content || ""
        } : null);
        setMaterialsDirty(false);
        setMaterialsTheoryDirty(false);
        setMaterialsAutoSaveState("idle");
      } else if (activeTab === "library") {
        const data = await getAdminLibraryTasks({
          status: libraryStatus
        });
        setLibraryTasks(data.tasks);
        const selected = librarySelectedTaskId ? data.tasks.find(t => t.id === librarySelectedTaskId) : data.tasks[0];
        setLibrarySelectedTask(selected || null);
        setLibrarySelectedTaskId(selected?.id ?? null);
        if ((selected?.status ?? libraryStatus) !== "REJECTED") {
          setLibraryRejectReason("");
        }
      } else if (activeTab === "support") {
        if (supportView === "legacy") {
          const data = await getAdminSupportTickets();
          setSupportTickets(data.tickets);
        } else {
          const data = await getAdminSupportConversations();
          setSupportConversations(data.conversations);
          if (!supportSelectedConversationId && data.conversations?.length) {
            setSupportSelectedConversationId(data.conversations[0].id);
          }
        }
      } else if (activeTab === "maintenance") {
        const data = await getAdminMaintenance();
        setMaintenanceState(data.state);
        setMaintenanceTitle(data.state.title || "Технічне обслуговування");
        setMaintenanceMessage(data.state.message || "");
        setMaintenanceUntil(toDatetimeLocalValue(data.state.until));
      } else if (activeTab === "emails") {
        // Need classes list for class-targeted emails.
        const classesData = await getAdminClasses();
        setClasses(classesData.classes);
      }
    } catch (error: unknown) {
      console.error("Failed to load data:", error);
      if (getErrorStatus(error) === 403) {
        showToast({
          type: "error",
          message: "Access denied. Only SYSTEM_ADMIN can access this page."
        });
        navigate("/");
      } else {
        showToast({
          type: "error",
          message: getErrorMessage(error, "Failed to load admin data")
        });
      }
    } finally {
      setLoading(false);
    }
  };
  const handleEnableOrUpdateMaintenance = async () => {
    const title = maintenanceTitle.trim();
    const message = maintenanceMessage.trim();
    if (!title) {
      showToast({ type: "error", message: "Title is required" });
      return;
    }
    if (!message) {
      showToast({ type: "error", message: "Message is required" });
      return;
    }
    setMaintenanceSaving(true);
    try {
      const untilIso = maintenanceUntil ? new Date(maintenanceUntil).toISOString() : null;
      const res = await enableAdminMaintenance({
        title,
        message,
        until: untilIso
      });
      setMaintenanceState(res.state);
      window.dispatchEvent(new CustomEvent("studycod:adminMaintenance", {
        detail: {
          enabled: !!res.state.enabled
        }
      }));
      showToast({ type: "success", message: "Maintenance enabled/updated" });
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to enable maintenance") });
    } finally {
      setMaintenanceSaving(false);
    }
  };
  const handleDisableMaintenance = async () => {
    setMaintenanceSaving(true);
    try {
      const res = await disableAdminMaintenance();
      setMaintenanceState(res.state);
      window.dispatchEvent(new CustomEvent("studycod:adminMaintenance", {
        detail: {
          enabled: !!res.state.enabled
        }
      }));
      showToast({ type: "success", message: "Maintenance disabled" });
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to disable maintenance") });
    } finally {
      setMaintenanceSaving(false);
    }
  };
  const openSupportTicket = (t: AdminSupportTicket) => {
    setSelectedTicket(t);
    setReplyText("");
    setShowSupportTicket(true);
  };

  const openSupportConversation = async (conversationId: number) => {
    setSupportSelectedConversationId(conversationId);
    setSupportChatLoading(true);
    try {
      const data = await getAdminSupportConversation(conversationId);
      setSupportMessages(data.messages || []);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to load conversation") });
    } finally {
      setSupportChatLoading(false);
    }
  };

  const handleAdminSupportReply = async () => {
    if (!supportSelectedConversationId) return;
    const trimmed = supportChatReplyText.trim();
    if (!trimmed) {
      showToast({ type: "error", message: "Reply text is required" });
      return;
    }
    setSupportChatLoading(true);
    try {
      const res = await postAdminSupportConversationMessage(supportSelectedConversationId, {
        text: trimmed,
        sendEmail: supportChatSendEmail
      });
      setSupportChatReplyText("");
      setSupportMessages(prev => [...prev, {
        id: res.message.id,
        senderType: "ADMIN",
        text: res.message.text,
        createdAt: res.message.createdAt,
        attachments: []
      }]);
      const list = await getAdminSupportConversations();
      setSupportConversations(list.conversations);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to send reply") });
    } finally {
      setSupportChatLoading(false);
    }
  };

  const downloadAdminAttachment = async (attachmentId: number) => {
    try {
      const { blob, filename } = await downloadSupportChatAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to download") });
    }
  };

  const selectLibraryTask = (taskId: number) => {
    setLibrarySelectedTaskId(taskId);
    const task = libraryTasks.find(t => t.id === taskId) || null;
    setLibrarySelectedTask(task);
    setLibraryRejectReason(task?.rejectionReason || "");
  };

  const refreshLibraryTasks = async () => {
    const data = await getAdminLibraryTasks({
      status: libraryStatus
    });
    setLibraryTasks(data.tasks);
    const nextSelected = data.tasks.find(t => t.id === librarySelectedTaskId) ?? data.tasks[0] ?? null;
    setLibrarySelectedTaskId(nextSelected?.id ?? null);
    setLibrarySelectedTask(nextSelected);
  };

  const handleApproveLibraryTask = async () => {
    if (!librarySelectedTaskId || !librarySelectedTask) return;
    if (librarySelectedTask.status !== "PENDING") {
      showToast({ type: "error", message: "Only PENDING tasks can be approved" });
      return;
    }
    setLibraryActing(true);
    try {
      await approveAdminLibraryTask(librarySelectedTaskId);
      await refreshLibraryTasks();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to approve task") });
    } finally {
      setLibraryActing(false);
    }
  };

  const handleRejectLibraryTask = async () => {
    if (!librarySelectedTaskId || !librarySelectedTask) return;
    if (librarySelectedTask.status !== "PENDING") {
      showToast({ type: "error", message: "Only PENDING tasks can be rejected" });
      return;
    }
    const reason = libraryRejectReason.trim();
    if (!reason) {
      showToast({ type: "error", message: "Rejection reason is required" });
      return;
    }
    setLibraryActing(true);
    try {
      await rejectAdminLibraryTask(librarySelectedTaskId, reason);
      await refreshLibraryTasks();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to reject task") });
    } finally {
      setLibraryActing(false);
    }
  };

  const handleReplyToTicket = async () => {
    if (!selectedTicket) return;
    const trimmed = replyText.trim();
    if (!trimmed) {
      showToast({ type: "error", message: "Reply text is required" });
      return;
    }
    setReplying(true);
    try {
      await replyAdminSupportTicket(selectedTicket.id, {
        replyText: trimmed
      });
      setShowSupportTicket(false);
      setSelectedTicket(null);
      setReplyText("");
      await loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to send reply") });
    } finally {
      setReplying(false);
    }
  };
  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      showToast({ type: "error", message: "Username and password are required" });
      return;
    }
    try {
      await createAdminUser(newUser);
      setShowCreateUser(false);
      setNewUser({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        role: "USER",
        userMode: "PERSONAL",
        lang: "JAVA"
      });
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to create user") });
    }
  };
  const handleEditUser = async () => {
    if (!selectedUser) return;
    try {
      await updateAdminUser(selectedUser.id, editUser);
      setShowEditUser(false);
      setSelectedUser(null);
      setEditUser({});
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to update user") });
    }
  };
  const handleUpdateRole = async (userId: number, role: "USER" | "TEACHER" | "SYSTEM_ADMIN") => {
    try {
      await updateUserRole(userId, {
        role
      });
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to update role") });
    }
  };
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteAdminUser(userToDelete);
      setShowDeleteUserConfirm(false);
      setUserToDelete(null);
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to delete user") });
    }
  };
  const handleCreateClass = async () => {
    if (!newClass.name || !newClass.teacherId) {
      showToast({ type: "error", message: "Name and teacher are required" });
      return;
    }
    try {
      await createAdminClass(newClass);
      setShowCreateClass(false);
      setNewClass({
        name: "",
        language: "JAVA",
        teacherId: 0
      });
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to create class") });
    }
  };
  const handleEditClass = async () => {
    if (!selectedClass) return;
    try {
      await updateAdminClass(selectedClass.id, editClass);
      setShowEditClass(false);
      setSelectedClass(null);
      setEditClass({});
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to update class") });
    }
  };
  const handleDeleteClass = async () => {
    if (!classToDelete) return;
    try {
      await deleteAdminClass(classToDelete);
      setShowDeleteClassConfirm(false);
      setClassToDelete(null);
      loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to delete class") });
    }
  };
  const openEditUser = async (user: AdminUser) => {
    setSelectedUser(user);
    setEditUser({
      email: user.email || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      lang: user.lang
    });
    setShowEditUser(true);
  };
  const openEditClass = (classItem: AdminClass) => {
    setSelectedClass(classItem);
    setEditClass({
      name: classItem.name,
      language: classItem.language,
      teacherId: classItem.teacherId
    });
    setShowEditClass(true);
  };

  const materialsSensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6
    }
  }));

  const handleMaterialsDragEnd = async (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const oldIndex = materialsTopics.findIndex(t => t.id === active.id);
    const newIndex = materialsTopics.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const optimistic = arrayMove(materialsTopics, oldIndex, newIndex).map((t, idx) => ({
      ...t,
      order: idx + 1
    }));
    setMaterialsTopics(optimistic);

    const selectedId = materialsSelectedTopicId;
    if (selectedId) {
      const nextSelected = optimistic.find(t => t.id === selectedId) || null;
      if (nextSelected) setMaterialsSelectedTopic(nextSelected);
      if (!materialsDirty && materialDraft && nextSelected) {
        setMaterialDraft({
          ...materialDraft,
          order: String(nextSelected.order ?? 0)
        });
      }
    }

    setMaterialsReordering(true);
    try {
      const res = await reorderAdminMaterialTopics({
        language: materialsLanguage,
        orderedIds: optimistic.map(t => t.id)
      });
      const list = res.topics || [];
      setMaterialsTopics(list);
      if (selectedId) {
        const refreshed = list.find(t => t.id === selectedId) || null;
        setMaterialsSelectedTopic(refreshed);
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to reorder topics") });
      try {
        const data = await getAdminMaterialTopics({
          language: materialsLanguage
        });
        setMaterialsTopics(data.topics || []);
      } catch {
        // ignore
      }
    } finally {
      setMaterialsReordering(false);
    }
  };

  const selectMaterialTopic = (topicId: number) => {
    if (materialsDirty) {
      const ok = confirm("You have unsaved changes. Discard them?");
      if (!ok) return;
    }
    const selected = materialsTopics.find(t => t.id === topicId) || null;
    setMaterialsSelectedTopicId(topicId);
    setMaterialsSelectedTopic(selected);
    setMaterialDraft(selected ? {
      title: selected.title,
      description: selected.description || "",
      order: String(selected.order ?? 0),
      language: selected.language,
      theoryTitle: selected.theoryBlock?.title || selected.title,
      theoryContent: selected.theoryBlock?.content || ""
    } : null);
    setMaterialsDirty(false);
    setMaterialsTheoryDirty(false);
    setMaterialsAutoSaveState("idle");
    setMaterialPreview(false);
  };

  const openTheoryHistoryModal = async () => {
    const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
    if (!theoryBlockId) {
      showToast({ type: "error", message: "This topic has no theory yet" });
      return;
    }
    setShowTheoryHistory(true);
    setTheoryHistoryLoading(true);
    setTheoryRevisions([]);
    setTheorySelectedVersion(null);
    setTheorySelectedSnapshot(null);
    setTheoryRollbackComment("");
    try {
      const res = await getAdminTheoryBlockRevisions(theoryBlockId);
      const list = res.revisions || [];
      setTheoryRevisions(list);

      const v = list[0]?.version;
      if (v) {
        setTheorySelectedVersion(v);
        const details = await getAdminTheoryBlockRevision(theoryBlockId, v);
        setTheorySelectedSnapshot(details.snapshot);
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to load theory history") });
    } finally {
      setTheoryHistoryLoading(false);
    }
  };

  const selectTheoryRevision = async (version: number) => {
    const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
    if (!theoryBlockId) return;
    setTheorySelectedVersion(version);
    setTheoryHistoryLoading(true);
    try {
      const details = await getAdminTheoryBlockRevision(theoryBlockId, version);
      setTheorySelectedSnapshot(details.snapshot);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to load revision") });
    } finally {
      setTheoryHistoryLoading(false);
    }
  };

  const handleRollbackTheory = async () => {
    const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
    if (!theoryBlockId || !theorySelectedVersion) return;

    if (materialsDirty || materialsTheoryDirty) {
      const ok = confirm("You have unsaved changes in the editor. Rolling back will refresh data and discard them. Continue?");
      if (!ok) return;
    }

    const ok = confirm(`Rollback theory to version ${theorySelectedVersion}?`);
    if (!ok) return;

    setTheoryRollbackBusy(true);
    try {
      await rollbackAdminTheoryBlockRevision(theoryBlockId, theorySelectedVersion, {
        comment: theoryRollbackComment.trim() || undefined
      });
      setShowTheoryHistory(false);
      setTheorySelectedSnapshot(null);
      setTheorySelectedVersion(null);
      await loadData();
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to rollback") });
    } finally {
      setTheoryRollbackBusy(false);
    }
  };

  const handleSaveMaterial = async () => {
    if (!materialsSelectedTopic || !materialDraft) return;
    const title = materialDraft.title.trim();
    if (!title) {
      showToast({ type: "error", message: "Title is required" });
      return;
    }
    const orderNum = materialDraft.order.trim() ? parseInt(materialDraft.order.trim(), 10) : 0;
    if (!Number.isFinite(orderNum) || orderNum < 0) {
      showToast({ type: "error", message: "Order must be a non-negative number" });
      return;
    }

    setMaterialsSaving(true);
    try {
      const theoryContent = materialDraft.theoryContent.trim();
      const payload: {
        title: string;
        description: string | null;
        order: number;
        language: MaterialsLanguage;
        theory?: {
          title: string;
          content: string;
        };
      } = {
        title,
        description: materialDraft.description.trim() || null,
        order: orderNum,
        language: materialDraft.language
      };
      if (theoryContent) {
        payload.theory = {
          title: materialDraft.theoryTitle.trim() || title,
          content: theoryContent
        };
      }

      const res = await updateAdminMaterialTopic(materialsSelectedTopic.id, payload);
      const updated = res.topic;

      setMaterialsTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
      setMaterialsSelectedTopic(updated);
      setMaterialsSelectedTopicId(updated.id);
      setMaterialDraft({
        title: updated.title,
        description: updated.description || "",
        order: String(updated.order ?? 0),
        language: updated.language,
        theoryTitle: updated.theoryBlock?.title || updated.title,
        theoryContent: updated.theoryBlock?.content || ""
      });
      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");
      showToast({ type: "success", message: "Saved" });
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to save") });
    } finally {
      setMaterialsSaving(false);
    }
  };

  const handleCreateMaterial = async () => {
    const title = newMaterialTopic.title.trim();
    if (!title) {
      showToast({ type: "error", message: "Title is required" });
      return;
    }
    const orderStr = newMaterialTopic.order.trim();
    const orderNum = orderStr ? parseInt(orderStr, 10) : NaN;
    if (orderStr && (!Number.isFinite(orderNum) || orderNum < 0)) {
      showToast({ type: "error", message: "Order must be a non-negative number" });
      return;
    }

    setCreatingMaterialTopic(true);
    try {
      const res = await createAdminMaterialTopic({
        title,
        description: newMaterialTopic.description.trim() || null,
        order: Number.isFinite(orderNum) ? orderNum : undefined,
        language: newMaterialTopic.language,
        theory: newMaterialTopic.theoryContent.trim() ? {
          title,
          content: newMaterialTopic.theoryContent.trim()
        } : null
      });
      const created = res.topic;
      setShowCreateMaterialTopic(false);
      setNewMaterialTopic({
        title: "",
        description: "",
        order: "",
        language: newMaterialTopic.language,
        theoryContent: ""
      });

      // Refresh list quickly and select created.
      setMaterialsTopics(prev => [...prev, created].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      selectMaterialTopic(created.id);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to create topic") });
    } finally {
      setCreatingMaterialTopic(false);
    }
  };

  const handleImportMaterialsYaml = async () => {
    const yaml = materialsYamlText.trim();
    if (!yaml) {
      showToast({ type: "error", message: "YAML is required" });
      return;
    }

    if (materialsDirty || materialsTheoryDirty) {
      const ok = confirm("You have unsaved changes. Import will refresh the list and may discard local edits. Continue?");
      if (!ok) return;
    }

    setMaterialsYamlImporting(true);
    try {
      const res = await importAdminMaterialTopicsYaml({
        language: materialsLanguage,
        yaml,
        mode: materialsYamlMode
      });
      const list = res.topics || [];
      setMaterialsTopics(list);
      setMaterialsSelectedTopicId(null);
      setMaterialsSelectedTopic(null);
      setMaterialDraft(null);

      // Select first topic after import.
      if (list.length) {
        setMaterialsSelectedTopicId(list[0].id);
        setMaterialsSelectedTopic(list[0]);
        setMaterialDraft({
          title: list[0].title,
          description: list[0].description || "",
          order: String(list[0].order ?? 0),
          language: list[0].language,
          theoryTitle: list[0].theoryBlock?.title || list[0].title,
          theoryContent: list[0].theoryBlock?.content || ""
        });
      }

      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");
      setShowImportMaterialsYaml(false);
      showToast({ type: "success", message: `Imported: created=${res.created}, updated=${res.updated}, skipped=${res.skipped}` });
    } catch (error: unknown) {
      const data = getErrorData(error);
      const msg = data?.message || "Failed to import YAML";
      const hint = data?.hint ? `\n\nHint: ${String(data.hint)}` : "";
      const detail = data?.detail ? `\n\nDetail: ${String(data.detail)}` : "";
      const details = data?.details
        ? `\n\nDetails: ${typeof data.details === "string" ? String(data.details) : JSON.stringify(data.details)}`
        : "";
      const fp = data?.filePath ? `\n\nFile: ${String(data.filePath)}` : "";
      const code = data?.code ? `\n\nCode: ${String(data.code)}` : "";
      const issuesText = formatErrorIssues(data?.errors);
      const issues = issuesText
        ? `\n\nErrors: ${issuesText}`
        : "";
      showToast({ type: "error", message: String(msg) + hint + detail + details + fp + code + issues, durationMs: 6500 });
    } finally {
      setMaterialsYamlImporting(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!materialToDelete) return;
    try {
      await deleteAdminMaterialTopic(materialToDelete.id);
      setMaterialsTopics(prev => prev.filter(t => t.id !== materialToDelete.id));
      if (materialsSelectedTopicId === materialToDelete.id) {
        setMaterialsSelectedTopicId(null);
        setMaterialsSelectedTopic(null);
        setMaterialDraft(null);
      }
      setShowDeleteMaterialConfirm(false);
      setMaterialToDelete(null);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to delete topic") });
    }
  };

  const parseEmailList = (raw: string): string[] => {
    // People often paste `\n` literally (from JSON, docs, etc.). Treat it like a newline.
    const normalized = String(raw || "").replace(/\\n/g, "\n");
    const items = normalized
      .split(/[\s,;]+/g)
      .map(s => s.trim())
      .filter(Boolean);
    const uniq = new Map<string, string>();
    for (const e of items) {
      const key = e.toLowerCase();
      if (!uniq.has(key)) uniq.set(key, e);
    }
    return Array.from(uniq.values());
  };

  const parseIdList = (raw: string): number[] => {
    const normalized = String(raw || "").replace(/\\n/g, "\n");
    const items = normalized
      .split(/[\s,;]+/g)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter((n): n is number => Number.isFinite(n) && Number.isInteger(n) && n > 0);

    const uniq = new Set<number>();
    for (const n of items) uniq.add(n);
    return Array.from(uniq.values());
  };

  const toggleEmailClassId = (classId: number) => {
    setEmailSelectedClassIds(prev => (prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]));
  };

  const runAdminBroadcastEmail = async (dryRun: boolean) => {
    if (emailSending) return;

    const subject = emailSubject.trim();
    const title = (emailTitle.trim() || subject).trim();
    const content = emailContent.trim();

    if (!subject) {
      showToast({ type: "error", message: "Subject is required" });
      return;
    }
    if (!title) {
      showToast({ type: "error", message: "Title is required" });
      return;
    }
    if (!content) {
      showToast({ type: "error", message: "Email content is required" });
      return;
    }

    const parsedEmails = parseEmailList(emailRecipientEmails);
    const parsedUserIds = parseIdList(emailRecipientUserIds);
    const classIds = emailSelectedClassIds;
    const includeSubscribed = emailDelivery === "NOTIFICATION" ? false : !!emailIncludeSubscribed;
    const includeAllUsers = emailDelivery === "NOTIFICATION" && !!emailNotifyAllUsers;

    const hasTargets = includeAllUsers || parsedEmails.length > 0 || classIds.length > 0 || parsedUserIds.length > 0;
    if (!includeSubscribed && !hasTargets) {
      showToast({ type: "error", message: "No recipients selected. Enable subscribed audience and/or add class recipients/emails/user IDs." });
      return;
    }

    if (emailDelivery === "NOTIFICATION" && !hasTargets) {
      showToast({ type: "error", message: "Notification mode requires explicit recipients (classes and/or emails and/or user IDs)." });
      return;
    }

    if (includeAllUsers && !dryRun) {
      const expected = "ALL USERS";
      if (emailNotifyAllUsersConfirm.trim() !== expected) {
        showToast({ type: "error", message: `To send a mass notification to all users, type '${expected}' in the confirmation field.` });
        return;
      }
    }

    const limitNum = Number(emailLimit);
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), 5000) : undefined;

    setEmailSending(true);
    setEmailLastResult(null);
    try {
      const resRaw = await sendAdminBroadcastEmail({
        subject,
        title,
        delivery: emailDelivery,
        includeAllUsers,
        confirm: includeAllUsers ? emailNotifyAllUsersConfirm.trim() : undefined,
        content,
        includeSubscribed,
        audience: emailAudience,
        targets: {
          userIds: parsedUserIds.length ? parsedUserIds : undefined,
          classIds: classIds.length ? classIds : undefined,
          emails: parsedEmails.length ? parsedEmails : undefined,
        },
        dryRun,
        limit,
      });
      const res = (resRaw ?? null) as AdminBroadcastDryRunResult | AdminBroadcastSendResult | null;
      setEmailLastResult(res);
      if (!dryRun && isAdminBroadcastSendResult(res) && res.ok) {
        showToast({
          type: "success",
          message: `Email broadcast completed. recipients=${res.recipients}, sent=${res.sent}, failed=${res.failed}`
        });
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessage(error, "Failed to send email") });
    } finally {
      setEmailSending(false);
    }
  };

  const applyGlobalCertSnap = (value: number) => {
    const bounded = clampNumber(value, 0, 100);
    if (!globalCertSnapEnabled) return Math.round(bounded * 10) / 10;
    const step = clampNumber(globalCertSnapStep, 0.5, 20);
    return Math.round((Math.round(bounded / step) * step) * 10) / 10;
  };

  const updateGlobalCertLayoutByPointer = (
    key: GlobalCertBlockKey,
    clientX: number,
    clientY: number,
    target: HTMLDivElement,
    options?: { snap?: boolean }
  ) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setGlobalCertLayout((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        x: options?.snap === false ? Math.round(clampNumber(x, 0, 100) * 10) / 10 : applyGlobalCertSnap(x),
        y: options?.snap === false ? Math.round(clampNumber(y, 0, 100) * 10) / 10 : applyGlobalCertSnap(y),
      },
    }));
  };

  const updateGlobalCertLayoutByPosition = (key: GlobalCertBlockKey, x: number, y: number, options?: { snap?: boolean }) => {
    setGlobalCertLayout((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        x: options?.snap === false ? Math.round(clampNumber(x, 0, 100) * 10) / 10 : applyGlobalCertSnap(x),
        y: options?.snap === false ? Math.round(clampNumber(y, 0, 100) * 10) / 10 : applyGlobalCertSnap(y),
      },
    }));
  };

  const updateGlobalCertExtraObjectByPointer = (
    id: string,
    clientX: number,
    clientY: number,
    target: HTMLDivElement,
    options?: { snap?: boolean }
  ) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setGlobalCertExtraObjects((prev) => prev.map((obj) => (
      obj.id === id
        ? {
            ...obj,
            x: options?.snap === false ? Math.round(clampNumber(x, 0, 100) * 10) / 10 : applyGlobalCertSnap(x),
            y: options?.snap === false ? Math.round(clampNumber(y, 0, 100) * 10) / 10 : applyGlobalCertSnap(y),
          }
        : obj
    )));
  };

  const updateGlobalCertExtraObjectByPosition = (id: string, x: number, y: number, options?: { snap?: boolean }) => {
    setGlobalCertExtraObjects((prev) => prev.map((obj) => (
      obj.id === id
        ? {
            ...obj,
            x: options?.snap === false ? Math.round(clampNumber(x, 0, 100) * 10) / 10 : applyGlobalCertSnap(x),
            y: options?.snap === false ? Math.round(clampNumber(y, 0, 100) * 10) / 10 : applyGlobalCertSnap(y),
          }
        : obj
    )));
  };

  const getCanvasPercentFromPointer = (clientX: number, clientY: number, target: HTMLDivElement): { x: number; y: number } | null => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const updateGlobalCertBlockResizeByPointer = (
    key: GlobalCertBlockKey,
    clientX: number,
    clientY: number,
    target: HTMLDivElement,
    start: { clientX: number; clientY: number; width: number; height: number }
  ) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = ((clientX - start.clientX) / rect.width) * 100;
    const dy = ((clientY - start.clientY) / rect.height) * 100;

    setGlobalCertLayout((prev) => {
      const current = prev[key];
      if (!current) return prev;
      const nextWidth = clampNumber(start.width + dx, 6, 96);
      let nextHeight = clampNumber(start.height + dy, 2, 80);
      if (globalCertResizeMode === "proportional") {
        const ratio = start.height / Math.max(start.width, 1);
        nextHeight = clampNumber(nextWidth * ratio, 2, 80);
      }
      return {
        ...prev,
        [key]: {
          ...current,
          width: Math.round(nextWidth * 10) / 10,
          height: Math.round(nextHeight * 10) / 10,
        },
      };
    });
  };

  const updateGlobalCertExtraResizeByPointer = (
    id: string,
    clientX: number,
    clientY: number,
    target: HTMLDivElement,
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
    const dx = ((clientX - start.clientX) / rect.width) * 100;
    const dy = ((clientY - start.clientY) / rect.height) * 100;

    const horizontalDelta = start.edge === "left" ? -dx : start.edge === "right" ? dx : 0;
    const verticalDelta = start.edge === "top" ? -dy : start.edge === "bottom" ? dy : 0;

    setGlobalCertExtraObjects((prev) => prev.map((obj) => {
      if (obj.id !== id) return obj;
      const nextWidth = clampNumber(start.width + horizontalDelta, 2, 96);
      let nextHeight = clampNumber(start.height + verticalDelta, 2, 96);
      if (globalCertResizeMode === "proportional") {
        const ratio = start.height / Math.max(start.width, 1);
        nextHeight = clampNumber(nextWidth * ratio, 2, 96);
      }

      if (!options?.oneSided) {
        return {
          ...obj,
          width: Math.round(nextWidth * 10) / 10,
          height: Math.round(nextHeight * 10) / 10,
        };
      }

      const roundedWidth = Math.round(nextWidth * 10) / 10;
      const roundedHeight = Math.round(nextHeight * 10) / 10;
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
        x: applyGlobalCertSnap(nextX),
        y: applyGlobalCertSnap(nextY),
        width: roundedWidth,
        height: roundedHeight,
      };
    }));
  };

  const addGlobalCertExtraObjectAtPosition = (type: GlobalCertExtraObjectType, x: number, y: number) => {
    const obj = createDefaultGlobalCertExtraObject(type, applyGlobalCertSnap(x), applyGlobalCertSnap(y));
    const maxZ = globalCertExtraObjects.reduce((m, o) => Math.max(m, Number(o.zIndex ?? 0)), 0);
    obj.zIndex = Math.max(1, maxZ + 1);
    setGlobalCertExtraObjects((prev) => [...prev, obj]);
    setGlobalCertSelectedExtraObjectId(obj.id);
    setGlobalCertSelectedBlock("name");
    setGlobalCertCanvasContextMenu(null);
  };

  const duplicateSelectedGlobalCertExtraObject = () => {
    if (!globalCertSelectedExtraObjectId) return;
    const current = globalCertExtraObjects.find((obj) => obj.id === globalCertSelectedExtraObjectId);
    if (!current) return;
    const duplicated: GlobalCertExtraObject = {
      ...current,
      id: `gc-extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: clampNumber(current.x + 2, 0, 100),
      y: clampNumber(current.y + 2, 0, 100),
      zIndex: clampNumber(Number(current.zIndex ?? 20) + 1, 1, 999),
    };
    setGlobalCertExtraObjects((prev) => [...prev, duplicated]);
    setGlobalCertSelectedExtraObjectId(duplicated.id);
  };

  const changeSelectedGlobalCertExtraLayer = (delta: number) => {
    if (!globalCertSelectedExtraObjectId) return;
    setGlobalCertExtraObjects((prev) => prev.map((obj) => {
      if (obj.id !== globalCertSelectedExtraObjectId) return obj;
      return {
        ...obj,
        zIndex: clampNumber(Number(obj.zIndex ?? 20) + delta, 1, 999),
      };
    }));
  };

  const uploadSelectedGlobalCertExtraImageFile = (file: File | null) => {
    if (!file || !globalCertSelectedExtraObjectId) return;
    if (!String(file.type ?? "").toLowerCase().startsWith("image/")) {
      setGlobalCertMessage("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setGlobalCertMessage("Failed to read file.");
        return;
      }
      setGlobalCertExtraObjects((prev) => prev.map((obj) => (
        obj.id === globalCertSelectedExtraObjectId
          ? { ...obj, imageUrl: result }
          : obj
      )));
      setGlobalCertMessage("Object image uploaded from file.");
    };
    reader.onerror = () => setGlobalCertMessage("Failed to read file.");
    reader.readAsDataURL(file);
  };

  const removeSelectedGlobalCertExtraObject = () => {
    if (!globalCertSelectedExtraObjectId) return;
    setGlobalCertExtraObjects((prev) => prev.filter((obj) => obj.id !== globalCertSelectedExtraObjectId));
    setGlobalCertSelectedExtraObjectId(null);
    setGlobalCertCanvasContextMenu(null);
  };

  const moveSelectedGlobalCertObjectToPosition = (x: number, y: number) => {
    if (!globalCertSelectedExtraObjectId) return;
    const nextX = applyGlobalCertSnap(x);
    const nextY = applyGlobalCertSnap(y);
    setGlobalCertExtraObjects((prev) => prev.map((obj) => obj.id === globalCertSelectedExtraObjectId ? { ...obj, x: nextX, y: nextY } : obj));
    setGlobalCertCanvasContextMenu(null);
  };

  const stopGlobalCertDragging = () => {
    setGlobalCertDraggingBlock(null);
    setGlobalCertDraggingExtraObjectId(null);
    setGlobalCertResizingBlock(null);
    setGlobalCertResizingExtraObjectId(null);
    setGlobalCertResizeStart(null);
    setGlobalCertExtraResizeStart(null);
    globalCertDragOriginRef.current = null;
  };

  const handleGlobalCertCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const noSnap = event.altKey;
    if (globalCertDraggingBlock) {
      if (event.shiftKey) {
        const pos = getCanvasPercentFromPointer(event.clientX, event.clientY, target);
        const origin = globalCertDragOriginRef.current;
        if (pos && origin && origin.kind === "block" && origin.keyOrId === globalCertDraggingBlock) {
          const dx = Math.abs(event.clientX - origin.clientX);
          const dy = Math.abs(event.clientY - origin.clientY);
          const lockY = dx >= dy;
          updateGlobalCertLayoutByPosition(globalCertDraggingBlock, pos.x, lockY ? origin.y : pos.y, { snap: !noSnap });
          return;
        }
      }
      updateGlobalCertLayoutByPointer(globalCertDraggingBlock, event.clientX, event.clientY, target, { snap: !noSnap });
      return;
    }
    if (globalCertDraggingExtraObjectId) {
      if (event.shiftKey) {
        const pos = getCanvasPercentFromPointer(event.clientX, event.clientY, target);
        const origin = globalCertDragOriginRef.current;
        if (pos && origin && origin.kind === "extra" && origin.keyOrId === globalCertDraggingExtraObjectId) {
          const dx = Math.abs(event.clientX - origin.clientX);
          const dy = Math.abs(event.clientY - origin.clientY);
          const lockY = dx >= dy;
          updateGlobalCertExtraObjectByPosition(globalCertDraggingExtraObjectId, pos.x, lockY ? origin.y : pos.y, { snap: !noSnap });
          return;
        }
      }
      updateGlobalCertExtraObjectByPointer(globalCertDraggingExtraObjectId, event.clientX, event.clientY, target, { snap: !noSnap });
      return;
    }
    if (globalCertResizingBlock && globalCertResizeStart) {
      updateGlobalCertBlockResizeByPointer(globalCertResizingBlock, event.clientX, event.clientY, target, globalCertResizeStart);
      return;
    }
    if (globalCertResizingExtraObjectId && globalCertExtraResizeStart) {
      updateGlobalCertExtraResizeByPointer(
        globalCertResizingExtraObjectId,
        event.clientX,
        event.clientY,
        target,
        globalCertExtraResizeStart,
        { oneSided: true }
      );
    }
  };

  useEffect(() => {
    if (!globalCertDraggingBlock && !globalCertDraggingExtraObjectId && !globalCertResizingBlock && !globalCertResizingExtraObjectId) return;
    const onRelease = () => stopGlobalCertDragging();
    window.addEventListener("mouseup", onRelease);
    window.addEventListener("blur", onRelease);
    return () => {
      window.removeEventListener("mouseup", onRelease);
      window.removeEventListener("blur", onRelease);
    };
  }, [globalCertDraggingBlock, globalCertDraggingExtraObjectId, globalCertResizingBlock, globalCertResizingExtraObjectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && globalCertSelectedExtraObjectId) {
        event.preventDefault();
        duplicateSelectedGlobalCertExtraObject();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && globalCertSelectedExtraObjectId) {
        event.preventDefault();
        removeSelectedGlobalCertExtraObject();
        return;
      }

      const step = event.shiftKey ? 5 : 1;
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
      }

      if (globalCertSelectedExtraObjectId) {
        setGlobalCertExtraObjects((prev) => prev.map((obj) => {
          if (obj.id !== globalCertSelectedExtraObjectId) return obj;
          if (event.key === "ArrowUp") return { ...obj, y: applyGlobalCertSnap(obj.y - step) };
          if (event.key === "ArrowDown") return { ...obj, y: applyGlobalCertSnap(obj.y + step) };
          if (event.key === "ArrowLeft") return { ...obj, x: applyGlobalCertSnap(obj.x - step) };
          if (event.key === "ArrowRight") return { ...obj, x: applyGlobalCertSnap(obj.x + step) };
          return obj;
        }));
        return;
      }

      if (!globalCertSelectedBlock) return;
      setGlobalCertLayout((prev) => {
        const current = prev[globalCertSelectedBlock];
        if (!current) return prev;
        if (event.key === "ArrowUp") return { ...prev, [globalCertSelectedBlock]: { ...current, y: applyGlobalCertSnap(current.y - step) } };
        if (event.key === "ArrowDown") return { ...prev, [globalCertSelectedBlock]: { ...current, y: applyGlobalCertSnap(current.y + step) } };
        if (event.key === "ArrowLeft") return { ...prev, [globalCertSelectedBlock]: { ...current, x: applyGlobalCertSnap(current.x - step) } };
        if (event.key === "ArrowRight") return { ...prev, [globalCertSelectedBlock]: { ...current, x: applyGlobalCertSnap(current.x + step) } };
        return prev;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    applyGlobalCertSnap,
    globalCertSelectedBlock,
    globalCertSelectedExtraObjectId,
    globalCertExtraObjects,
    globalCertLayout,
  ]);

  const uploadGlobalCertBackgroundFile = (file: File | null) => {
    if (!file) return;
    if (!isSupportedCertificateBackgroundFile(file)) {
      setGlobalCertMessage("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setGlobalCertMessage("Failed to read file.");
        return;
      }
      const normalized = isSvgCertificateBackgroundFile(file)
        ? normalizeCertificateBackgroundSource(result)
        : result;
      setGlobalCertBackgroundUrl(normalized);
      setGlobalCertMessage("Background uploaded from file.");
    };
    reader.onerror = () => setGlobalCertMessage("Failed to read file.");
    if (isSvgCertificateBackgroundFile(file)) {
      reader.readAsText(file);
      return;
    }
    reader.readAsDataURL(file);
  };

  const createGlobalStudyCodTemplate = async () => {
    setGlobalCertCreating(true);
    setGlobalCertMessage(null);
    try {
      const finalHtml = buildGlobalCertFinalHtml();
      const finalCss = buildGlobalCertFinalCss();
      const result = await createCertificateTemplate({
        name: `Global Contest Style ${new Date().toISOString().slice(0, 10)}`,
        type: "custom",
        htmlTemplate: finalHtml,
        cssTemplate: finalCss || undefined,
        fields: GLOBAL_CERT_TEMPLATE_FIELD_KEYS.map((fieldKey) => ({
          fieldKey,
          isEnabled: Boolean(globalCertFields[fieldKey]?.isEnabled),
          isRequired: Boolean(globalCertFields[fieldKey]?.isRequired),
        })),
      });
      setGlobalCertTemplateId(String(result.templateId));
      setGlobalCertMessage(`Global contest-style template created: #${result.templateId}`);
      showToast({ type: "success", message: `Global certificate template #${result.templateId} created` });
      void loadCertificateTemplateLibrary();
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Failed to create global template");
      setGlobalCertMessage(msg);
      showToast({ type: "error", message: msg });
    } finally {
      setGlobalCertCreating(false);
    }
  };

  const buildGlobalCertFinalHtml = React.useCallback(() => {
    if (globalCertEditorMode === "visual") {
      return buildGlobalStudyCodTemplateHtmlWithVisibility(globalCertFields, globalCertHiddenBlocks);
    }
    const autoHtml = buildGlobalContestStyleAutoLayoutHtml(globalCertFields);
    return String(globalCertTemplateHtml || autoHtml).trim() || autoHtml;
  }, [globalCertEditorMode, globalCertFields, globalCertHiddenBlocks, globalCertTemplateHtml]);

  const buildGlobalCertFinalCss = React.useCallback(() => {
    if (globalCertEditorMode === "visual") {
      return buildStudyCodVisualCss({
        theme: globalCertTheme,
        backgroundImageUrl: globalCertBackgroundUrl,
        layout: globalCertLayout,
        hiddenBlocks: globalCertHiddenBlocks,
        extraObjects: globalCertExtraObjects,
        extraCss: globalCertExtraCss,
      });
    }
    const autoCss = buildGlobalContestStyleAutoLayoutCss(globalCertBackgroundUrl);
    const merged = mergeGlobalAutoLayoutCss(globalCertTemplateCss, autoCss);
    const extra = String(globalCertExtraCss ?? "").trim();
    return [merged, extra].filter(Boolean).join("\n\n");
  }, [globalCertBackgroundUrl, globalCertEditorMode, globalCertExtraCss, globalCertExtraObjects, globalCertHiddenBlocks, globalCertLayout, globalCertTemplateCss, globalCertTheme]);

  useEffect(() => {
    if (globalCertEditorMode !== "visual") return;
    setGlobalCertTemplateHtml(buildGlobalStudyCodTemplateHtmlWithVisibility(globalCertFields, globalCertHiddenBlocks));
    setGlobalCertTemplateCss(
      buildStudyCodVisualCss({
        theme: globalCertTheme,
        backgroundImageUrl: globalCertBackgroundUrl,
        layout: globalCertLayout,
        hiddenBlocks: globalCertHiddenBlocks,
        extraObjects: globalCertExtraObjects,
        extraCss: "",
      })
    );
  }, [globalCertBackgroundUrl, globalCertEditorMode, globalCertExtraObjects, globalCertFields, globalCertHiddenBlocks, globalCertLayout, globalCertTheme]);

  const applyGlobalContestStyleAutoLayout = React.useCallback(() => {
    const autoHtml = buildGlobalContestStyleAutoLayoutHtml(globalCertFields);
    const autoCss = buildGlobalContestStyleAutoLayoutCss(globalCertBackgroundUrl);
    setGlobalCertTemplateHtml(autoHtml);
    setGlobalCertTemplateCss((prev) => mergeGlobalAutoLayoutCss(prev, autoCss));
  }, [globalCertBackgroundUrl, globalCertFields]);

  const globalCertTemplatePlaceholders = React.useMemo(
    () => extractTemplatePlaceholders(buildGlobalCertFinalHtml()),
    [buildGlobalCertFinalHtml]
  );

  const globalCertUnknownPlaceholders = React.useMemo(() => {
    const allowed = new Set<string>(GLOBAL_CERT_TEMPLATE_FIELD_KEYS);
    return globalCertTemplatePlaceholders.filter((key) => !allowed.has(key));
  }, [globalCertTemplatePlaceholders]);

  const globalCertMissingRequiredPlaceholders = React.useMemo(() => {
    const inTemplate = new Set<string>(globalCertTemplatePlaceholders);
    return GLOBAL_CERT_TEMPLATE_FIELD_KEYS.filter((key) => {
      const field = globalCertFields[key];
      return Boolean(field?.isEnabled && field?.isRequired) && !inTemplate.has(key);
    });
  }, [globalCertFields, globalCertTemplatePlaceholders]);

  const globalCertPublishPreviewSrcDoc = React.useMemo(
    () => globalCertEditorMode === "visual"
      ? buildGlobalStudyCodPreviewSrcDoc(buildGlobalCertFinalCss())
      : renderGlobalCertificatePreviewHtml({
          htmlTemplate: buildGlobalCertFinalHtml(),
          cssTemplate: buildGlobalCertFinalCss(),
          fields: globalCertFields,
        }),
    [buildGlobalCertFinalCss, buildGlobalCertFinalHtml, globalCertEditorMode, globalCertFields]
  );

  const loadCertificateTemplateLibrary = React.useCallback(async () => {
    setCertificateTemplateLibraryLoading(true);
    setCertificateTemplateLibraryError(null);
    try {
      const r = await listCertificateTemplates({ includeInactive: true, limit: 300 });
      setCertificateTemplateLibrary(Array.isArray(r.templates) ? r.templates : []);
    } catch (error: unknown) {
      setCertificateTemplateLibrary([]);
      setCertificateTemplateLibraryError(getErrorMessage(error, "Failed to load template library"));
    } finally {
      setCertificateTemplateLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "certificates") return;
    void loadCertificateTemplateLibrary();
  }, [activeTab, loadCertificateTemplateLibrary]);

  const publishGlobalStudyCodTemplate = async () => {
    const name = String(globalCertPublishName ?? "").trim();
    if (!name) {
      setGlobalCertMessage("Please provide template name.");
      return;
    }
    if (globalCertUnknownPlaceholders.length > 0) {
      setGlobalCertMessage(`Unknown placeholders: ${globalCertUnknownPlaceholders.join(", ")}`);
      return;
    }
    if (globalCertMissingRequiredPlaceholders.length > 0) {
      setGlobalCertMessage(`Template is missing required placeholders: ${globalCertMissingRequiredPlaceholders.join(", ")}`);
      return;
    }

    setGlobalCertPublishBusy(true);
    setGlobalCertMessage(null);
    try {
      const result = await createCertificateTemplate({
        name,
        type: "custom",
        htmlTemplate: buildGlobalCertFinalHtml(),
        cssTemplate: buildGlobalCertFinalCss() || undefined,
        fields: GLOBAL_CERT_TEMPLATE_FIELD_KEYS.map((fieldKey) => ({
          fieldKey,
          isEnabled: Boolean(globalCertFields[fieldKey]?.isEnabled),
          isRequired: Boolean(globalCertFields[fieldKey]?.isRequired),
        })),
      });
      setGlobalCertTemplateId(String(result.templateId));
      setGlobalCertMessage(`Template published: #${result.templateId}`);
      showToast({ type: "success", message: `Template #${result.templateId} published` });
      setGlobalCertPublishOpen(false);
      void loadCertificateTemplateLibrary();
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Failed to publish template");
      setGlobalCertMessage(msg);
      showToast({ type: "error", message: msg });
    } finally {
      setGlobalCertPublishBusy(false);
    }
  };

  const loadGlobalTemplateFromLibrary = async (templateId: number) => {
    setGlobalCertMessage(null);
    try {
      const result = await getCertificateTemplateById(templateId);
      const tpl = result.template;

      setGlobalCertPublishName(String(tpl.name ?? ""));
      setGlobalCertTemplateId(String(tpl.id));
      setGlobalCertTemplateHtml(String(tpl.htmlTemplate ?? ""));
      setGlobalCertTemplateCss(String(tpl.cssTemplate ?? ""));
      setGlobalCertExtraCss("");

      const nextFields = defaultGlobalCertTemplateFieldsState();
      for (const row of Array.isArray(tpl.fields) ? tpl.fields : []) {
        if (!Object.prototype.hasOwnProperty.call(nextFields, row.fieldKey)) continue;
        nextFields[row.fieldKey as GlobalCertTemplateFieldKey] = {
          isEnabled: Boolean(row.isEnabled),
          isRequired: Boolean(row.isRequired),
        };
      }
      setGlobalCertFields(nextFields);
      setGlobalCertHiddenBlocks(defaultGlobalCertHiddenBlocksState());
      setGlobalCertEditorMode("advanced");
      setGlobalCertMessage(`Loaded template #${tpl.id} from library.`);
      showToast({ type: "success", message: `Template #${tpl.id} loaded` });
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Failed to load template from library");
      setGlobalCertMessage(msg);
      showToast({ type: "error", message: msg });
    }
  };

  const applyLoadedTemplateToVisualLayout = () => {
    const css = String(globalCertTemplateCss ?? "");
    const html = String(globalCertTemplateHtml ?? "");
    if (!css.trim() && !html.trim()) {
      setGlobalCertMessage("No loaded template to apply. Load a template from library first.");
      return;
    }

    const ruleMap = buildBlockRuleMapFromTemplateCss(css);

    setGlobalCertLayout((prev) => {
      const next: GlobalCertLayoutState = { ...prev };
      for (const key of GLOBAL_CERT_BLOCK_KEYS) {
        const rule = ruleMap[key];
        if (!rule) continue;
        const cur = next[key];
        next[key] = {
          ...cur,
          x: parseCssPercent(rule, "left") ?? cur.x,
          y: parseCssPercent(rule, "top") ?? cur.y,
          width: parseCssPercent(rule, "width") ?? cur.width,
          height: parseCssPercent(rule, "height") ?? cur.height,
          fontSize: parseCssPixel(rule, "font-size") ?? cur.fontSize,
          fontWeight: parseNumberFromCss(extractCssDeclaration(rule, "font-weight")) ?? cur.fontWeight,
          align: detectAlignFromCss(rule),
        };
      }
      const metaBounds = parseCfMetaBounds(css);
      if (metaBounds) {
        const width = clampNumber(metaBounds.right - metaBounds.left, 6, 96);
        const height = clampNumber(metaBounds.bottom - metaBounds.top, 2, 80);
        const centerX = clampNumber(metaBounds.left + width / 2, 0, 100);
        const centerY = clampNumber(metaBounds.top + height / 2, 0, 100);
        next.meta = {
          ...next.meta,
          x: centerX,
          y: centerY,
          width,
          height,
          fontSize: metaBounds.fontSize,
          fontWeight: metaBounds.fontWeight,
          align: metaBounds.align,
        };
      }
      const scoreBounds = parseCfScoreBounds(css);
      if (scoreBounds) {
        next.score = {
          ...next.score,
          ...scoreBounds.score,
        };
        next.max_score = {
          ...next.max_score,
          ...scoreBounds.maxScore,
        };
      }
      const nameBounds = parseCfNameBounds(css);
      if (nameBounds) {
        next.name = {
          ...next.name,
          ...nameBounds.name,
        };
        next.full_name = {
          ...next.full_name,
          ...nameBounds.fullName,
        };
      }
      const anchorBounds = parseCfAnchorBounds(css);
      if (anchorBounds.brand) {
        next.brand = {
          ...next.brand,
          ...anchorBounds.brand,
        };
      }
      if (anchorBounds.signature) {
        next.signature = {
          ...next.signature,
          ...anchorBounds.signature,
        };
      }
      if (anchorBounds.id) {
        next.id = {
          ...next.id,
          ...anchorBounds.id,
        };
      }
      if (anchorBounds.qr) {
        next.qr = {
          ...next.qr,
          ...anchorBounds.qr,
        };
      }
      return next;
    });

    setGlobalCertFields(detectFieldsFromTemplate(html));
    setGlobalCertHiddenBlocks(defaultGlobalCertHiddenBlocksState());
    setGlobalCertTheme(detectThemeFromCss(css));
    const backgroundUrl = extractBackgroundUrlFromCss(css);
    if (backgroundUrl) setGlobalCertBackgroundUrl(backgroundUrl);
    setGlobalCertExtraObjects([]);
    setGlobalCertEditorMode("visual");
    setGlobalCertMessage("Applied loaded template to visual layout. Check positions and fine-tune if needed.");
    showToast({ type: "success", message: "Template mapped to visual layout" });
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const normalizedIdQuery = normalizedSearchQuery.replace(/^#/, "");
  const filteredUsers = users.filter((u) => {
    if (!normalizedSearchQuery) return true;
    return (
      String(u.id).includes(normalizedIdQuery) ||
      u.username.toLowerCase().includes(normalizedSearchQuery) ||
      u.email?.toLowerCase().includes(normalizedSearchQuery) ||
      u.firstName?.toLowerCase().includes(normalizedSearchQuery) ||
      u.lastName?.toLowerCase().includes(normalizedSearchQuery)
    );
  });
  if (loading && activeTab === "stats") {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("loading")}
      </div>;
  }
  return <div className="h-full flex flex-col bg-bg-base">
      {}
      <div className="border-b border-border p-3 sm:p-4 bg-bg-secondary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-mono font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Admin Panel
          </h1>
          <Button variant="secondary" onClick={() => navigate("/?app=home")}>
            {t("toHome", {
              defaultValue: "Exit admin panel"
            })}
          </Button>
        </div>
      </div>

      {}
      <div className="flex gap-2 p-3 sm:p-4 border-b border-border bg-bg-secondary overflow-x-auto whitespace-nowrap">
        <Button variant={activeTab === "stats" ? "primary" : "secondary"} onClick={() => setActiveTab("stats")} className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Statistics
        </Button>
        <Button variant={activeTab === "users" ? "primary" : "secondary"} onClick={() => setActiveTab("users")} className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Users
        </Button>
        <Button variant={activeTab === "classes" ? "primary" : "secondary"} onClick={() => setActiveTab("classes")} className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Classes
        </Button>

        <Button variant={activeTab === "materials" ? "primary" : "secondary"} onClick={() => setActiveTab("materials")} className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Materials
        </Button>

        <Button variant={activeTab === "library" ? "primary" : "secondary"} onClick={() => setActiveTab("library")} className="flex items-center gap-2">
          <Library className="w-4 h-4" />
          Library
        </Button>

        <Button variant={activeTab === "emails" ? "primary" : "secondary"} onClick={() => setActiveTab("emails")} className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Emails
        </Button>

        <Button variant={activeTab === "mailbox" ? "primary" : "secondary"} onClick={() => setActiveTab("mailbox")} className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Mailbox
        </Button>

        <Button variant={activeTab === "support" ? "primary" : "secondary"} onClick={() => setActiveTab("support")} className="flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Support
        </Button>

        <Button variant={activeTab === "maintenance" ? "primary" : "secondary"} onClick={() => setActiveTab("maintenance")} className="flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          Maintenance
        </Button>

        <Button variant={activeTab === "certificates" ? "primary" : "secondary"} onClick={() => setActiveTab("certificates")} className="flex items-center gap-2">
          <Award className="w-4 h-4" />
          Certificates
        </Button>
      </div>

      {}
      <div className="flex-1 overflow-auto p-3 sm:p-4">
        {}
        {activeTab === "stats" && stats && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Total Users</h3>
                <Users className="w-5 h-5 text-text-secondary" />
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats.users.total}</p>
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Teachers:</span>
                  <span className="text-text-primary">{stats.users.teachers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Admins:</span>
                  <span className="text-text-primary">{stats.users.admins}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">User Modes</h3>
                <UserIcon className="w-5 h-5 text-text-secondary" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Personal:</span>
                  <span className="text-text-primary font-semibold">{stats.users.byMode.PERSONAL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Educational:</span>
                  <span className="text-text-primary font-semibold">{stats.users.byMode.EDUCATIONAL}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Total Classes</h3>
                <BookOpen className="w-5 h-5 text-text-secondary" />
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats.classes.total}</p>
            </Card>

            <Card className="p-4 md:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Judge Queue Load</h3>
                <BarChart3 className="w-5 h-5 text-text-secondary" />
              </div>

              {!judgeLoad ? (
                <p className="text-sm text-text-secondary">No judge metrics available right now.</p>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-text-muted">
                    mode=<span className="text-text-primary font-mono">{judgeLoad.mode}</span> · sampled at {new Date(judgeLoad.sampledAt).toLocaleString()}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Active</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.active}</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Queued</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.queued}</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Peak active</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.peakActive}</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Peak queue</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.peakQueueLength}</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Avg exec</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.avgExecutionTimeMs}ms</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Avg wait</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.avgQueueWaitTimeMs}ms</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">DLQ size</div>
                      <div className="text-lg font-mono text-accent-warning">{judgeLoad.deadLetterQueueLength}</div>
                    </div>
                    <div className="border border-border p-2 bg-bg-surface">
                      <div className="text-[11px] text-text-muted">Retry cap</div>
                      <div className="text-lg font-mono text-text-primary">{judgeLoad.maxRetries}</div>
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary">
                    started={judgeLoad.started} · completed={judgeLoad.totalCompleted} · rejected={judgeLoad.totalRejectedQueueFull} · requeued={judgeLoad.totalRequeuedExpired} · dead-lettered={judgeLoad.totalDeadLettered} · limits {judgeLoad.maxConcurrent}/{judgeLoad.maxQueueSize}
                  </div>

                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs font-mono text-text-primary">
                        Dead-letter operations · total={judgeDeadLetterTotal}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          value={judgeDeadLetterLimit}
                          onChange={e => setJudgeDeadLetterLimit(e.target.value)}
                          className="w-24"
                        />
                        <Button variant="secondary" onClick={() => void refreshJudgeDeadLetter()} disabled={judgeDeadLetterLoading}>
                          {judgeDeadLetterLoading ? "Refreshing..." : "Refresh DLQ"}
                        </Button>
                        <Button onClick={() => void handleReplayJudgeDeadLetter()} disabled={judgeDeadLetterReplaying || judgeLoad.mode !== "distributed"}>
                          {judgeDeadLetterReplaying ? "Replaying..." : "Replay DLQ"}
                        </Button>
                      </div>
                    </div>

                    {judgeDeadLetterLastReplay ? (
                      <div className="text-xs text-text-secondary">
                        last replay: moved={judgeDeadLetterLastReplay.moved} · skipped={judgeDeadLetterLastReplay.skipped} · remaining={judgeDeadLetterLastReplay.remaining} · queued={judgeDeadLetterLastReplay.queued}
                      </div>
                    ) : null}

                    <div className="max-h-52 overflow-y-auto border border-border bg-bg-base">
                      {judgeDeadLetterItems.length === 0 ? (
                        <div className="p-3 text-xs text-text-secondary">No dead-letter jobs.</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {judgeDeadLetterItems.map(item => (
                            <div key={item.jobId} className="p-2 text-xs font-mono space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-text-primary">
                                <span>job={item.jobId}</span>
                                {item.submissionId ? <span>submission={item.submissionId}</span> : null}
                                <span>state={item.state || "unknown"}</span>
                                <span>attempts={item.attempts}</span>
                              </div>
                              <div className="text-text-muted">
                                updated={item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}
                                {item.finishedAt ? ` · finished=${new Date(item.finishedAt).toLocaleString()}` : ""}
                              </div>
                              {item.error ? (
                                <div className="text-accent-warning break-words">error={String(item.error).slice(0, 220)}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>}

        {}
        {activeTab === "users" && <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <Input type="text" placeholder="Search users (name, email, ID)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={usersFilter.role || ""} onChange={e => setUsersFilter({
              ...usersFilter,
              role: e.target.value || undefined
            })} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                  <option value="">All Roles</option>
                  <option value="USER">User</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="SYSTEM_ADMIN">Admin</option>
                </select>
                <select value={usersFilter.userMode || ""} onChange={e => setUsersFilter({
              ...usersFilter,
              userMode: e.target.value || undefined
            })} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                  <option value="">All Modes</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="EDUCATIONAL">Educational</option>
                </select>
                <Button onClick={() => setShowCreateUser(true)} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create User
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[640px] md:min-w-[760px] w-full">
                  <caption className="sr-only">User management table</caption>
                  <thead className="bg-bg-secondary border-b border-border">
                    <tr>
                      <th className="hidden md:table-cell px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">ID</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Username</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Role</th>
                      <th className="hidden lg:table-cell px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Mode</th>
                      <th className="hidden xl:table-cell px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Language</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => <tr key={user.id} className="border-b border-border hover:bg-bg-secondary transition-fast">
                        <td className="hidden md:table-cell px-4 py-2 text-sm text-text-primary font-mono">{user.id}</td>
                        <td className="px-4 py-2 text-sm text-text-primary">{user.username}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.email || "-"}</td>
                        <td className="px-4 py-2">
                          <select value={user.role} onChange={e => {
                        const role = parseUserRole(e.target.value);
                        if (role) handleUpdateRole(user.id, role);
                      }} className="px-2 py-1 border border-border bg-bg-secondary text-text-primary font-mono text-xs">
                            <option value="USER">USER</option>
                            <option value="TEACHER">TEACHER</option>
                            <option value="SYSTEM_ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-2 text-sm text-text-secondary">{user.userMode}</td>
                        <td className="hidden xl:table-cell px-4 py-2 text-sm text-text-secondary">{user.lang}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEditUser(user)} className="flex items-center gap-1">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => {
                        setUserToDelete(user.id);
                        setShowDeleteUserConfirm(true);
                      }} className="flex items-center gap-1 text-accent-error hover:opacity-85">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>
              {usersTotal > 20 && <div className="p-4 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    Showing {(usersPage - 1) * 20 + 1} - {Math.min(usersPage * 20, usersTotal)} of {usersTotal}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setUsersPage(p => Math.max(1, p - 1))} disabled={usersPage === 1}>
                      Previous
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setUsersPage(p => p + 1)} disabled={usersPage * 20 >= usersTotal}>
                      Next
                    </Button>
                  </div>
                </div>}
            </Card>
          </div>}

        {}
        {activeTab === "classes" && <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowCreateClass(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Class
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map(classItem => <Card key={classItem.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-mono font-semibold text-text-primary text-lg">{classItem.name}</h3>
                      <p className="text-sm text-text-secondary mt-1">{classItem.language}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditClass(classItem)} className="flex items-center gap-1">
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => {
                  setClassToDelete(classItem.id);
                  setShowDeleteClassConfirm(true);
                }} className="flex items-center gap-1 text-accent-error hover:opacity-85">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-text-secondary">
                      Teacher: <span className="text-text-primary">{classItem.teacherName}</span>
                    </p>
                    <p className="text-sm text-text-secondary mt-1">
                      Created: <span className="text-text-primary">{new Date(classItem.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                </Card>)}
            </div>
          </div>}

        {}
        {activeTab === "materials" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Learning materials</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">Global topics + theory by language (visible for all classes of that language).</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-text-secondary">Language</div>
                  <select value={materialsLanguage} onChange={e => {
                const lang = parseMaterialsLanguage(e.target.value);
                if (!lang) return;
                setMaterialsLanguage(lang);
                setMaterialsSelectedTopicId(null);
                setMaterialsSelectedTopic(null);
                setMaterialDraft(null);
                setMaterialsDirty(false);
              }} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                    <option value="JAVA">JAVA</option>
                    <option value="PYTHON">PYTHON</option>
                    <option value="CPP">CPP</option>
                  </select>

                  <Button variant="secondary" onClick={() => {
                setMaterialsYamlText("language: " + materialsLanguage + "\n" +
                  "topics:\n" +
                  "  - title: Introduction\n" +
                  "    description: Basic concepts\n" +
                  "    order: 1\n" +
                  "    theory:\n" +
                  "      title: Introduction\n" +
                  "      content: |\n" +
                  "        # Hello\n" +
                  "        This is **theory-only** markdown.\n");
                setMaterialsYamlMode("merge");
                setMaterialsYamlFileKey(k => k + 1);
                setShowImportMaterialsYaml(true);
              }} disabled={materialsRepoSyncing || materialsSaving || materialsReordering}>
                    Import YAML
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={syncMaterialsFromRepoMenu}
                    disabled={materialsRepoSyncing || materialsSaving || materialsReordering}
                    className="flex items-center gap-2"
                    aria-label="Sync topics/theory from repo menu"
                    title="Sync topics/theory from repo menu (theories/*_theory.yml)"
                  >
                    <RefreshCcw className={`w-4 h-4 ${materialsRepoSyncing ? "animate-spin" : ""}`} />
                    {materialsRepoSyncing ? "Syncing…" : "Sync from repo"}
                  </Button>

                  <Button variant="secondary" onClick={async () => {
                try {
                  const { blob, filename } = await exportAdminMaterialTopicsYaml({
                    language: materialsLanguage
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (error: unknown) {
                  showToast({ type: "error", message: getErrorMessage(error, "Failed to export YAML") });
                }
              }} disabled={materialsRepoSyncing || materialsSaving || materialsReordering}>
                    Export YAML
                  </Button>

                  <Button onClick={() => {
                setNewMaterialTopic({
                  title: "",
                  description: "",
                  order: "",
                  language: materialsLanguage,
                  theoryContent: ""
                });
                setShowCreateMaterialTopic(true);
              }} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create topic
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 md:col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-mono font-semibold text-text-primary">Topics</div>
                  <div className="text-xs font-mono text-text-secondary">{materialsReordering ? "Reordering…" : materialsTopics.length}</div>
                </div>

                <DndContext sensors={materialsSensors} collisionDetection={closestCenter} onDragEnd={handleMaterialsDragEnd}>
                  <SortableContext items={materialsTopics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="mt-3 space-y-2">
                      {materialsTopics.map(topic => {
                        const isSelected = materialsSelectedTopicId === topic.id;
                        return <SortableMaterialTopicRow key={topic.id} topic={topic} selected={isSelected} onSelect={() => selectMaterialTopic(topic.id)} />;
                      })}
                      {!materialsTopics.length && <div className="text-sm font-mono text-text-secondary space-y-2">
                          <div>No global topics for {materialsLanguage}.</div>

                          {materialsDiagnostics ? <div className="text-[11px] font-mono text-text-secondary opacity-80">
                              In DB: legacy topics={materialsDiagnostics.legacyTopics}, class topics={materialsDiagnostics.topicsNewClass}
                            </div> : null}

                          {materialsDiagnostics?.legacyTopics ? <div>
                              <Button variant="secondary" size="sm" onClick={importMaterialsFromLegacyDb} disabled={materialsLegacyImporting}>
                                {materialsLegacyImporting ? "Importing…" : "Import from existing DB topics"}
                              </Button>
                            </div> : null}

                          {materialsDiagnostics?.topicsNewClass ? <div className="text-[11px] font-mono text-text-secondary opacity-80">
                              Note: class-specific topics exist, but this page shows only global topics (class = NULL).
                            </div> : null}
                        </div>}
                    </div>
                  </SortableContext>
                </DndContext>
              </Card>

              <Card className="p-4 md:col-span-2">
                {!materialsSelectedTopic || !materialDraft ? <div className="text-sm font-mono text-text-secondary">Select a topic to edit.</div> : <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-mono font-semibold text-text-primary">Edit topic</div>
                        <div className="mt-1 text-xs font-mono text-text-secondary">ID: {materialsSelectedTopic.id}{materialsDirty ? " • Unsaved changes" : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => setMaterialPreview(p => !p)}>
                          {materialPreview ? "Hide preview" : "Preview"}
                        </Button>
                        {materialsAutoSaveState !== "idle" && <div className={`text-xs font-mono ${materialsAutoSaveState === "error" ? "text-accent-error" : "text-text-secondary"}`}>
                            {materialsAutoSaveState === "saving" ? "Auto-saving…" : materialsAutoSaveState === "saved" ? "Auto-saved" : "Auto-save failed"}
                          </div>}
                        <Button onClick={handleSaveMaterial} disabled={materialsSaving || !materialsDirty}>
                          <Save className="w-4 h-4 mr-2" />
                          {materialsSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="secondary" onClick={() => {
                  setMaterialToDelete(materialsSelectedTopic);
                  setShowDeleteMaterialConfirm(true);
                }} className="text-accent-error hover:opacity-85">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono text-text-secondary mb-1">Title</label>
                        <Input value={materialDraft.title} onChange={e => {
                    setMaterialDraft({
                      ...materialDraft,
                      title: e.target.value
                    });
                    setMaterialsDirty(true);
                  }} />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-text-secondary mb-1">Order</label>
                        <Input value={materialDraft.order} onChange={e => {
                    setMaterialDraft({
                      ...materialDraft,
                      order: e.target.value
                    });
                    setMaterialsDirty(true);
                  }} />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-text-secondary mb-1">Language</label>
                        <select value={materialDraft.language} onChange={e => {
                    const lang = parseMaterialsLanguage(e.target.value);
                    if (!lang) return;
                    setMaterialDraft({
                      ...materialDraft,
                      language: lang
                    });
                    setMaterialsDirty(true);
                  }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                          <option value="JAVA">JAVA</option>
                          <option value="PYTHON">PYTHON</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-text-secondary mb-1">Description</label>
                      <textarea value={materialDraft.description} onChange={e => {
                  setMaterialDraft({
                    ...materialDraft,
                    description: e.target.value
                  });
                  setMaterialsDirty(true);
                }} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[80px]" />
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-sm font-mono font-semibold text-text-primary">Theory (Markdown)</div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
                              if (!theoryBlockId) {
                                showToast({ type: "error", message: "This topic has no theory yet" });
                                return;
                              }
                              if (materialsTheoryDirty || materialsDirty) {
                                showToast({ type: "error", message: "Save your changes first, then translate." });
                                return;
                              }

                              const ok = confirm("Translate this theory to English and store it in DB?");
                              if (!ok) return;

                              setMaterialsTranslatingEn(true);
                              try {
                                await translateAdminTheoryBlockToEn(theoryBlockId, { force: false });
                                showToast({ type: "success", message: "Saved EN translation." });
                              } catch (error: unknown) {
                                showToast({ type: "error", message: getErrorMessage(error, "Failed to translate") });
                              } finally {
                                setMaterialsTranslatingEn(false);
                              }
                            }}
                            disabled={!materialsSelectedTopic?.theoryBlock || materialsTranslatingEn || materialsSaving || materialsReordering}
                          >
                            <Languages className="w-4 h-4 mr-2" />
                            {materialsTranslatingEn ? "Translating…" : "Translate → EN"}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={openTheoryHistoryModal} disabled={!materialsSelectedTopic.theoryBlock}>
                            <History className="w-4 h-4 mr-2" />
                            History
                          </Button>
                          <Button variant="secondary" size="sm" onClick={async () => {
                    const ok = confirm("Remove theory from this topic?");
                    if (!ok) return;
                    try {
                      setMaterialsSaving(true);
                      const res = await updateAdminMaterialTopic(materialsSelectedTopic.id, {
                        clearTheory: true
                      });
                      const updated = res.topic;
                      setMaterialsTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
                      setMaterialsSelectedTopic(updated);
                      setMaterialDraft({
                        title: updated.title,
                        description: updated.description || "",
                        order: String(updated.order ?? 0),
                        language: updated.language,
                        theoryTitle: updated.title,
                        theoryContent: ""
                      });
                      setMaterialsDirty(false);
                      setMaterialsTheoryDirty(false);
                      setMaterialsAutoSaveState("idle");
                    } catch (error: unknown) {
                      showToast({ type: "error", message: getErrorMessage(error, "Failed to remove theory") });
                    } finally {
                      setMaterialsSaving(false);
                    }
                  }}>
                          Remove theory
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs font-mono text-text-secondary mb-1">Theory title</label>
                          <Input value={materialDraft.theoryTitle} onChange={e => {
                      setMaterialDraft({
                        ...materialDraft,
                        theoryTitle: e.target.value
                      });
                      setMaterialsDirty(true);
                      setMaterialsTheoryDirty(true);
                      setMaterialsAutoSaveState("idle");
                    }} />
                        </div>

                        <div>
                          <label className="block text-xs font-mono text-text-secondary mb-1">Theory content</label>
                          <textarea value={materialDraft.theoryContent} onChange={e => {
                      setMaterialDraft({
                        ...materialDraft,
                        theoryContent: e.target.value
                      });
                      setMaterialsDirty(true);
                      setMaterialsTheoryDirty(true);
                      setMaterialsAutoSaveState("idle");
                    }} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[240px]" placeholder="Write theory in Markdown..." />
                        </div>

                        {materialPreview && <div className="p-3 rounded-md border border-border bg-bg-code">
                            <div className="text-xs font-mono text-text-secondary mb-2">Preview</div>
                            <MarkdownView content={materialDraft.theoryContent || ""} />
                          </div>}
                      </div>
                    </div>
                  </div>}
              </Card>
            </div>
          </div>}

        {}
        {activeTab === "library" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Task library moderation</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">
                    Review teacher submissions and approve/reject for the public library.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-text-secondary">Status</div>
                  <select value={libraryStatus} onChange={e => {
                const status = parseLibraryStatus(e.target.value);
                if (!status) return;
                setLibraryStatus(status);
                setLibrarySelectedTaskId(null);
                setLibrarySelectedTask(null);
                setLibraryRejectReason("");
              }} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 md:col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-mono font-semibold text-text-primary">Tasks</div>
                  <div className="text-xs font-mono text-text-secondary">{libraryTasks.length}</div>
                </div>

                <div className="mt-3 space-y-2">
                  {libraryTasks.map(task => {
                const isSelected = librarySelectedTaskId === task.id;
                const statusClass = task.status === "PENDING" ? "border-accent-warning/60 text-accent-warning bg-accent-warning/10" : task.status === "APPROVED" ? "border-accent-success/60 text-accent-success bg-accent-success/10" : task.status === "REJECTED" ? "border-accent-error/60 text-accent-error bg-accent-error/10" : "border-border text-text-secondary bg-bg-secondary";
                return <button key={task.id} onClick={() => selectLibraryTask(task.id)} className={`w-full text-left rounded-md border px-3 py-2 transition-fast ${isSelected ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-mono text-text-primary truncate">{task.title}</div>
                            <div className="mt-0.5 text-[11px] font-mono text-text-secondary truncate">
                              {task.author?.username ? `${task.author.username}${task.author.email ? ` (${task.author.email})` : ""}` : "Unknown author"}
                            </div>
                          </div>
                          <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusClass}`}>{task.status}</div>
                        </div>
                        <div className="mt-1 text-[11px] font-mono text-text-secondary flex items-center justify-between gap-2">
                          <span>{task.lang}</span>
                          <span>#{task.id}</span>
                        </div>
                      </button>;
              })}
                  {libraryTasks.length === 0 && <div className="text-xs font-mono text-text-secondary">No tasks for this filter.</div>}
                </div>
              </Card>

              <Card className="p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-mono font-semibold text-text-primary">Details</div>
                  <div className="text-xs font-mono text-text-secondary">{librarySelectedTask ? `#${librarySelectedTask.id}` : "Select a task"}</div>
                </div>

                {!librarySelectedTask ? <div className="mt-4 text-sm text-text-secondary font-mono">Select a task from the list to review it.</div> : <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-mono font-semibold text-text-primary">{librarySelectedTask.title}</div>
                        <div className="mt-1 text-xs font-mono text-text-secondary">
                          Author: {librarySelectedTask.author?.username || "Unknown"}{librarySelectedTask.author?.email ? ` (${librarySelectedTask.author.email})` : ""}
                        </div>
                      </div>
                      <div className={`px-3 py-1 text-xs font-mono border rounded-md ${librarySelectedTask.status === "PENDING" ? "border-accent-warning/60 bg-accent-warning/10 text-accent-warning" : librarySelectedTask.status === "APPROVED" ? "border-accent-success/60 bg-accent-success/10 text-accent-success" : librarySelectedTask.status === "REJECTED" ? "border-accent-error/60 bg-accent-error/10 text-accent-error" : "border-border bg-bg-code text-text-secondary"}`}>
                        {librarySelectedTask.status}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="text-xs font-mono text-text-secondary">
                        <div>Language: <span className="text-text-primary">{librarySelectedTask.lang}</span></div>
                        <div className="mt-1">Max attempts: <span className="text-text-primary">{librarySelectedTask.maxAttempts}</span></div>
                      </div>
                      <div className="text-xs font-mono text-text-secondary">
                        <div>Submitted: <span className="text-text-primary">{librarySelectedTask.submittedAt ? new Date(librarySelectedTask.submittedAt).toLocaleString() : "-"}</span></div>
                        <div className="mt-1">Published: <span className="text-text-primary">{librarySelectedTask.publishedAt ? new Date(librarySelectedTask.publishedAt).toLocaleString() : "-"}</span></div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">Description</div>
                      <div className="rounded-md border border-border bg-bg-code p-3 text-sm text-text-primary whitespace-pre-wrap">
                        {librarySelectedTask.description || "(empty)"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">Template</div>
                      <pre className="rounded-md border border-border bg-bg-code p-3 text-xs text-text-primary overflow-auto max-h-[45vh]">{librarySelectedTask.template || ""}</pre>
                    </div>

                    {librarySelectedTask.status === "REJECTED" && <div>
                        <div className="text-xs font-mono text-text-secondary mb-1">Rejection reason</div>
                        <div className="rounded-md border border-accent-error/40 bg-accent-error/10 p-3 text-sm text-accent-error whitespace-pre-wrap">
                          {librarySelectedTask.rejectionReason || "-"}
                        </div>
                      </div>}

                    <div className="pt-2 border-t border-border">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-mono text-text-secondary">
                          Updated: <span className="text-text-primary">{new Date(librarySelectedTask.updatedAt).toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="primary" onClick={handleApproveLibraryTask} disabled={libraryActing || librarySelectedTask.status !== "PENDING"} className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </Button>
                          <Button variant="secondary" onClick={handleRejectLibraryTask} disabled={libraryActing || librarySelectedTask.status !== "PENDING"} className="flex items-center gap-2 text-accent-error hover:opacity-85">
                            <XCircle className="w-4 h-4" />
                            Reject
                          </Button>
                        </div>
                      </div>

                      {librarySelectedTask.status === "PENDING" && <div className="mt-3">
                          <div className="text-xs font-mono text-text-secondary mb-1">Rejection reason (required for Reject)</div>
                          <textarea value={libraryRejectReason} onChange={e => setLibraryRejectReason(e.target.value)} rows={3} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Explain what needs fixing…" />
                        </div>}
                    </div>
                  </div>}
              </Card>
            </div>
          </div>}

        {}
        {activeTab === "emails" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Email announcements</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">
                    Send a newsletter to subscribers (Marketing) or send a targeted announcement (Notification/Updates).
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[11px] font-mono text-text-secondary mr-2">
                    Mode: <span className="text-text-primary">{emailDryRun ? "Dry run" : "Send"}</span>
                  </div>
                  <Button variant="secondary" onClick={() => setEmailLastResult(null)} disabled={emailSending || !emailLastResult}>
                    Clear result
                  </Button>
                  <Button variant="secondary" onClick={() => {
                setEmailDryRun(true);
                runAdminBroadcastEmail(true);
              }} disabled={emailSending}>
                    {emailSending ? "Working…" : "Dry run"}
                  </Button>
                  <Button variant="primary" onClick={() => {
                setEmailDryRun(false);
                runAdminBroadcastEmail(false);
              }} disabled={emailSending}>
                    {emailSending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-4 lg:col-span-2">
                <div className="text-sm font-mono font-semibold text-text-primary">Message</div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">Delivery</label>
                    <select value={emailDelivery} onChange={e => {
                  const v = parseEmailDelivery(e.target.value);
                  if (!v) return;
                  setEmailDelivery(v);
                  if (v === "NOTIFICATION") {
                    setEmailIncludeSubscribed(false);
                    setEmailAudience("ALL");
                    // keep existing targets; but mass-notify is off by default
                    setEmailNotifyAllUsers(false);
                    setEmailNotifyAllUsersConfirm("");
                  } else {
                    setEmailNotifyAllUsers(false);
                    setEmailNotifyAllUsersConfirm("");
                  }
                }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                      <option value="MARKETING">Marketing (subscribers, has unsubscribe)</option>
                      <option value="NOTIFICATION">Notification (targeted, no unsubscribe)</option>
                    </select>
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      {emailDelivery === "MARKETING" ? "For subscribed recipients (may land in Promotions)." : "For specific classes/emails (aims for Updates/Notifications tab)."}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">Subject</label>
                    <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject line" />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">Title (headline inside email)</label>
                    <Input value={emailTitle} onChange={e => setEmailTitle(e.target.value)} placeholder="Defaults to subject" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-mono text-text-secondary mb-1">Content</label>
                  <textarea value={emailContent} onChange={e => setEmailContent(e.target.value)} rows={10} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Write the email body (plain text)." />
                  <div className="mt-2 text-[11px] font-mono text-text-secondary">
                    Tip: plain text will be converted to safe HTML (paragraphs split by blank lines).
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-sm font-mono font-semibold text-text-primary">Recipients</div>

                <div className="mt-3 space-y-3">
                  {emailDelivery === "NOTIFICATION" && <div className="space-y-2 rounded-md border border-border bg-bg-code p-3">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" checked={emailNotifyAllUsers} onChange={e => {
                    const checked = e.target.checked;
                    setEmailNotifyAllUsers(checked);
                    if (checked) {
                      setEmailAudience("USERS");
                    }
                  }} className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-text-primary">Notify all users</div>
                          <div className="text-[11px] font-mono text-text-secondary">Sends to all verified USERS (ignores marketing subscription). Requires confirmation on Send.</div>
                        </div>
                      </div>

                      {emailNotifyAllUsers && <div>
                          <div className="text-[11px] font-mono text-text-secondary mb-1">Confirmation (type exactly: <span className="text-text-primary">ALL USERS</span>)</div>
                          <Input value={emailNotifyAllUsersConfirm} onChange={e => setEmailNotifyAllUsersConfirm(e.target.value)} placeholder="ALL USERS" />
                        </div>}
                    </div>}

                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={emailDelivery === "NOTIFICATION" ? false : emailIncludeSubscribed} onChange={e => setEmailIncludeSubscribed(e.target.checked)} disabled={emailDelivery === "NOTIFICATION"} className="mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-text-primary">Include subscribed recipients</div>
                      <div className="text-[11px] font-mono text-text-secondary">Respects marketing emails subscription flag.</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Subscribed audience</div>
                    <select value={emailAudience} onChange={e => {
                  const audience = parseEmailAudience(e.target.value);
                  if (audience) setEmailAudience(audience);
                }} disabled={emailDelivery === "NOTIFICATION" || !emailIncludeSubscribed} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm disabled:opacity-50">
                      <option value="ALL">USERS + STUDENTS</option>
                      <option value="USERS">USERS only</option>
                      <option value="STUDENTS">STUDENTS only</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Add specific emails (comma / space / newline separated)</div>
                    <textarea value={emailRecipientEmails} onChange={e => setEmailRecipientEmails(e.target.value)} rows={4} className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="alice@example.com\nbob@example.com" />
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      Parsed: {parseEmailList(emailRecipientEmails).length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Add specific user IDs (comma / space / newline separated)</div>
                    <textarea value={emailRecipientUserIds} onChange={e => setEmailRecipientUserIds(e.target.value)} rows={2} className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="123\n456" />
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      Parsed: {parseIdList(emailRecipientUserIds).length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Add class recipients</div>
                    <div className="max-h-[220px] overflow-auto rounded-md border border-border bg-bg-code p-2">
                      {classes.length === 0 ? <div className="text-[11px] font-mono text-text-secondary">No classes loaded.</div> : <div className="space-y-1">
                          {classes
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => {
                        const checked = emailSelectedClassIds.includes(c.id);
                        return <label key={c.id} className="flex items-start gap-2 text-xs font-mono text-text-primary cursor-pointer select-none">
                                <input type="checkbox" checked={checked} onChange={() => toggleEmailClassId(c.id)} className="mt-0.5" />
                                <span className="min-w-0">
                                  <span className="truncate">{c.name}</span>
                                  <span className="ml-2 text-[11px] text-text-secondary">#{c.id} · {c.language}</span>
                                </span>
                              </label>;
                      })}
                        </div>}
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">Selected classes: {emailSelectedClassIds.length}</div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Recipient limit (max 5000)</div>
                    <Input value={emailLimit} onChange={e => setEmailLimit(e.target.value)} placeholder="5000" />
                  </div>
                </div>
              </Card>
            </div>

            {emailLastResult && <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-mono font-semibold text-text-primary">Result</div>
                  <div className="text-xs font-mono text-text-secondary">{emailLastResult.dryRun ? "Dry run" : "Sent"}</div>
                </div>

                {emailLastResult.dryRun ? <div className="mt-3 space-y-3">
                    <div className="text-xs font-mono text-text-secondary">Recipients: <span className="text-text-primary">{emailLastResult.count}</span></div>
                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">Sample (up to 20)</div>
                      <div className="rounded-md border border-border bg-bg-code p-3 text-xs font-mono text-text-primary overflow-auto">
                        {(emailLastResult.sample || []).map((r) => <div key={`${r.kind}:${r.id}`}>{r.email} <span className="text-text-secondary">({r.kind} #{r.id})</span></div>)}
                        {(emailLastResult.sample || []).length === 0 && <div className="text-text-secondary">(empty)</div>}
                      </div>
                    </div>
                  </div> : isAdminBroadcastSendResult(emailLastResult) ? <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md border border-border bg-bg-code p-3">
                      <div className="text-xs font-mono text-text-secondary">Recipients</div>
                      <div className="mt-1 text-lg font-mono font-semibold text-text-primary">{emailLastResult.recipients}</div>
                    </div>
                    <div className="rounded-md border border-border bg-bg-code p-3">
                      <div className="text-xs font-mono text-text-secondary">Sent</div>
                      <div className="mt-1 text-lg font-mono font-semibold text-text-primary">{emailLastResult.sent}</div>
                    </div>
                    <div className="rounded-md border border-border bg-bg-code p-3">
                      <div className="text-xs font-mono text-text-secondary">Failed</div>
                      <div className="mt-1 text-lg font-mono font-semibold text-text-primary">{emailLastResult.failed}</div>
                    </div>
                  </div> : null}
              </Card>}
          </div>}

        {activeTab === "certificates" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Global contest-style certificate editor</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">
                    Admin editor now uses the same custom HTML/CSS + placeholders flow as contest certificates.
                  </div>
                </div>

                <div className="text-xs font-mono text-text-secondary">
                  Last template ID: <span className="text-text-primary">{globalCertTemplateId || "—"}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Template name"
                  value={globalCertPublishName}
                  onChange={(e) => setGlobalCertPublishName(e.target.value)}
                  placeholder="Global Contest Template"
                />
                <div>
                  <label className="block text-xs font-mono text-text-secondary mb-1">Background URL (optional)</label>
                  <Input
                    value={globalCertBackgroundUrl}
                    onChange={(e) => setGlobalCertBackgroundUrl(normalizeCertificateBackgroundSource(e.target.value))}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button
                  variant={globalCertEditorMode === "visual" ? "primary" : "secondary"}
                  onClick={() => setGlobalCertEditorMode("visual")}
                >
                  Visual mode
                </Button>
                <Button
                  variant={globalCertEditorMode === "advanced" ? "primary" : "secondary"}
                  onClick={() => setGlobalCertEditorMode("advanced")}
                >
                  Advanced mode
                </Button>
                <Button
                  variant="secondary"
                  onClick={applyLoadedTemplateToVisualLayout}
                  disabled={!String(globalCertTemplateCss ?? "").trim() && !String(globalCertTemplateHtml ?? "").trim()}
                >
                  Apply loaded template to visual
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="inline-flex items-center gap-2 px-2 py-1 border border-border rounded bg-bg-code cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      uploadGlobalCertBackgroundFile(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />
                  Upload background file
                </label>
                <Button variant="secondary" onClick={() => setGlobalCertBackgroundUrl("")} disabled={!globalCertBackgroundUrl}>Clear background</Button>
                <Button variant="secondary" onClick={applyGlobalContestStyleAutoLayout}>Apply contest autolayout</Button>
                <Button variant={globalCertTheme === "classic" ? "primary" : "secondary"} onClick={() => setGlobalCertTheme("classic")}>Preset: Classic</Button>
                <Button variant={globalCertTheme === "gold" ? "primary" : "secondary"} onClick={() => setGlobalCertTheme("gold")}>Preset: Gold</Button>
                <Button variant={globalCertTheme === "dark" ? "primary" : "secondary"} onClick={() => setGlobalCertTheme("dark")}>Preset: Dark</Button>
                <Button variant="secondary" onClick={createGlobalStudyCodTemplate} disabled={globalCertCreating}>
                  {globalCertCreating ? "Creating..." : "Create draft template"}
                </Button>
              </div>

              <div>
                <div className="text-xs font-mono text-text-secondary mb-2">Fields</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {GLOBAL_CERT_TEMPLATE_FIELD_KEYS.map((fieldKey) => (
                    <label key={`global-field-${fieldKey}`} className="rounded border border-border px-2 py-1.5 bg-bg-code text-xs font-mono text-text-secondary">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-primary">{globalCertTemplateFieldLabel(fieldKey)}</span>
                        <input
                          type="checkbox"
                          checked={globalCertFields[fieldKey].isEnabled}
                          onChange={(e) => setGlobalCertFields((prev) => ({
                            ...prev,
                            [fieldKey]: {
                              ...prev[fieldKey],
                              isEnabled: e.target.checked,
                              isRequired: e.target.checked ? prev[fieldKey].isRequired : false,
                            },
                          }))}
                        />
                      </div>
                      <label className="mt-1 inline-flex items-center gap-1 text-[11px]">
                        <input
                          type="checkbox"
                          checked={globalCertFields[fieldKey].isRequired}
                          disabled={!globalCertFields[fieldKey].isEnabled}
                          onChange={(e) => setGlobalCertFields((prev) => ({
                            ...prev,
                            [fieldKey]: {
                              ...prev[fieldKey],
                              isRequired: e.target.checked,
                            },
                          }))}
                        />
                        required
                      </label>
                    </label>
                  ))}
                </div>
              </div>

              {globalCertEditorMode === "visual" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-text-secondary">Visual canvas (drag blocks and objects)</span>
                    <span className="text-text-secondary">
                      <span className="text-text-primary">Shift</span>: lock axis · <span className="text-text-primary">Alt</span>: free move (no snap)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-text-secondary">Selected:</span>
                    <select
                      value={globalCertSelectedBlock}
                      onChange={(e) => setGlobalCertSelectedBlock(e.target.value as GlobalCertBlockKey)}
                      className="px-2 py-1 border border-border rounded bg-bg-code text-text-primary"
                    >
                      {GLOBAL_CERT_BLOCK_KEYS.map((key) => (
                        <option key={`global-cert-select-${key}`} value={key}>
                          {globalCertBlockLabel(key)}
                        </option>
                      ))}
                    </select>
                    <span className="text-text-secondary">Align:</span>
                    <Button
                      variant={globalCertLayout[globalCertSelectedBlock]?.align === "left" ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertLayout((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: { ...prev[globalCertSelectedBlock], align: "left" },
                        }))
                      }
                    >
                      Left
                    </Button>
                    <Button
                      variant={globalCertLayout[globalCertSelectedBlock]?.align === "center" ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertLayout((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: { ...prev[globalCertSelectedBlock], align: "center" },
                        }))
                      }
                    >
                      Center
                    </Button>
                    <Button
                      variant={globalCertLayout[globalCertSelectedBlock]?.align === "right" ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertLayout((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: { ...prev[globalCertSelectedBlock], align: "right" },
                        }))
                      }
                    >
                      Right
                    </Button>
                    <span className="text-text-secondary ml-2">Zone:</span>
                    <Button
                      variant={globalCertLayout[globalCertSelectedBlock]?.sizeMode === "fixed" ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertLayout((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: { ...prev[globalCertSelectedBlock], sizeMode: "fixed" },
                        }))
                      }
                    >
                      Fixed box
                    </Button>
                    <Button
                      variant={globalCertLayout[globalCertSelectedBlock]?.sizeMode === "auto" ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertLayout((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: { ...prev[globalCertSelectedBlock], sizeMode: "auto" },
                        }))
                      }
                    >
                      Auto grow
                    </Button>
                    <Button
                      variant={globalCertLayout[globalCertSelectedBlock]?.sizeMode === "stretch" ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertLayout((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: { ...prev[globalCertSelectedBlock], sizeMode: "stretch" },
                        }))
                      }
                    >
                      Stretch (100%)
                    </Button>
                    <span className="text-text-secondary ml-2">Visibility:</span>
                    <Button
                      variant={globalCertHiddenBlocks[globalCertSelectedBlock] ? "secondary" : "primary"}
                      onClick={() =>
                        setGlobalCertHiddenBlocks((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: false,
                        }))
                      }
                    >
                      Visible
                    </Button>
                    <Button
                      variant={globalCertHiddenBlocks[globalCertSelectedBlock] ? "primary" : "secondary"}
                      onClick={() =>
                        setGlobalCertHiddenBlocks((prev) => ({
                          ...prev,
                          [globalCertSelectedBlock]: true,
                        }))
                      }
                    >
                      Hide block
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setGlobalCertHiddenBlocks(defaultGlobalCertHiddenBlocksState())}
                    >
                      Restore all blocks
                    </Button>
                  </div>
                  <div className="w-full border border-border rounded-md bg-bg-code/40 p-2">
                    <div
                      ref={globalCertCanvasRef}
                      className="relative w-full aspect-[1123/794] border border-border rounded-md overflow-hidden select-none mx-auto max-w-[1123px]"
                      style={{
                        background:
                          globalCertTheme === "dark"
                            ? "#0f172a"
                            : globalCertTheme === "gold"
                              ? "linear-gradient(135deg, #fffdf3 0%, #fff2c9 100%)"
                              : "linear-gradient(135deg, #ffffff 0%, #eef5ff 100%)",
                        cursor:
                          globalCertDraggingBlock || globalCertDraggingExtraObjectId
                            ? "grabbing"
                            : "default",
                      }}
                      onMouseMove={handleGlobalCertCanvasMouseMove}
                      onMouseUp={stopGlobalCertDragging}
                      onMouseLeave={stopGlobalCertDragging}
                      onMouseDown={() => {
                        setGlobalCertSelectedExtraObjectId(null);
                        setGlobalCertCanvasContextMenu(null);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) return;
                        const x = applyGlobalCertSnap(((event.clientX - rect.left) / rect.width) * 100);
                        const y = applyGlobalCertSnap(((event.clientY - rect.top) / rect.height) * 100);
                        setGlobalCertCanvasContextMenu({
                          left: event.clientX - rect.left,
                          top: event.clientY - rect.top,
                          x,
                          y,
                        });
                      }}
                    >
                    {GLOBAL_CERT_BLOCK_KEYS.map((key) => {
                      if (globalCertHiddenBlocks[key]) return null;
                      const block = globalCertLayout[key];
                      if (!block) return null;
                      const align = block.align === "center" || block.align === "right" ? block.align : "left";
                      const sizeMode = block.sizeMode === "auto" || block.sizeMode === "stretch" ? block.sizeMode : "fixed";
                      const transform = align === "center" ? "translate(-50%, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
                      const isSelected = globalCertSelectedExtraObjectId == null && globalCertSelectedBlock === key;
                      return (
                        <div
                          key={`gc-block-${key}`}
                          className={`absolute ${isSelected ? "ring-2 ring-primary" : "ring-1 ring-border/60"} rounded-sm`}
                          style={{
                            left: `${block.x}%`,
                            top: `${block.y}%`,
                            width: sizeMode === "auto" ? "auto" : `${block.width}%`,
                            maxWidth: sizeMode === "auto" ? `${block.width}%` : undefined,
                            minHeight: `${block.height}%`,
                            transform,
                            textAlign: align,
                            color: globalCertPreviewColor(globalCertTheme, key),
                            fontSize: `${block.fontSize}px`,
                            fontWeight: block.fontWeight,
                            display: "block",
                            lineHeight: 1.2,
                            padding: "2px 6px",
                            cursor: globalCertDraggingBlock === key ? "grabbing" : "grab",
                            background: isSelected ? "rgba(59,130,246,0.10)" : "rgba(15,23,42,0.04)",
                            overflow: "visible",
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setGlobalCertCanvasContextMenu(null);
                            setGlobalCertSelectedExtraObjectId(null);
                            setGlobalCertSelectedBlock(key);
                            setGlobalCertDraggingBlock(key);
                            globalCertDragOriginRef.current = {
                              kind: "block",
                              keyOrId: key,
                              clientX: event.clientX,
                              clientY: event.clientY,
                              x: block.x,
                              y: block.y,
                            };
                          }}
                        >
                          {key === "qr" ? (
                            <div className="w-full h-full border border-dashed border-border/80 bg-white/80 flex items-center justify-center text-[11px]">QR</div>
                          ) : (
                            <span className="whitespace-pre-wrap break-words">{globalCertCanvasSampleValue(key)}</span>
                          )}
                          <button
                            type="button"
                            className="absolute right-0 bottom-0 w-2.5 h-2.5 bg-primary rounded-sm"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setGlobalCertCanvasContextMenu(null);
                              setGlobalCertSelectedExtraObjectId(null);
                              setGlobalCertSelectedBlock(key);
                              setGlobalCertResizingBlock(key);
                              setGlobalCertResizeStart({
                                clientX: event.clientX,
                                clientY: event.clientY,
                                width: block.width,
                                height: block.height,
                              });
                            }}
                            aria-label={`Resize ${key}`}
                          />
                        </div>
                      );
                    })}

                    {[...globalCertExtraObjects]
                      .sort((a, b) => Number(a.zIndex ?? 0) - Number(b.zIndex ?? 0))
                      .map((obj) => {
                        const align = obj.align === "left" || obj.align === "right" ? obj.align : "center";
                        const transform = align === "center" ? "translate(-50%, -50%)" : align === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)";
                        const isSelected = globalCertSelectedExtraObjectId === obj.id;
                        return (
                          <div
                            key={obj.id}
                            className={`absolute ${isSelected ? "ring-2 ring-primary" : "ring-1 ring-border/60"} rounded-sm`}
                            style={{
                              left: `${obj.x}%`,
                              top: `${obj.y}%`,
                              width: `${obj.width}%`,
                              height: `${obj.height}%`,
                              transform,
                              zIndex: Number(obj.zIndex ?? 20),
                              cursor: globalCertDraggingExtraObjectId === obj.id ? "grabbing" : "grab",
                              background: obj.type === "shape" ? obj.backgroundColor : "rgba(15,23,42,0.04)",
                              color: obj.color,
                              opacity: obj.opacity,
                              borderRadius: `${obj.borderRadius}px`,
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                              padding: "2px 6px",
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setGlobalCertCanvasContextMenu(null);
                              setGlobalCertSelectedExtraObjectId(obj.id);
                              setGlobalCertDraggingExtraObjectId(obj.id);
                              globalCertDragOriginRef.current = {
                                kind: "extra",
                                keyOrId: obj.id,
                                clientX: event.clientX,
                                clientY: event.clientY,
                                x: obj.x,
                                y: obj.y,
                              };
                            }}
                          >
                            {obj.type === "image" ? (
                              obj.imageUrl ? <img src={obj.imageUrl} alt="Certificate element image" className="w-full h-full object-contain pointer-events-none" /> : <span className="text-[11px]">Image</span>
                            ) : obj.type === "shape" ? null : (
                              <span className="truncate" style={{ fontSize: `${obj.fontSize}px`, fontWeight: obj.fontWeight }}>{obj.text || "Text"}</span>
                            )}
                            <button
                              type="button"
                              className="absolute right-0 bottom-0 w-2.5 h-2.5 bg-primary rounded-sm"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setGlobalCertSelectedExtraObjectId(obj.id);
                                setGlobalCertResizingExtraObjectId(obj.id);
                                setGlobalCertExtraResizeStart({
                                  clientX: event.clientX,
                                  clientY: event.clientY,
                                  width: obj.width,
                                  height: obj.height,
                                  x: obj.x,
                                  y: obj.y,
                                  align,
                                  edge: "right",
                                });
                              }}
                              aria-label="Resize object"
                            />
                          </div>
                        );
                      })}

                    {globalCertCanvasContextMenu ? (
                      <div
                        className="absolute z-[200] min-w-[190px] rounded-md border border-border bg-bg-base p-2 shadow-lg text-xs font-mono"
                        style={{ left: globalCertCanvasContextMenu.left, top: globalCertCanvasContextMenu.top }}
                      >
                        <div className="text-text-secondary mb-2">
                          x: {globalCertCanvasContextMenu.x.toFixed(1)}% · y: {globalCertCanvasContextMenu.y.toFixed(1)}%
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          <Button variant="secondary" onClick={() => addGlobalCertExtraObjectAtPosition("text", globalCertCanvasContextMenu.x, globalCertCanvasContextMenu.y)}>Add text object</Button>
                          <Button variant="secondary" onClick={() => addGlobalCertExtraObjectAtPosition("image", globalCertCanvasContextMenu.x, globalCertCanvasContextMenu.y)}>Add image object</Button>
                          <Button variant="secondary" onClick={() => addGlobalCertExtraObjectAtPosition("shape", globalCertCanvasContextMenu.x, globalCertCanvasContextMenu.y)}>Add shape object</Button>
                          {globalCertSelectedExtraObjectId ? (
                            <Button variant="secondary" onClick={() => moveSelectedGlobalCertObjectToPosition(globalCertCanvasContextMenu.x, globalCertCanvasContextMenu.y)}>
                              Move selected here
                            </Button>
                          ) : null}
                          <Button variant="secondary" onClick={() => setGlobalCertCanvasContextMenu(null)}>Close</Button>
                        </div>
                      </div>
                    ) : null}
                    </div>
                  </div>
                  {globalCertSelectedExtraObjectId ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Button variant="secondary" onClick={duplicateSelectedGlobalCertExtraObject}>Duplicate object</Button>
                      <Button variant="secondary" onClick={() => changeSelectedGlobalCertExtraLayer(1)}>Layer +1</Button>
                      <Button variant="secondary" onClick={() => changeSelectedGlobalCertExtraLayer(-1)}>Layer -1</Button>
                      <Button variant="secondary" onClick={removeSelectedGlobalCertExtraObject}>Delete object</Button>
                      <label className="inline-flex items-center gap-2 px-2 py-1 border border-border rounded bg-bg-code cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            uploadSelectedGlobalCertExtraImageFile(e.target.files?.[0] ?? null);
                            e.currentTarget.value = "";
                          }}
                        />
                        Upload image to selected
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-text-secondary mb-1">HTML template</label>
                  <textarea
                    value={globalCertTemplateHtml}
                    onChange={(e) => setGlobalCertTemplateHtml(e.target.value)}
                    rows={14}
                    className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-text-secondary mb-1">CSS template</label>
                  <textarea
                    value={globalCertTemplateCss}
                    onChange={(e) => setGlobalCertTemplateCss(e.target.value)}
                    rows={14}
                    className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-text-secondary mb-1">Extra CSS (optional)</label>
                <textarea value={globalCertExtraCss} onChange={e => setGlobalCertExtraCss(e.target.value)} rows={5} className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" />
              </div>

              {globalCertUnknownPlaceholders.length > 0 ? <div className="text-xs font-mono text-accent-error">Unknown placeholders: {globalCertUnknownPlaceholders.join(", ")}</div> : null}
              {globalCertMissingRequiredPlaceholders.length > 0 ? <div className="text-xs font-mono text-accent-error">Missing required placeholders: {globalCertMissingRequiredPlaceholders.join(", ")}</div> : null}

              <div className="border border-border bg-bg-base rounded-lg overflow-hidden">
                <div className="px-2 py-1 text-xs text-text-secondary border-b border-border">Full template preview</div>
                            <iframe
                  title="admin-global-certificate-preview"
                              className="w-full h-[70vh] min-h-[360px] md:min-h-[620px] bg-white"
                  sandbox="allow-scripts"
                  srcDoc={globalCertPublishPreviewSrcDoc}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => void loadCertificateTemplateLibrary()} disabled={certificateTemplateLibraryLoading}>
                  {certificateTemplateLibraryLoading ? "Refreshing template library..." : "Refresh templates"}
                </Button>
                <Button onClick={publishGlobalStudyCodTemplate} disabled={globalCertPublishBusy}>
                  {globalCertPublishBusy ? "Publishing template..." : "Publish as active template"}
                </Button>
              </div>

              {globalCertMessage ? <div className="text-sm text-text-primary font-mono">{globalCertMessage}</div> : null}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="text-sm font-mono font-semibold text-text-primary">Template library</div>
              {certificateTemplateLibraryError ? <div className="text-xs font-mono text-accent-error">{certificateTemplateLibraryError}</div> : null}
              <div className="max-h-[260px] overflow-auto border border-border rounded bg-bg-base">
                <table className="min-w-[560px] md:min-w-[720px] w-full text-[11px] font-mono">
                  <caption className="sr-only">Certificate template library</caption>
                  <thead className="bg-bg-hover">
                    <tr>
                      <th className="hidden md:table-cell p-1.5 border-b border-border text-left">ID</th>
                      <th className="p-1.5 border-b border-border text-left">Name</th>
                      <th className="p-1.5 border-b border-border text-left">Type</th>
                      <th className="hidden lg:table-cell p-1.5 border-b border-border text-left">Contest</th>
                      <th className="hidden sm:table-cell p-1.5 border-b border-border text-left">Version</th>
                      <th className="p-1.5 border-b border-border text-left">Status</th>
                      <th className="p-1.5 border-b border-border text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificateTemplateLibrary.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-2 text-text-secondary">
                          {certificateTemplateLibraryLoading ? "Loading template library..." : "No templates yet. Publish one to get started."}
                        </td>
                      </tr>
                    ) : (
                      certificateTemplateLibrary.map((tpl) => (
                        <tr key={`admin-cert-tpl-${tpl.id}`} className="odd:bg-bg-base even:bg-bg-surface">
                          <td className="hidden md:table-cell p-1.5 border-b border-border">{tpl.id}</td>
                          <td className="p-1.5 border-b border-border truncate max-w-[280px]" title={tpl.name}>{tpl.name}</td>
                          <td className="p-1.5 border-b border-border">{tpl.type}</td>
                          <td className="hidden lg:table-cell p-1.5 border-b border-border">{tpl.contestId ?? "—"}</td>
                          <td className="hidden sm:table-cell p-1.5 border-b border-border">{tpl.version}</td>
                          <td className="p-1.5 border-b border-border">{tpl.isActive ? "Active" : "Inactive"}</td>
                          <td className="p-1.5 border-b border-border">
                            <Button variant="secondary" onClick={() => void loadGlobalTemplateFromLibrary(tpl.id)}>
                              Open in editor
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>}

        {activeTab === "mailbox" && <AdminMailWorkspace />}

        {}
        {activeTab === "support" && <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={supportView === "chat" ? "primary" : "secondary"} onClick={() => setSupportView("chat")}>
                Chat
              </Button>
              <Button variant={supportView === "legacy" ? "primary" : "secondary"} onClick={() => setSupportView("legacy")}>
                Legacy tickets
              </Button>
            </div>

            {supportView === "chat" ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 md:col-span-1">
                  <div className="text-sm font-mono font-semibold text-text-primary">Conversations</div>
                  <div className="mt-3 space-y-2">
                    {supportConversations.map(c => <button key={c.id} onClick={() => openSupportConversation(c.id)} className={`w-full text-left rounded-md border px-3 py-2 transition-fast ${supportSelectedConversationId === c.id ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-text-secondary truncate">{c.userEmail}</div>
                            <div className="text-sm font-mono text-text-primary truncate">{c.subject}</div>
                          </div>
                          <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.status === "OPEN" ? "border-accent-success/60 text-accent-success bg-accent-success/10" : "border-border text-text-secondary bg-bg-secondary"}`}>
                            {c.status}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-text-secondary font-mono">
                          {new Date(c.lastMessageAt).toLocaleString()}
                        </div>
                      </button>)}
                    {supportConversations.length === 0 && <div className="text-xs font-mono text-text-secondary">No conversations yet.</div>}
                  </div>
                </Card>

                <Card className="p-4 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-mono font-semibold text-text-primary">Thread</div>
                    <div className="text-xs font-mono text-text-secondary">
                      {supportSelectedConversationId ? `#${supportSelectedConversationId}` : "Select a conversation"}
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-border bg-bg-code p-3 h-[55vh] overflow-auto">
                    {supportChatLoading && <div className="text-xs font-mono text-text-secondary">Loading…</div>}
                    {!supportChatLoading && supportSelectedConversationId && supportMessages.length === 0 && <div className="text-xs font-mono text-text-secondary">No messages.</div>}
                    <div className="space-y-3">
                      {supportMessages.map(m => {
                    const isUser = m.senderType === "USER";
                    return <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                            <div className={`max-w-[85%] rounded-lg border px-3 py-2 ${isUser ? "border-border bg-bg-secondary" : "border-primary/50 bg-primary/10"}`}>
                              <div className="text-[11px] font-mono text-text-secondary flex items-center justify-between gap-3">
                                <span>{m.senderType}</span>
                                <span>{new Date(m.createdAt).toLocaleString()}</span>
                              </div>
                              {m.text && <div className="mt-1 text-sm whitespace-pre-wrap">{m.text}</div>}

                              {m.attachments?.length ? <div className="mt-2 space-y-1">
                                  {m.attachments.map(a => <div key={a.id} className="flex items-center justify-between gap-2 border border-border rounded-md px-2 py-1 bg-bg-base">
                                      <div className="min-w-0">
                                        <div className="text-xs font-mono text-text-primary truncate">{a.originalName}</div>
                                        <div className="text-[11px] font-mono text-text-secondary">{Math.max(0, Math.round((a.sizeBytes || 0) / 1024))} KB</div>
                                      </div>
                                      <Button variant="secondary" size="sm" onClick={() => downloadAdminAttachment(a.id)}>
                                        Download
                                      </Button>
                                    </div>)}
                                </div> : null}
                            </div>
                          </div>;
                  })}
                    </div>
                  </div>

                  {supportSelectedConversationId && <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-mono text-text-secondary">Reply</div>
                        <label className="text-xs font-mono text-text-secondary flex items-center gap-2">
                          <input type="checkbox" checked={supportChatSendEmail} onChange={e => setSupportChatSendEmail(e.target.checked)} />
                          send email
                        </label>
                      </div>
                      <textarea value={supportChatReplyText} onChange={e => setSupportChatReplyText(e.target.value)} rows={4} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Type an admin reply…" />
                      <div className="flex justify-end">
                        <Button variant="primary" onClick={handleAdminSupportReply} disabled={supportChatLoading}>
                          {supportChatLoading ? "Sending…" : "Send"}
                        </Button>
                      </div>
                    </div>}
                </Card>
              </div> : <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-bg-secondary border-b border-border">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">ID</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Subject</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Status</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Created</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Answered</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supportTickets.map(t => <tr key={t.id} className="border-b border-border hover:bg-bg-secondary transition-fast">
                          <td className="px-4 py-2 text-sm text-text-primary font-mono">{t.id}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">{t.userEmail}</td>
                          <td className="px-4 py-2 text-sm text-text-primary">{t.subject}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">{t.status}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">
                            {new Date(t.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">
                            {t.answeredAt ? new Date(t.answeredAt).toLocaleString() : "-"}
                          </td>
                          <td className="px-4 py-2">
                            <Button variant="secondary" size="sm" onClick={() => openSupportTicket(t)}>
                              View / Reply
                            </Button>
                          </td>
                        </tr>)}
                      {supportTickets.length === 0 && <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-text-secondary font-mono text-sm">
                            No tickets yet.
                          </td>
                        </tr>}
                    </tbody>
                  </table>
                </div>
              </Card>}
          </div>}

        {}
        {activeTab === "maintenance" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-mono font-semibold text-text-primary">Global maintenance mode</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Коли увімкнено — сайт блокується для всіх, крім SYSTEM_ADMIN. Доступними залишаються /api/auth/* та /api/admin/*.
                  </p>
                </div>
                <div className={`px-3 py-1 text-xs font-mono border rounded-md ${maintenanceState?.enabled ? "border-accent-warning/60 bg-accent-warning/10 text-accent-warning" : "border-border bg-bg-code text-text-secondary"}`}>
                  {maintenanceState?.enabled ? "ENABLED" : "DISABLED"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Title</div>
                  <Input value={maintenanceTitle} onChange={e => setMaintenanceTitle(e.target.value)} />
                </div>

                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Message</div>
                  <textarea value={maintenanceMessage} onChange={e => setMaintenanceMessage(e.target.value)} rows={5} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" />
                </div>

                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Until (optional)</div>
                  <Input type="datetime-local" value={maintenanceUntil} onChange={e => setMaintenanceUntil(e.target.value)} />
                  <div className="mt-1 text-xs text-text-secondary">
                    Якщо порожньо — без таймера. Значення перетворюється в ISO (UTC) перед збереженням.
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleEnableOrUpdateMaintenance} disabled={maintenanceSaving} className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  {maintenanceState?.enabled ? "Update" : "Enable"}
                </Button>
                <Button variant="secondary" onClick={handleDisableMaintenance} disabled={maintenanceSaving} className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Disable
                </Button>
              </div>
            </Card>
          </div>}
      </div>

      {}
      <Modal isOpen={showCreateMaterialTopic} onClose={() => setShowCreateMaterialTopic(false)} title="Create topic (materials)">
        <div className="space-y-4">
          <Input label="Title" value={newMaterialTopic.title} onChange={e => setNewMaterialTopic({
          ...newMaterialTopic,
          title: e.target.value
        })} required />

          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Description</label>
            <textarea value={newMaterialTopic.description} onChange={e => setNewMaterialTopic({
            ...newMaterialTopic,
            description: e.target.value
          })} rows={4} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Optional" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={newMaterialTopic.language} onChange={e => {
              const lang = parseMaterialsLanguage(e.target.value);
              if (!lang) return;
              setNewMaterialTopic({
                ...newMaterialTopic,
                language: lang
              });
            }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
              </select>
            </div>
            <Input label="Order (optional)" value={newMaterialTopic.order} onChange={e => setNewMaterialTopic({
            ...newMaterialTopic,
            order: e.target.value
          })} />
          </div>

          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Theory (Markdown, optional)</label>
            <textarea value={newMaterialTopic.theoryContent} onChange={e => setNewMaterialTopic({
            ...newMaterialTopic,
            theoryContent: e.target.value
          })} rows={10} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="If provided, it will be validated as theory-only (no practice/tasks sections)." />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateMaterialTopic(false)} disabled={creatingMaterialTopic}>
              Cancel
            </Button>
            <Button onClick={handleCreateMaterial} disabled={creatingMaterialTopic}>
              {creatingMaterialTopic ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteMaterialConfirm} onClose={() => {
      setShowDeleteMaterialConfirm(false);
      setMaterialToDelete(null);
    }} title="Delete topic">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary font-mono">
            Delete topic <span className="text-text-primary">{materialToDelete?.title}</span>?
          </p>
          <p className="text-xs text-text-secondary font-mono">
            Note: deletion is blocked if the topic still has tasks/control works.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => {
            setShowDeleteMaterialConfirm(false);
            setMaterialToDelete(null);
          }}>
              Cancel
            </Button>
            <Button onClick={handleDeleteMaterial} className="text-accent-error hover:opacity-85">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showImportMaterialsYaml} onClose={() => setShowImportMaterialsYaml(false)} title={`Import materials from YAML (${materialsLanguage})`}>
        <div className="space-y-4">
          <div className="text-xs font-mono text-text-secondary">
            Imports global topics (class = NULL) for the selected language. YAML can be pasted or uploaded from a .yml/.yaml file.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Mode</label>
              <select value={materialsYamlMode} onChange={e => {
              const mode = parseMaterialsYamlMode(e.target.value);
              if (mode) setMaterialsYamlMode(mode);
            }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="merge">merge (create/update by title)</option>
                <option value="replace">replace (delete existing empty global topics first)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Upload YAML file (optional)</label>
              <input
                key={materialsYamlFileKey}
                type="file"
                accept=".yml,.yaml,text/yaml,text/x-yaml"
                className="w-full text-xs font-mono text-text-secondary"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const text = await f.text();
                    setMaterialsYamlText(text);
                  } catch {
                    showToast({ type: "error", message: "Failed to read file" });
                  }
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">YAML</label>
            <textarea
              value={materialsYamlText}
              onChange={e => setMaterialsYamlText(e.target.value)}
              rows={16}
              className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md"
              placeholder={"language: JAVA\ntopics:\n  - title: ...\n    description: ...\n    order: 1\n    theory:\n      content: |\n        # Markdown"}
            />
            <div className="mt-2 text-[11px] font-mono text-text-secondary">
              Tip: Use <code>content: |</code> for multi-line Markdown.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowImportMaterialsYaml(false)} disabled={materialsYamlImporting}>
              Cancel
            </Button>
            <Button onClick={handleImportMaterialsYaml} disabled={materialsYamlImporting}>
              {materialsYamlImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTheoryHistory} onClose={() => {
      setShowTheoryHistory(false);
      setTheorySelectedSnapshot(null);
      setTheorySelectedVersion(null);
      setTheoryRollbackComment("");
    }} title={`Theory history${materialsSelectedTopic ? ` — ${materialsSelectedTopic.title}` : ""}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-3 md:col-span-1">
            <div className="flex items-center justify-between">
              <div className="text-sm font-mono font-semibold text-text-primary">Revisions</div>
              <div className="text-xs font-mono text-text-secondary">{theoryRevisions.length}</div>
            </div>
            {theoryHistoryLoading && <div className="mt-2 text-xs font-mono text-text-secondary">Loading…</div>}
            <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
              {theoryRevisions.map(r => {
              const selected = theorySelectedVersion === r.version;
              return <button key={r.id} onClick={() => selectTheoryRevision(r.version)} className={`w-full text-left rounded-md border px-3 py-2 transition-fast ${selected ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono text-text-primary">v{r.version} <span className="text-text-secondary">({r.action})</span></div>
                      <div className="text-[11px] font-mono text-text-secondary">{new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                    {r.comment && <div className="mt-1 text-[11px] font-mono text-text-secondary truncate">{r.comment}</div>}
                  </button>;
            })}
              {!theoryRevisions.length && !theoryHistoryLoading && <div className="text-xs font-mono text-text-secondary">No revisions</div>}
            </div>
          </Card>

          <Card className="p-3 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-mono font-semibold text-text-primary">Snapshot</div>
              <div className="text-xs font-mono text-text-secondary">
                {theorySelectedVersion ? `Selected v${theorySelectedVersion}` : "Select a revision"}
              </div>
            </div>

            <div className="mt-3">
              {theorySelectedSnapshot ? <div className="p-3 rounded-md border border-border bg-bg-code">
                  <div className="text-xs font-mono text-text-secondary mb-2">{theorySelectedSnapshot.title}</div>
                  <MarkdownView content={theorySelectedSnapshot.content || ""} />
                </div> : <div className="text-xs font-mono text-text-secondary">No snapshot loaded</div>}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <Input label="Rollback comment (optional)" value={theoryRollbackComment} onChange={e => setTheoryRollbackComment(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowTheoryHistory(false)} disabled={theoryRollbackBusy}>
                  Close
                </Button>
                <Button onClick={handleRollbackTheory} disabled={theoryRollbackBusy || !theorySelectedVersion} className="text-accent-warning">
                  {theoryRollbackBusy ? "Rolling back…" : "Rollback"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </Modal>

      {}
      <Modal isOpen={showCreateUser} onClose={() => setShowCreateUser(false)} title="Create User">
        <div className="space-y-4">
          <Input label="Username" value={newUser.username} onChange={e => setNewUser({
          ...newUser,
          username: e.target.value
        })} required />
          <Input label="Email" type="email" value={newUser.email} onChange={e => setNewUser({
          ...newUser,
          email: e.target.value
        })} />
          <Input label="Password" type="password" value={newUser.password} onChange={e => setNewUser({
          ...newUser,
          password: e.target.value
        })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={newUser.firstName} onChange={e => setNewUser({
            ...newUser,
            firstName: e.target.value
          })} />
            <Input label="Last Name" value={newUser.lastName} onChange={e => setNewUser({
            ...newUser,
            lastName: e.target.value
          })} />
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Role</label>
            <select value={newUser.role} onChange={e => {
            const role = parseUserRole(e.target.value);
            if (!role) return;
            setNewUser({
              ...newUser,
              role
            });
          }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="USER">USER</option>
              <option value="TEACHER">TEACHER</option>
              <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">User Mode</label>
            <select value={newUser.userMode} onChange={e => {
            const userMode = parseUserMode(e.target.value);
            if (!userMode) return;
            setNewUser({
              ...newUser,
              userMode
            });
          }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="PERSONAL">PERSONAL</option>
              <option value="EDUCATIONAL">EDUCATIONAL</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
            <select value={newUser.lang} onChange={e => {
            const lang = parseUserLanguage(e.target.value);
            if (!lang) return;
            setNewUser({
              ...newUser,
              lang
            });
          }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="JAVA">JAVA</option>
              <option value="PYTHON">PYTHON</option>
              <option value="CPP">CPP</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateUser(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>Create</Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showEditUser} onClose={() => setShowEditUser(false)} title="Edit User">
        {selectedUser && <div className="space-y-4">
            <Input label="Email" type="email" value={editUser.email || ""} onChange={e => setEditUser({
          ...editUser,
          email: e.target.value
        })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={editUser.firstName || ""} onChange={e => setEditUser({
            ...editUser,
            firstName: e.target.value
          })} />
              <Input label="Last Name" value={editUser.lastName || ""} onChange={e => setEditUser({
            ...editUser,
            lastName: e.target.value
          })} />
            </div>
            <Input label="New Password (leave empty to keep current)" type="password" value={editUser.password || ""} onChange={e => setEditUser({
          ...editUser,
          password: e.target.value
        })} />
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={editUser.lang || selectedUser.lang} onChange={e => {
            const lang = parseUserLanguage(e.target.value);
            if (!lang) return;
            setEditUser({
              ...editUser,
              lang
            });
          }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
                <option value="CPP">CPP</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditUser(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditUser}>Save</Button>
            </div>
          </div>}
      </Modal>

      {}
      <Modal isOpen={showDeleteUserConfirm} onClose={() => setShowDeleteUserConfirm(false)} title="Delete User">
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this user? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteUserConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeleteUser} className="text-accent-error hover:opacity-85">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showCreateClass} onClose={() => setShowCreateClass(false)} title="Create Class">
        <div className="space-y-4">
          <Input label="Class Name" value={newClass.name} onChange={e => setNewClass({
          ...newClass,
          name: e.target.value
        })} required />
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
            <select value={newClass.language} onChange={e => {
            const language = parseClassLanguage(e.target.value);
            if (!language) return;
            setNewClass({
              ...newClass,
              language
            });
          }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="JAVA">JAVA</option>
              <option value="PYTHON">PYTHON</option>
              <option value="CPP">CPP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Teacher</label>
            <select value={newClass.teacherId || 0} onChange={e => setNewClass({
            ...newClass,
            teacherId: parseInt(e.target.value) || 0
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value={0}>Select teacher...</option>
              {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>
                  {teacher.username} ({teacher.email || "No email"})
                </option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateClass(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateClass}>Create</Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showEditClass} onClose={() => setShowEditClass(false)} title="Edit Class">
        {selectedClass && <div className="space-y-4">
            <Input label="Class Name" value={editClass.name || ""} onChange={e => setEditClass({
          ...editClass,
          name: e.target.value
        })} />
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={editClass.language || selectedClass.language} onChange={e => {
            const language = parseClassLanguage(e.target.value);
            if (!language) return;
            setEditClass({
              ...editClass,
              language
            });
          }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
                <option value="CPP">CPP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Teacher</label>
              <select value={editClass.teacherId || selectedClass.teacherId} onChange={e => setEditClass({
            ...editClass,
            teacherId: parseInt(e.target.value) || 0
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value={0}>Select teacher...</option>
                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>
                    {teacher.username} ({teacher.email || "No email"})
                  </option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditClass(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditClass}>Save</Button>
            </div>
          </div>}
      </Modal>

      {}
      <Modal isOpen={showDeleteClassConfirm} onClose={() => setShowDeleteClassConfirm(false)} title="Delete Class">
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this class? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteClassConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeleteClass} className="text-accent-error hover:opacity-85">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showSupportTicket} onClose={() => {
      setShowSupportTicket(false);
      setSelectedTicket(null);
      setReplyText("");
    }} title={selectedTicket ? `Ticket #${selectedTicket.id}` : "Ticket"}>
        {selectedTicket && <div className="space-y-4">
            <div className="text-sm font-mono text-text-secondary">From: {selectedTicket.userEmail}</div>
            <div className="text-sm font-mono text-text-secondary">Subject: {selectedTicket.subject}</div>
            <div className="text-sm font-mono text-text-secondary">Status: {selectedTicket.status}</div>

            <div className="border border-border bg-bg-secondary p-3">
              <div className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2">Message</div>
              <div className="text-sm text-text-primary whitespace-pre-wrap">{selectedTicket.message}</div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Reply</label>
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} className="w-full min-h-[140px] resize-y bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-text-muted" placeholder="Type your reply..." />
              <div className="text-xs text-text-secondary font-mono">
                Email will be sent from techical-support@studycod.space
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => {
            setShowSupportTicket(false);
            setSelectedTicket(null);
            setReplyText("");
          }} disabled={replying}>
                Cancel
              </Button>
              <Button onClick={handleReplyToTicket} disabled={replying}>
                {replying ? "Sending..." : "Send Reply"}
              </Button>
            </div>
          </div>}
      </Modal>
    </div>;
};
