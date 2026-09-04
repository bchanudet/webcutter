import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateGcodeDto, Gcode } from '@webcutter/shared';

@Injectable({ providedIn: 'root' })
export class GcodeApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/gcodes';

  listGcodes(): Observable<Gcode[]> {
    return this.http.get<Gcode[]>(this.baseUrl);
  }

  createGcode(payload: CreateGcodeDto): Observable<Gcode> {
    return this.http.post<Gcode>(this.baseUrl, payload);
  }

  updateGcode(id: number, payload: CreateGcodeDto): Observable<Gcode> {
    return this.http.patch<Gcode>(`${this.baseUrl}/${id}`, payload);
  }

  deleteGcode(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
