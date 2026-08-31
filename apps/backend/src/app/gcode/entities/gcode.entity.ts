import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// SQLite has no native enum column type, so the hook is stored as varchar (see Profile.mode for precedent).
export enum GcodeHook {
  START = 'start',
  END = 'end',
}

@Entity('gcode')
export class Gcode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'varchar' })
  hook!: GcodeHook;

  @Column('int')
  order!: number;

  @Column('text')
  code!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
