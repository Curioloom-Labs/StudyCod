import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";
import { Grade } from "./Grade";
import { Topic } from "./Topic";
import { TestData } from "./TestData";
export type TaskType = "INTRO" | "TOPIC" | "CONTROL";
export type TaskStatus = "OPEN" | "SUBMITTED" | "GRADED";
export type TaskLang = "JAVA" | "PYTHON" | "CPP";
export type TaskIoType = "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT";
@Entity("tasks")
export class Task {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => User, u => u.tasks, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "user_id"
  })
  user!: User;
  @ManyToOne(() => Topic, {
    nullable: true
  })
  @JoinColumn({
    name: "topic_id"
  })
  topic?: Topic | null;
  @Column({
    type: "enum",
    enum: ["INTRO", "TOPIC", "CONTROL"],
    default: "TOPIC"
  })
  type!: TaskType;
  @Column()
  title!: string;
  @Column()
  subtitle!: string;
  @Column({
    type: "text"
  })
  description!: string;

  /**
   * Machine-only task IO type. Not shown in the statement.
   * Helps generate tests and pick a judge checker deterministically.
   */
  @Column({
    type: "enum",
    enum: ["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"],
    default: "STDIN_STDOUT",
    name: "io_type"
  })
  ioType!: TaskIoType;
  descriptionMarkdown?: string;
  @Column({
    type: "text"
  })
  template!: string;
  @Column({
    type: "text",
    default: "",
    name: "draft_code"
  })
  draftCode!: string;
  @Column({
    type: "text",
    default: "",
    name: "final_code"
  })
  finalCode!: string;
  @Column({
    type: "tinyint",
    default: 0
  })
  completed!: number;
  @Column({
    type: "varchar",
    length: 10,
    default: "JAVA"
  })
  lang!: TaskLang;
  @Column({
    type: "tinyint",
    unsigned: true,
    default: 0
  })
  difus!: number;
  @Column({
    type: "int",
    default: 0,
    name: "num_in_topic"
  })
  numInTopic!: number;
  @Column({
    type: "int",
    default: 0,
    name: "topic_index"
  })
  topicIndex!: number;
  @OneToMany(() => Grade, g => g.task)
  grades!: Grade[];
  @OneToMany(() => TestData, td => td.personalTask)
  testData!: TestData[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}