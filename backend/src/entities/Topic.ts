import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, RelationId } from "typeorm";
import { TheoryBlock } from "./TheoryBlock";
export type TopicLanguage = "JAVA" | "PYTHON" | "CPP";
@Entity("topics")
export class Topic {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({ type: "varchar" })
  title!: string;
  @Column({
    type: "enum",
    enum: ["JAVA", "PYTHON", "CPP"]
  })
  lang!: TopicLanguage;
  @Column({
    type: "int",
    name: "topic_index"
  })
  topicIndex!: number;
  @Column({
    type: "mediumtext",
    name: "theory_markdown",
    nullable: true
  })
  theoryMarkdown?: string | null;
  @ManyToOne(() => TheoryBlock, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "theory_block_id"
  })
  theoryBlock?: TheoryBlock | null;
  @RelationId((topic: Topic) => topic.theoryBlock)
  theoryBlockId?: number | null;
  @Column({
    type: "boolean",
    name: "is_control",
    default: false
  })
  isControl!: boolean;
}