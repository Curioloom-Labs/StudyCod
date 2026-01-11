import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { EduLesson } from "./EduLesson";
import { TestData } from "./TestData";
import { EduGrade } from "./EduGrade";
import { TaskTheory } from "./TaskTheory";
@Entity("edu_tasks")
export class EduTask {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => EduLesson, l => l.tasks, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "lesson_id"
  })
  lesson!: EduLesson;
  @Column()
  title!: string;
  @Column({
    type: "text"
  })
  description!: string;
  @Column({
    type: "text"
  })
  template!: string;
  @Column({
    type: "int",
    default: 1,
    name: "max_attempts"
  })
  maxAttempts!: number;
  @Column({
    type: "datetime",
    nullable: true,
    name: "deadline"
  })
  deadline?: Date | null;
  @Column({
    type: "boolean",
    default: false,
    name: "is_closed"
  })
  isClosed!: boolean;
  @OneToMany(() => TestData, td => td.task)
  testData!: TestData[];
  @OneToMany(() => EduGrade, g => g.task)
  grades!: EduGrade[];
  @OneToOne(() => TaskTheory, theory => theory.eduTask, {
    nullable: true
  })
  theory?: TaskTheory | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}