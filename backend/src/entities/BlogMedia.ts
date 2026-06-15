import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * An uploaded blog image. `mediaKey` is the unguessable, public-facing id used
 * in the image URL (`/blog/media/:mediaKey`) — images must be reachable without
 * an Authorization header because `<img>` cannot send the Bearer token. The file
 * itself lives on disk under UPLOADS_DIR/blog, addressed by `storageKey`.
 */
export type MediaPrincipalType = "USER" | "STUDENT";

@Entity("blog_media")
export class BlogMedia {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index("uq_blog_media_key", { unique: true })
  @Column({ type: "varchar", length: 64, name: "media_key" })
  mediaKey!: string;

  @Column({ type: "varchar", length: 300, name: "storage_key" })
  storageKey!: string;

  @Column({ type: "varchar", length: 100, name: "mime_type" })
  mimeType!: string;

  @Column({ type: "int", name: "size_bytes" })
  sizeBytes!: number;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "uploader_type", nullable: true })
  uploaderType!: MediaPrincipalType | null;

  @Column({ type: "int", name: "uploader_id", nullable: true })
  uploaderId!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
