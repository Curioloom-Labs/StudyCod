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
    type: "mediumtext"
  })
  content!: string;

  // Stored uk -> en translation (generated on-demand for users with English UI)
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "title_en",
    select: false
  })
  titleEn?: string | null;

  @Column({
    type: "mediumtext",
    nullable: true,
    name: "content_en",
    select: false
  })
  contentEn?: string | null;

  // Version of the source (uk) content that was translated into contentEn/titleEn.
  @Column({
    type: "int",
    nullable: true,
    name: "translation_version_en",
    select: false
  })
  translationVersionEn?: number | null;

  @Column({
    type: "datetime",
    nullable: true,
    name: "translated_at_en",
    select: false
  })
  translatedAtEn?: Date | null;
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