import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from "typeorm";
import { User } from "./User";
import { LibraryTask } from "./LibraryTask";

@Entity("library_task_attempts")
@Unique("uq_library_task_attempts_user_task", ["user", "libraryTask"])
export class LibraryTaskAttempt {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => LibraryTask, { onDelete: "CASCADE" })
  @JoinColumn({ name: "library_task_id" })
  libraryTask!: LibraryTask;

  @Column({ type: "mediumtext", name: "draft_code", default: "" })
  draftCode!: string;

  // JSON map: { [judgeLanguage: string]: code }
  @Column({ type: "simple-json", name: "draft_code_by_language", nullable: true })
  draftCodeByLanguage?: Record<string, string> | null;

  @Column({ type: "mediumtext", name: "last_submitted_code", nullable: true })
  lastSubmittedCode?: string | null;

  // JSON map: { [judgeLanguage: string]: code }
  @Column({ type: "simple-json", name: "last_submitted_code_by_language", nullable: true })
  lastSubmittedCodeByLanguage?: Record<string, string> | null;

  @Column({ type: "varchar", length: 16, name: "last_verdict", nullable: true })
  lastVerdict?: string | null;

  @Column({ type: "int", name: "last_score", nullable: true })
  lastScore?: number | null;

  @Column({ type: "int", name: "last_max_score", nullable: true })
  lastMaxScore?: number | null;

  @Column({ type: "int", name: "last_tests_passed", nullable: true })
  lastTestsPassed?: number | null;

  @Column({ type: "int", name: "last_tests_total", nullable: true })
  lastTestsTotal?: number | null;

  @Column({ type: "int", name: "submissions_count", default: 0 })
  submissionsCount!: number;

  @Column({ type: "datetime", name: "last_checked_at", nullable: true })
  lastCheckedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
