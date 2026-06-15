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

export type CourseLanguage = "JAVA" | "PYTHON" | "CPP";
export type CourseStatus = "DRAFT" | "PUBLISHED";

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

  @Column({ type: "enum", enum: ["JAVA", "PYTHON", "CPP"] })
  language!: CourseLanguage;

  @Column({ type: "enum", enum: ["DRAFT", "PUBLISHED"], default: "DRAFT" })
  status!: CourseStatus;

  @Column({ type: "int", nullable: true, name: "created_by_user_id" })
  createdByUserId?: number | null;

  @OneToMany(() => CourseModule, (m) => m.course)
  modules!: CourseModule[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
