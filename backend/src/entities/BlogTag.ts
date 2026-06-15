import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * A normalized blog tag. `slug` is the lowercase, url-safe identifier used in
 * filter URLs (`/blog/tag/:slug`); `name` is the display label as first typed.
 * Tags are auto-created when an admin saves a post that references them.
 */
@Entity("blog_tags")
export class BlogTag {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index("uq_blog_tags_slug", { unique: true })
  @Column({ type: "varchar", length: 60 })
  slug!: string;

  @Column({ type: "varchar", length: 60 })
  name!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
