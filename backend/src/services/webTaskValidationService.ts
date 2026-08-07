export type WebTaskMode = "CODE" | "WEB";

export type WebTaskProfileId =
  | "FREE_WEB"
  | "HTML_ONLY"
  | "HTML_CSS_NO_JS"
  | "HTML_JS_NO_CSS"
  | "JS_ONLY_DOM"
  | "CSS_ONLY"
  | "HTML_AND_INLINE_ONLY";

export interface WebTaskValidationProfile {
  id: WebTaskProfileId;
  allowHtml: boolean;
  allowCss: boolean;
  allowJs: boolean;
  allowInlineStyle: boolean;
  allowInlineScript: boolean;
  allowExternalResources: boolean;
  lockHtml: boolean;
  lockCss: boolean;
  lockJs: boolean;
}

export type WebTaskFile = {
  path: "index.html" | "styles.css" | "script.js";
  content: string;
};

export type WebTaskRuleType =
  | "required_selector"
  | "forbidden_selector"
  | "required_text"
  | "forbidden_text"
  | "required_script_pattern"
  | "forbidden_script_pattern"
  | "required_attribute"
  | "forbidden_attribute"
  | "required_style"
  | "forbidden_style";

export interface WebTaskValidationRule {
  id?: string;
  type: WebTaskRuleType;
  message?: string;
  points?: number;
  selector?: string;
  attribute?: string;
  value?: string;
  valuePattern?: string;
  property?: string;
  text?: string;
  pattern?: string;
  flags?: string;
}

export interface WebTaskValidationItemResult {
  id: string;
  type: WebTaskRuleType;
  passed: boolean;
  message: string;
  points: number;
  earnedPoints: number;
}

export interface WebTaskValidationResult {
  passed: boolean;
  score: number;
  maxScore: number;
  passedRules: number;
  totalRules: number;
  results: WebTaskValidationItemResult[];
}

const WEB_FILE_ORDER: Array<WebTaskFile["path"]> = ["index.html", "styles.css", "script.js"];

const PROFILE_PRESETS: Record<WebTaskProfileId, WebTaskValidationProfile> = {
  FREE_WEB: {
    id: "FREE_WEB",
    allowHtml: true,
    allowCss: true,
    allowJs: true,
    allowInlineStyle: true,
    allowInlineScript: true,
    allowExternalResources: false,
    lockHtml: false,
    lockCss: false,
    lockJs: false,
  },
  HTML_ONLY: {
    id: "HTML_ONLY",
    allowHtml: true,
    allowCss: false,
    allowJs: false,
    allowInlineStyle: false,
    allowInlineScript: false,
    allowExternalResources: false,
    lockHtml: false,
    lockCss: true,
    lockJs: true,
  },
  HTML_CSS_NO_JS: {
    id: "HTML_CSS_NO_JS",
    allowHtml: true,
    allowCss: true,
    allowJs: false,
    allowInlineStyle: true,
    allowInlineScript: false,
    allowExternalResources: false,
    lockHtml: false,
    lockCss: false,
    lockJs: true,
  },
  HTML_JS_NO_CSS: {
    id: "HTML_JS_NO_CSS",
    allowHtml: true,
    allowCss: false,
    allowJs: true,
    allowInlineStyle: false,
    allowInlineScript: true,
    allowExternalResources: false,
    lockHtml: false,
    lockCss: true,
    lockJs: false,
  },
  JS_ONLY_DOM: {
    id: "JS_ONLY_DOM",
    allowHtml: true,
    allowCss: false,
    allowJs: true,
    allowInlineStyle: false,
    allowInlineScript: true,
    allowExternalResources: false,
    lockHtml: true,
    lockCss: true,
    lockJs: false,
  },
  CSS_ONLY: {
    id: "CSS_ONLY",
    allowHtml: true,
    allowCss: true,
    allowJs: false,
    allowInlineStyle: true,
    allowInlineScript: false,
    allowExternalResources: false,
    lockHtml: true,
    lockCss: false,
    lockJs: true,
  },
  HTML_AND_INLINE_ONLY: {
    id: "HTML_AND_INLINE_ONLY",
    allowHtml: true,
    allowCss: false,
    allowJs: false,
    allowInlineStyle: true,
    allowInlineScript: true,
    allowExternalResources: false,
    lockHtml: false,
    lockCss: true,
    lockJs: true,
  },
};

