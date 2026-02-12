import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from "typeorm";
import { User } from "./User";
import { Student } from "./Student";
import { SupportMessage } from "./SupportMessage";

export type SupportConversationStatus = "OPEN" | "CLOSED";

@Entity("support_conversations")
export class SupportConversation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "user_id" })
  user?: User | null;

  @ManyToOne(() => Student, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "student_id" })
  student?: Student | null;

  @Column({
    type: "varchar",
    length: 255,
    name: "user_email"
  })
  userEmail!: string;

  @Column({
    type: "varchar",
    length: 255
  })
  subject!: string;

  @Column({
    type: "enum",
    enum: ["OPEN", "CLOSED"],
    default: "OPEN"
  })
  status!: SupportConversationStatus;

  @Column({
    type: "int",
    nullable: true,
    name: "legacy_ticket_id",
    default: null
  })
  legacyTicketId?: number | null;

  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 6
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: "updated_at",
    type: "datetime",
    precision: 6
  })
  updatedAt!: Date;

  @Column({
    name: "last_message_at",
    type: "datetime",
    precision: 6
  })
  lastMessageAt!: Date;

  @OneToMany(() => SupportMessage, m => m.conversation)
  messages!: SupportMessage[];
}
