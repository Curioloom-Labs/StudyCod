import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  CreateDateColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Contest } from "./Contest";
import { User } from "./User";
import { Student } from "./Student";

export type ContestPrincipalType = "USER" | "STUDENT";

@Entity("contest_participants")
@Unique("uq_contest_participants_contest_user", ["contest", "user"])
@Unique("uq_contest_participants_contest_student", ["contest", "student"])
export class ContestParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Contest, (c) => c.participants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contest_id" })
  contest!: Contest;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User | null;

  @ManyToOne(() => Student, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "student_id" })
  student?: Student | null;

  @Column({
    type: "enum",
    enum: ["USER", "STUDENT"],
    name: "principal_type",
  })
  principalType!: ContestPrincipalType;

  // Snapshot for stable scoreboard display.
  @Column({ type: "varchar", length: 180, name: "display_name" })
  displayName!: string;

  @Column({ type: "tinyint", width: 1, default: false, name: "is_disqualified" })
  isDisqualified!: boolean;

  @Column({ type: "varchar", length: 120, nullable: true, name: "contest_account_handle" })
  contestAccountHandle?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true, name: "contest_account_note" })
  contestAccountNote?: string | null;

  @Column({ type: "text", nullable: true, name: "disqualification_reason" })
  disqualificationReason?: string | null;

  @Column({ type: "datetime", nullable: true, name: "disqualified_at" })
  disqualifiedAt?: Date | null;

  @CreateDateColumn({ name: "joined_at" })
  joinedAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
