import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { EduTask } from "./EduTask";
import { TopicTask } from "./TopicTask";
import { Task } from "./Task";
@Entity("test_data")
export class TestData {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => EduTask, t => t.testData, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "task_id"
  })
  task?: EduTask | null;
  @ManyToOne(() => TopicTask, t => t.testData, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "topic_task_id"
  })
  topicTask?: TopicTask | null;
  @ManyToOne(() => Task, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "personal_task_id"
  })
  personalTask?: Task | null;
  @Column({
    type: "text"
  })
  input!: string;
  @Column({
    type: "text",
    name: "expected_output"
  })
  expectedOutput!: string;
  @Column({
    type: "boolean",
    default: false,
    name: "is_hidden"
  })
  isHidden!: boolean;
  @Column({
    type: "int",
    default: 1
  })
  points!: number;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
}