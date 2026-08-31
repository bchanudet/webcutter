import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Material, MaterialPayload, Profile, ProfilePayload } from './material.model';

@Injectable({ providedIn: 'root' })
export class MaterialsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/materials';

  listMaterials(): Observable<Material[]> {
    return this.http.get<Material[]>(this.baseUrl);
  }

  createMaterial(payload: MaterialPayload): Observable<Material> {
    return this.http.post<Material>(this.baseUrl, payload);
  }

  updateMaterial(id: number, payload: MaterialPayload): Observable<Material> {
    return this.http.patch<Material>(`${this.baseUrl}/${id}`, payload);
  }

  deleteMaterial(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  createProfile(materialId: number, payload: ProfilePayload): Observable<Profile> {
    return this.http.post<Profile>(`${this.baseUrl}/${materialId}/profiles`, payload);
  }

  updateProfile(id: number, payload: ProfilePayload): Observable<Profile> {
    return this.http.patch<Profile>(`/api/profiles/${id}`, payload);
  }

  deleteProfile(id: number): Observable<void> {
    return this.http.delete<void>(`/api/profiles/${id}`);
  }
}
