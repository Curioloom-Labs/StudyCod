import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

export type LearningEvidenceSource = "GRADE" | "QUIZ" | "THEORY" | "FINAL_ASSESSMENT" | "PLACEMENT";

/** Append-only evidence used to calculate IAD for one course enrollment. */
@Entity("learning_evidence")
@Index("idx_learning_evidence_enrollment", ["enrollmentId", "createdAt"])
export class LearningEvidence {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int", name: "enrollment_id" })
  enrollmentId!: number;

  @Column({ type: "varchar", length: 128, name: "skill_key", nullable: true })
  skillKey?: string | null;

  @Column({ type: "enum", enum: ["GRADE", "QUIZ", "THEORY", "FINAL_ASSESSMENT", "PLACEMENT"], name: "source_type" })
  sourceType!: LearningEvidenceSource;

  @Column({ type: "varchar", length: 128, name: "source_id", nullable: true })
  sourceId?: string | null;

  @Column({ type: "decimal", precision: 5, scale: 3 })
  score!: number;

  @Column({ type: "decimal", precision: 5, scale: 3, nullable: true })
  difficulty?: number | null;

  @Column({ type: "int", name: "model_version", default: 2 })
  modelVersion!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
