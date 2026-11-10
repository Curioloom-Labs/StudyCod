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
    attemptsUsed: number;
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

export type CourseDiagnosticTaskAttemptResult = {
  testsPassed: number;
  testsTotal: number;
  score: number;
};

export type CourseDiagnosticTaskAttemptState = {
  attemptsUsed: number;
  inFlight: number;
  latestResult: CourseDiagnosticTaskAttemptResult | null;
  bestResult: CourseDiagnosticTaskAttemptResult | null;
};

export type CourseDiagnosticTaskAttempts = Record<string, CourseDiagnosticTaskAttemptState>;
export type CourseDiagnosticReportStatus = "NOT_REQUESTED" | "PENDING" | "PROCESSING" | "READY" | "FAILED";

const diagnosticPayloadTransformer = {
  to(value: CourseDiagnosticPayload | null | undefined): string | null {
    return value == null ? null : JSON.stringify(value);
  },
  from(value: string | null | undefined): CourseDiagnosticPayload | null {
    if (value == null) return null;
    return JSON.parse(value) as CourseDiagnosticPayload;
  },
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

  @Column({ type: "mediumtext", name: "assessment_data", transformer: diagnosticPayloadTransformer })
  assessmentData!: CourseDiagnosticPayload;

  @Column({ type: "enum", enum: ["READY", "SUBMITTED"], default: "READY" })
  status!: "READY" | "SUBMITTED";

  @Column({ type: "simple-json", nullable: true, name: "result_data" })
  resultData?: CourseDiagnosticResult | null;

  @Column({ type: "simple-json", nullable: true, name: "task_attempts_data" })
  taskAttemptsData?: CourseDiagnosticTaskAttempts | null;

  @Column({ type: "enum", enum: ["NOT_REQUESTED", "PENDING", "PROCESSING", "READY", "FAILED"], default: "NOT_REQUESTED", name: "report_status" })
  reportStatus!: CourseDiagnosticReportStatus;

  @Column({ type: "mediumtext", nullable: true, name: "mentor_report" })
  mentorReport?: string | null;

  @Column({ type: "int", default: 0, name: "report_attempts" })
  reportAttempts!: number;

  @Column({ type: "datetime", nullable: true, name: "report_next_attempt_at" })
  reportNextAttemptAt?: Date | null;

  @Column({ type: "int", default: 0, name: "report_email_attempts" })
  reportEmailAttempts!: number;

  @Column({ type: "datetime", nullable: true, name: "report_email_next_attempt_at" })
  reportEmailNextAttemptAt?: Date | null;

  @Column({ type: "datetime", nullable: true, name: "report_email_sent_at" })
  reportEmailSentAt?: Date | null;

  @Column({ type: "timestamp", nullable: true, name: "submitted_at" })
  submittedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
