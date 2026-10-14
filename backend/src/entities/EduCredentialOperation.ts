import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from "typeorm";
import { User } from "./User";
import { Class } from "./Class";

export type CredentialOperationKind = "CREATE" | "IMPORT" | "RESET" | "RESET_BATCH";
export type CredentialOperationState = "PENDING" | "READY" | "EXPIRED" | "CANCELLED" | "ACKNOWLEDGED";

@Entity("edu_credential_operations")
@Index("uq_edu_credential_operation_actor_key", ["actorId", "operationKey"], { unique: true })
@Index("idx_edu_credential_operation_class_actor", ["classId", "actorId", "state", "id"])
@Index("idx_edu_credential_operation_expiry", ["state", "expiresAt"])
export class EduCredentialOperation {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: "actor_id", type: "int" }) actorId!: number;
  @ManyToOne(() => User, { onDelete: "CASCADE" }) @JoinColumn({ name: "actor_id" }) actor!: User;
  @Column({ name: "class_id", type: "int" }) classId!: number;
  @ManyToOne(() => Class, { onDelete: "CASCADE" }) @JoinColumn({ name: "class_id" }) cls!: Class;
  @Column({ name: "operation_key", type: "char", length: 36 }) operationKey!: string;
  @Column({ type: "enum", enum: ["CREATE", "IMPORT", "RESET", "RESET_BATCH"] }) kind!: CredentialOperationKind;
  @Column({ type: "enum", enum: ["PENDING", "READY", "EXPIRED", "CANCELLED", "ACKNOWLEDGED"] }) state!: CredentialOperationState;
  @Column({ name: "request_hash", type: "char", length: 64 }) requestHash!: string;
  @Column({ name: "requested_count", type: "int" }) requestedCount!: number;
  @Column({ name: "student_ids", type: "json" }) studentIds!: number[];
  @Column({ name: "response_cipher", type: "mediumtext", nullable: true }) responseCipher!: string | null;
  @Column({ name: "expires_at", type: "datetime", precision: 3 }) expiresAt!: Date;
  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" }) createdAt!: Date;
}
