import { AppDataSource } from "../../data-source";
import { ContestParticipant } from "../../entities/ContestParticipant";

const validId = (id: number): boolean => Number.isSafeInteger(id) && id > 0;

/** Fresh indexed membership check; no permissions or memberships are cached. */
export async function userContestParticipantId(contestId: number, userId: number): Promise<number | null> {
  if (!validId(contestId) || !validId(userId)) return null;
  const rows = await AppDataSource.query(
    "SELECT id FROM contest_participants WHERE contest_id=? AND user_id=? LIMIT 1", [contestId, userId]) as Array<{ id: number }>;
  return rows[0] ? Number(rows[0].id) : null;
}

export async function userOwnsContestParticipant(participantId: number, contestId: number, userId: number): Promise<boolean> {
  if (![participantId, contestId, userId].every(validId)) return false;
  const rows = await AppDataSource.query(
    "SELECT id FROM contest_participants WHERE id=? AND contest_id=? AND user_id=? LIMIT 1",
    [participantId, contestId, userId]) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Avoid relation joins for a User participant already identified by foreign keys. */
export async function readUserContestParticipant(contestId: number, userId: number): Promise<ContestParticipant | null> {
  if (!validId(contestId) || !validId(userId)) return null;
  const rows = await AppDataSource.query(`SELECT id,principal_type principalType,display_name displayName,
    is_disqualified isDisqualified,contest_account_handle contestAccountHandle,contest_account_note contestAccountNote,
    notification_email notificationEmail,notification_full_name notificationFullName,
    disqualification_reason disqualificationReason,disqualified_at disqualifiedAt,joined_at joinedAt,updated_at updatedAt
    FROM contest_participants WHERE contest_id=? AND user_id=? LIMIT 1`, [contestId, userId]) as ContestParticipant[];
  if (!rows[0]) return null;
  return AppDataSource.getRepository(ContestParticipant).create({ ...rows[0], isDisqualified: Boolean(Number(rows[0].isDisqualified)) });
}
