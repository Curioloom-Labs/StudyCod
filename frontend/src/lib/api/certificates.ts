import { api } from "./client";
import { optimizeCertificateTemplateImages } from "../certificates/optimizeTemplateImages";

const CERTIFICATE_TEMPLATE_TEXT_LIMIT = 50 * 1024 * 1024;

type CertificateApiValidationIssue = {
  path?: Array<string | number>;
  message?: string;
  code?: string;
  maximum?: number;
};

type CertificateApiErrorData = {
  message?: string;
  error?: string;
  detail?: string;
  limit?: number;
  errors?: CertificateApiValidationIssue[];
};

function getCertificateApiErrorData(error: unknown): CertificateApiErrorData | null {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  const data = response && typeof response === "object" ? Reflect.get(response, "data") : undefined;
  if (!data || typeof data !== "object") return null;
  return data as CertificateApiErrorData;
}

function getCertificateApiStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return 0;
  const status = Number(Reflect.get(response, "status"));
  return Number.isFinite(status) ? status : 0;
}

function getCertificateApiMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = Reflect.get(error, "message");
  return typeof message === "string" ? message : "";
}

function makeTemplateTooLargeMessage(limit?: number): string {
  const max = Number(limit ?? CERTIFICATE_TEMPLATE_TEXT_LIMIT);
  const maxMb = Number.isFinite(max) && max > 0 ? (max / (1024 * 1024)).toFixed(1) : "50.0";
  return `TEMPLATE_TOO_LARGE: шаблон завеликий (до ${maxMb} МБ на поле HTML або CSS). Вбудовані PNG/JPG/WebP стискаються автоматично; заміни завелике зображення на URL або зменш його. / Template is too large (up to ${maxMb} MB per HTML or CSS field). Embedded PNG/JPG/WebP images are compressed automatically; use an image URL or reduce the image size.`;
}

function parseInvalidInputMessage(data: CertificateApiErrorData): string | null {
  const issues = Array.isArray(data?.errors) ? data.errors : [];
  if (!issues.length) return null;

  const tooBig = issues.find((issue) => {
    const key = String(issue?.path?.[0] ?? "");
    return (key === "htmlTemplate" || key === "cssTemplate") && String(issue?.code ?? "") === "too_big";
  });
  if (tooBig) {
    return makeTemplateTooLargeMessage(Number(tooBig.maximum));
  }

  const first = issues[0];
  const path = Array.isArray(first?.path) && first.path.length ? first.path.join(".") : "payload";
  const msg = String(first?.message ?? "Invalid input").trim() || "Invalid input";
  return `INVALID_INPUT: ${path} — ${msg}`;
}

function normalizeCertificateApiError(error: unknown, fallbackMessage: string): Error {
  const data = getCertificateApiErrorData(error);
  const status = getCertificateApiStatus(error);
  const code = String(data?.message ?? data?.error ?? "").trim();

  if (code === "TEMPLATE_TOO_LARGE" || status === 413) {
    return new Error(makeTemplateTooLargeMessage(Number(data?.limit)));
  }

  if (code === "INVALID_INPUT") {
    const parsed = parseInvalidInputMessage(data || {});
    return new Error(parsed || "INVALID_INPUT");
  }

  if (code === "AWARDS_NOT_CONFIRMED") return new Error("Спочатку підтвердь розподіл місць у розділі «Учасники». / Confirm awards in Participants first.");
  if (code === "AWARDS_STALE") return new Error("Результати змінилися. Онови та підтвердь розподіл місць повторно. / Results changed. Refresh and reconfirm awards.");

  if (code === "ONLY_USERS") {
    return new Error("ACCESS_DENIED: only authenticated USER accounts can manage certificate templates.");
  }

  if (code === "ACCESS_DENIED") {
    return new Error("ACCESS_DENIED: you do not have permission to modify certificate settings for this contest.");
  }

  const directMessage = String(code || getCertificateApiMessage(error)).trim();
  if (directMessage) return new Error(directMessage);
  return new Error(fallbackMessage);
}

function assertTemplateTextSize(payload: { htmlTemplate?: string | null; cssTemplate?: string | null }): void {
  const encoder = new TextEncoder();
  const htmlLen = encoder.encode(String(payload.htmlTemplate ?? "")).byteLength;
  const cssLen = encoder.encode(String(payload.cssTemplate ?? "")).byteLength;
  if (htmlLen > CERTIFICATE_TEMPLATE_TEXT_LIMIT || cssLen > CERTIFICATE_TEMPLATE_TEXT_LIMIT) {
    throw new Error(makeTemplateTooLargeMessage(CERTIFICATE_TEMPLATE_TEXT_LIMIT));
  }
}

