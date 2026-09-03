import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Material } from './material.entity';

export enum ProfileMode {
  LINE = 'LINE',
  FILL = 'FILL',
}

@Entity('profile')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Material, (material) => material.profiles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'materialId' })
  material!: Material;

  @Column()
  materialId!: string;

  @Column()
  name!: string;

  @Column()
  color!: string;

  /** Stored as plain text (not TypeORM's "enum" column type, which SQLite doesn't natively support). */
  @Column({ type: 'varchar' })
  mode!: ProfileMode;

  @Column('float')
  powerPercent!: number;

  @Column('float')
  speedMmPerSec!: number;

  @Column({ default: 1 })
  passes!: number;

  @Column('float', { nullable: true, default: null })
  lineSpacingMm!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
