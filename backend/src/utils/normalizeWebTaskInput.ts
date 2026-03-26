import {
  normalizeWebTaskFiles,
  normalizeWebValidationProfile,
  normalizeWebValidationRules,
  type WebTaskFile,
  type WebTaskValidationProfile,
  type WebTaskValidationRule,
} from "../services/webTaskValidationService";

export type NormalizedTaskMode = "CODE" | "WEB";

export type WebTaskInputLike = {
  taskMode?: unknown;
  template?: unknown;
  webTemplateFiles?: unknown;
  webValidationRules?: unknown;
  webValidationProfile?: unknown;
};

export type NormalizedWebTaskInput = {
  taskMode: NormalizedTaskMode;
  template: string;
  webTemplateFiles: WebTaskFile[] | null;
  webValidationRules: WebTaskValidationRule[] | null;
  webValidationProfile: WebTaskValidationProfile | null;
};

function normalizeTaskMode(raw: unknown): NormalizedTaskMode {
  return String(raw ?? "CODE").toUpperCase() === "WEB" ? "WEB" : "CODE";
}

function setIndexHtml(files: WebTaskFile[], html: string): WebTaskFile[] {
  return files.map((f) => (f.path === "index.html" ? { ...f, content: html } : f));
}

function hasOwnField(obj: unknown, key: string): boolean {
  return !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

export function normalizeWebTaskInput(
  raw: WebTaskInputLike,
  fallback?: WebTaskInputLike
): NormalizedWebTaskInput {
  const taskMode = normalizeTaskMode(raw?.taskMode ?? fallback?.taskMode);
  const resolvedTemplate = raw?.template ?? fallback?.template;
  const template = typeof resolvedTemplate === "string" ? resolvedTemplate : "";

  if (taskMode !== "WEB") {
    return {
      taskMode,
      template,
      webTemplateFiles: null,
      webValidationRules: null,
      webValidationProfile: null,
    };
  }

  const filesSource = hasOwnField(raw, "webTemplateFiles")
    ? raw?.webTemplateFiles
    : fallback?.webTemplateFiles;
  const rulesSource = hasOwnField(raw, "webValidationRules")
    ? raw?.webValidationRules
    : fallback?.webValidationRules;
  const profileSource = hasOwnField(raw, "webValidationProfile")
    ? raw?.webValidationProfile
    : fallback?.webValidationProfile;

  let files = normalizeWebTaskFiles(filesSource ?? []);
  const templateTrimmed = template.trim();

  if (templateTrimmed) {
    const hasRawFiles = hasOwnField(raw, "webTemplateFiles");
    const indexFromFiles = String(files.find((f) => f.path === "index.html")?.content ?? "").trim();
    if (!hasRawFiles || !indexFromFiles) {
      files = setIndexHtml(files, template);
    }
  }

  const canonicalTemplate = String(files.find((f) => f.path === "index.html")?.content ?? "");

  return {
    taskMode,
    template: canonicalTemplate,
    webTemplateFiles: files,
    webValidationRules: normalizeWebValidationRules(rulesSource ?? []),
    webValidationProfile: normalizeWebValidationProfile(profileSource ?? "FREE_WEB"),
  };
}
