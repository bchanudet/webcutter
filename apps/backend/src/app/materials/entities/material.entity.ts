import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Profile } from './profile.entity';

@Entity('material')
export class Material {
  @PrimaryGeneratedColumn()
  id!: number;

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
