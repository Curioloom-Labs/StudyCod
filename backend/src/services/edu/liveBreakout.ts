import { randomBytes } from "crypto";
import { setLiveState, getLiveState, deleteLiveState } from "./liveStateStore";

/**
 * Ephemeral breakout-room state for a live lesson. The teacher splits the class
 * into N groups; each group is its own LiveKit room (a fresh room name). This
 * holds the assignment (which student is in which group) so a student's client
 * can fetch a token for their group room and the teacher can hop between groups.
 *
 * Transient session state, backed by {@link ./liveStateStore} (Redis when
 * configured, in-process Map otherwise). Cleared explicitly on close/lesson end;
 * a long safety TTL guards against a never-closed session leaking state.
 */
export interface BreakoutGroup {
  index: number;
  roomName: string;
  studentIds: number[];
}

export interface BreakoutState {
  classId: number;
  groups: BreakoutGroup[];
  openedAtMs: number;
}

const NS = "breakout";
const SAFETY_TTL_SEC = 12 * 60 * 60;

export async function openBreakouts(classId: number, count: number, studentIds: number[]): Promise<BreakoutState> {
  const groupCount = Math.max(2, Math.min(8, Math.floor(count) || 2));
  const groups: BreakoutGroup[] = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push({ index: i, roomName: `cls-${classId}-bk-${i}-${randomBytes(6).toString("hex")}`, studentIds: [] });
  }
  // Round-robin assignment keeps groups balanced.
  studentIds.forEach((sid, idx) => {
    groups[idx % groupCount].studentIds.push(sid);
  });

  const state: BreakoutState = { classId, groups, openedAtMs: Date.now() };
  await setLiveState(NS, classId, state, SAFETY_TTL_SEC);
  return state;
}

export async function getBreakouts(classId: number): Promise<BreakoutState | null> {
  return await getLiveState<BreakoutState>(NS, classId);
}

export async function findStudentGroup(classId: number, studentId: number): Promise<BreakoutGroup | null> {
  const state = await getBreakouts(classId);
  if (!state) return null;
  return state.groups.find((g) => g.studentIds.includes(studentId)) ?? null;
}

export async function getGroup(classId: number, index: number): Promise<BreakoutGroup | null> {
  const state = await getBreakouts(classId);
  if (!state) return null;
  return state.groups.find((g) => g.index === index) ?? null;
}

export async function closeBreakouts(classId: number): Promise<void> {
  await deleteLiveState(NS, classId);
}
