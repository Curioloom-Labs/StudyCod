import type { ContestAwardRow } from "../api/contestAwards";

export const CERTIFICATE_VARIABLES = ["contest_name", "name", "full_name", "place", "score", "max_score", "date", "organizer", "signature", "certificate_id", "qr_code"] as const;
export type CertificateVariable = typeof CERTIFICATE_VARIABLES[number];
export type CertificateDesign = {
  id: number | null; contestId: number | null; name: string; type: "studycod" | "custom";
  htmlTemplate: string; cssTemplate: string;
  fields: Array<{ fieldKey: CertificateVariable; isEnabled?: boolean; isRequired?: boolean }>;
};

export function eligibleForDiploma(row: ContestAwardRow): boolean {
  return row.submissionCount > 0 && (!row.isDisqualified || row.retainParticipation);
}

export function diplomaLabel(row: ContestAwardRow, english = false): string {
  if (!eligibleForDiploma(row)) return english ? "No diploma" : "Без диплома";
  if (row.awardPlace) return english ? ["", "1st place", "2nd place", "3rd place"][row.awardPlace] : `${row.awardPlace} місце`;
  return english ? "Participant" : "Учасник";
}

export function parseCertificateDesign(input: unknown): CertificateDesign {
  if (!input || typeof input !== "object") throw new Error("INVALID_TEMPLATE_FILE");
  const value = input as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim() || typeof value.htmlTemplate !== "string" || !value.htmlTemplate.trim()
    || (value.cssTemplate != null && typeof value.cssTemplate !== "string")) throw new Error("INVALID_TEMPLATE_FILE");
  const placeholders = Array.from(value.htmlTemplate.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g), match => match[1]);
  const unknown = placeholders.filter(key => !CERTIFICATE_VARIABLES.includes(key as CertificateVariable));
  if (unknown.length) throw new Error(`UNKNOWN_TEMPLATE_FIELDS:${unknown.join(", ")}`);
  const supplied = Array.isArray(value.fields) ? value.fields : [];
  const fields = CERTIFICATE_VARIABLES.map(fieldKey => {
    const field = supplied.find(item => item && item.fieldKey === fieldKey);
    return { fieldKey, isEnabled: field ? field.isEnabled !== false : placeholders.includes(fieldKey), isRequired: fieldKey === "name" };
  });
  return { id: null, contestId: null, name: value.name.trim().slice(0, 180), type: "custom", htmlTemplate: value.htmlTemplate,
    cssTemplate: String(value.cssTemplate || ""), fields };
}
