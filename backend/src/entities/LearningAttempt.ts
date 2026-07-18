import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";

export type LearningPrincipalType = "USER" | "STUDENT";
export type LearningTaskKind = "LIBRARY" | "PERSONAL" | "EDU" | "UNKNOWN";
export type LearningOutcome = "FAILED" | "SOLVED";

/**
 * Append-only learning history. This is deliberately separate from the
 * current-state attempt tables and never stores submitted source code.
 */
@Entity("learning_attempts")
@Index("idx_learning_attempts_principal", ["principalType", "principalId", "createdAt"])
@Index("idx_learning_attempts_task", ["taskKind", "taskId", "createdAt"])
export class LearningAttempt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type" })
  principalType!: LearningPrincipalType;

  @Column({ type: "int", name: "principal_id" })
  principalId!: number;

  @Column({ type: "enum", enum: ["LIBRARY", "PERSONAL", "EDU", "UNKNOWN"], name: "task_kind", default: "UNKNOWN" })
  taskKind!: LearningTaskKind;

  @Column({ type: "int", name: "task_id" })
  taskId!: number;

  @Column({ type: "int", name: "topic_id", nullable: true })
  topicId?: number | null;

  /** Cached task/topic label used for evidence without joining code/content. */
  @Column({ type: "varchar", length: 160, name: "topic_label", nullable: true })
  topicLabel?: string | null;

  /** Existing grade/submission/attempt identifier, when the source flow has one. */
  @Column({ type: "varchar", length: 128, name: "submission_id", nullable: true })
  submissionId?: string | null;

  @Column({ type: "int", name: "source_attempt_id", nullable: true })
  sourceAttemptId?: number | null;

  @Column({ type: "enum", enum: ["FAILED", "SOLVED"] })
  outcome!: LearningOutcome;

  @Column({ type: "varchar", length: 64, name: "failure_category", nullable: true })
  failureCategory?: string | null;

  @Column({ type: "int", name: "first_failed_test_id", nullable: true })
  firstFailedTestId?: number | null;

  @Column({ type: "tinyint", unsigned: true, name: "highest_hint_level_shown", default: 0 })
  highestHintLevelShown!: number;

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt!: Date;
}