export type CertificateVerification = {
  certificateId: string;
  name: string;
  contestName: string;
  date: string | null;
  score: number;
  maxScore: number;
  organizer: string;
  status: "valid" | "revoked";
};

export type ProfileCertificate = {
  certificateId: string;
  contestId: number;
  contestTitle: string;
  participantName: string;
  score: number;
  maxScore: number;
  place: string | null;
  organizer: string;
  status: string;
  issuedAt: string | null;
  pdfStorageKey: string | null;
  createdAt: string | null;
};


export async function getCertificateVerification(certificateId: string): Promise<CertificateVerification> {
  try {
    const res = await api.post("/certificate/verify", {
      certificateId: String(certificateId ?? "").trim()
    });
    return res.data as CertificateVerification;
  } catch (e: unknown) {
    const msg = getCertificateApiErrorData(e)?.message;
    if (msg === "CERTIFICATE_NOT_FOUND") {
      const error = Object.assign(new Error("CERTIFICATE_NOT_FOUND"), { code: "CERTIFICATE_NOT_FOUND" });
      throw error;
    }
    throw e;
  }
}

export async function getMyCertificates(): Promise<{ certificates: ProfileCertificate[] }> {
  const res = await api.get("/profile/certificates");
  return res.data as { certificates: ProfileCertificate[] };
}

export async function createCertificateTemplate(payload: {
  contestId?: number;
  name: string;
  type: "studycod" | "custom";
  htmlTemplate?: string;
  cssTemplate?: string;
  fields?: Array<{
    fieldKey:
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
    isEnabled?: boolean;
    isRequired?: boolean;
  }>;
}): Promise<{ templateId: number }> {
  const optimizedPayload = await optimizeCertificateTemplateImages(payload);
  assertTemplateTextSize(optimizedPayload);
  try {
    const res = await api.post("/certificate/template", optimizedPayload);
    return res.data as { templateId: number };
  } catch (e: unknown) {
    throw normalizeCertificateApiError(e, "Failed to create certificate template");
  }
}

export async function updateCertificateTemplate(
  templateId: number,
  payload: {
    name?: string;
    type?: "studycod" | "custom";
    htmlTemplate?: string | null;
    cssTemplate?: string | null;
    isActive?: boolean;
    fields?: Array<{
      fieldKey:
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
      isEnabled?: boolean;
      isRequired?: boolean;
    }>;
  }
): Promise<{ ok: boolean; templateId: number; version: number }> {
  const optimizedPayload = await optimizeCertificateTemplateImages(payload);
  assertTemplateTextSize(optimizedPayload);
  try {
    const res = await api.put(`/certificate/template/${Number(templateId)}`, optimizedPayload);
    return res.data as { ok: boolean; templateId: number; version: number };
  } catch (e: unknown) {
    throw normalizeCertificateApiError(e, "Failed to update certificate template");
  }
}

export async function getCertificateTemplateById(templateId: number): Promise<{
  template: {
    id: number;
    contestId: number | null;
    name: string;
    type: "studycod" | "custom";
    htmlTemplate: string | null;
    cssTemplate: string | null;
    fields: Array<{
      fieldKey:
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
      isEnabled: boolean;
      isRequired: boolean;
    }>;
    isActive: boolean;
    version: number;
  };
}> {
  try {
    const res = await api.get(`/certificate/template/${Number(templateId)}`);
    return res.data as {
      template: {
        id: number;
        contestId: number | null;
        name: string;
        type: "studycod" | "custom";
        htmlTemplate: string | null;
        cssTemplate: string | null;
        fields: Array<{
          fieldKey:
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
          isEnabled: boolean;
          isRequired: boolean;
        }>;
        isActive: boolean;
        version: number;
      };
    };
  } catch (e: unknown) {
    const msg = getCertificateApiErrorData(e)?.message;
    if (msg === "TEMPLATE_NOT_FOUND") {
      const error = Object.assign(new Error("TEMPLATE_NOT_FOUND"), { code: "TEMPLATE_NOT_FOUND" });
      throw error;
    }
    throw normalizeCertificateApiError(e, "Failed to load certificate template");
  }
}

