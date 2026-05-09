import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { TopicNew } from "./TopicNew";
import { TopicTask } from "./TopicTask";
import { LessonAttempt } from "./LessonAttempt";
import { SummaryGrade } from "./SummaryGrade";
@Entity("control_works")
export class ControlWork {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => TopicNew, topic => topic.controlWorks, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "topic_id"
  })
  topic!: TopicNew;
  @Column({
    type: "varchar",
    length: 255,
    nullable: true
  })
  title!: string | null;
  @Column({
    type: "int",
    nullable: true,
    name: "time_limit_minutes"
  })
  timeLimitMinutes?: number | null;
  @Column({
    type: "text",
    nullable: true,
    name: "quiz_json"
  })
  quizJson?: string | null;
  @Column({
    type: "boolean",
    default: false,
    name: "has_theory"
  })
  hasTheory!: boolean;
  @Column({
    type: "boolean",
    default: true,
    name: "has_practice"
  })
  hasPractice!: boolean;
  @Column({
    type: "boolean",
    default: false,
    name: "is_assigned"
  })
  isAssigned!: boolean;
  @Column({
    type: "simple-json",
    nullable: true,
    name: "assigned_student_ids"
  })
  assignedStudentIds?: number[] | null;
  @Column({
    type: "datetime",
    nullable: true,
    name: "deadline"
  })
  deadline?: Date | null;
  @Column({
    type: "text",
    nullable: true
  })
  formula?: string | null;
  @OneToMany(() => LessonAttempt, attempt => attempt.controlWork)
  attempts!: LessonAttempt[];
  @OneToMany(() => SummaryGrade, grade => grade.controlWork)
  summaryGrades!: SummaryGrade[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}