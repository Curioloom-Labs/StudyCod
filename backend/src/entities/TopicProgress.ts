import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from "typeorm";
import { TopicNew } from "./TopicNew";
import { Student } from "./Student";
export type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
@Entity("topic_progress")
export class TopicProgress {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Student, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "student_id"
  })
  student!: Student;
  @ManyToOne(() => TopicNew, topic => topic.progresses, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "topic_id"
  })
  topic!: TopicNew;
  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "practice_average"
  })
  practiceAverage?: number | null;
  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "control_grade"
  })
  controlGrade?: number | null;
  @Column({
    type: "enum",
    enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
    default: "NOT_STARTED"
  })
  status!: ProgressStatus;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
  @Unique(["student", "topic"])
  static uniqueConstraint = ["student", "topic"];
}