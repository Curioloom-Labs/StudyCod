import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * An integrity event recorded from client-side proctoring signals at submit
 * time. Append-only log a teacher can review. The scoring math lives in
 * services/integrity/proctoringScore; this stores the result + evidence flags.
 */
export type IntegrityPrincipalType = "USER" | "STUDENT";
export type IntegrityTaskKind = "LIBRARY" | "TOPIC" | "CONTEST" | "UNKNOWN";
export type IntegrityLevelValue = "clean" | "review" | "suspicious";

@Entity("submission_integrity")
@Index("idx_submission_integrity_principal", ["principalType", "principalId"])
@Index("idx_submission_integrity_task", ["taskKind", "taskId"])
@Index("idx_submission_integrity_level", ["level"])
export class SubmissionIntegrity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type" })
  principalType!: IntegrityPrincipalType;

  @Column({ type: "int", name: "principal_id" })
  principalId!: number;

  @Column({ type: "enum", enum: ["LIBRARY", "TOPIC", "CONTEST", "UNKNOWN"], name: "task_kind", default: "UNKNOWN" })
  taskKind!: IntegrityTaskKind;

  @Column({ type: "int", name: "task_id", nullable: true })
  taskId?: number | null;

  @Column({ type: "int" })
  score!: number;

  @Column({ type: "enum", enum: ["clean", "review", "suspicious"] })
  level!: IntegrityLevelValue;

  /** JSON-encoded string[] of evidence flags. */
  @Column({ type: "text", nullable: true })
  flags?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
