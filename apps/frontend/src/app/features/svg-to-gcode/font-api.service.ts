import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface TextToSvgResult {
  svg: string;
}

@Injectable({ providedIn: 'root' })
export class FontApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/font';

  textToSvg(text: string, heightMm: number): Observable<TextToSvgResult> {
    return this.http.post<TextToSvgResult>(`${this.baseUrl}/text-to-svg`, { text, heightMm });
  }
}
