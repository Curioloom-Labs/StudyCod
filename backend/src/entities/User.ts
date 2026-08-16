import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Task } from "./Task";
import { Grade } from "./Grade";
export type UserMode = "PERSONAL" | "EDUCATIONAL" | "CONTEST";
export type UserRole = "USER" | "TEACHER" | "SUPPORT" | "SYSTEM_ADMIN";
export type PlacementLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

const iadDecimalTransformer = {
  to: (value: number | null | undefined) => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return 0;
    const clamped = Math.max(0, Math.min(1, n));
    return Math.round(clamped * 1000) / 1000;
  },
  from: (value: string | number | null) => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }
};

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({
    type: "varchar",
    unique: true
  })
  username!: string;
  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    nullable: true
  })
  email?: string | null;
  @Column({
    type: "boolean",
    default: false,
    name: "email_verified"
  })
  emailVerified!: boolean;

  /**
   * Global broadcast/marketing emails subscription.
   * Default: true (all registered users are subscribed by default).
   */
  @Column({
    type: "boolean",
    default: true,
    name: "marketing_emails_enabled"
  })
  marketingEmailsEnabled!: boolean;
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "email_verification_token"
  })
  emailVerificationToken?: string | null;
  @Column({
    type: "timestamp",
    nullable: true,
    name: "email_verification_expires"
  })
  emailVerificationExpires?: Date | null;
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "password_reset_token"
  })
  passwordResetToken?: string | null;
  @Column({
    type: "timestamp",
    nullable: true,
    name: "password_reset_expires"
  })
  passwordResetExpires?: Date | null;
  @Column({ type: "varchar" })
  password!: string;
  @Column({
    type: "enum",
    enum: ["PERSONAL", "EDUCATIONAL", "CONTEST"],
    default: "PERSONAL",
    name: "user_mode"
  })
  userMode!: UserMode;

  /**
   * The learner's selected Personal course. Progress remains stored on every
   * enrollment; this pointer only answers which course owns the main workspace
   * and the request-level runtime context.
   */
  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "current_course_enrollment_id"
  })
  currentCourseEnrollmentId?: number | null;
  @Column({
    type: "enum",
    enum: ["USER", "TEACHER", "SUPPORT", "SYSTEM_ADMIN"],
    default: null,
    nullable: true,
    name: "role"
  })
  role!: UserRole | null;
  @Column({
    type: "decimal",
    precision: 6,
    scale: 3,
    default: 0,
    name: "difus_java",
    transformer: iadDecimalTransformer
  })
  iadJava!: number;
  @Column({
    type: "decimal",
    precision: 6,
    scale: 3,
    default: 0,
    name: "difus_python",
    transformer: iadDecimalTransformer
  })
  iadPython!: number;
  @Column({
    type: "decimal",
    precision: 6,
    scale: 3,
    default: 0,
    name: "difus_cpp",
    transformer: iadDecimalTransformer
  })
  iadCpp!: number;
  @Column({
    type: "text",
    nullable: true,
    name: "avatar_url"
  })
  avatarUrl?: string | null;
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    unique: true,
    name: "google_id"
  })
  googleId?: string | null;
  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "first_name"
  })
  firstName?: string | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "cf_handle"
  })
  cfHandle?: string | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "atcoder_handle"
  })
  atcoderHandle?: string | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "leetcode_handle"
  })
  leetcodeHandle?: string | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "codechef_handle"
  })
  codechefHandle?: string | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "last_name"
  })
  lastName?: string | null;
  @Column({
    type: "tinyint",
    unsigned: true,
    nullable: true,
    name: "birth_day"
  })
  birthDay?: number | null;
  @Column({
    type: "tinyint",
    unsigned: true,
    nullable: true,
    name: "birth_month"
  })
  birthMonth?: number | null;

  /**
   * Tracks the year when the last birthday greeting email was sent.
   * Used to ensure idempotency (send at most once per year).
   */
  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "birthday_greeted_year"
  })
  birthdayGreetedYear?: number | null;
  @Column({
    type: "timestamp",
    nullable: true,
    name: "last_milestone_shown"
  })
  lastMilestoneShown?: Date | null;
  @Column({
    type: "timestamp",
    nullable: true,
    name: "last_activity_date"
  })
  lastActivityDate?: Date | null;
  @Column({
    type: "int",
    default: 0,
    name: "current_streak"
  })
  currentStreak!: number;
  @Column({
    type: "int",
    default: 0,
    name: "longest_streak"
  })
  longestStreak!: number;
  @Column({
    type: "timestamp",
    nullable: true,
    name: "last_difus_change"
  })
  lastIadChange?: Date | null;
  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "last_difus_grade_id_java"
  })
  lastIadGradeIdJava!: number | null;

  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "last_difus_grade_id_python"
  })
  lastIadGradeIdPython!: number | null;

  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "last_difus_grade_id_cpp"
  })
  lastIadGradeIdCpp!: number | null;

  get difusJava(): number {
    return this.iadJava;
  }
  set difusJava(value: number) {
    this.iadJava = value;
  }

  get difusPython(): number {
    return this.iadPython;
  }
  set difusPython(value: number) {
    this.iadPython = value;
  }

  get difusCpp(): number {
    return this.iadCpp;
  }
  set difusCpp(value: number) {
    this.iadCpp = value;
  }

  get lastDifusChange(): Date | null | undefined {
    return this.lastIadChange;
  }
  set lastDifusChange(value: Date | null | undefined) {
    this.lastIadChange = value;
  }

  get lastDifusGradeIdJava(): number | null {
    return this.lastIadGradeIdJava;
  }
  set lastDifusGradeIdJava(value: number | null) {
    this.lastIadGradeIdJava = value;
  }

  get lastDifusGradeIdPython(): number | null {
    return this.lastIadGradeIdPython;
  }
  set lastDifusGradeIdPython(value: number | null) {
    this.lastIadGradeIdPython = value;
  }

  get lastDifusGradeIdCpp(): number | null {
    return this.lastIadGradeIdCpp;
  }
  set lastDifusGradeIdCpp(value: number | null) {
    this.lastIadGradeIdCpp = value;
  }
  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    default: null
  })
  timezone?: string | null;

  @Column({
    type: "boolean",
    default: false,
    name: "placement_done"
  })
  placementDone!: boolean;

  @Column({
    type: "enum",
    enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
    nullable: true,
    default: null,
    name: "placement_level"
  })
  placementLevel!: PlacementLevel | null;

  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "placement_score"
  })
  placementScore!: number | null;

  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "placement_mastered_until_topic_index_java"
  })
  placementMasteredUntilTopicIndexJava!: number | null;

  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "placement_mastered_until_topic_index_python"
  })
  placementMasteredUntilTopicIndexPython!: number | null;

  @Column({
    type: "timestamp",
    nullable: true,
    default: null,
    name: "placement_done_at"
  })
  placementDoneAt!: Date | null;

  @Column({
    type: "boolean",
    default: false,
    name: "placement_coding_passed"
  })
  placementCodingPassed!: boolean;

  @Column({
    type: "enum",
    enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
    nullable: true,
    default: null,
    name: "placement_coding_level"
  })
  placementCodingLevel!: PlacementLevel | null;

  @Column({
    type: "varchar",
    length: 80,
    nullable: true,
    default: null,
    name: "placement_coding_task_id"
  })
  placementCodingTaskId!: string | null;

  @Column({
    type: "int",
    nullable: true,
    default: null,
    name: "placement_coding_score"
  })
  placementCodingScore!: number | null;

  @Column({
    type: "timestamp",
    nullable: true,
    default: null,
    name: "placement_coding_done_at"
  })
  placementCodingDoneAt!: Date | null;
  @OneToMany(() => Task, t => t.user)
  tasks!: Task[];
  @OneToMany(() => Grade, g => g.user)
  grades!: Grade[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}
