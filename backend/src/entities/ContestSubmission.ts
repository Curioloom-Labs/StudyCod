import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";
import { Contest } from "./Contest";
import { ContestProblem } from "./ContestProblem";
import { ContestParticipant } from "./ContestParticipant";

export type ContestSubmissionPhase = "CONTEST" | "UPSOLVE";

@Entity("contest_submissions")
export class ContestSubmission {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Contest, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contest_id" })
  contest!: Contest;

  @ManyToOne(() => ContestProblem, (p) => p.submissions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "problem_id" })
  problem!: ContestProblem;

  @ManyToOne(() => ContestParticipant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "participant_id" })
  participant!: ContestParticipant;

  @Index("idx_contest_submissions_language")
  @Column({ type: "varchar", length: 16 })
  language!: string;

  @Column({ type: "mediumtext", name: "submitted_code" })
  submittedCode!: string;

  @Column({ type: "varchar", length: 16, nullable: true })
  verdict?: string | null;

  @Column({ type: "int", nullable: true })
  score?: number | null;

  @Column({ type: "int", nullable: true, name: "max_score" })
  maxScore?: number | null;

  @Column({ type: "int", nullable: true, name: "tests_passed" })
  testsPassed?: number | null;

  @Column({ type: "int", nullable: true, name: "tests_total" })
  testsTotal?: number | null;

  @Column({ type: "varchar", length: 64, nullable: true, name: "compile_error_kind" })
  compileErrorKind?: string | null;

  @Column({
    type: "text",
    nullable: true,
    name: "group_scores",
  })
  groupScores?: string | null;

  @Index("idx_contest_submissions_phase")
  @Column({
    type: "enum",
    enum: ["CONTEST", "UPSOLVE"],
    default: "CONTEST",
  })
  phase!: ContestSubmissionPhase;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
