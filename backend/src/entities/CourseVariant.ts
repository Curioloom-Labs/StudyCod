import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  RelationId,
  Index,
} from "typeorm";
import { Course } from "./Course";
import { UserCourseEnrollment } from "./UserCourseEnrollment";

/** Execution context of a course. It belongs to the course, never to User. */
export type CourseRuntime = "JAVA" | "PYTHON" | "CPP";
export type CourseVariantStatus = "DRAFT" | "PUBLISHED";

@Entity("course_variants")
@Index("uq_course_variant_runtime", ["course", "runtime"], { unique: true })
export class CourseVariant {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Course, (course) => course.variants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @RelationId((variant: CourseVariant) => variant.course)
  courseId!: number;

  @Column({ type: "enum", enum: ["JAVA", "PYTHON", "CPP"] })
  runtime!: CourseRuntime;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "enum", enum: ["DRAFT", "PUBLISHED"], default: "DRAFT" })
  status!: CourseVariantStatus;

  @OneToMany(() => UserCourseEnrollment, (enrollment) => enrollment.variant)
  enrollments!: UserCourseEnrollment[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
