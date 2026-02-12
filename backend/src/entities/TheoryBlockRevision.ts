import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import { TheoryBlock } from "./TheoryBlock";
import { User } from "./User";

export type TheoryBlockRevisionAction = "CREATE" | "UPDATE" | "ROLLBACK" | "AUTO";

@Entity("theory_block_revisions")
@Index("uq_theory_block_revisions_block_version", ["theoryBlockId", "version"], { unique: true })
@Index("idx_theory_block_revisions_block_created", ["theoryBlockId", "createdAt"])
export class TheoryBlockRevision {
  @PrimaryGeneratedColumn()
  id!: number;

  // Keep explicit FK column for easy querying/indexing.
  @Column({ type: "int", name: "theory_block_id" })
  theoryBlockId!: number;

  @ManyToOne(() => TheoryBlock, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "theory_block_id" })
  theoryBlock!: TheoryBlock;

  @Column({ type: "int" })
  version!: number;

  @Column({
    type: "enum",
    enum: ["CREATE", "UPDATE", "ROLLBACK", "AUTO"],
    default: "UPDATE"
  })
  action!: TheoryBlockRevisionAction;

  @Column({ type: "varchar", length: 255, nullable: true })
  comment?: string | null;

  // JSON snapshot: { title, content, level, tags }
  @Column({ type: "mediumtext" })
  snapshot!: string;

  @Column({ type: "int", name: "created_by_user_id", nullable: true })
  createdByUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by_user_id" })
  createdBy?: User | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