export function normalizeWebValidationProfile(input: unknown): WebTaskValidationProfile {
  const asId = (raw: unknown): WebTaskProfileId => {
    const v = String(raw ?? "").trim().toUpperCase();
    if (v === "HTML_ONLY") return "HTML_ONLY";
    if (v === "HTML_CSS_NO_JS") return "HTML_CSS_NO_JS";
    if (v === "HTML_JS_NO_CSS") return "HTML_JS_NO_CSS";
    if (v === "JS_ONLY_DOM") return "JS_ONLY_DOM";
    if (v === "CSS_ONLY") return "CSS_ONLY";
    if (v === "HTML_AND_INLINE_ONLY") return "HTML_AND_INLINE_ONLY";
    return "FREE_WEB";
  };

  if (!input || typeof input !== "object") {
    return { ...PROFILE_PRESETS[asId(input)] };
  }

  const obj = input as Record<string, unknown>;
  const id = asId(obj.id);
  const base = PROFILE_PRESETS[id];
  const boolOr = (raw: unknown, fallback: boolean) =>
    typeof raw === "boolean" ? raw : fallback;

  return {
    ...base,
    allowHtml: boolOr(obj.allowHtml, base.allowHtml),
    allowCss: boolOr(obj.allowCss, base.allowCss),
    allowJs: boolOr(obj.allowJs, base.allowJs),
    allowInlineStyle: boolOr(obj.allowInlineStyle, base.allowInlineStyle),
    allowInlineScript: boolOr(obj.allowInlineScript, base.allowInlineScript),
    allowExternalResources: boolOr(obj.allowExternalResources, base.allowExternalResources),
    lockHtml: boolOr(obj.lockHtml, base.lockHtml),
    lockCss: boolOr(obj.lockCss, base.lockCss),
    lockJs: boolOr(obj.lockJs, base.lockJs),
  };
}

export function normalizeWebValidationRules(input: unknown): WebTaskValidationRule[] {
  return normalizeRules(input);
}

export function normalizeWebTaskFiles(input: unknown): WebTaskFile[] {
  const out = new Map<WebTaskFile["path"], string>();
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const path = String((item as any).path ?? "").trim() as WebTaskFile["path"];
      if (!WEB_FILE_ORDER.includes(path)) continue;
      const content = typeof (item as any).content === "string" ? (item as any).content : "";
      out.set(path, content);
    }
  }

  if (!out.has("index.html")) out.set("index.html", "");
  if (!out.has("styles.css")) out.set("styles.css", "");
  if (!out.has("script.js")) out.set("script.js", "");

  return WEB_FILE_ORDER.map(path => ({ path, content: out.get(path) ?? "" }));
}

function normalizeRules(input: unknown): WebTaskValidationRule[] {
  if (!Array.isArray(input)) return [];
  const out: WebTaskValidationRule[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const type = String((raw as any).type ?? "").trim() as WebTaskRuleType;
    if (
      type !== "required_selector" &&
      type !== "forbidden_selector" &&
      type !== "required_text" &&
      type !== "forbidden_text" &&
      type !== "required_script_pattern" &&
      type !== "forbidden_script_pattern" &&
      type !== "required_attribute" &&
      type !== "forbidden_attribute" &&
      type !== "required_style" &&
      type !== "forbidden_style"
    ) {
      continue;
    }

    const pointsRaw = Number((raw as any).points ?? 1);
    const points = Number.isFinite(pointsRaw) ? Math.max(0, Math.round(pointsRaw)) : 1;

    out.push({
      id: typeof (raw as any).id === "string" ? (raw as any).id : undefined,
      type,
      points,
      message: typeof (raw as any).message === "string" ? (raw as any).message : undefined,
      selector: typeof (raw as any).selector === "string" ? (raw as any).selector : undefined,
      attribute: typeof (raw as any).attribute === "string" ? (raw as any).attribute : undefined,
      value: typeof (raw as any).value === "string" ? (raw as any).value : undefined,
      valuePattern: typeof (raw as any).valuePattern === "string" ? (raw as any).valuePattern : undefined,
      property: typeof (raw as any).property === "string" ? (raw as any).property : undefined,
      text: typeof (raw as any).text === "string" ? (raw as any).text : undefined,
      pattern: typeof (raw as any).pattern === "string" ? (raw as any).pattern : undefined,
      flags: typeof (raw as any).flags === "string" ? (raw as any).flags : undefined,
    });
  }
  return out;
}

