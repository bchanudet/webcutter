import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateMaterialDto, CreateProfileDto, Material, Profile } from '@webcutter/shared';

@Injectable({ providedIn: 'root' })
export class MaterialsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/materials';

  listMaterials(): Observable<Material[]> {
    return this.http.get<Material[]>(this.baseUrl);
  }

  createMaterial(payload: CreateMaterialDto): Observable<Material> {
    return this.http.post<Material>(this.baseUrl, payload);
  }

  updateMaterial(id: string, payload: CreateMaterialDto): Observable<Material> {
    return this.http.patch<Material>(`${this.baseUrl}/${id}`, payload);
  }

  deleteMaterial(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  createProfile(materialId: string, payload: CreateProfileDto): Observable<Profile> {
    return this.http.post<Profile>(`${this.baseUrl}/${materialId}/profiles`, payload);
  }

  updateProfile(id: string, payload: CreateProfileDto): Observable<Profile> {
    return this.http.patch<Profile>(`/api/profiles/${id}`, payload);
  }

  deleteProfile(id: string): Observable<void> {
    return this.http.delete<void>(`/api/profiles/${id}`);
  }
}
