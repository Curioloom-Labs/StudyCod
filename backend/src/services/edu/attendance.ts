import { AppDataSource } from "../../data-source";
import { Attendance, type AttendanceStatus } from "../../entities/Attendance";

/**
 * Attendance taking (Tier 1). One record per (class, student, date), upserted.
 */

const VALID: readonly AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

/** Pure: validate a status, or null. */
export function normalizeAttendanceStatus(raw: unknown): AttendanceStatus | null {
  return VALID.includes(raw as AttendanceStatus) ? (raw as AttendanceStatus) : null;
}

/** Pure: YYYY-MM-DD validation (calendar day). */
export function isValidDate(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(new Date(raw).getTime());
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

/** Pure: tally statuses. */
export function summarizeAttendance(records: Array<{ status: AttendanceStatus }>): AttendanceCounts {
  const c: AttendanceCounts = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
  for (const r of records) {
    c.total += 1;
    if (r.status === "PRESENT") c.present += 1;
    else if (r.status === "ABSENT") c.absent += 1;
    else if (r.status === "LATE") c.late += 1;
    else if (r.status === "EXCUSED") c.excused += 1;
  }
  return c;
}

const repo = () => AppDataSource.getRepository(Attendance);

export async function getAttendanceForDate(classId: number, date: string): Promise<Attendance[]> {
  return await repo().find({ where: { classId, date } });
}

export interface AttendanceEntryInput {
  studentId: number;
  status: AttendanceStatus;
}

/**
 * Upsert attendance for a set of students on a date. Invalid entries are
 * skipped. Returns the resulting records for the date. Atomic.
 */
export async function setAttendanceForDate(
  classId: number,
  date: string,
  entries: AttendanceEntryInput[],
  recordedByUserId: number | null,
  lessonId: number | null = null
): Promise<Attendance[]> {
  await AppDataSource.transaction(async (manager) => {
    const r = manager.getRepository(Attendance);
    for (const e of entries) {
      const status = normalizeAttendanceStatus(e.status);
      const studentId = Number(e.studentId);
      if (!status || !Number.isFinite(studentId)) continue;
      const existing = await r.findOne({ where: { classId, studentId, date } });
      if (existing) {
        existing.status = status;
        existing.lessonId = lessonId;
        existing.recordedByUserId = recordedByUserId;
        await r.save(existing);
      } else {
        await r.save(r.create({ classId, studentId, date, status, lessonId, recordedByUserId }));
      }
    }
  });
  return await getAttendanceForDate(classId, date);
}
