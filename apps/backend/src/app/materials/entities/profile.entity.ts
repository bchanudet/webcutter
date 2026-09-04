import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfileMode, Profile as ProfileData } from '@webcutter/shared';
import { Material } from './material.entity';

export { ProfileMode };

@Entity('profile')
export class Profile implements ProfileData {
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
  speedMmPerMin!: number;

  @Column({ default: 1 })
  passes!: number;

  @Column('float', { nullable: true, default: null })
  lineSpacingMm!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
