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
import { Organization } from "./Organization";
import { CourseModule } from "./CourseModule";
import { CourseVariant } from "./CourseVariant";
import { CourseDependency } from "./CourseDependency";

export type CourseStatus = "DRAFT" | "PUBLISHED";
export type CourseLevel = "FOUNDATION" | "SPECIALIZATION" | "ADVANCED";

/**
 * A reusable course template (Phase 2). Authored once, then assigned to many
 * Classes via fork-on-assign (P2.2). `organization` null = global catalog
 * (future); org-scoped courses belong to one tenant.
 */
@Entity("courses")
export class Course {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "org_id" })
  organization?: Organization | null;

  @RelationId((c: Course) => c.organization)
  organizationId?: number | null;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "varchar", length: 120, nullable: true, unique: true, name: "catalog_key" })
  catalogKey?: string | null;

  @Column({ type: "enum", enum: ["FOUNDATION", "SPECIALIZATION", "ADVANCED"], default: "FOUNDATION" })
  level!: CourseLevel;

  @Column({ type: "boolean", default: false, name: "is_base" })
  isBase!: boolean;

  @Column({ type: "varchar", length: 64, nullable: true, name: "source_hash" })
  sourceHash?: string | null;

  @Column({ type: "int", default: 1, name: "content_version" })
  contentVersion!: number;

  @Column({ type: "timestamp", nullable: true, name: "last_synced_at" })
  lastSyncedAt?: Date | null;

  @Column({ type: "enum", enum: ["DRAFT", "PUBLISHED"], default: "DRAFT" })
  status!: CourseStatus;

  @Column({ type: "int", nullable: true, name: "created_by_user_id" })
  createdByUserId?: number | null;

  @OneToMany(() => CourseModule, (m) => m.course)
  modules!: CourseModule[];

  @OneToMany(() => CourseVariant, (variant) => variant.course)
  variants!: CourseVariant[];

  @OneToMany(() => CourseDependency, (dependency) => dependency.course)
  dependencies!: CourseDependency[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
