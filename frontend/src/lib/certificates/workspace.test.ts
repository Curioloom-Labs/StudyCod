import { describe, expect, it } from "vitest";
import { diplomaLabel, eligibleForDiploma, parseCertificateDesign } from "./workspace";
import type { ContestAwardRow } from "../api/contestAwards";

const participant: ContestAwardRow = { participantId: 1, displayName: "Тест", rank: 1, totalScore: 100, maxScore: 100,
  submissionCount: 1, isDisqualified: false, retainParticipation: false, awardPlace: 1 };

describe("certificate recipient allocation", () => {
  it("distinguishes all four diploma types and excludes absent and fully disqualified participants", () => {
    expect([null, 1, 2, 3].map(awardPlace => diplomaLabel({ ...participant, awardPlace: awardPlace as ContestAwardRow["awardPlace"] })))
      .toEqual(["Учасник", "1 місце", "2 місце", "3 місце"]);
    expect(eligibleForDiploma({ ...participant, submissionCount: 0 })).toBe(false);
    expect(diplomaLabel({ ...participant, isDisqualified: true })).toBe("Без диплома");
    expect(eligibleForDiploma({ ...participant, isDisqualified: true, retainParticipation: true, awardPlace: null })).toBe(true);
  });
  it("keeps imported HTML and CSS intact rather than replacing them with an editor canvas", () => {
    const htmlTemplate = '<main class="rank-{{place}}">{{name}}</main>';
    const cssTemplate = ".rank-1 {color:gold}";
    const design = parseCertificateDesign({ name: "Куб", htmlTemplate, cssTemplate });
    expect(design.htmlTemplate).toBe(htmlTemplate);
    expect(design.cssTemplate).toBe(cssTemplate);
    expect(design.fields.find(field => field.fieldKey === "place")?.isEnabled).toBe(true);
    expect(() => parseCertificateDesign({ name: "broken", htmlTemplate: "" })).toThrow();
    expect(() => parseCertificateDesign({ name: "broken", htmlTemplate: "{{unknown_field}}" })).toThrow("UNKNOWN_TEMPLATE_FIELDS");
  });
});
