import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  RelationId
} from "typeorm";
import { EduTask } from "./EduTask";
import { Student } from "./Student";

/**
 * A student's submission to a MANUAL (hand-graded) task — a text answer and/or
 * an uploaded file. The teacher reads it and grades via the existing manual-grade
 * endpoint (writes EduGrade). One submission row per (task, student); resubmits
 * overwrite it until graded.
 */
export type ManualSubmissionStatus = "SUBMITTED" | "GRADED";

@Entity("manual_submissions")
@Index("uq_manual_task_student", ["task", "student"], { unique: true })
export class ManualSubmission {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => EduTask, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task!: EduTask;

  @RelationId((s: ManualSubmission) => s.task)
  taskId!: number;

  @ManyToOne(() => Student, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: Student;

  @RelationId((s: ManualSubmission) => s.student)
  studentId!: number;

  @Column({ type: "text", nullable: true })
  text?: string | null;

  /** Relative storage key under UPLOADS_DIR for an uploaded file, if any. */
  @Column({ type: "varchar", length: 300, nullable: true, name: "file_storage_key" })
  fileStorageKey?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, name: "file_name" })
  fileName?: string | null;

  @Column({ type: "enum", enum: ["SUBMITTED", "GRADED"], default: "SUBMITTED" })
  status!: ManualSubmissionStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
