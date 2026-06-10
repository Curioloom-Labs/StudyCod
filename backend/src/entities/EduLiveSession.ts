import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import { Class } from "./Class";
import { EduLesson } from "./EduLesson";
import { User } from "./User";

export type LiveSessionStatus = "LIVE" | "ENDED";

/**
 * A live, code-aware classroom session for a class. Backs the LiveKit room a
 * teacher opens to run a lesson in real time. The LiveKit room itself is
 * ephemeral (created on demand by the SFU); this row is the durable record that
 * ties a room name to a class/lesson, tracks who is hosting, and whether the
 * session is still LIVE. At most one LIVE session per class is enforced at the
 * route layer.
 */
@Entity("edu_live_sessions")
export class EduLiveSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Class, {
    onDelete: "CASCADE"
  })
  @JoinColumn({
    name: "class_id"
  })
  class!: Class;

  @ManyToOne(() => EduLesson, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "lesson_id"
  })
  lesson?: EduLesson | null;

  /**
   * Stable, unguessable LiveKit room identity. Tokens are minted against this
   * name, so it must be unique across all sessions (including ended ones).
   */
  @Index({ unique: true })
  @Column({
    type: "varchar",
    length: 128,
    name: "room_name"
  })
  roomName!: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true
  })
  title?: string | null;

  @Column({
    type: "enum",
    enum: ["LIVE", "ENDED"],
    default: "LIVE"
  })
  status!: LiveSessionStatus;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: "SET NULL"
  })
  @JoinColumn({
    name: "started_by_user_id"
  })
  startedBy?: User | null;

  @CreateDateColumn({
    name: "created_at"
  })
  createdAt!: Date;

  @Column({
    type: "datetime",
    precision: 6,
    nullable: true,
    name: "ended_at"
  })
  endedAt?: Date | null;
}
