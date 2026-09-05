import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HistoryResult } from '@webcutter/shared';
import { Machine } from '../../machine/entities/machine.entity';

export { HistoryResult };

/** A single past cutting job — created by `JobService.start()` (result/endDatetime left `NULL`) and
 * finalized once the job actually ends. `machine`/`machineId` are nullable with `ON DELETE SET NULL`
 * (not `CASCADE`, unlike `Profile.material`): a history entry must outlive the machine it ran on,
 * e.g. the machine being replaced with a new one. */
@Entity('history_entry')
export class HistoryEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Machine, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'machineId' })
  machine!: Machine | null;

  @Column({ nullable: true, default: null })
  machineId!: number | null;

  @Column()
  fileName!: string;

  @Column()
  fileSizeBytes!: number;

  @Column()
  commandCount!: number;

  @Column('text')
  thumbnailBase64!: string;

  @Column()
  startDatetime!: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  endDatetime!: Date | null;

  /** Stored as plain text (not TypeORM's "enum" column type, which SQLite doesn't natively support). */
  @Column({ type: 'varchar', nullable: true, default: null })
  result!: HistoryResult | null;
}
