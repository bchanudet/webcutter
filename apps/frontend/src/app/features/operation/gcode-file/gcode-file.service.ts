import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { GcodeFileInfo } from './gcode-file.model';

/** The single G-code file currently uploaded and ready to be sent to the cutter (Operation page).
 * `current` mirrors `CutterSocketService.gcodeFile` — broadcast by the backend to every connected
 * browser whenever the file changes — rather than being fetched or held locally here, so every
 * browser on the Operation page stays in sync. */
@Injectable({ providedIn: 'root' })
export class GcodeFileService {
  private readonly http = inject(HttpClient);
  private readonly cutterSocket = inject(CutterSocketService);
  private readonly baseUrl = '/api/gcode-file';

  readonly current = this.cutterSocket.gcodeFile;

  /** Returns an observable (rather than subscribing internally) so a caller — e.g. the Gcode
   * page's "Send to Operation" — can chain work (like navigating away) onto the upload actually
   * completing, instead of firing it off blind. `current` updates once the server broadcasts the
   * change back over the WebSocket, not directly from this response. */
  upload(file: File): Observable<GcodeFileInfo> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<GcodeFileInfo>(this.baseUrl, formData);
  }

  delete(): void {
    this.cutterSocket.deleteGcodeFile();
  }

  /** The raw text of the currently uploaded file — fetched on demand (e.g. by the G-code viewer
   * tab) rather than broadcast alongside `current`'s metadata, since it's heavy and only actually
   * needed by whichever browser has that tab open. */
  fetchContent(): Observable<{ content: string }> {
    return this.http.get<{ content: string }>(`${this.baseUrl}/content`);
  }
}
