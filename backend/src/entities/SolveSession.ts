import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * A recorded solve session for replay. `snapshots` is a JSON-encoded
 * ReplaySnapshot[] (see services/replay/replaySession), already bounded before
 * persistence. One row per saved session.
 */
export type SolvePrincipalType = "USER" | "STUDENT";
export type SolveTaskKind = "LIBRARY" | "TOPIC" | "CONTEST" | "PLAYGROUND" | "UNKNOWN";

@Entity("solve_sessions")
@Index("idx_solve_sessions_principal", ["principalType", "principalId"])
@Index("idx_solve_sessions_task", ["taskKind", "taskId"])
export class SolveSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type" })
  principalType!: SolvePrincipalType;

  @Column({ type: "int", name: "principal_id" })
  principalId!: number;

  @Column({ type: "enum", enum: ["LIBRARY", "TOPIC", "CONTEST", "PLAYGROUND", "UNKNOWN"], name: "task_kind", default: "UNKNOWN" })
  taskKind!: SolveTaskKind;

  @Column({ type: "int", name: "task_id", nullable: true })
  taskId?: number | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  language?: string | null;

  /** JSON-encoded ReplaySnapshot[]. */
  @Column({ type: "mediumtext" })
  snapshots!: string;

  @Column({ type: "int", name: "duration_ms", default: 0 })
  durationMs!: number;

  @Column({ type: "varchar", length: 16, nullable: true, name: "final_verdict" })
  finalVerdict?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
