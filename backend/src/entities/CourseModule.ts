import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  RelationId
} from "typeorm";
import { Course } from "./Course";
import { CourseItem } from "./CourseItem";

/**
 * An ordered section within a {@link Course} template — groups items (theory,
 * tasks, quizzes, pages) into a teachable unit.
 */
@Entity("course_modules")
export class CourseModule {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Course, (c) => c.modules, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course;

  @RelationId((m: CourseModule) => m.course)
  courseId!: number;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "int", default: 0 })
  order!: number;

  @Column({ type: "varchar", length: 160, nullable: true, name: "content_key" })
  contentKey?: string | null;

  @Column({ type: "varchar", length: 64, nullable: true, name: "source_hash" })
  sourceHash?: string | null;

  @OneToMany(() => CourseItem, (i) => i.module)
  items!: CourseItem[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
