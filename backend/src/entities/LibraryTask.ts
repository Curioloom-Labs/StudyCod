import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";
import { TaskTheory } from "./TaskTheory";
import { TestData } from "./TestData";

export type LibraryTaskStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type LibraryTaskLang = "JAVA" | "PYTHON";
export type LibraryTaskDifficulty = "EASY" | "MEDIUM" | "HARD";

@Entity("library_tasks")
export class LibraryTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "author_user_id" })
  author!: User;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "text" })
  template!: string;

  // Optional: per-language templates (judge language ids as keys).
  @Column({ type: "simple-json", name: "templates_by_language", nullable: true })
  templatesByLanguage?: Record<string, string> | null;

  // Stable identifiers for OJ-style catalog & URLs.
  @Column({ type: "varchar", length: 64, name: "problem_code", nullable: true })
  problemCode?: string | null;

  @Column({ type: "varchar", length: 128, name: "slug", nullable: true })
  slug?: string | null;

  @Column({
    type: "enum",
    enum: ["EASY", "MEDIUM", "HARD"],
    nullable: true,
  })
  difficulty?: LibraryTaskDifficulty | null;

  @Column({ type: "text", name: "tags", nullable: true })
  tags?: string[] | null;

  @Column({ type: "varchar", length: 80, name: "section", nullable: true })
  section?: string | null;

  // Per-task judge configuration. Null => language defaults.
  @Column({ type: "int", name: "time_limit_ms", nullable: true })
  timeLimitMs?: number | null;

  @Column({ type: "int", name: "memory_limit_mb", nullable: true })
  memoryLimitMb?: number | null;

  @Column({ type: "int", name: "output_limit_kb", nullable: true })
  outputLimitKb?: number | null;

  // Stored as JSON in TEXT column (TypeORM simple-json).
  @Column({ type: "simple-json", name: "checker_spec", nullable: true })
  checkerSpec?: any | null;

  // Planned: multi-language tasks. For now, informational.
  @Column({ type: "simple-json", name: "allowed_languages", nullable: true })
  allowedLanguages?: string[] | null;

  @Column({
    type: "enum",
    enum: ["JAVA", "PYTHON"],
    default: "JAVA",
  })
  lang!: LibraryTaskLang;

  @Column({ type: "int", default: 3, name: "max_attempts" })
  maxAttempts!: number;

  @Column({
    type: "enum",
    enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
    default: "DRAFT",
  })
  status!: LibraryTaskStatus;

  @Column({ type: "text", name: "rejection_reason", nullable: true })
  rejectionReason?: string | null;

  @Column({ type: "datetime", name: "submitted_at", nullable: true })
  submittedAt?: Date | null;

  @Column({ type: "datetime", name: "published_at", nullable: true })
  publishedAt?: Date | null;

  @OneToOne(() => TaskTheory, (theory) => theory.libraryTask, { nullable: true })
  theory?: TaskTheory | null;

  @OneToMany(() => TestData, (td) => td.libraryTask)
  testData!: TestData[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
