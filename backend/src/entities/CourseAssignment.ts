import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  RelationId,
  Index
} from "typeorm";
import { Class } from "./Class";
import { Course } from "./Course";

/**
 * Records that a {@link Course} template was forked onto a {@link Class}
 * (fork-on-assign, P2.2). The fork created a snapshot of EduLessons/EduTasks; the
 * `originMap` remembers, per source course-item, the content hash at fork time
 * and the created EduTask id, so the opt-in pull (P2.3) can detect both upstream
 * template changes (hash differs from current course) and local teacher edits.
 */
export interface OriginEntry {
  /** Hash of the source course-item at fork time (for upstream-change detection). */
  sourceHash: string;
  /** Hash of the materialized EduTask at fork time (for local-edit detection). */
  localHash?: string;
  eduTaskId?: number | null;
}

@Entity("course_assignments")
@Index("idx_assignment_class", ["class"])
@Index("uq_assignment_class_course", ["class", "course"], { unique: true })
export class CourseAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Class, { onDelete: "CASCADE" })
  @JoinColumn({ name: "class_id" })
  class!: Class;

  @RelationId((a: CourseAssignment) => a.class)
  classId!: number;

  @ManyToOne(() => Course, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @RelationId((a: CourseAssignment) => a.course)
  courseId!: number;

  /** Map of source course-item id → fork-time origin info. */
  @Column({ type: "simple-json", nullable: true, name: "origin_map" })
  originMap?: Record<string, OriginEntry> | null;

  /** Map of source course-module id → created EduLesson id (for placing NEW_UPSTREAM items). */
  @Column({ type: "simple-json", nullable: true, name: "module_map" })
  moduleMap?: Record<string, number> | null;

  @Column({ type: "timestamp", name: "forked_at" })
  forkedAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
