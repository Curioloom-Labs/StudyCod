import { api } from "./client";

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
  const safeId = encodeURIComponent(String(certificateId ?? "").trim());
  try {
    const res = await api.get(`/certificate/${safeId}`);
    return res.data as CertificateVerification;
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    if (msg === "CERTIFICATE_NOT_FOUND") {
      const error = new Error("CERTIFICATE_NOT_FOUND");
      (error as any).code = "CERTIFICATE_NOT_FOUND";
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
  const res = await api.post("/certificate/template", payload);
  return res.data as { templateId: number };
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
  } catch (e: any) {
    const msg = e?.response?.data?.message;
    if (msg === "TEMPLATE_NOT_FOUND") {
      const error = new Error("TEMPLATE_NOT_FOUND");
      (error as any).code = "TEMPLATE_NOT_FOUND";
      throw error;
    }
    throw e;
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
}

export async function updateContestCertificateSettings(
  contestId: number,
  payload: {
    mode: "none" | "studycod" | "custom";
    defaultTemplateId?: number | null;
    sendEmailEnabled?: boolean;
  }
): Promise<{ ok: boolean }> {
  const res = await api.put(`/certificate/contest/${contestId}/settings`, payload);
  return res.data as { ok: boolean };
}

export async function generateContestCertificates(
  contestId: number,
  payload?: { forceRegenerate?: boolean }
): Promise<{ queued: boolean; contestId: number; jobId: number }> {
  const res = await api.post(`/contests/${contestId}/generate-certificates`, payload ?? {});
  return res.data as { queued: boolean; contestId: number; jobId: number };
}
