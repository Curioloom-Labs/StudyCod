import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index
} from "typeorm";
import { BlogComment } from "./BlogComment";

/** A user/student report flagging a comment for admin review. */
export type ReportPrincipalType = "USER" | "STUDENT";
export type ReportStatus = "OPEN" | "RESOLVED";

@Entity("blog_comment_reports")
@Index("idx_blog_comment_reports_status", ["status"])
export class BlogCommentReport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int", name: "comment_id" })
  commentId!: number;

  @ManyToOne(() => BlogComment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "comment_id" })
  comment!: BlogComment;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "reporter_type" })
  reporterType!: ReportPrincipalType;

  @Column({ type: "int", name: "reporter_id" })
  reporterId!: number;

  @Column({ type: "varchar", length: 300, nullable: true })
  reason!: string | null;

  @Column({ type: "enum", enum: ["OPEN", "RESOLVED"], default: "OPEN" })
  status!: ReportStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
