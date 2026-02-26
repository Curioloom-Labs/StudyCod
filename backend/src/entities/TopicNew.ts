import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, RelationId, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { TopicTask } from "./TopicTask";
import { ControlWork } from "./ControlWork";
import { TopicProgress } from "./TopicProgress";
import { Class } from "./Class";
import { TheoryBlock } from "./TheoryBlock";
export type TopicLanguage = "JAVA" | "PYTHON" | "CPP";
@Entity("topics_new")
export class TopicNew {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column()
  title!: string;
  @Column({
    type: "text",
    nullable: true
  })
  description?: string | null;
  @Column({
    type: "int",
    default: 0
  })
  order!: number;
  @Column({
    type: "enum",
    enum: ["JAVA", "PYTHON", "CPP"]
  })
  language!: TopicLanguage;
  @ManyToOne(() => Class, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "class_id"
  })
  class?: Class | null;
  @ManyToOne(() => TheoryBlock, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "theory_block_id"
  })
  theoryBlock?: TheoryBlock | null;
  @RelationId((topic: TopicNew) => topic.theoryBlock)
  theoryBlockId?: number | null;
  @OneToMany(() => TopicTask, task => task.topic)
  tasks!: TopicTask[];
  @OneToMany(() => ControlWork, cw => cw.topic)
  controlWorks!: ControlWork[];
  @OneToMany(() => TopicProgress, progress => progress.topic)
  progresses!: TopicProgress[];
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}