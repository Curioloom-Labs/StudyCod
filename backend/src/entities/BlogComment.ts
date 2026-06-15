import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index
} from "typeorm";
import { BlogPost } from "./BlogPost";

/**
 * A comment on a blog post. The author is a polymorphic principal (USER or
 * STUDENT) — resolved to a display name/avatar at read time — because the
 * platform has two distinct account types. `parent` enables a single level of
 * threaded replies (replies to a reply collapse onto the same parent).
 */
export type CommentPrincipalType = "USER" | "STUDENT";

@Entity("blog_comments")
@Index("idx_blog_comments_post", ["postId"])
export class BlogComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int", name: "post_id" })
  postId!: number;

  @ManyToOne(() => BlogPost, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: BlogPost;

  /** Top-level comment when null; otherwise the parent it replies to. */
  @Column({ type: "int", name: "parent_id", nullable: true })
  parentId!: number | null;

  @ManyToOne(() => BlogComment, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent!: BlogComment | null;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "author_type" })
  authorType!: CommentPrincipalType;

  @Column({ type: "int", name: "author_id" })
  authorId!: number;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "boolean", default: false })
  pinned!: boolean;

  /** Set when the author edits their comment. */
  @Column({ type: "datetime", name: "edited_at", nullable: true })
  editedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
