import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { TopicTask } from "./TopicTask";
import { EduTask } from "./EduTask";
@Entity("task_theories")
export class TaskTheory {
  @PrimaryGeneratedColumn()
  id!: number;
  @OneToOne(() => TopicTask, task => task.theory, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "topic_task_id"
  })
  topicTask?: TopicTask | null;
  @OneToOne(() => EduTask, task => task.theory, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "edu_task_id"
  })
  eduTask?: EduTask | null;
  @Column({
    type: "text"
  })
  content!: string;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}