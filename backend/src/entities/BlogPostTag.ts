import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { BlogPost } from "./BlogPost";
import { BlogTag } from "./BlogTag";

/** Join row linking a post to a tag. */
@Entity("blog_post_tags")
@Index("idx_blog_post_tags_tag", ["tagId"])
export class BlogPostTag {
  @PrimaryColumn({ type: "int", name: "post_id" })
  postId!: number;

  @PrimaryColumn({ type: "int", name: "tag_id" })
  tagId!: number;

  @ManyToOne(() => BlogPost, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: BlogPost;

  @ManyToOne(() => BlogTag, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tag_id" })
  tag!: BlogTag;
}
