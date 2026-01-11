import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, BeforeInsert, BeforeUpdate } from "typeorm";
import { Student } from "./Student";
import { Class } from "./Class";
import { EduLesson } from "./EduLesson";
import { ControlWork } from "./ControlWork";
import { TopicNew } from "./TopicNew";
import { AssessmentType, validateAssessmentType } from "../types/AssessmentType";
@Entity("summary_grades")
export class SummaryGrade {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Student, s => s.summaryGrades, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "student_id"
  })
  student!: Student;
  @ManyToOne(() => Class, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "class_id"
  })
  class!: Class;
  @ManyToOne(() => EduLesson, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "lesson_id"
  })
  lesson?: EduLesson | null;
  @ManyToOne(() => ControlWork, cw => cw.summaryGrades, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "control_work_id"
  })
  controlWork?: ControlWork | null;
  @ManyToOne(() => TopicNew, {
    onDelete: "CASCADE",
    nullable: false
  })
  @JoinColumn({
    name: "topic_id"
  })
  topic!: TopicNew;
  @Column({
    type: "varchar",
    length: 255
  })
  name!: string;
  @Column({
    type: "enum",
    enum: AssessmentType,
    default: AssessmentType.INTERMEDIATE,
    name: "assessment_type"
  })
  assessmentType!: AssessmentType;
  @Column({
    type: "decimal",
    precision: 5,
    scale: 2
  })
  grade!: number;
  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "theory_grade"
  })
  theoryGrade!: number | null;
  @Column({
    type: "text",
    nullable: true,
    name: "formula_snapshot"
  })
  formulaSnapshot!: string | null;
  @Column({
    type: "timestamp",
    nullable: true,
    name: "calculated_at"
  })
  calculatedAt!: Date | null;
  @Column({
    type: "text",
    nullable: true,
    name: "quiz_answers_json"
  })
  quizAnswersJson!: string | null;
  @Column({
    type: "text",
    nullable: true,
    name: "quiz_results_json"
  })
  quizResultsJson!: string | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @BeforeInsert()
  @BeforeUpdate()
  validateAssessmentType() {
    validateAssessmentType(this.assessmentType, this.controlWork?.id || null, 'grade');
  }
}