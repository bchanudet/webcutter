import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface WorkspaceCheckError {
  code: string;
  message: string;
  pathIds: string[];
}

export interface WorkspaceCheckResult {
  errors: WorkspaceCheckError[];
}

@Injectable({ providedIn: 'root' })
export class WorkspaceCheckApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/workspace';

  check(svg: string): Observable<WorkspaceCheckResult> {
    return this.http.post<WorkspaceCheckResult>(`${this.baseUrl}/check`, { svg });
  }
}
