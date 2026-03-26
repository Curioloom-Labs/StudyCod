export type CertificateMode = "none" | "studycod" | "custom";

export type CertificateVariableKey =
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

export type CertificatePayload = {
  contest_name: string;
  name: string;
  full_name: string;
  place: string | null;
  score: number;
  max_score: number;
  date: string;
  organizer: string;
  signature: string;
  certificate_id: string;
  qr_code: string;
};

export type CertificateTemplateRecord = {
  id: number;
  contestId: number | null;
  name: string;
  type: "studycod" | "custom";
  htmlTemplate: string | null;
  cssTemplate: string | null;
  isActive: boolean;
  version: number;
};

export type CertificateFieldRecord = {
  fieldKey: CertificateVariableKey;
  isEnabled: boolean;
  isRequired: boolean;
};

export type CertificateRenderInput = {
  mode: Exclude<CertificateMode, "none">;
  payload: CertificatePayload;
  template: CertificateTemplateRecord | null;
  fields: CertificateFieldRecord[];
};
