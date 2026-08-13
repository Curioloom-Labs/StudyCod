import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";
import { Student } from "./Student";
import { EduTask } from "./EduTask";
import { TopicTask } from "./TopicTask";
@Entity("edu_grades")
@Index("idx_edu_grades_student_task_created", ["student", "task", "createdAt"])
@Index("idx_edu_grades_student_topic_created", ["student", "topicTask", "createdAt"])
export class EduGrade {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Student, s => s.grades, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "student_id"
  })
  student!: Student;
  @ManyToOne(() => EduTask, t => t.grades, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "task_id"
  })
  task?: EduTask | null;
  @ManyToOne(() => TopicTask, t => t.grades, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "topic_task_id"
  })
  topicTask?: TopicTask | null;
  @Column({
    type: "int",
    nullable: true
  })
  total!: number | null;
  @Column({
    type: "text",
    nullable: true,
    name: "submitted_code"
  })
  submittedCode!: string | null;
  @Column({
    type: "text",
    nullable: true
  })
  feedback!: string | null;
  @Column({
    type: "boolean",
    default: false,
    name: "is_manually_graded"
  })
  isManuallyGraded!: boolean;
  @Column({
    type: "int",
    default: 0,
    name: "tests_passed"
  })
  testsPassed!: number;
  @Column({
    type: "int",
    default: 0,
    name: "tests_total"
  })
  testsTotal!: number;
  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "theory_grade"
  })
  theoryGrade!: number | null;
  @Column({
    type: "enum",
    enum: ["PRACTICE", "TEST"],
    nullable: true,
    default: "PRACTICE"
  })
  type!: "PRACTICE" | "TEST" | null;
  @Column({
    type: "boolean",
    default: false,
    name: "is_completed"
  })
  isCompleted!: boolean;
  @Column({
    type: "text",
    nullable: true,
    name: "test_results"
  })
  testResults!: string | null;

  @Column({
    type: "int",
    nullable: true
  })
  score!: number | null;

  @Column({
    type: "int",
    nullable: true,
    name: "max_score"
  })
  maxScore!: number | null;

  @Column({
    type: "text",
    nullable: true,
    name: "group_scores"
  })
  groupScores!: string | null;
  // Per-criterion rubric breakdown as JSON {criterionId: points} (Tier 1).
  @Column({
    type: "text",
    nullable: true,
    name: "rubric_scores"
  })
  rubricScores!: string | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}
