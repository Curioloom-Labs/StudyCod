import type { WebTaskFile, WebTaskValidationRule } from "../services/webTaskValidationService";
import { normalizeWebTaskFiles } from "../services/webTaskValidationService";

export interface WebTaskPayloadV1 {
  mode: "WEB";
  version: 1;
  files: WebTaskFile[];
  rules?: WebTaskValidationRule[];
}

const PREFIX = "WEB_TASK_V1:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function encodeWebTaskPayload(payload: WebTaskPayloadV1): string {
  return `${PREFIX}${JSON.stringify(payload)}`;
}

export function decodeWebTaskPayload(raw: unknown): WebTaskPayloadV1 | null {
  if (typeof raw !== "string") return null;
  const src = raw.trim();
  if (!src.startsWith(PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(src.slice(PREFIX.length));
    if (!isRecord(parsed)) return null;
    if (parsed.mode !== "WEB") return null;
    if (Number(parsed.version) !== 1) return null;

    return {
      mode: "WEB",
      version: 1,
      files: normalizeWebTaskFiles(parsed.files),
      rules: Array.isArray(parsed.rules) ? parsed.rules : undefined,
    };
  } catch {
    return null;
  }
}

export function defaultWebTaskFiles(): WebTaskFile[] {
  return [
    {
      path: "index.html",
      content: "<main>\n  <h1>Hello, StudyCod!</h1>\n</main>\n",
    },
    {
      path: "styles.css",
      content: "body {\n  font-family: system-ui, sans-serif;\n}\n",
    },
    {
      path: "script.js",
      content: "// your javascript here\n",
    },
  ];
}

export function normalizeWebTaskTemplate(rawTemplate: unknown): {
  files: WebTaskFile[];
  rules: WebTaskValidationRule[];
} {
  const decoded = decodeWebTaskPayload(rawTemplate);
  if (decoded) {
    return {
      files: normalizeWebTaskFiles(decoded.files),
      rules: Array.isArray(decoded.rules) ? decoded.rules : [],
    };
  }

  return {
    files: defaultWebTaskFiles(),
    rules: [],
  };
}
