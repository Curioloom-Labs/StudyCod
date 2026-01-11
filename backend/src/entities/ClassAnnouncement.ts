import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Class } from "./Class";
import { User } from "./User";
@Entity("class_announcements")
export class ClassAnnouncement {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Class, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "class_id"
  })
  class!: Class;
  @ManyToOne(() => User, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "author_id"
  })
  author!: User;
  @Column({
    type: "varchar",
    length: 255,
    nullable: true
  })
  title!: string | null;
  @Column({
    type: "text"
  })
  content!: string;
  @Column({
    type: "boolean",
    default: false
  })
  pinned!: boolean;
  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at"
  })
  updatedAt!: Date;
}