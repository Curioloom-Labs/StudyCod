import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { SupportMessage } from "./SupportMessage";

@Entity("support_attachments")
export class SupportAttachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SupportMessage, m => m.attachments, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "message_id" })
  message!: SupportMessage;

  @Column({
    type: "varchar",
    length: 255,
    name: "original_name"
  })
  originalName!: string;

  @Column({
    type: "varchar",
    length: 127,
    name: "mime_type",
    default: "application/octet-stream"
  })
  mimeType!: string;

  @Column({
    type: "int",
    unsigned: true,
    name: "size_bytes"
  })
  sizeBytes!: number;

  @Column({
    type: "varchar",
    length: 512,
    name: "storage_key"
  })
  storageKey!: string;

  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 6
  })
  createdAt!: Date;
}
