import { Controller, Get, Query } from '@nestjs/common';
import { HistoryEntry, HistorySummary } from '@webcutter/shared';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('summary')
  getSummary(): Promise<HistorySummary> {
    return this.history.getSummary();
  }

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string): Promise<HistoryEntry[]> {
    return this.history.list(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }
}
