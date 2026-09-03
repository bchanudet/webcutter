import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// SQLite has no native enum column type, so the parity is stored as varchar (see Profile.mode for precedent).
export enum SerialParity {
  NONE = 'none',
  EVEN = 'even',
  ODD = 'odd',
}

// Numeric values match the origin corner convention used by the G-code generator.
export enum GcodeOrigin {
  BOTTOM_LEFT = 0,
  TOP_LEFT = 1,
  TOP_RIGHT = 2,
  BOTTOM_RIGHT = 4,
  CENTER = 5,
}

@Entity('machine')
export class Machine {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('float')
  bedWidthMm!: number;

  @Column('float')
  bedHeightMm!: number;

  @Column()
  serialPortPath!: string;

  @Column()
  baudRate!: number;

  @Column()
  dataBits!: number;

  @Column()
  stopBits!: number;

  @Column({ type: 'varchar' })
  parity!: SerialParity;

  @Column({ default: false })
  mirrorX!: boolean;

  @Column({ default: false })
  mirrorY!: boolean;

  @Column({ type: 'int', default: GcodeOrigin.BOTTOM_LEFT })
  origin!: GcodeOrigin;

  @Column({ type: 'float', default: 10})
  maxAccelerationXMmPerSec2!: number;

  @Column({ type: 'float', default: 10})
  maxAccelerationYMmPerSec2!: number;

  @Column({ type: 'float', default: 600 })
  maxSpeedXMmPerMin!: number;

  @Column({ type: 'float', default: 600 })
  maxSpeedYMmPerMin!: number;

  // GRBL's own max spindle/laser value (its $30 setting) — powerPercent from a cutting profile
  // is scaled against this to produce the actual S value sent in G-code (e.g. M4 S<value>).
  @Column({ type: 'int', default: 1000 })
  sMax!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
