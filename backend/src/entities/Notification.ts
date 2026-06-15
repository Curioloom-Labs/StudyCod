import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * An in-app notification for a polymorphic recipient (USER or STUDENT). Kept
 * generic so it can grow beyond the blog, but currently emitted for blog
 * comment activity (a new comment on your post, a reply to your comment).
 */
export type NotificationPrincipalType = "USER" | "STUDENT";
export type NotificationType = "BLOG_COMMENT" | "BLOG_REPLY";

@Entity("notifications")
@Index("idx_notifications_recipient", ["recipientType", "recipientId", "readAt"])
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "recipient_type" })
  recipientType!: NotificationPrincipalType;

  @Column({ type: "int", name: "recipient_id" })
  recipientId!: number;

  @Column({ type: "enum", enum: ["BLOG_COMMENT", "BLOG_REPLY"] })
  type!: NotificationType;

  /** Display name of whoever triggered the notification. */
  @Column({ type: "varchar", length: 200, name: "actor_name", nullable: true })
  actorName!: string | null;

  /** Slug of the related blog post, for deep-linking. */
  @Column({ type: "varchar", length: 180, name: "post_slug", nullable: true })
  postSlug!: string | null;

  @Column({ type: "varchar", length: 200, name: "post_title", nullable: true })
  postTitle!: string | null;

  @Column({ type: "int", name: "comment_id", nullable: true })
  commentId!: number | null;

  @Column({ type: "datetime", name: "read_at", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
