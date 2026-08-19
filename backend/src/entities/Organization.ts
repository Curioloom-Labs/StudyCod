import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";

export const EDUCATIONAL_INSTITUTION_TYPES = [
  "SCHOOL",
  "LYCEUM",
  "GYMNASIUM",
  "COLLEGE",
  "UNIVERSITY",
  "VOCATIONAL",
  "OTHER"
] as const;
export type EducationalInstitutionType = (typeof EDUCATIONAL_INSTITUTION_TYPES)[number];

/**
 * A tenant in the SaaS EDU subsystem — a school, course provider, or similar.
 * The root that org-scoped EDU data (classes, memberships) hangs off. Personal
 * and Contest modes have no organization (they keep using bare `User`).
 */
@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({ type: "varchar", length: 32, name: "institution_type", default: "OTHER" })
  institutionType!: EducationalInstitutionType;

  /** URL-safe handle, unique across the platform. */
  @Index("idx_org_slug", { unique: true })
  @Column({ type: "varchar", length: 80 })
  slug!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
