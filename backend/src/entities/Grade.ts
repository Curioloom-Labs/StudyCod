import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn, BeforeInsert, BeforeUpdate } from "typeorm";
import { User } from "./User";
import { Task } from "./Task";
@Entity({
  name: "grades"
})
export class Grade {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => User, u => u.grades, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "user_id"
  })
  user!: User;
  @ManyToOne(() => Task, t => t.grades, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "task_id"
  })
  task?: Task | null;
  @BeforeInsert()
  @BeforeUpdate()
  validatePersonalDomain() {
    if (this.user && typeof this.user === "object" && "userMode" in this.user) {
      if (this.user.userMode !== "PERSONAL") {
        throw new Error(`Grade entity can only be used with PERSONAL domain users. ` + `User ${this.user.id} has userMode: ${this.user.userMode}. ` + `Use EduGrade entity for EDUCATIONAL domain.`);
      }
    }
  }
  @Column({
    type: "int",
    nullable: true
  })
  total!: number | null;
  @Column({
    type: "int",
    nullable: true,
    default: 0,
    name: "work_score"
  })
  workScore!: number | null;
  @Column({
    type: "int",
    nullable: true,
    default: 0,
    name: "optimization_score"
  })
  optimizationScore!: number | null;
  @Column({
    type: "int",
    nullable: true,
    default: 0,
    name: "integrity_score"
  })
  integrityScore!: number | null;
  @Column({
    type: "text",
    nullable: true,
    name: "ai_feedback"
  })
  aiFeedback!: string | null;
  @Column({
    type: "int",
    nullable: true,
    name: "previous_grade_id"
  })
  previousGradeId!: number | null;
  @Column({
    type: "text",
    nullable: true,
    name: "code_snapshot"
  })
  codeSnapshot!: string | null;
  @Column({
    type: "text",
    nullable: true,
    name: "comparison_feedback"
  })
  comparisonFeedback!: string | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
}