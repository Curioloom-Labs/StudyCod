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
import { UserCourseEnrollment } from "./UserCourseEnrollment";
import { CourseItem } from "./CourseItem";

export type CourseItemProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type CourseProjectProgressStatus = "DRAFT" | "SUBMITTED";

export interface CourseProjectProgressData {
  milestoneIds: string[];
  draft: string;
  status: CourseProjectProgressStatus;
  submittedAt?: string | null;
}

@Entity("course_item_progress")
@Index("uq_enrollment_item_progress", ["enrollment", "item"], { unique: true })
export class CourseItemProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => UserCourseEnrollment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "enrollment_id" })
  enrollment!: UserCourseEnrollment;

  @RelationId((progress: CourseItemProgress) => progress.enrollment)
  enrollmentId!: number;

  @ManyToOne(() => CourseItem, { onDelete: "CASCADE" })
  @JoinColumn({ name: "item_id" })
  item!: CourseItem;

  @RelationId((progress: CourseItemProgress) => progress.item)
  itemId!: number;

  @Column({ type: "enum", enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"], default: "NOT_STARTED" })
  status!: CourseItemProgressStatus;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  score?: number | null;

  @Column({ type: "timestamp", nullable: true, name: "completed_at" })
  completedAt?: Date | null;

  @Column({ type: "simple-json", nullable: true, name: "project_data" })
  projectData?: CourseProjectProgressData | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
