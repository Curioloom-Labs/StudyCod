export type TalentRole = "OWNER" | "HR" | "ENGINEER";
export type TalentView = "interviews" | "kits" | "overview" | "candidates" | "assessments" | "team";
export type TalentCase = { id: string; status: string; candidate_username?: string; role_title?: string; task_title?: string | null; [key: string]: unknown };
export type TalentFile = { path: string; content: string };

export function compareTalentFiles(before: TalentFile[], after: TalentFile[]) {
  const source = new Map(before.map(file => [file.path, file]));
  const submitted = new Map(after.map(file => [file.path, file]));
  return [...new Set([...source.keys(), ...submitted.keys()])].sort().map(path => {
    const original = source.get(path);
    const result = submitted.get(path);
    const status = !original ? "ADDED" : !result ? "REMOVED" : original.content === result.content ? "UNCHANGED" : "MODIFIED";
    return { path, original, submitted: result, status };
  });
}

export function normalizeTalentCompany(response: Record<string, any>): Record<string, any> {
  if (!response.company?.id || !response.company?.name || !["OWNER", "HR", "ENGINEER"].includes(response.company.role)) throw new Error("INVALID_COMPANY_RESPONSE");
  return { ...response.company, members: Array.isArray(response.members) ? response.members : [], assessments: Array.isArray(response.assessments) ? response.assessments : [] };
}

export const talentStages = [
  { key: "invitation", statuses: ["INVITED"], uk: "Запрошення", en: "Invitation" },
  { key: "interview", statuses: ["ACCEPTED"], uk: "Співбесіда", en: "Interview" },
  { key: "evidence", statuses: ["PORTFOLIO_SELECTED"], uk: "Версія проєкту", en: "Project evidence" },
  { key: "task", statuses: ["TASK_ASSIGNED"], uk: "Технічна зміна", en: "Technical change" },
  { key: "review", statuses: ["TASK_SUBMITTED"], uk: "Рецензування", en: "Review" },
  { key: "complete", statuses: ["REVIEWED"], uk: "Відгуки", en: "Feedback" },
] as const;

export function talentView(value: string | null): TalentView {
  return value === "candidates" || value === "assessments" || value === "team" || value === "kits" || value === "overview" ? value : "interviews";
}

export function talentCaseUrl(companyId: string, assessmentId: string): string {
  return `/companies?${new URLSearchParams({ company: companyId, assessment: assessmentId })}`;
}

export function talentNextAction(status: string, role: TalentRole, en: boolean): { label: string; actionable: boolean } {
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

export function filterTalentCases(cases: TalentCase[], query: string, status: string, technicalOnly = false): TalentCase[] {
  const needle = query.trim().toLocaleLowerCase();
  const technicalStatuses = new Set(["PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"]);
  return cases.filter(item => (!technicalOnly || technicalStatuses.has(item.status))
    && (!status || item.status === status)
    && (!needle || `${item.candidate_username ?? ""} ${item.role_title ?? ""} ${item.task_title ?? ""}`.toLocaleLowerCase().includes(needle)));
}
