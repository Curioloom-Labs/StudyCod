import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Student } from "./Student";
import { TopicTask } from "./TopicTask";
import { EduGrade } from "./EduGrade";

export const EDU_HINT_FEEDBACK_SIGNALS = ["UP", "DOWN"] as const;
export type EduHintFeedbackSignal = (typeof EDU_HINT_FEEDBACK_SIGNALS)[number];

export const EDU_HINT_FEEDBACK_REASON_CODES = [
  "HELPFUL",
  "NOT_SPECIFIC",
  "INCORRECT",
  "TOO_HARD",
  "TOO_VERBOSE",
  "OTHER",
] as const;
export type EduHintFeedbackReasonCode = (typeof EDU_HINT_FEEDBACK_REASON_CODES)[number];

@Entity("edu_hint_feedback")
export class EduHintFeedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Student, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "student_id" })
  student!: Student;

  @ManyToOne(() => TopicTask, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "topic_task_id" })
  topicTask!: TopicTask;

  @ManyToOne(() => EduGrade, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "grade_id" })
  grade!: EduGrade | null;

  @Column({
    type: "varchar",
    length: 128,
    nullable: true,
    name: "submission_id",
  })
  submissionId!: string | null;

  @Column({
    type: "varchar",
    length: 128,
    name: "code_hash",
  })
  codeHash!: string;

  @Column({
    type: "varchar",
    length: 32,
    nullable: true,
  })
  verdict!: string | null;

  @Column({
    type: "enum",
    enum: EDU_HINT_FEEDBACK_SIGNALS,
  })
  signal!: EduHintFeedbackSignal;

  @Column({
    type: "enum",
    enum: EDU_HINT_FEEDBACK_REASON_CODES,
    nullable: true,
    name: "reason_code",
  })
  reasonCode!: EduHintFeedbackReasonCode | null;

  @Column({
    type: "text",
    nullable: true,
    name: "reason_text",
  })
  reasonText!: string | null;

  @Column({
    type: "int",
    default: 0,
    name: "hints_shown",
  })
  hintsShown!: number;

  @Column({
    type: "int",
    default: 0,
    name: "hints_total",
  })
  hintsTotal!: number;

  @CreateDateColumn({
    name: "created_at",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: "updated_at",
  })
  updatedAt!: Date;
}
