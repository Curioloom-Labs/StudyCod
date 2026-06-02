import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique, Index } from "typeorm";

/**
 * Per-principal spaced-repetition state for a concept (SM-2). One row per
 * (principal, conceptKey). The scheduling math lives in
 * services/learning/spacedRepetition; this is just durable storage.
 */
export type ReviewPrincipalType = "USER" | "STUDENT";

@Entity("concept_review_states")
@Unique("uq_concept_review_principal_concept", ["principalType", "principalId", "conceptKey"])
@Index("idx_concept_review_due", ["principalType", "principalId", "dueAt"])
export class ConceptReviewState {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type" })
  principalType!: ReviewPrincipalType;

  @Column({ type: "int", name: "principal_id" })
  principalId!: number;

  @Column({ type: "varchar", length: 191, name: "concept_key" })
  conceptKey!: string;

  @Column({ type: "int", default: 0 })
  repetitions!: number;

  @Column({ type: "decimal", precision: 5, scale: 3, name: "ease_factor", default: 2.5 })
  easeFactor!: string | number;

  @Column({ type: "int", name: "interval_days", default: 0 })
  intervalDays!: number;

  @Column({ type: "datetime", name: "due_at" })
  dueAt!: Date;

  @Column({ type: "boolean", default: false })
  mastered!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
