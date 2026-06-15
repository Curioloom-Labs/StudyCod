import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * Append-only audit trail for sensitive actions — who did what to whom, and
 * when. The seed of the COPPA/FERPA/GDPR-K data-access journal (who viewed or
 * changed a minor's data) and the future RBAC/role-change log.
 *
 * Writes are best-effort (see services/audit/auditLog.writeAudit): an audit
 * failure must never break the user action it records.
 *
 * `orgId` is nullable now (organizations arrive in the SaaS Phase 1 retrofit);
 * it is here from the start so the table never needs a backfilling migration.
 */
export type AuditActorType = "USER" | "STUDENT" | "SYSTEM";

@Entity("audit_logs")
@Index("idx_audit_target", ["targetType", "targetId"])
@Index("idx_audit_actor", ["actorType", "actorId"])
@Index("idx_audit_created", ["createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 16, name: "actor_type" })
  actorType!: AuditActorType;

  @Column({ type: "int", nullable: true, name: "actor_id" })
  actorId?: number | null;

  /** Stable dotted verb, e.g. "student.password.regenerate", "membership.role.change". */
  @Column({ type: "varchar", length: 100 })
  action!: string;

  @Column({ type: "varchar", length: 32, nullable: true, name: "target_type" })
  targetType?: string | null;

  @Column({ type: "int", nullable: true, name: "target_id" })
  targetId?: number | null;

  @Column({ type: "int", nullable: true, name: "org_id" })
  orgId?: number | null;

  @Column({ type: "simple-json", nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 64, nullable: true, name: "request_id" })
  requestId?: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
