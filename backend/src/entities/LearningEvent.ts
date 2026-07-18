import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";
import type { LearningPrincipalType, LearningTaskKind } from "./LearningAttempt";

export type LearningEventType =
  | "coding_attempt_failed"
  | "hint_viewed"
  | "retry_started"
  | "solved_after_failure"
  | "recommended_task_opened";

/** Minimal first-party learning analytics event. No code or personal payloads. */
@Entity("learning_events")
@Index("idx_learning_events_principal", ["principalType", "principalId", "createdAt"])
@Index("idx_learning_events_task", ["taskKind", "taskId", "createdAt"])
@Index("uq_learning_events_dedupe", ["dedupeKey"], { unique: true })
export class LearningEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type" })
  principalType!: LearningPrincipalType;

  @Column({ type: "int", name: "principal_id" })
  principalId!: number;

  @Column({ type: "enum", enum: ["LIBRARY", "PERSONAL", "EDU", "UNKNOWN"], name: "task_kind", default: "UNKNOWN" })
  taskKind!: LearningTaskKind;

  @Column({ type: "int", name: "task_id", nullable: true })
  taskId?: number | null;

  @Column({ type: "int", name: "learning_attempt_id", nullable: true })
  learningAttemptId?: number | null;

  @Column({ type: "varchar", length: 64, name: "failure_category", nullable: true })
  failureCategory?: string | null;

  @Column({ type: "tinyint", unsigned: true, name: "hint_level", nullable: true })
  hintLevel?: number | null;

  @Column({ type: "varchar", length: 191, name: "dedupe_key" })
  dedupeKey!: string;

  @Column({ type: "enum", enum: ["coding_attempt_failed", "hint_viewed", "retry_started", "solved_after_failure", "recommended_task_opened"], name: "event_type" })
  eventType!: LearningEventType;

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt!: Date;
}
