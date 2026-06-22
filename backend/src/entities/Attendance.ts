import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Class } from "./Class";
import { Student } from "./Student";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/**
 * Per-student, per-day attendance record (Tier 1). One row per (class, student,
 * date). EDU-only; does not touch Personal/Contest.
 */
@Entity("attendance")
@Unique("uq_attendance_class_student_date", ["classId", "studentId", "date"])
export class Attendance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int", name: "class_id" })
  classId!: number;

  @ManyToOne(() => Class, { onDelete: "CASCADE" })
  @JoinColumn({ name: "class_id" })
  class!: Class;

  @Column({ type: "int", name: "student_id" })
  studentId!: number;

  @ManyToOne(() => Student, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: Student;

  /** Calendar day (no time component). */
  @Column({ type: "date" })
  date!: string;

  @Column({ type: "enum", enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"], default: "PRESENT" })
  status!: AttendanceStatus;

  /** Optional link to the lesson this attendance was taken for. */
  @Column({ type: "int", nullable: true, name: "lesson_id" })
  lessonId?: number | null;

  /** Teacher (User) who recorded it. */
  @Column({ type: "int", nullable: true, name: "recorded_by_user_id" })
  recordedByUserId?: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
