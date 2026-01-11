import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { TopicNew } from "./TopicNew";
import { ControlWork } from "./ControlWork";
import { TaskTheory } from "./TaskTheory";
import { TestData } from "./TestData";
import { EduGrade } from "./EduGrade";
export type TaskType = "PRACTICE" | "CONTROL";
@Entity("topic_tasks")
export class TopicTask {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => TopicNew, topic => topic.tasks, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "topic_id"
  })
  topic!: TopicNew;
  @ManyToOne(() => ControlWork, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "control_work_id"
  })
  controlWork?: ControlWork | null;
  @Column({
    type: "enum",
    enum: ["PRACTICE", "CONTROL"],
    default: "PRACTICE"
  })
  type!: TaskType;
  @Column({
    type: "int",
    default: 0
  })
  order!: number;
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
  @Column({
    type: "boolean",
    default: false,
    name: "is_assigned"
  })
  isAssigned!: boolean;
  @OneToOne(() => TaskTheory, theory => theory.topicTask, {
    nullable: true
  })
  theory?: TaskTheory | null;
  @OneToMany(() => TestData, td => td.topicTask)
  testData!: TestData[];
  @OneToMany(() => EduGrade, g => g.topicTask)
  grades!: EduGrade[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}