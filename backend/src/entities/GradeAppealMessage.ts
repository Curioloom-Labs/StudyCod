import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from "typeorm";
import { GradeAppeal } from "./GradeAppeal";
import { User } from "./User";
import { Student } from "./Student";

export const GRADE_APPEAL_MESSAGE_SENDER_TYPES = ["STUDENT", "TEACHER", "SYSTEM"] as const;
export type GradeAppealMessageSenderType = (typeof GRADE_APPEAL_MESSAGE_SENDER_TYPES)[number];

@Entity("grade_appeal_messages")
export class GradeAppealMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => GradeAppeal, appeal => appeal.messages, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "appeal_id" })
  appeal!: GradeAppeal;

  @Column({
    type: "enum",
    enum: GRADE_APPEAL_MESSAGE_SENDER_TYPES,
    name: "sender_type",
  })
  senderType!: GradeAppealMessageSenderType;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "sender_user_id" })
  senderUser!: User | null;

  @ManyToOne(() => Student, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "sender_student_id" })
  senderStudent!: Student | null;

  @Column({
    type: "text",
  })
  text!: string;

  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 6,
  })
  createdAt!: Date;
}
