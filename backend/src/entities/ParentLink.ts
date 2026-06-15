import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  RelationId
} from "typeorm";
import { User } from "./User";
import { Student } from "./Student";

/**
 * Links a parent (a User with a PARENT org membership) to a specific student
 * (their child). Established only via an invitation issued by a teacher/OrgAdmin
 * — the school controls who is whose parent (safest for minors' data). Read
 * access to a child's progress is gated on the existence of this row.
 */
@Entity("parent_links")
@Index("uq_parent_student", ["parent", "student"], { unique: true })
export class ParentLink {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_user_id" })
  parent!: User;

  @RelationId((link: ParentLink) => link.parent)
  parentUserId!: number;

  @ManyToOne(() => Student, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id" })
  student!: Student;

  @RelationId((link: ParentLink) => link.student)
  studentId!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
