import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { GcodeFileInfo } from './gcode-file.model';

/** The single G-code file currently uploaded and ready to be sent to the cutter (Operation page).
 * Kept as shared state (rather than fetched separately by each consumer) so the toolbar's
 * upload/delete actions and the sidebar's "gcode file" card stay in sync. */
@Injectable({ providedIn: 'root' })
export class GcodeFileService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/gcode-file';

  readonly current = signal<GcodeFileInfo | null>(null);

  constructor() {
    this.http.get<GcodeFileInfo | null>(this.baseUrl).subscribe((file) => this.current.set(file));
  }

  upload(file: File): void {
    const formData = new FormData();
    formData.append('file', file);
    this.http.post<GcodeFileInfo>(this.baseUrl, formData).subscribe((info) => this.current.set(info));
  }

  delete(): void {
    this.http.delete<void>(this.baseUrl).subscribe(() => this.current.set(null));
  }
}
