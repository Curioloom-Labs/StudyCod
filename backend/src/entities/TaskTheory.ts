import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { TopicTask } from "./TopicTask";
import { EduTask } from "./EduTask";
import { LibraryTask } from "./LibraryTask";
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

  @OneToOne(() => LibraryTask, task => task.theory, {
    onDelete: "CASCADE",
    nullable: true
  })
  @JoinColumn({
    name: "library_task_id"
  })
  libraryTask?: LibraryTask | null;
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