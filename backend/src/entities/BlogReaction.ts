import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from "typeorm";

/**
 * An emoji reaction on a post or a comment. One reaction per principal per
 * target (the unique index enforces it); re-reacting replaces or removes it.
 */
export type ReactionPrincipalType = "USER" | "STUDENT";
export type ReactionTargetType = "POST" | "COMMENT";

export const BLOG_REACTION_EMOJIS = ["👍", "❤️", "🎉", "🚀", "👀"];

@Entity("blog_reactions")
@Unique("uq_blog_reaction_principal", ["targetType", "targetId", "principalType", "principalId"])
@Index("idx_blog_reactions_target", ["targetType", "targetId"])
export class BlogReaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["POST", "COMMENT"], name: "target_type" })
  targetType!: ReactionTargetType;

  @Column({ type: "int", name: "target_id" })
  targetId!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type" })
  principalType!: ReactionPrincipalType;

  @Column({ type: "int", name: "principal_id" })
  principalId!: number;

  @Column({ type: "varchar", length: 16 })
  emoji!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
