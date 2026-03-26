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
export type LibraryTaskLang = "JAVA" | "PYTHON" | "CPP";
export type LibraryTaskDifficulty = "EASY" | "MEDIUM" | "HARD";
export type LibraryTaskMode = "CODE" | "WEB";
export type WebValidationProfileId = "FREE_WEB" | "HTML_ONLY" | "HTML_CSS_NO_JS" | "HTML_JS_NO_CSS" | "JS_ONLY_DOM" | "CSS_ONLY" | "HTML_AND_INLINE_ONLY";

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

  // Stored uk -> en translation (generated on-demand for users with English UI)
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "title_en",
    select: false,
  })
  titleEn?: string | null;

  @Column({
    type: "text",
    nullable: true,
    name: "description_en",
    select: false,
  })
  descriptionEn?: string | null;

  // Hash of the source (uk) fields used to generate titleEn/descriptionEn.
  // Used to detect staleness without relying on updated_at.
  @Column({
    type: "varchar",
    length: 64,
    nullable: true,
    name: "translation_source_hash_en",
    select: false,
  })
  translationSourceHashEn?: string | null;

  // Version of the translation algorithm/output format.
  @Column({
    type: "int",
    nullable: true,
    name: "translation_version_en",
    select: false,
  })
  translationVersionEn?: number | null;

  @Column({
    type: "datetime",
    nullable: true,
    name: "translated_at_en",
    select: false,
  })
  translatedAtEn?: Date | null;

  @Column({ type: "text" })
  template!: string;

  @Column({
    type: "enum",
    enum: ["CODE", "WEB"],
    default: "CODE",
    name: "task_mode"
  })
  taskMode!: LibraryTaskMode;

  @Column({ type: "simple-json", name: "web_template_files", nullable: true })
  webTemplateFiles?: Array<{
    path: "index.html" | "styles.css" | "script.js";
    content: string;
  }> | null;

  @Column({ type: "simple-json", name: "web_validation_rules", nullable: true })
  webValidationRules?: Array<{
    id?: string;
    type:
      | "required_selector"
      | "forbidden_selector"
      | "required_text"
      | "forbidden_text"
      | "required_script_pattern"
      | "forbidden_script_pattern"
      | "required_attribute"
      | "forbidden_attribute"
      | "required_style"
      | "forbidden_style";
    message?: string;
    points?: number;
    selector?: string;
    attribute?: string;
    value?: string;
    valuePattern?: string;
    property?: string;
    text?: string;
    pattern?: string;
    flags?: string;
  }> | null;

  @Column({ type: "simple-json", name: "web_validation_profile", nullable: true })
  webValidationProfile?: {
    id: WebValidationProfileId;
    allowHtml?: boolean;
    allowCss?: boolean;
    allowJs?: boolean;
    allowInlineStyle?: boolean;
    allowInlineScript?: boolean;
    allowExternalResources?: boolean;
    lockHtml?: boolean;
    lockCss?: boolean;
    lockJs?: boolean;
  } | null;

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

  // Stored as JSON in TEXT column (TypeORM simple-json).
  // Important: storing string[] in a plain TEXT column can cause the MySQL driver
  // to expand the array into multiple SQL values and trigger
  // "Column count doesn't match value count at row 1".
  @Column({ type: "simple-json", name: "tags", nullable: true })
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
    enum: ["JAVA", "PYTHON", "CPP"],
    default: "JAVA",
  })
  lang!: LibraryTaskLang;

  @Column({ type: "int", default: 3, name: "max_attempts" })
  maxAttempts!: number;

  @Column({ type: "tinyint", width: 1, name: "is_hidden_from_library", default: false })
  isHiddenFromLibrary!: boolean;

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
