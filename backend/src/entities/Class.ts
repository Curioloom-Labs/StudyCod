import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";
import { Student } from "./Student";
import { EduLesson } from "./EduLesson";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS, GradingSystem } from "../types/GradingSystem";
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
  @Column()
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