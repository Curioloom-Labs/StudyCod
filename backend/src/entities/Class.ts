import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";
import { Student } from "./Student";
import { EduLesson } from "./EduLesson";
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