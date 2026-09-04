import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Machine, UpdateMachineDto } from '@webcutter/shared';

@Injectable({ providedIn: 'root' })
export class MachineApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/machine';

  getMachine(): Observable<Machine> {
    return this.http.get<Machine>(this.baseUrl);
  }

  updateMachine(payload: UpdateMachineDto): Observable<Machine> {
    return this.http.put<Machine>(this.baseUrl, payload);
  }
}
