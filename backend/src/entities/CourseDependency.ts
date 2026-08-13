import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  RelationId,
  CreateDateColumn,
  Index,
} from "typeorm";
import { Course } from "./Course";

/** A hard prerequisite edge in the learning catalog. */
@Entity("course_dependencies")
@Index("uq_course_dependency", ["course", "prerequisiteCourse"], { unique: true })
export class CourseDependency {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Course, (course) => course.dependencies, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @RelationId((dependency: CourseDependency) => dependency.course)
  courseId!: number;

  @ManyToOne(() => Course, { onDelete: "CASCADE" })
  @JoinColumn({ name: "prerequisite_course_id" })
  prerequisiteCourse!: Course;

  @RelationId((dependency: CourseDependency) => dependency.prerequisiteCourse)
  prerequisiteCourseId!: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 100, name: "required_completion_percent" })
  requiredCompletionPercent!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
