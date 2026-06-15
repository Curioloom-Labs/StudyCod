import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  RelationId
} from "typeorm";
import { Organization } from "./Organization";
import { ORG_ROLES, type OrgRole } from "../types/OrgRole";

/**
 * A pending invitation for a person (by email) to join an organization with a
 * given role. Accepted by an authenticated user, which creates/upgrades their
 * {@link Membership}. The token is the bearer secret in the invite link.
 */
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED";

@Entity("org_invitations")
export class OrgInvitation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  organization!: Organization;

  @RelationId((inv: OrgInvitation) => inv.organization)
  organizationId!: number;

  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "enum", enum: ORG_ROLES })
  role!: OrgRole;

  /** For PARENT invites: the specific student this parent will be linked to. */
  @Column({ type: "int", nullable: true, name: "student_id" })
  studentId?: number | null;

  @Index("idx_invite_token", { unique: true })
  @Column({ type: "varchar", length: 80 })
  token!: string;

  @Column({ type: "enum", enum: ["PENDING", "ACCEPTED", "REVOKED"], default: "PENDING" })
  status!: InvitationStatus;

  @Column({ type: "int", nullable: true, name: "invited_by_user_id" })
  invitedByUserId?: number | null;

  @Column({ type: "int", nullable: true, name: "accepted_by_user_id" })
  acceptedByUserId?: number | null;

  @Column({ type: "timestamp", name: "expires_at" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
