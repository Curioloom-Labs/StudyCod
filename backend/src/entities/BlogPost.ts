import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from "typeorm";
import { User } from "./User";

/**
 * A devblog / changelog post. Authored by SYSTEM_ADMIN users and read by any
 * authenticated principal (users and students). `slug` is the human-readable,
 * unguessable-enough id used in the public-facing post URL.
 *
 * `category` keeps the feed flexible: free-form news as well as release notes
 * (NEWS / ANNOUNCEMENT) and structured changelog entries (FEATURE / FIX /
 * IMPROVEMENT) that may carry a `version` label.
 */
export type BlogCategory =
  | "NEWS"
  | "ANNOUNCEMENT"
  | "FEATURE"
  | "FIX"
  | "IMPROVEMENT";

export type BlogStatus = "DRAFT" | "PUBLISHED";

export const BLOG_CATEGORIES: BlogCategory[] = [
  "NEWS",
  "ANNOUNCEMENT",
  "FEATURE",
  "FIX",
  "IMPROVEMENT"
];

@Entity("blog_posts")
export class BlogPost {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index("uq_blog_posts_slug", { unique: true })
  @Column({ type: "varchar", length: 180 })
  slug!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  /** Short teaser shown in the feed list. Optional. */
  @Column({ type: "varchar", length: 320, nullable: true })
  excerpt!: string | null;

  /** Full post body, stored as Markdown. */
  @Column({ type: "mediumtext" })
  content!: string;

  @Column({
    type: "enum",
    enum: BLOG_CATEGORIES,
    default: "NEWS"
  })
  category!: BlogCategory;

  /** Optional release/version label for changelog entries (e.g. "v1.4.0"). */
  @Column({ type: "varchar", length: 40, nullable: true })
  version!: string | null;

  /** Public media key of the cover image (see BlogMedia). Optional. */
  @Column({ type: "varchar", length: 64, name: "cover_image_key", nullable: true })
  coverImageKey!: string | null;

  /** When true, no new comments may be posted (admin moderation). */
  @Column({ type: "boolean", name: "comments_locked", default: false })
  commentsLocked!: boolean;

  @Column({ type: "boolean", default: false })
  pinned!: boolean;

  @Column({
    type: "enum",
    enum: ["DRAFT", "PUBLISHED"],
    default: "DRAFT"
  })
  status!: BlogStatus;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "author_id" })
  author!: User | null;

  /** Set when the post first transitions to PUBLISHED. */
  @Column({ type: "datetime", name: "published_at", nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
