import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HistoryEntry, HistorySummary } from '@webcutter/shared';

@Injectable({ providedIn: 'root' })
export class HistoryApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/history';

  getSummary(): Observable<HistorySummary> {
    return this.http.get<HistorySummary>(`${this.baseUrl}/summary`);
  }

  listEntries(from?: Date | null, to?: Date | null): Observable<HistoryEntry[]> {
    let params = new HttpParams();
    if (from) {
      params = params.set('from', from.toISOString());
    }
    if (to) {
      params = params.set('to', to.toISOString());
    }
    return this.http.get<HistoryEntry[]>(this.baseUrl, { params });
  }
}
