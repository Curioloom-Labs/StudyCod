import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";
import type { EducationalInstitutionType } from "./Organization";

/**
 * Short-lived organization data collected before an EDU administrator verifies
 * their email. The organization is materialized only after verification.
 */
@Entity("edu_registration_intents")
@Index("uq_edu_registration_intent_user", ["userId"], { unique: true })
export class EduRegistrationIntent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "int", unique: true })
  userId!: number;

  @Column({ name: "organization_name", type: "varchar", length: 200 })
  organizationName!: string;

  @Column({ name: "institution_type", type: "varchar", length: 32 })
  institutionType!: EducationalInstitutionType;

  @Column({ name: "expires_at", type: "timestamp" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
