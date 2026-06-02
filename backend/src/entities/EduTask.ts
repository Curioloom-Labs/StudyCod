import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { EduLesson } from "./EduLesson";
import { TestData } from "./TestData";
import { EduGrade } from "./EduGrade";
import { TaskTheory } from "./TaskTheory";
export type EduTaskMode = "CODE" | "WEB";
export type WebValidationProfileId = "FREE_WEB" | "HTML_ONLY" | "HTML_CSS_NO_JS" | "HTML_JS_NO_CSS" | "JS_ONLY_DOM" | "CSS_ONLY" | "HTML_AND_INLINE_ONLY";
@Entity("edu_tasks")
export class EduTask {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => EduLesson, l => l.tasks, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "lesson_id"
  })
  lesson!: EduLesson;
  @Column({ type: "varchar" })
  title!: string;
  @Column({
    type: "text"
  })
  description!: string;
  @Column({
    type: "text"
  })
  template!: string;
  @Column({
    type: "enum",
    enum: ["CODE", "WEB"],
    default: "CODE",
    name: "task_mode"
  })
  taskMode!: EduTaskMode;
  @Column({
    type: "simple-json",
    nullable: true,
    name: "web_template_files"
  })
  webTemplateFiles?: Array<{
    path: "index.html" | "styles.css" | "script.js";
    content: string;
  }> | null;
  @Column({
    type: "simple-json",
    nullable: true,
    name: "web_validation_rules"
  })
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
  @Column({
    type: "simple-json",
    nullable: true,
    name: "web_validation_profile"
  })
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
  @Column({
    type: "int",
    default: 1,
    name: "max_attempts"
  })
  maxAttempts!: number;
  @Column({
    type: "datetime",
    nullable: true,
    name: "deadline"
  })
  deadline?: Date | null;
  @Column({
    type: "boolean",
    default: false,
    name: "is_closed"
  })
  isClosed!: boolean;
  @OneToMany(() => TestData, td => td.task)
  testData!: TestData[];
  @OneToMany(() => EduGrade, g => g.task)
  grades!: EduGrade[];
  @OneToOne(() => TaskTheory, theory => theory.eduTask, {
    nullable: true
  })
  theory?: TaskTheory | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}