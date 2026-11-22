export type AssessRole = "OWNER" | "HR" | "ENGINEER";
export type AssessView = "interviews" | "kits" | "overview" | "candidates" | "assessments" | "team" | "integrations";
export type AssessCase = { id: string; status: string; candidate_username?: string; role_title?: string; task_title?: string | null; [key: string]: unknown };
export type AssessFile = { path: string; content: string };

export function compareAssessFiles(before: AssessFile[], after: AssessFile[]) {
  const source = new Map(before.map(file => [file.path, file]));
  const submitted = new Map(after.map(file => [file.path, file]));
  return [...new Set([...source.keys(), ...submitted.keys()])].sort().map(path => {
    const original = source.get(path);
    const result = submitted.get(path);
    const status = !original ? "ADDED" : !result ? "REMOVED" : original.content === result.content ? "UNCHANGED" : "MODIFIED";
    return { path, original, submitted: result, status };
  });
}

export function normalizeAssessCompany(response: Record<string, any>): Record<string, any> {
  if (!response.company?.id || !response.company?.name || !["OWNER", "HR", "ENGINEER"].includes(response.company.role)) throw new Error("INVALID_COMPANY_RESPONSE");
  return {
    ...response.company,
    members: Array.isArray(response.members) ? response.members : [],
    assessments: Array.isArray(response.assessments) ? response.assessments : [],
    assessmentPage: Number(response.assessmentPage ?? 1),
    assessmentPageSize: Number(response.assessmentPageSize ?? 50),
    assessmentMatchCount: Number(response.assessmentMatchCount ?? 0),
    assessmentTotal: Number(response.assessmentTotal ?? 0),
    technicalAssessmentTotal: Number(response.technicalAssessmentTotal ?? 0),
    assessmentStatusCounts: response.assessmentStatusCounts && typeof response.assessmentStatusCounts === "object" ? response.assessmentStatusCounts : {},
  };
}

export const assessStages = [
  { key: "invitation", statuses: ["INVITED"], uk: "Запрошення", en: "Invitation" },
  { key: "interview", statuses: ["ACCEPTED"], uk: "Співбесіда", en: "Interview" },
  { key: "evidence", statuses: ["PORTFOLIO_SELECTED"], uk: "Версія проєкту", en: "Project evidence" },
  { key: "task", statuses: ["TASK_ASSIGNED"], uk: "Технічна зміна", en: "Technical change" },
  { key: "review", statuses: ["TASK_SUBMITTED"], uk: "Рецензування", en: "Review" },
  { key: "complete", statuses: ["REVIEWED"], uk: "Відгуки", en: "Feedback" },
] as const;

export function assessView(value: string | null): AssessView {
  return value === "candidates" || value === "assessments" || value === "team" || value === "integrations" || value === "kits" || value === "overview" ? value : "interviews";
}

export function assessCaseUrl(companyId: string, assessmentId: string): string {
  return `/assess?${new URLSearchParams({ company: companyId, assessment: assessmentId })}`;
}

export function assessBatchCaseVariant(first: "A" | "B", index: number): "A" | "B" {
  return index % 2 === 0 ? first : first === "A" ? "B" : "A";
}

export function assessNextAction(status: string, role: AssessRole, en: boolean): { label: string; actionable: boolean } {
  const labels: Record<string, [string, string]> = {
    INVITED: ["Очікуємо згоду", "Awaiting consent"], ACCEPTED: ["Переглянути співбесіду", "Review interview"],
    PORTFOLIO_SELECTED: ["Призначити зміну вимог", "Assign a requirement change"], TASK_ASSIGNED: ["Кандидат працює", "Candidate is working"],
    TASK_SUBMITTED: ["Переглянути виконання", "Review submission"], REVIEWED: ["Відкрити підсумок", "Open feedback"],
    DECLINED: ["Запрошення відхилено", "Invitation declined"], WITHDRAWN: ["Згоду відкликано", "Consent withdrawn"], CLOSED: ["Оцінювання закрито", "Assessment closed"],
  };
  const actionable = status === "ACCEPTED" && role !== "ENGINEER"
    || (status === "PORTFOLIO_SELECTED" || status === "TASK_SUBMITTED") && role !== "HR";
  const label = role === "HR" && status === "PORTFOLIO_SELECTED"
    ? (en ? "Review project evidence" : "Переглянути версію")
    : (labels[status] ?? ["Відкрити досьє", "Open dossier"])[en ? 1 : 0];
  return { label, actionable };
}

export function filterAssessCases(cases: AssessCase[], query: string, status: string, technicalOnly = false): AssessCase[] {
  const needle = query.trim().toLocaleLowerCase();
  const technicalStatuses = new Set(["PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"]);
  return cases.filter(item => (!technicalOnly || technicalStatuses.has(item.status))
    && (!status || item.status === status)
    && (!needle || `${item.candidate_username ?? ""} ${item.role_title ?? ""} ${item.task_title ?? ""}`.toLocaleLowerCase().includes(needle)));
}

export function suggestAssessEvidenceProbes(
  criteria: Array<{ id?: string; labelUk?: string; labelEn?: string }>,
  reviews: Array<{ reviewerType?: string; submittedAt?: string; scores?: Array<number | null> }>,
  en: boolean,
): string[] {
  if (!criteria.length || !reviews.length) return [];
  const latestByReviewer = new Map<string, { submittedAt: number; scores: Array<number | null> }>();
  for (const review of reviews) {
    if (!Array.isArray(review.scores)) continue;
    const reviewer = review.reviewerType ?? "reviewer";
    const submittedAt = Date.parse(review.submittedAt ?? "") || 0;
    if (submittedAt >= (latestByReviewer.get(reviewer)?.submittedAt ?? -1)) {
      latestByReviewer.set(reviewer, { submittedAt, scores: review.scores });
    }
  }
  if (!latestByReviewer.size) return [];
  return criteria.flatMap((criterion, index) => {
    const scores = [...latestByReviewer.values()].map(review => review.scores[index]).filter((score): score is number => typeof score === "number");
    if (scores.some(score => score >= 2)) return [];
    const label = (en ? criterion.labelEn : criterion.labelUk)?.trim();
    if (!label) return [];
    return [en
      ? `We have not yet seen enough evidence for “${label}”. Could you walk us through one concrete example and explain your role and the outcome?`
      : `За критерієм «${label}» поки недостатньо конкретних доказів. Наведи один приклад і поясни свою роль та результат.`];
  }).slice(0, 3);
}
