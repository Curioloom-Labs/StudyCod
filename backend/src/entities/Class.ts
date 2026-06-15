import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, RelationId, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";
import { Student } from "./Student";
import { EduLesson } from "./EduLesson";
import { Organization } from "./Organization";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS, GradingSystem } from "../types/GradingSystem";
import { DEFAULT_GRADE_SCALE_MODE, GRADE_SCALE_MODES, GradeScaleMode } from "../utils/gradingScale";
export type ClassLanguage = "JAVA" | "PYTHON" | "CPP";
@Entity("classes")
export class Class {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => User, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "teacher_id"
  })
  teacher!: User;
  // Owning organization (SaaS tenant). Nullable during/after the Phase 1
  // backfill; org-scoping is enforced only within the EDU subsystem.
  @ManyToOne(() => Organization, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "org_id"
  })
  organization?: Organization | null;
  @RelationId((c: Class) => c.organization)
  organizationId?: number | null;
  @Column({ type: "varchar" })
  name!: string;
  @Column({
    type: "enum",
    enum: ["JAVA", "PYTHON", "CPP"]
  })
  language!: ClassLanguage;
  @Column({
    type: "enum",
    enum: GRADING_SYSTEMS,
    name: "grading_system",
    default: DEFAULT_GRADING_SYSTEM
  })
  gradingSystem!: GradingSystem;
  @Column({
    type: "enum",
    enum: GRADE_SCALE_MODES,
    name: "grade_scale_mode",
    default: DEFAULT_GRADE_SCALE_MODE
  })
  gradeScaleMode!: GradeScaleMode;
  // Class-level default thematic-grade formula (vars: practice, control).
  // Empty/null = built-in smart default. Topics may override this per-topic.
  @Column({
    type: "varchar",
    length: 255,
    name: "thematic_formula",
    nullable: true
  })
  thematicFormula?: string | null;
  // Weighted-category gradebook config (generalized gradebook, P2.6). Null =
  // use the existing thematic/semester model. See services/edu/gradebookCalc.ts.
  @Column({
    type: "simple-json",
    name: "gradebook_config",
    nullable: true
  })
  gradebookConfig?: { categories: Array<{ id: string; name?: string; weight: number; dropLowest?: number }> } | null;
  // Self-enrolment join code (Student↔User unification, dual-mode). A User who
  // enters this code gets a roster Student profile linked to their account +
  // a STUDENT membership. Null = self-enrolment closed. Legacy generated-
  // credential students are unaffected.
  @Column({
    type: "varchar",
    length: 16,
    name: "join_code",
    nullable: true,
    unique: true
  })
  joinCode?: string | null;
  @OneToMany(() => Student, s => s.class)
  students!: Student[];
  @OneToMany(() => EduLesson, l => l.class)
  lessons!: EduLesson[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}