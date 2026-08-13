import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from "typeorm";
import { Class } from "./Class";
import { User } from "./User";
import { EduGrade } from "./EduGrade";
import { SummaryGrade } from "./SummaryGrade";

export type StudentUiLanguage = "uk" | "en";

@Entity("students")
export class Student {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Class, c => c.students, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "class_id"
  })
  class!: Class;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "user_id"
  })
  user?: User | null;
  @Column({
    type: "varchar",
    length: 100,
    name: "first_name"
  })
  firstName!: string;
  @Column({
    type: "varchar",
    length: 100,
    name: "last_name"
  })
  lastName!: string;
  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    name: "middle_name"
  })
  middleName?: string | null;
  @Column({
    type: "varchar",
    length: 255
  })
  email!: string;

  // COPPA/FERPA/GDPR-K hooks (design-for-later): age gating + parental consent.
  @Column({
    type: "date",
    nullable: true,
    name: "birth_date"
  })
  birthDate?: string | null;

  /** Null = no recorded parental consent; a timestamp = consent given. */
  @Column({
    type: "timestamp",
    nullable: true,
    name: "parental_consent_at"
  })
  parentalConsentAt?: Date | null;

  @Column({
    type: "enum",
    enum: ["uk", "en"],
    default: "en",
    name: "ui_language"
  })
  uiLanguage!: StudentUiLanguage;

  /**
   * Global broadcast/marketing emails subscription.
   * Default: true (all registered students are subscribed by default).
   */
  @Column({
    type: "boolean",
    default: true,
    name: "marketing_emails_enabled"
  })
  marketingEmailsEnabled!: boolean;
  @Column({
    type: "varchar",
    length: 100,
    unique: true,
    name: "generated_username"
  })
  generatedUsername!: string;
  @Column({
    type: "varchar",
    name: "generated_password"
  })
  generatedPassword!: string;
  @Column({
    type: "text",
    nullable: true,
    name: "avatar_url"
  })
  avatarUrl?: string | null;
  plainPassword?: string;
  @OneToMany(() => EduGrade, g => g.student)
  grades!: EduGrade[];
  @OneToMany(() => SummaryGrade, sg => sg.student)
  summaryGrades!: SummaryGrade[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
  @DeleteDateColumn({
    name: "deleted_at",
    type: "timestamp",
    nullable: true
  })
  deletedAt?: Date | null;
}
