import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  RelationId
} from "typeorm";
import { CourseModule } from "./CourseModule";

/**
 * A single authored element inside a {@link CourseModule}. The `kind` selects
 * which payload in `content` (JSON) is meaningful — code-first kinds (CODE_TASK,
 * WEB_TASK) plus the Phase 2 table-stakes additions (THEORY/PAGE, QUIZ, and a
 * MANUAL task graded by hand).
 */
export type CourseItemKind = "THEORY" | "PAGE" | "CODE_TASK" | "WEB_TASK" | "QUIZ" | "MANUAL";

@Entity("course_items")
export class CourseItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => CourseModule, (m) => m.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "module_id" })
  module!: CourseModule;

  @RelationId((i: CourseItem) => i.module)
  moduleId!: number;

  @Column({ type: "enum", enum: ["THEORY", "PAGE", "CODE_TASK", "WEB_TASK", "QUIZ", "MANUAL"] })
  kind!: CourseItemKind;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "int", default: 0 })
  order!: number;

  @Column({ type: "varchar", length: 200, nullable: true, name: "content_key" })
  contentKey?: string | null;

  @Column({ type: "varchar", length: 64, nullable: true, name: "source_hash" })
  sourceHash?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, name: "source_path" })
  sourcePath?: string | null;

  @Column({ type: "int", default: 1, name: "content_version" })
  contentVersion!: number;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive!: boolean;

  /** Kind-specific payload (task template + tests, quiz questions, page HTML, …). */
  @Column({ type: "simple-json", nullable: true })
  content?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
