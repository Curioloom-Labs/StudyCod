import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from "typeorm";
import { UserCourseEnrollment } from "./UserCourseEnrollment";

export type CourseDiagnosticQuestion = {
  id: string;
  question: string;
  options: string[];
  correct: number;
  topicId: number;
  topicTitle: string;
};

export type CourseDiagnosticPractical = {
  id: string;
  moduleTitle: string;
  topicIds: number[];
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  codeTemplate: string;
  runtime: "JAVA" | "PYTHON" | "CPP";
  entryFile: string;
  tests: Array<{ input: string; output: string }>;
};

export type CourseDiagnosticPayload = {
  version: 1 | 2;
  seed: string;
  questions: CourseDiagnosticQuestion[];
  /** Version 1 payloads keep one task; version 2 has a course-wide task set. */
  practical?: CourseDiagnosticPractical;
  practicals?: CourseDiagnosticPractical[];
};

export type CourseDiagnosticResult = {
  score: number;
  knowledgeScore: number;
  practicalScore: number;
  correctCount: number;
  totalQuestions: number;
  testsPassed: number;
  testsTotal: number;
  practicalResults?: Array<{
    taskId: string;
    title: string;
    moduleTitle: string;
    topicIds: number[];
    testsPassed: number;
    testsTotal: number;
    score: number;
  }>;
  passed: boolean;
  answers: Array<{ questionId: string; selectedIndex: number }>;
  topicResults: Array<{
    topicId: number;
    topicTitle: string;
    correctCount: number;
    totalQuestions: number;
    score: number;
    theoryCredited: boolean;
    practiceCredited: boolean;
  }>;
  review: Array<{
    questionId: string;
    question: string;
    options: string[];
    selectedIndex: number;
    correctIndex: number;
    topicTitle: string;
  }>;
  submittedAt: string;
};

@Entity("course_diagnostic_assessments")
@Index("uq_course_diagnostic_attempt", ["enrollment", "attemptNumber"], { unique: true })
export class CourseDiagnosticAssessment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => UserCourseEnrollment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "enrollment_id" })
  enrollment!: UserCourseEnrollment;

  @RelationId((assessment: CourseDiagnosticAssessment) => assessment.enrollment)
  enrollmentId!: number;

  @Column({ type: "int", default: 1, name: "attempt_number" })
  attemptNumber!: number;

  @Column({ type: "simple-json", name: "assessment_data" })
  assessmentData!: CourseDiagnosticPayload;

  @Column({ type: "enum", enum: ["READY", "SUBMITTED"], default: "READY" })
  status!: "READY" | "SUBMITTED";

  @Column({ type: "simple-json", nullable: true, name: "result_data" })
  resultData?: CourseDiagnosticResult | null;

  @Column({ type: "timestamp", nullable: true, name: "submitted_at" })
  submittedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
