import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Task } from "./Task";
import { Grade } from "./Grade";
export type UserLang = "JAVA" | "PYTHON";
export type UserMode = "PERSONAL" | "EDUCATIONAL";
export type UserRole = "USER" | "TEACHER" | "SYSTEM_ADMIN";
@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({
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
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "email_verification_token"
  })
  emailVerificationToken?: string | null;
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
  @Column()
  password!: string;
  @Column({
    type: "enum",
    enum: ["PERSONAL", "EDUCATIONAL"],
    default: "PERSONAL",
    name: "user_mode"
  })
  userMode!: UserMode;
  @Column({
    type: "enum",
    enum: ["USER", "TEACHER", "SYSTEM_ADMIN"],
    default: null,
    nullable: true,
    name: "role"
  })
  role!: UserRole | null;
  @Column({
    type: "varchar",
    length: 10,
    default: "JAVA"
  })
  lang!: UserLang;
  @Column({
    type: "tinyint",
    unsigned: true,
    default: 0,
    name: "difus_java"
  })
  difusJava!: number;
  @Column({
    type: "tinyint",
    unsigned: true,
    default: 0,
    name: "difus_python"
  })
  difusPython!: number;
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
  lastDifusChange?: Date | null;
  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    default: null
  })
  timezone?: string | null;
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