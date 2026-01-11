import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
@Entity("theory_blocks")
export class TheoryBlock {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({
    type: "varchar",
    length: 255
  })
  title!: string;
  @Column({
    type: "text"
  })
  content!: string;
  @Column({
    type: "int",
    default: 1
  })
  version!: number;
  @Column({
    type: "int",
    nullable: true
  })
  level?: number | null;
  @Column({
    type: "text",
    nullable: true
  })
  tags?: string | null;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}