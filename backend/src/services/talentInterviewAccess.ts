import { AppDataSource } from "../data-source";
import { talentJson } from "./talentInterviewKit";

export type InterviewRole = "OWNER" | "HR" | "ENGINEER" | "CANDIDATE";
export type InterviewAccess = { row: Record<string, any>; role: InterviewRole; userId: number; canHost: boolean; consented: boolean };
export async function interviewAccess(id: string, userId: number): Promise<InterviewAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await AppDataSource.query(`SELECT i.*,DATE_FORMAT(i.scheduled_at,'%Y-%m-%dT%H:%i:%s.000Z') AS scheduled_utc,a.candidate_id,a.status AS consent_status,a.consent_at,
    c.name AS company_name,u.username AS candidate_username,h.username AS host_username
    FROM growth_interviews i JOIN growth_company_assessments a ON a.id=i.assessment_id
    JOIN growth_companies c ON c.id=i.company_id JOIN users u ON u.id=a.candidate_id JOIN users h ON h.id=i.host_user_id
    WHERE i.id=? LIMIT 1`, [id]) as Array<Record<string, any>>;
  const row = rows[0];
  if (!row || ["WITHDRAWN", "DECLINED", "CLOSED"].includes(row.consent_status)) return null;
  const consented = Boolean(row.consent_at) && row.consent_status !== "INVITED";
  if (Number(row.candidate_id) === userId) return { row, role: "CANDIDATE", userId, canHost: false, consented };
  const members = await AppDataSource.query("SELECT role FROM growth_company_members WHERE company_id=? AND user_id=? AND status='ACTIVE' LIMIT 1", [row.company_id, userId]) as Array<{ role: InterviewRole }>;
  const role = members[0]?.role;
  const assigned = talentJson<number[]>(row.interviewer_ids_json, []);
  if (!role || role !== "OWNER" && Number(row.host_user_id) !== userId && !assigned.includes(userId)) return null;
  return { row, role, userId, canHost: role === "OWNER" || Number(row.host_user_id) === userId, consented };
}

export function canReadInterviewWorkspace(access: InterviewAccess): boolean {
  return access.role !== "CANDIDATE" || access.consented && access.row.status !== "SCHEDULED";
}

export function interviewCalendar(row: Record<string, any>, origin: string): string {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(row.scheduled_utc ?? row.scheduled_at);
  const end = new Date(start.getTime() + Number(row.duration_minutes) * 60_000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyCod//Talent Interviews//UK", "BEGIN:VEVENT", `UID:${row.id}@studycod.space`, `DTSTAMP:${stamp(new Date(row.created_at))}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(String(row.title))}`, `DESCRIPTION:${escape(`${row.company_name}\n${origin}/companies/interviews/${row.id}`)}`, `URL:${origin}/companies/interviews/${row.id}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
