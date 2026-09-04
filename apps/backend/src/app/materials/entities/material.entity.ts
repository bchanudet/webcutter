import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Material as MaterialData } from '@webcutter/shared';
import { Profile } from './profile.entity';

@Entity('material')
export class Material implements MaterialData {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('float')
  thicknessMm!: number;

  @OneToMany(() => Profile, (profile) => profile.material)
  profiles!: Profile[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
