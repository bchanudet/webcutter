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

export interface WorkspaceGenerateResult {
  errors: WorkspaceCheckError[];
  /** `null` whenever `errors` isn't empty. */
  gcode: string | null;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/workspace';

  check(svg: string): Observable<WorkspaceCheckResult> {
    return this.http.post<WorkspaceCheckResult>(`${this.baseUrl}/check`, { svg });
  }

  generate(svg: string): Observable<WorkspaceGenerateResult> {
    return this.http.post<WorkspaceGenerateResult>(`${this.baseUrl}/generate`, { svg });
  }
}
