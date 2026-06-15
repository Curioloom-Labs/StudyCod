import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  RelationId
} from "typeorm";
import { User } from "./User";
import { Organization } from "./Organization";
import { ORG_ROLES, type OrgRole } from "../types/OrgRole";

/**
 * A user's membership of an organization, carrying their per-org {@link OrgRole}.
 * This is where EDU authorization lives — the global `User.role` is NOT used for
 * org permissions. One row per (user, org); the role is the highest the user
 * holds in that org.
 */
@Entity("memberships")
@Index("uq_membership_user_org", ["user", "organization"], { unique: true })
export class Membership {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @RelationId((m: Membership) => m.user)
  userId!: number;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  organization!: Organization;

  @RelationId((m: Membership) => m.organization)
  organizationId!: number;

  @Column({ type: "enum", enum: ORG_ROLES })
  role!: OrgRole;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
