import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Student } from "./Student";
import { Class } from "./Class";
import { User } from "./User";
import { EduGrade } from "./EduGrade";
import { SummaryGrade } from "./SummaryGrade";
import { GradeAppealMessage } from "./GradeAppealMessage";

export const GRADE_APPEAL_TARGET_TYPES = ["EDU_GRADE", "SUMMARY_GRADE"] as const;
export type GradeAppealTargetType = (typeof GRADE_APPEAL_TARGET_TYPES)[number];

export const GRADE_APPEAL_STATUSES = [
  "SUBMITTED",
  "IN_REVIEW",
  "NEEDS_INFO",
  "RESOLVED_ACCEPTED",
  "RESOLVED_PARTIAL",
  "RESOLVED_REJECTED",
  "CANCELLED",
] as const;
export type GradeAppealStatus = (typeof GRADE_APPEAL_STATUSES)[number];

export const GRADE_APPEAL_REASON_CODES = [
  "CHECK_TEST_RESULTS",
  "CHECK_FEEDBACK",
  "CHECK_CALCULATION",
  "CHECK_THEMATIC",
  "OTHER",
] as const;
export type GradeAppealReasonCode = (typeof GRADE_APPEAL_REASON_CODES)[number];

@Entity("grade_appeals")
export class GradeAppeal {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Student, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "student_id" })
  student!: Student;

  @ManyToOne(() => Class, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "class_id" })
  class!: Class;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "teacher_user_id" })
  teacherUser!: User | null;

  @ManyToOne(() => EduGrade, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "edu_grade_id" })
  eduGrade!: EduGrade | null;

  @ManyToOne(() => SummaryGrade, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "summary_grade_id" })
  summaryGrade!: SummaryGrade | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "resolved_by_user_id" })
  resolvedByUser!: User | null;

  @Column({
    type: "enum",
    enum: GRADE_APPEAL_TARGET_TYPES,
    name: "target_type",
  })
  targetType!: GradeAppealTargetType;

  @Column({
    type: "enum",
    enum: GRADE_APPEAL_STATUSES,
    default: "SUBMITTED",
  })
  status!: GradeAppealStatus;

  @Column({
    type: "enum",
    enum: GRADE_APPEAL_REASON_CODES,
    name: "reason_code",
  })
  reasonCode!: GradeAppealReasonCode;

  @Column({
    type: "text",
    name: "reason_text",
  })
  reasonText!: string;

  @Column({
    type: "text",
    nullable: true,
    name: "desired_outcome",
  })
  desiredOutcome!: string | null;

  @Column({
    type: "text",
    nullable: true,
    name: "resolution_text",
  })
  resolutionText!: string | null;

  @Column({
    type: "int",
    nullable: true,
    name: "previous_grade",
  })
  previousGrade!: number | null;

  @Column({
    type: "int",
    nullable: true,
    name: "new_grade",
  })
  newGrade!: number | null;

  @Column({
    type: "boolean",
    default: false,
    name: "grade_changed",
  })
  gradeChanged!: boolean;

  @Column({
    type: "datetime",
    nullable: true,
    name: "started_review_at",
  })
  startedReviewAt!: Date | null;

  @Column({
    type: "datetime",
    nullable: true,
    name: "resolved_at",
  })
  resolvedAt!: Date | null;

  @Column({
    type: "datetime",
    name: "last_message_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  lastMessageAt!: Date;

  @CreateDateColumn({
    name: "created_at",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: "updated_at",
  })
  updatedAt!: Date;

  @OneToMany(() => GradeAppealMessage, message => message.appeal)
  messages!: GradeAppealMessage[];
}
