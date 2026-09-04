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

  @Column()
  name!: string;

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

  /** Offset between GRBL's own homed origin and this machine's logical (0, 0) — e.g. a fixed gap
   * between the limit switches and the actual corner of the cutting surface. Added to every X/Y
   * coordinate sent in G-code, and subtracted back out of the position GRBL reports (see
   * `WorkspaceGcodeGeneratorService`/`FramingService` and the frontend's `PositionCard`), so a
   * program's `X0 Y0` and the Position widget's "0, 0" both mean this logical origin, not GRBL's. */
  @Column({ type: 'float', default: 0 })
  offsetXMm!: number;

  @Column({ type: 'float', default: 0 })
  offsetYMm!: number;

  @Column({ type: 'float', default: 10})
  maxAccelerationXMmPerSec2!: number;

  @Column({ type: 'float', default: 10})
  maxAccelerationYMmPerSec2!: number;

  // Feed rate for G1 moves (laser on) — see `travelSpeedXMmPerMin`/`travelSpeedYMmPerMin` for G0.
  @Column({ type: 'float', default: 600 })
  maxSpeedXMmPerMin!: number;

  @Column({ type: 'float', default: 600 })
  maxSpeedYMmPerMin!: number;

  // Feed rate for G0 rapid moves (laser off) — kept separate from the work speed above since a
  // rapid move is typically much faster than any cut/engrave feed rate.
  @Column({ type: 'float', default: 6000 })
  travelSpeedXMmPerMin!: number;

  @Column({ type: 'float', default: 6000 })
  travelSpeedYMmPerMin!: number;

  // GRBL's own max spindle/laser value (its $30 setting) — powerPercent from a cutting profile
  // is scaled against this to produce the actual S value sent in G-code (e.g. M4 S<value>).
  @Column({ type: 'int', default: 1000 })
  sMax!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
