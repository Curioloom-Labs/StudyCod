import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
@Entity("maintenance_state")
export class MaintenanceState {
  @PrimaryColumn({
    type: "int"
  })
  id!: number;
  @Column({
    type: "boolean",
    default: false
  })
  enabled!: boolean;
  @Column({
    type: "varchar",
    length: 255,
    default: "Технічне обслуговування"
  })
  title!: string;
  @Column({
    type: "text",
    default: ""
  })
  message!: string;
  @Column({
    type: "datetime",
    precision: 6,
    nullable: true,
    default: null
  })
  until!: Date | null;
  @CreateDateColumn({
    name: "created_at",
    type: "datetime",
    precision: 6
  })
  createdAt!: Date;
  @UpdateDateColumn({
    name: "updated_at",
    type: "datetime",
    precision: 6
  })
  updatedAt!: Date;
}