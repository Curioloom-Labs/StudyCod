import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";
export type SupportTicketStatus = "OPEN" | "ANSWERED" | "CLOSED";
@Entity("support_tickets")
export class SupportTicket {
  @PrimaryGeneratedColumn()
  id!: number;
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
    type: "text"
  })
  message!: string;
  @Column({
    type: "enum",
    enum: ["OPEN", "ANSWERED", "CLOSED"],
    default: "OPEN"
  })
  status!: SupportTicketStatus;
  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 6
  })
  createdAt!: Date;
  @Column({
    name: "answered_at",
    type: "datetime",
    precision: 6,
    nullable: true,
    default: null
  })
  answeredAt?: Date | null;
}