function selectorExists(html: string, selector: string): boolean {
  const s = selector.trim();
  if (!s) return false;

  // Supported simple selectors: #id, .class, tag
  if (s.startsWith("#")) {
    const id = escapeRegExp(s.slice(1));
    const re = new RegExp(`id\\s*=\\s*([\"'])${id}\\1`, "i");
    return re.test(html);
  }

  if (s.startsWith(".")) {
    const cls = escapeRegExp(s.slice(1));
    const re = new RegExp(`class\\s*=\\s*([\"'])[^\"']*\\b${cls}\\b[^\"']*\\1`, "i");
    return re.test(html);
  }

  // tag selector
  const tag = escapeRegExp(s.toLowerCase());
  const re = new RegExp(`<\\s*${tag}(\\s|>)`, "i");
  return re.test(html);
}

function escapeRegExp(value: string): string {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeRegExp(pattern: string, flags?: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function htmlHasInlineScript(html: string): boolean {
  const lower = String(html ?? "").toLowerCase();
  const isTagWhitespace = (value: string): boolean => value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f";
  let cursor = 0;
  while (cursor < lower.length) {
    const start = lower.indexOf("<script", cursor);
    if (start < 0) return false;
    const boundary = lower[start + 7] || "";
    if (boundary === ">" || isTagWhitespace(boundary)) {
      const openEnd = lower.indexOf(">", start + 7);
      if (openEnd < 0) return false;
      const closeStart = lower.indexOf("</script", openEnd + 1);
      if (closeStart >= 0) {
        const closeBoundary = lower[closeStart + 8] || "";
        if (closeBoundary === ">" || isTagWhitespace(closeBoundary)) return true;
      }
    }
    cursor = start + 7;
  }
  return false;
}

function htmlHasInlineStyleTag(html: string): boolean {
  return /<style(?:\s[^>]*)?>[\s\S]*?<\/style\s*>/i.test(html);
}

function htmlHasExternalResources(html: string): boolean {
  return /(?:src|href)\s*=\s*(["'])\s*(?:https?:)?\/\//i.test(html);
}

function htmlHasInlineEventHandlers(html: string): boolean {
  return /\son[a-z]+\s*=\s*(["']).*?\1/i.test(html);
}

function htmlHasStyleAttributes(html: string): boolean {
  return /\sstyle\s*=\s*(["']).*?\1/i.test(html);
}

function cssSelectorHasProperty(css: string, selector: string, property: string, valuePattern?: string): boolean {
  const sel = selector.trim();
  const prop = property.trim();
  if (!sel || !prop) return false;
  const blockRe = new RegExp(`${escapeRegExp(sel)}\\s*\\{([\\s\\S]*?)\\}`, "i");
  const block = css.match(blockRe)?.[1] ?? "";
  if (!block) return false;
  const propRe = new RegExp(`${escapeRegExp(prop)}\\s*:\\s*([^;]+)`, "i");
  const m = block.match(propRe);
  if (!m) return false;
  if (!valuePattern || !valuePattern.trim()) return true;
  const val = String(m[1] ?? "").trim();
  const vp = safeRegExp(valuePattern, undefined);
  return vp ? vp.test(val) : val.includes(valuePattern);
}

function selectorHasAttribute(html: string, selector: string, attribute: string, value?: string, valuePattern?: string): boolean {
  const sel = selector.trim();
  const attr = attribute.trim();
  if (!sel || !attr) return false;

  let tag = "";
  let id = "";
  let cls = "";
  if (sel.startsWith("#")) id = sel.slice(1);
  else if (sel.startsWith(".")) cls = sel.slice(1);
  else tag = sel;

  const chunks = html.match(/<[^>]+>/g) ?? [];
  for (const c of chunks) {
    const lower = c.toLowerCase();
    if (tag && !new RegExp(`^<\\s*${escapeRegExp(tag)}(\\s|>)`, "i").test(c)) continue;
    if (id && !new RegExp(`\\sid\\s*=\\s*(["'])${escapeRegExp(id)}\\1`, "i").test(c)) continue;
    if (cls && !new RegExp(`\\sclass\\s*=\\s*(["'])[^"']*\\b${escapeRegExp(cls)}\\b[^"']*\\1`, "i").test(c)) continue;

    const attrRe = new RegExp(`\\s${escapeRegExp(attr)}(?:\\s*=\\s*(["'])(.*?)\\1)?`, "i");
    const m = c.match(attrRe);
    if (!m) continue;
    if (value == null && valuePattern == null) return true;
    const attrVal = String(m[2] ?? "");
    if (typeof value === "string" && attrVal !== value) continue;
    if (typeof valuePattern === "string" && valuePattern.trim()) {
      const re = safeRegExp(valuePattern, undefined);
      if (re ? !re.test(attrVal) : !attrVal.includes(valuePattern)) continue;
    }
    return true;
  }
  return false;
}

function buildFullHtml(files: WebTaskFile[]): string {
  const indexHtml = files.find(f => f.path === "index.html")?.content ?? "";
  const css = files.find(f => f.path === "styles.css")?.content ?? "";
  const js = files.find(f => f.path === "script.js")?.content ?? "";

  const hasStyleTag = /<style[\s>]/i.test(indexHtml);
  const hasScriptTag = /<script[\s>]/i.test(indexHtml);

  let html = indexHtml;
  if (!hasStyleTag) {
    html += `\n<style>\n${css}\n</style>\n`;
  }
  if (!hasScriptTag) {
    html += `\n<script>\n${js}\n</script>\n`;
  }
  return html;
}

export function validateWebTaskSubmission(params: {
  files: unknown;
  rules: unknown;
  profile?: unknown;
  referenceFiles?: unknown;
}): WebTaskValidationResult {
  const files = normalizeWebTaskFiles(params.files);
  const rules = normalizeRules(params.rules);
  const profile = normalizeWebValidationProfile(params.profile ?? "FREE_WEB");
  const referenceFiles = params.referenceFiles ? normalizeWebTaskFiles(params.referenceFiles) : null;

  const profileResults: WebTaskValidationItemResult[] = [];
  const indexHtml = files.find(f => f.path === "index.html")?.content ?? "";
  const stylesCss = files.find(f => f.path === "styles.css")?.content ?? "";
  const scriptJs = files.find(f => f.path === "script.js")?.content ?? "";

  const addProfileViolation = (message: string) => {
    profileResults.push({
      id: `profile_${profileResults.length + 1}`,
      type: "forbidden_text",
      passed: false,
      message,
      points: 1,
      earnedPoints: 0,
    });
  };

  if (!profile.allowJs) {
    if (String(scriptJs).trim()) addProfileViolation("JavaScript file is not allowed for this task profile.");
    if (htmlHasInlineScript(indexHtml)) addProfileViolation("Inline <script> is not allowed for this task profile.");
    if (htmlHasInlineEventHandlers(indexHtml)) addProfileViolation("Inline on* event handlers are not allowed for this task profile.");
  }
  if (!profile.allowCss) {
    if (String(stylesCss).trim()) addProfileViolation("styles.css is not allowed for this task profile.");
    if (htmlHasInlineStyleTag(indexHtml)) addProfileViolation("Inline <style> is not allowed for this task profile.");
    if (htmlHasStyleAttributes(indexHtml)) addProfileViolation("style=" + '"..."' + " attributes are not allowed for this task profile.");
  }
  if (!profile.allowInlineScript && htmlHasInlineScript(indexHtml)) {
    addProfileViolation("Inline <script> is forbidden by task profile.");
  }
  if (!profile.allowInlineStyle) {
    if (htmlHasInlineStyleTag(indexHtml)) addProfileViolation("Inline <style> is forbidden by task profile.");
    if (htmlHasStyleAttributes(indexHtml)) addProfileViolation("style=" + '"..."' + " attributes are forbidden by task profile.");
  }
  if (!profile.allowExternalResources && htmlHasExternalResources(indexHtml)) {
    addProfileViolation("External resources (http/https URLs) are forbidden by task profile.");
  }

  if (referenceFiles) {
    const refHtml = referenceFiles.find(f => f.path === "index.html")?.content ?? "";
    const refCss = referenceFiles.find(f => f.path === "styles.css")?.content ?? "";
    const refJs = referenceFiles.find(f => f.path === "script.js")?.content ?? "";
    if (profile.lockHtml && refHtml !== indexHtml) addProfileViolation("index.html is locked by task profile and cannot be modified.");
    if (profile.lockCss && refCss !== stylesCss) addProfileViolation("styles.css is locked by task profile and cannot be modified.");
    if (profile.lockJs && refJs !== scriptJs) addProfileViolation("script.js is locked by task profile and cannot be modified.");
  }

  if (rules.length === 0 && profileResults.length === 0) {
    return {
      passed: true,
      score: 0,
      maxScore: 0,
      passedRules: 0,
      totalRules: 0,
      results: [],
    };
  }

  const html = buildFullHtml(files);
  const js = scriptJs;
  const css = stylesCss + "\n" + (indexHtml.match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi) ?? []).join("\n");

  const results: WebTaskValidationItemResult[] = [...profileResults];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const id = r.id || `rule_${i + 1}`;
    const points = Math.max(0, Number(r.points ?? 1) || 0);

    let passed = false;

    if (r.type === "required_selector") {
      const sel = String(r.selector ?? "").trim();
      passed = !!sel && selectorExists(html, sel);
    } else if (r.type === "forbidden_selector") {
      const sel = String(r.selector ?? "").trim();
      passed = !!sel && !selectorExists(html, sel);
    } else if (r.type === "required_text") {
      const text = String(r.text ?? "");
      passed = !!text && html.includes(text);
    } else if (r.type === "forbidden_text") {
      const text = String(r.text ?? "");
      passed = !!text && !html.includes(text);
    } else if (r.type === "required_script_pattern") {
      const pattern = String(r.pattern ?? "");
      const re = pattern ? safeRegExp(pattern, r.flags) : null;
      passed = !!re && re.test(js);
    } else if (r.type === "forbidden_script_pattern") {
      const pattern = String(r.pattern ?? "");
      const re = pattern ? safeRegExp(pattern, r.flags) : null;
      passed = !!re && !re.test(js);
    } else if (r.type === "required_attribute") {
      const selector = String(r.selector ?? "");
      const attribute = String(r.attribute ?? "");
      passed = selectorHasAttribute(html, selector, attribute, r.value, r.valuePattern);
    } else if (r.type === "forbidden_attribute") {
      const selector = String(r.selector ?? "");
      const attribute = String(r.attribute ?? "");
      passed = !selectorHasAttribute(html, selector, attribute, r.value, r.valuePattern);
    } else if (r.type === "required_style") {
      const selector = String(r.selector ?? "");
      const property = String(r.property ?? "");
      const valuePattern = String(r.valuePattern ?? r.value ?? "");
      passed = cssSelectorHasProperty(css, selector, property, valuePattern || undefined);
    } else if (r.type === "forbidden_style") {
      const selector = String(r.selector ?? "");
      const property = String(r.property ?? "");
      const valuePattern = String(r.valuePattern ?? r.value ?? "");
      passed = !cssSelectorHasProperty(css, selector, property, valuePattern || undefined);
    }

    const fallbackMessage = passed ? "Rule passed" : "Rule failed";

    results.push({
      id,
      type: r.type,
      passed,
      message: String(r.message ?? fallbackMessage),
      points,
      earnedPoints: passed ? points : 0,
    });
  }

  const score = results.reduce((sum, r) => sum + r.earnedPoints, 0);
  const maxScore = results.reduce((sum, r) => sum + r.points, 0);
  const passedRules = results.filter(r => r.passed).length;

  return {
    passed: passedRules === results.length,
    score,
    maxScore,
    passedRules,
    totalRules: results.length,
    results,
  };
}
