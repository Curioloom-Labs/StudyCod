import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Unique,
} from "typeorm";
import { Contest } from "./Contest";
import { LibraryTask } from "./LibraryTask";
import { ContestSubmission } from "./ContestSubmission";

@Entity("contest_problems")
@Unique("uq_contest_problems_contest_order", ["contest", "order"])
export class ContestProblem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Contest, (c) => c.problems, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contest_id" })
  contest!: Contest;

  // Contest-local task snapshot (stored as a LibraryTask row, usually DRAFT).
  @ManyToOne(() => LibraryTask, { onDelete: "CASCADE" })
  @JoinColumn({ name: "library_task_id" })
  libraryTask!: LibraryTask;

  // 0-based order inside contest.
  @Column({ type: "int", default: 0 })
  order!: number;

  // Optional label (e.g. "A", "B"), derived from order if null.
  @Column({ type: "varchar", length: 8, nullable: true })
  label?: string | null;

  // Optional contest-local max score for this problem.
  // If set, submissions are scaled to this value (keeps partial scoring).
  @Column({ type: "int", nullable: true })
  points?: number | null;

  @OneToMany(() => ContestSubmission, (s) => s.problem)
  submissions!: ContestSubmission[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
