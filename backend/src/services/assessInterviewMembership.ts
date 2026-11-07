import { AppDataSource } from "../data-source";
import { assessInterviewJson } from "./assessInterviewKit";
import { closeAssessInterviewMediaRoom, removeAssessInterviewParticipant } from "./assessInterviewMedia";

/** Remove a revoked member from interview rosters and end sessions they host. */
export async function revokeAssessInterviewMemberAccess(companyId: string, userId: number): Promise<void> {
  if (!companyId || !Number.isSafeInteger(userId) || userId <= 0) return;
  const interviews = await AppDataSource.query(
    `SELECT id,status,room_name,host_user_id,interviewer_ids_json FROM growth_interviews i
     WHERE i.company_id=? AND i.status IN ('SCHEDULED','LIVE')
       AND (i.host_user_id=? OR JSON_CONTAINS(i.interviewer_ids_json,JSON_ARRAY(?)))`,
    [companyId, userId, userId],
  ) as Array<{ id: string; status: string; room_name: string; host_user_id: number; interviewer_ids_json: unknown }>;

  for (const interview of interviews) {
    const parsed = assessInterviewJson<unknown>(interview.interviewer_ids_json, []);
    const assigned = Array.isArray(parsed) ? parsed.map(Number) : [];
    const assignedIndex = assigned.findIndex(id => id === userId);
    if (assignedIndex >= 0) {
      await AppDataSource.query(
        `UPDATE growth_interviews SET interviewer_ids_json=JSON_REMOVE(interviewer_ids_json,?)
         WHERE id=? AND company_id=? AND status IN ('SCHEDULED','LIVE')`,
        [`$[${assignedIndex}]`, interview.id, companyId],
      );
    }
    if (Number(interview.host_user_id) === userId) {
      const cancelled = await AppDataSource.query(
        `UPDATE growth_interviews SET status='CANCELLED',completed_at=UTC_TIMESTAMP(3)
         WHERE id=? AND company_id=? AND status IN ('SCHEDULED','LIVE')`,
        [interview.id, companyId],
      );
      if (interview.status === "LIVE" && cancelled.affectedRows) await closeAssessInterviewMediaRoom(interview.room_name);
    } else if (interview.status === "LIVE" && assignedIndex >= 0) {
      await removeAssessInterviewParticipant(interview.room_name, userId);
    }
  }
}
