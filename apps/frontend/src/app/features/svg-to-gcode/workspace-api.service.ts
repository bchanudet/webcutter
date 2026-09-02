import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { GcodeFileInfo } from '../operation/gcode-file/gcode-file.model';

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

export interface WorkspaceSendToOperationResult {
  errors: WorkspaceCheckError[];
  /** `null` whenever `errors` isn't empty — the g-code itself never reaches the browser, only
   * this metadata, since the backend stores it directly as the Operation page's current file. */
  file: GcodeFileInfo | null;
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

  /** Generates g-code from the workspace SVG and stores it as the current Operation file,
   * entirely server-side — no g-code round-trips through the browser. */
  sendToOperation(svg: string): Observable<WorkspaceSendToOperationResult> {
    return this.http.post<WorkspaceSendToOperationResult>(`${this.baseUrl}/send-to-operation`, { svg });
  }
}
