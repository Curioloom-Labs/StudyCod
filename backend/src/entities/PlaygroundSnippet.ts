import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

/**
 * A shareable code-playground snippet. `shareId` is the unguessable id used in
 * the public share URL.
 */
export type SnippetPrincipalType = "USER" | "STUDENT";

@Entity("playground_snippets")
export class PlaygroundSnippet {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index("uq_playground_snippets_share_id", { unique: true })
  @Column({ type: "varchar", length: 32, name: "share_id" })
  shareId!: string;

  @Column({ type: "varchar", length: 16 })
  language!: string;

  @Column({ type: "mediumtext" })
  code!: string;

  @Column({ type: "text", nullable: true })
  stdin?: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  title?: string | null;

  @Column({ type: "enum", enum: ["USER", "STUDENT"], name: "principal_type", nullable: true })
  principalType?: SnippetPrincipalType | null;

  @Column({ type: "int", name: "principal_id", nullable: true })
  principalId?: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
