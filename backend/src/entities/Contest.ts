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

export type ContestVisibility = "PUBLIC" | "PRIVATE_CODE" | "CLASS" | "TEMPORARY_ACCOUNTS";
export type ContestScoringMode = "IOI" | "ICPC";
export type ContestDifficulty = "EASY" | "MEDIUM" | "HARD";
export type ContestScoreboardVisibility = "LIVE" | "AFTER_END" | "ORGANIZERS_ONLY";
export type ContestParticipantAccessMode = "SELF_REGISTRATION" | "ISSUED_ACCOUNTS";
export type ContestBannerTheme = "forest" | "ocean" | "violet" | "sunset";

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

  @Column({ type: "varchar", length: 16, default: "🏆" })
  icon!: string;

  @Column({ type: "varchar", length: 512, nullable: true, name: "icon_image_url" })
  iconImageUrl?: string | null;

  @Column({ type: "varchar", length: 20, default: "forest", name: "banner_theme" })
  bannerTheme!: ContestBannerTheme;

  @Column({ type: "varchar", length: 512, nullable: true, name: "banner_image_url" })
  bannerImageUrl?: string | null;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "simple-json", nullable: true })
  tags?: string[] | null;

  @Column({ type: "varchar", length: 12, nullable: true })
  difficulty?: ContestDifficulty | null;

  @Column({
    type: "enum",
    enum: ["PUBLIC", "PRIVATE_CODE", "CLASS", "TEMPORARY_ACCOUNTS"],
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

  // Ranking model for the live scoreboard:
  //  - IOI: rank by sum of best partial score per problem (default, matches the
  //    submit pipeline which records partial/subtask scores).
  //  - ICPC: rank by problems solved, then penalty (time to first AC + wrong tries).
  @Column({
    type: "enum",
    enum: ["IOI", "ICPC"],
    default: "IOI",
    name: "scoring_mode",
  })
  scoringMode!: ContestScoringMode;

  @Column({
    type: "enum",
    enum: ["LIVE", "AFTER_END", "ORGANIZERS_ONLY"],
    default: "LIVE",
    name: "scoreboard_visibility",
  })
  scoreboardVisibility!: ContestScoreboardVisibility;

  @Column({
    type: "enum",
    enum: ["SELF_REGISTRATION", "ISSUED_ACCOUNTS"],
    default: "SELF_REGISTRATION",
    name: "participant_access_mode",
  })
  participantAccessMode!: ContestParticipantAccessMode;

  @OneToMany(() => ContestProblem, (p) => p.contest)
  problems!: ContestProblem[];

  @OneToMany(() => ContestParticipant, (p) => p.contest)
  participants!: ContestParticipant[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
