import { describe, expect, it } from "vitest";
import { compareTalentFiles, filterTalentCases, normalizeTalentCompany, talentNextAction, talentView, type TalentCase } from "./companyWorkspace";

describe("Talent workspace data and role actions", () => {
  it("reads company identity and permissions from the nested API response", () => {
    const response = { company: { id: "team", name: "Company", role: "ENGINEER" }, members: [{ id: "member" }], assessments: [{ id: "case", status: "TASK_SUBMITTED" }] };
    const company = normalizeTalentCompany(response);
    expect(company.id).toBe("team");
    expect(company.role).toBe("ENGINEER");
    expect(company.assessments).toBe(response.assessments);
    expect(() => normalizeTalentCompany({ ...response, company: { ...response.company, role: "TEACHER" } })).toThrow("INVALID_COMPANY_RESPONSE");
  });

  it("does not put engineering work into an HR action queue or interviews into an engineer's queue", () => {
    expect(talentNextAction("PORTFOLIO_SELECTED", "HR", false).actionable).toBe(false);
    expect(talentNextAction("TASK_SUBMITTED", "HR", true).actionable).toBe(false);
    expect(talentNextAction("ACCEPTED", "ENGINEER", true).actionable).toBe(false);
    expect(talentNextAction("TASK_SUBMITTED", "ENGINEER", true).actionable).toBe(true);
    expect(talentNextAction("PORTFOLIO_SELECTED", "OWNER", false).actionable).toBe(true);
    expect(talentNextAction("WITHDRAWN", "OWNER", false).actionable).toBe(false);
  });

  it("keeps withdrawn work out of the engineering queue while searching roles and tasks", () => {
    const cases: TalentCase[] = [
      { id: "accepted", status: "ACCEPTED", candidate_username: "olena", role_title: "Python developer" },
      { id: "active", status: "TASK_ASSIGNED", candidate_username: "andrii", role_title: "Python developer", task_title: "Atomic import" },
      { id: "withdrawn", status: "WITHDRAWN", candidate_username: "marta", role_title: "Python developer" },
      { id: "submitted", status: "TASK_SUBMITTED", candidate_username: "denys", role_title: "Java developer" },
    ];
    expect(filterTalentCases(cases, "PYTHON", "", true).map(item => item.id)).toEqual(["active"]);
    expect(filterTalentCases(cases, " atomic ", "", true).map(item => item.id)).toEqual(["active"]);
    expect(filterTalentCases(cases, "", "TASK_SUBMITTED", true).map(item => item.id)).toEqual(["submitted"]);
    expect(filterTalentCases(cases, "", "WITHDRAWN", true)).toEqual([]);
  });

  it("opens interviews by default and keeps existing sections addressable", () => {
    expect(talentView("team")).toBe("team");
    expect(talentView("arbitrary")).toBe("interviews");
    expect(talentView(null)).toBe("interviews");
  });

  it("compares paths independently of order and distinguishes empty, added, removed and edited files", () => {
    const before = [{ path: "unchanged.py", content: "same" }, { path: "empty.py", content: "" }, { path: "removed.py", content: "old" }, { path: "edited.py", content: "old" }];
    const after = [{ path: "edited.py", content: "new" }, { path: "added.py", content: "" }, { path: "unchanged.py", content: "same" }, { path: "empty.py", content: "" }];
    expect(compareTalentFiles(before, after).map(file => [file.path, file.status])).toEqual([
      ["added.py", "ADDED"], ["edited.py", "MODIFIED"], ["empty.py", "UNCHANGED"], ["removed.py", "REMOVED"], ["unchanged.py", "UNCHANGED"],
    ]);
    expect(before[0].content).toBe("same");
    expect(after[0].content).toBe("new");
  });
});
