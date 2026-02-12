import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from "typeorm";
import { SupportConversation } from "./SupportConversation";
import { User } from "./User";
import { Student } from "./Student";
import { SupportAttachment } from "./SupportAttachment";

export type SupportMessageSenderType = "USER" | "ADMIN" | "SYSTEM";

@Entity("support_messages")
export class SupportMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SupportConversation, c => c.messages, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "conversation_id" })
  conversation!: SupportConversation;

  @Column({
    type: "enum",
    enum: ["USER", "ADMIN", "SYSTEM"],
    name: "sender_type"
  })
  senderType!: SupportMessageSenderType;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "sender_user_id" })
  senderUser?: User | null;

  @ManyToOne(() => Student, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "sender_student_id" })
  senderStudent?: Student | null;

  @Column({
    type: "text",
    nullable: true
  })
  text?: string | null;

  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 6
  })
  createdAt!: Date;

  @OneToMany(() => SupportAttachment, a => a.message)
  attachments!: SupportAttachment[];
}
