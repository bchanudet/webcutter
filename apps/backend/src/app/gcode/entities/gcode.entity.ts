import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { GcodeHook, Gcode as GcodeData } from '@webcutter/shared';

export { GcodeHook };

@Entity('gcode')
export class Gcode implements GcodeData {
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
