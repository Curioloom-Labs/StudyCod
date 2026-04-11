import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { EduTask } from "./EduTask";
import { TopicTask } from "./TopicTask";
import { Task } from "./Task";
import { LibraryTask } from "./LibraryTask";
export type TestKind = "SAMPLE" | "JUDGE";
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

  @ManyToOne(() => LibraryTask, t => t.testData, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "library_task_id"
  })
  libraryTask?: LibraryTask | null;
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
  // New preferred flag: separates statement examples (SAMPLE) from judge-only tests (JUDGE).
  // We keep `isHidden` for backward compatibility and as a fallback for legacy rows.
  @Column({
    type: "enum",
    enum: ["SAMPLE", "JUDGE"],
    default: "JUDGE"
  })
  kind!: TestKind;
  @Column({
    type: "int",
    default: 1
  })
  points!: number;

  // Optional: subtask identifier used for binary (0 or full) subtask scoring.
  // When null/empty => falls back to legacy public/hidden grouping.
  @Column({
    type: "varchar",
    length: 64,
    nullable: true,
  })
  subtask?: string | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
}