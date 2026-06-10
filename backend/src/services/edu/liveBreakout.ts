import { randomBytes } from "crypto";

/**
 * Ephemeral breakout-room state for a live lesson. The teacher splits the class
 * into N groups; each group is its own LiveKit room (a fresh room name). This
 * holds the assignment (which student is in which group) so a student's client
 * can fetch a token for their group room and the teacher can hop between groups.
 * Transient session state — single-instance scope (move to Redis for multi-node).
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

const byClass = new Map<number, BreakoutState>();

export function openBreakouts(classId: number, count: number, studentIds: number[]): BreakoutState {
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
  byClass.set(classId, state);
  return state;
}

export function getBreakouts(classId: number): BreakoutState | null {
  return byClass.get(classId) ?? null;
}

export function findStudentGroup(classId: number, studentId: number): BreakoutGroup | null {
  const state = byClass.get(classId);
  if (!state) return null;
  return state.groups.find((g) => g.studentIds.includes(studentId)) ?? null;
}

export function getGroup(classId: number, index: number): BreakoutGroup | null {
  const state = byClass.get(classId);
  if (!state) return null;
  return state.groups.find((g) => g.index === index) ?? null;
}

export function closeBreakouts(classId: number): void {
  byClass.delete(classId);
}
