import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  RelationId,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { User } from "./User";
import { Course } from "./Course";
import { CourseVariant } from "./CourseVariant";

export type EnrollmentStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";

@Entity("user_course_enrollments")
@Index("uq_user_course_variant", ["user", "variant"], { unique: true })
@Index("idx_user_enrollment_status", ["user", "status"])
export class UserCourseEnrollment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @RelationId((enrollment: UserCourseEnrollment) => enrollment.user)
  userId!: number;

  @ManyToOne(() => Course, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @RelationId((enrollment: UserCourseEnrollment) => enrollment.course)
  courseId!: number;

  @ManyToOne(() => CourseVariant, (variant) => variant.enrollments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variant_id" })
  variant!: CourseVariant;

  @RelationId((enrollment: UserCourseEnrollment) => enrollment.variant)
  variantId!: number;

  @Column({ type: "enum", enum: ["LOCKED", "AVAILABLE", "IN_PROGRESS", "COMPLETED"], default: "AVAILABLE" })
  status!: EnrollmentStatus;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0, name: "completion_percent" })
  completionPercent!: number;

  /** IAD/mastery is intentionally separate from formal completion. */
  @Column({ type: "decimal", precision: 5, scale: 3, default: 0, name: "mastery_score" })
  masteryScore!: number;

  @Column({ type: "boolean", default: false, name: "final_assessment_passed" })
  finalAssessmentPassed!: boolean;

  @Column({ type: "timestamp", nullable: true, name: "completed_at" })
  completedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
