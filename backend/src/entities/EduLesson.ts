import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Class } from "./Class";
import { EduTask } from "./EduTask";
export type LessonType = "LESSON" | "CONTROL";
@Entity("edu_lessons")
export class EduLesson {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Class, c => c.lessons, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "class_id"
  })
  class!: Class;
  @Column({
    type: "enum",
    enum: ["LESSON", "CONTROL"],
    default: "LESSON"
  })
  type!: LessonType;
  @Column({ type: "varchar" })
  title!: string;
  @Column({
    type: "text",
    nullable: true
  })
  theory?: string | null;
  @Column({
    type: "boolean",
    default: false,
    name: "has_theory"
  })
  hasTheory!: boolean;
  @Column({
    type: "int",
    nullable: true,
    name: "time_limit_minutes"
  })
  timeLimitMinutes?: number | null;
  @Column({
    type: "boolean",
    default: false,
    name: "control_has_theory"
  })
  controlHasTheory!: boolean;
  @Column({
    type: "boolean",
    default: true,
    name: "control_has_practice"
  })
  controlHasPractice!: boolean;
  @Column({
    type: "text",
    nullable: true,
    name: "quiz_json"
  })
  quizJson?: string | null;
  @OneToMany(() => EduTask, t => t.lesson)
  tasks!: EduTask[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}