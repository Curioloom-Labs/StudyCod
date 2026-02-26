import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";
import { Class } from "./Class";
import { ContestProblem } from "./ContestProblem";
import { ContestParticipant } from "./ContestParticipant";

export type ContestVisibility = "PUBLIC" | "PRIVATE_CODE" | "CLASS";

@Entity("contests")
export class Contest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdBy!: User;

  @ManyToOne(() => Class, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "class_id" })
  class?: Class | null;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({
    type: "enum",
    enum: ["PUBLIC", "PRIVATE_CODE", "CLASS"],
    default: "PUBLIC",
  })
  visibility!: ContestVisibility;

  // Used only for PRIVATE_CODE contests.
  @Column({ type: "varchar", length: 64, nullable: true, name: "join_code" })
  joinCode?: string | null;

  @Column({ type: "datetime", nullable: true, name: "starts_at" })
  startsAt?: Date | null;

  @Column({ type: "datetime", nullable: true, name: "ends_at" })
  endsAt?: Date | null;

  @Column({ type: "boolean", default: true, name: "is_published" })
  isPublished!: boolean;

  // If true, allow submissions after contest end in "upsolve" phase.
  // These submissions must NOT affect the official contest scoreboard.
  @Column({ type: "boolean", default: true, name: "allow_upsolve" })
  allowUpsolve!: boolean;

  @OneToMany(() => ContestProblem, (p) => p.contest)
  problems!: ContestProblem[];

  @OneToMany(() => ContestParticipant, (p) => p.contest)
  participants!: ContestParticipant[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