export async function listCertificateTemplates(params?: {
  type?: "studycod" | "custom";
  contestId?: number;
  includeInactive?: boolean;
  limit?: number;
}): Promise<{
  templates: Array<{
    id: number;
    contestId: number | null;
    name: string;
    type: "studycod" | "custom";
    isActive: boolean;
    version: number;
  }>;
}> {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (Number.isFinite(Number(params?.contestId))) query.set("contestId", String(params?.contestId));
  if (params?.includeInactive) query.set("includeInactive", "1");
  if (Number.isFinite(Number(params?.limit))) query.set("limit", String(params?.limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  try {
    const res = await api.get(`/certificate/templates${suffix}`);
    return res.data as {
      templates: Array<{
        id: number;
        contestId: number | null;
        name: string;
        type: "studycod" | "custom";
        isActive: boolean;
        version: number;
      }>;
    };
  } catch (e: unknown) {
    throw normalizeCertificateApiError(e, "Failed to load certificate templates");
  }
}

export async function updateContestCertificateSettings(
  contestId: number,
  payload: {
    mode: "none" | "studycod" | "custom";
    defaultTemplateId?: number | null;
    sendEmailEnabled?: boolean;
  }
): Promise<{ ok: boolean }> {
  try {
    const res = await api.put(`/certificate/contest/${contestId}/settings`, payload);
    return res.data as { ok: boolean };
  } catch (e: unknown) {
    throw normalizeCertificateApiError(e, "Failed to update contest certificate settings");
  }
}

export async function generateContestCertificates(
  contestId: number,
  payload?: { forceRegenerate?: boolean }
): Promise<{ queued: boolean; contestId: number; jobId: number }> {
  try {
    const res = await api.post(`/contests/${contestId}/generate-certificates`, payload ?? {});
    return res.data as { queued: boolean; contestId: number; jobId: number };
  } catch (e: unknown) {
    throw normalizeCertificateApiError(e, "Failed to queue certificate generation");
  }
}

export type CertificateWorkspaceData = {
  settings: { mode: "none" | "studycod" | "custom"; templateId: number | null; sendEmailEnabled: boolean };
  templates: Array<{ id: number; name: string; type: "studycod" | "custom"; contestId: number | null; version: number }>;
  recipients: Array<{ participantId: number; email: string; certificateId: string | null; status: string | null;
    place: string | null; issuedAt: string | null; emailSentAt: string | null; pdfAvailable: boolean }>;
  generation: { batchId: number | null; status: "idle" | "queued" | "running" | "completed" | "failed";
    pending: number; failed: number; rendered: number; emailed: number;
    errors: Array<{ participantId: number | null; stage: string; message: string }> };
};

export type CertificatePreviewDraft = { templateId?: number; htmlTemplate?: string; cssTemplate?: string;
  participantId?: number; place?: "1" | "2" | "3" | null };

export async function getCertificateWorkspace(contestId: number): Promise<CertificateWorkspaceData> {
  try { return (await api.get(`/certificate/contest/${contestId}/workspace`)).data; }
  catch (error) { throw normalizeCertificateApiError(error, "Failed to load certificates"); }
}

export async function previewContestCertificate(contestId: number, draft: CertificatePreviewDraft): Promise<{ html: string }> {
  const optimized = await optimizeCertificateTemplateImages(draft);
  assertTemplateTextSize(optimized);
  try { return (await api.post(`/certificate/contest/${contestId}/preview`, optimized)).data; }
  catch (error) { throw normalizeCertificateApiError(error, "Failed to preview certificate"); }
}

export async function retryContestCertificateJobs(contestId: number): Promise<{ retried: number }> {
  try { return (await api.post(`/certificate/contest/${contestId}/retry`)).data; }
  catch (error) { throw normalizeCertificateApiError(error, "Failed to retry generation"); }
}

export async function sendExistingContestCertificates(contestId: number): Promise<{ queued: number }> {
  try { return (await api.post(`/certificate/contest/${contestId}/send`)).data; }
  catch (error) { throw normalizeCertificateApiError(error, "Failed to queue email delivery"); }
}

export async function downloadContestCertificate(contestId: number, participantId: number): Promise<Blob> {
  const response = await api.get(`/certificate/contest/${contestId}/pdf/${participantId}`, { responseType: "blob" });
  return response.data as Blob;
}
