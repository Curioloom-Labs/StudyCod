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
import { EduLesson } from "./EduLesson";
import { Student } from "./Student";

/**
 * A student's attempt at a lesson quiz (the new quiz engine, P2.5). Stores the
 * submitted answers and the auto-graded outcome. Kept separate from the grade
 * tables for now; the generalized gradebook can later surface these scores.
 * One attempt per (lesson, student).
 */
export type QuizAttemptStatus = "AUTO_GRADED" | "NEEDS_MANUAL" | "MANUAL_GRADED";

@Entity("quiz_attempts")
@Index("uq_quiz_lesson_student", ["lesson", "student"], { unique: true })
export class QuizAttempt {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => EduLesson, { onDelete: "CASCADE" })
  @JoinColumn({ name: "lesson_id" })
  lesson!: EduLesson;

  @RelationId((a: QuizAttempt) => a.lesson)
  lessonId!: number;

  @ManyToOne(() => Student, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: Student;

  @RelationId((a: QuizAttempt) => a.student)
  studentId!: number;

  @Column({ type: "text", nullable: true, name: "answers_json" })
  answersJson?: string | null;

  @Column({ type: "decimal", precision: 7, scale: 2, default: 0, name: "auto_score" })
  autoScore!: number;

  @Column({ type: "decimal", precision: 7, scale: 2, default: 0, name: "max_score" })
  maxScore!: number;

  @Column({ type: "int", default: 0, name: "auto_percent" })
  autoPercent!: number;

  /** Teacher-awarded points for OPEN_TEXT questions (set on manual grading). */
  @Column({ type: "decimal", precision: 7, scale: 2, default: 0, name: "manual_score" })
  manualScore!: number;

  /** Final percent (auto + manual) of max, once fully graded. */
  @Column({ type: "int", nullable: true, name: "final_percent" })
  finalPercent?: number | null;

  @Column({ type: "enum", enum: ["AUTO_GRADED", "NEEDS_MANUAL", "MANUAL_GRADED"], default: "AUTO_GRADED" })
  status!: QuizAttemptStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
