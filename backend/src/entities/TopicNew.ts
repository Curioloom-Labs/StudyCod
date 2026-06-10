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
  @Column({ type: "varchar" })
  title!: string;
  // Persisted English translation of `title`. Populated lazily by the
  // translation service (write-through). Removes the synchronous uk->en HTTP
  // call from GET hot paths once the row has been translated once.
  @Column({
    name: "title_en",
    type: "varchar",
    length: 512,
    nullable: true
  })
  titleEn?: string | null;
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
  // Per-topic thematic-grade formula override (vars: practice, control).
  // Empty/null = inherit the class formula, which itself falls back to the
  // built-in smart default. See utils/thematicFormula.ts.
  @Column({
    type: "varchar",
    length: 255,
    name: "thematic_formula",
    nullable: true
  })
  thematicFormula?: string | null;
  // Which semester (1, 2, …) this topic belongs to. NULL is treated as
  // semester 1 when aggregating semester grades. See services/edu/semesterGrading.ts.
  @Column({
    type: "int",
    nullable: true
  })
  semester?: number | null;
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