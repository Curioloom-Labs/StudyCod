import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from "typeorm";
import { LibraryTask } from "./LibraryTask";
import { User } from "./User";

export type LibraryTaskRevisionAction = "APPROVE" | "ROLLBACK" | "MANUAL";

@Entity("library_task_revisions")
@Index("uq_library_task_revisions_task_version", ["libraryTaskId", "version"], { unique: true })
@Index("idx_library_task_revisions_task_created", ["libraryTaskId", "createdAt"])
export class LibraryTaskRevision {
  @PrimaryGeneratedColumn()
  id!: number;

  // Keep explicit FK column for easy querying/indexing.
  @Column({ type: "int", name: "library_task_id" })
  libraryTaskId!: number;

  @ManyToOne(() => LibraryTask, { onDelete: "CASCADE" })
  @JoinColumn({ name: "library_task_id" })
  libraryTask!: LibraryTask;

  @Column({ type: "int" })
  version!: number;

  @Column({
    type: "enum",
    enum: ["APPROVE", "ROLLBACK", "MANUAL"],
    default: "APPROVE",
  })
  action!: LibraryTaskRevisionAction;

  @Column({ type: "varchar", length: 255, nullable: true })
  comment?: string | null;

  @Column({ type: "mediumtext" })
  snapshot!: string;

  @Column({ type: "int", name: "created_by_user_id", nullable: true })
  createdByUserId?: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser?: User | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
