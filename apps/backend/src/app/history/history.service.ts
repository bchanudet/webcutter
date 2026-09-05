import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HistoryEntry as HistoryEntryDto, HistoryResult, HistorySummary } from '@webcutter/shared';
import { Repository } from 'typeorm';
import { HistoryEntry } from './entities/history-entry.entity';

export interface CreateHistoryEntryParams {
  machineId: number;
  fileName: string;
  fileSizeBytes: number;
  commandCount: number;
  thumbnailBase64: string;
}

function toDto(entry: HistoryEntry): HistoryEntryDto {
  return {
    id: entry.id,
    machineId: entry.machineId,
    machineName: entry.machine?.name ?? null,
    fileName: entry.fileName,
    fileSizeBytes: entry.fileSizeBytes,
    commandCount: entry.commandCount,
    thumbnailBase64: entry.thumbnailBase64,
    startDatetime: entry.startDatetime.toISOString(),
    endDatetime: entry.endDatetime?.toISOString() ?? null,
    result: entry.result,
  };
}

/** CRUD-lite for job history: `JobService` calls `create()`/`finish()` directly (not over REST) to
 * open/close an entry around a job's lifecycle; `HistoryController` only ever reads finished entries
 * (`endDatetime`/`result` both set) for the "History" page. */
@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(HistoryEntry) private readonly historyEntries: Repository<HistoryEntry>,
  ) {}

  async create(params: CreateHistoryEntryParams): Promise<HistoryEntry> {
    const entry = this.historyEntries.create({
      ...params,
      startDatetime: new Date(),
      endDatetime: null,
      result: null,
    });
    return this.historyEntries.save(entry);
  }

  async finish(id: string, result: HistoryResult): Promise<void> {
    await this.historyEntries.update(id, { endDatetime: new Date(), result });
  }

  async getSummary(): Promise<HistorySummary> {
    const [success, error, aborted] = await Promise.all([
      this.historyEntries.count({ where: { result: HistoryResult.SUCCESS } }),
      this.historyEntries.count({ where: { result: HistoryResult.ERROR } }),
      this.historyEntries.count({ where: { result: HistoryResult.ABORTED } }),
    ]);
    return { success, error, aborted };
  }

  async list(from?: Date, to?: Date): Promise<HistoryEntryDto[]> {
    const query = this.historyEntries
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.machine', 'machine')
      .where('entry.endDatetime IS NOT NULL')
      .orderBy('entry.startDatetime', 'DESC');

    if (from) {
      query.andWhere('entry.startDatetime >= :from', { from });
    }
    if (to) {
      query.andWhere('entry.startDatetime <= :to', { to });
    }

    const entries = await query.getMany();
    return entries.map(toDto);
  }
}
