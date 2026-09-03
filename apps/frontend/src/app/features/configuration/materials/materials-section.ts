import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { ConfirmationService, PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { Message } from '@openng/optimus-ui/message';
import { TableModule } from '@openng/optimus-ui/table';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { MaterialsApiService } from './materials-api.service';
import { Material, Profile } from './material.model';
import { MaterialFormDialog, MaterialSaveEvent } from './material-form-dialog';
import { ProfileFormDialog, ProfileSaveEvent } from './profile-form-dialog';

@Component({
  selector: 'app-materials-section',
  imports: [
    Card,
    TableModule,
    Button,
    Message,
    ConfirmDialog,
    PrimeTemplate,
    TablerIcon,
    MaterialFormDialog,
    ProfileFormDialog,
  ],
  providers: [ConfirmationService],
  templateUrl: './materials-section.html',
  styleUrl: './materials-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialsSection {
  private readonly api = inject(MaterialsApiService);
  private readonly confirmation = inject(ConfirmationService);

  private readonly materialDialog = viewChild.required(MaterialFormDialog);
  private readonly profileDialog = viewChild.required(ProfileFormDialog);

  protected readonly materials = signal<Material[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly expandedRowKeys = signal<Record<string, boolean>>({});

  constructor() {
    this.refresh();
  }

  protected isExpanded(material: Material): boolean {
    return !!this.expandedRowKeys()[material.id];
  }

  protected toggleExpanded(material: Material): void {
    this.expandedRowKeys.update((keys) => ({ ...keys, [material.id]: !keys[material.id] }));
  }

  protected openCreateMaterial(): void {
    this.materialDialog().openForCreate();
  }

  protected openEditMaterial(material: Material): void {
    this.materialDialog().openForEdit(material);
  }

  protected onMaterialSave(event: MaterialSaveEvent): void {
    const request =
      event.id === null
        ? this.api.createMaterial(event.payload)
        : this.api.updateMaterial(event.id, event.payload);
    request.subscribe({
      next: () => this.refresh(),
      error: () => this.errorMessage.set('Could not save the material.'),
    });
  }

  protected confirmDeleteMaterial(material: Material): void {
    this.confirmation.confirm({
      header: 'Delete material',
      message: `Delete "${material.name}" and its ${material.profiles.length} profile(s)? This cannot be undone.`,
      accept: () => {
        this.api.deleteMaterial(material.id).subscribe({
          next: () => this.refresh(),
          error: () => this.errorMessage.set('Could not delete the material.'),
        });
      },
    });
  }

  protected openCreateProfile(material: Material): void {
    this.profileDialog().openForCreate(material.id);
  }

  protected openEditProfile(material: Material, profile: Profile): void {
    this.profileDialog().openForEdit(material.id, profile);
  }

  protected onProfileSave(event: ProfileSaveEvent): void {
    const request =
      event.id === null
        ? this.api.createProfile(event.materialId, event.payload)
        : this.api.updateProfile(event.id, event.payload);
    request.subscribe({
      next: () => this.refresh(),
      error: () => this.errorMessage.set('Could not save the profile.'),
    });
  }

  protected confirmDeleteProfile(profile: Profile): void {
    this.confirmation.confirm({
      header: 'Delete profile',
      message: `Delete profile "${profile.name}"? This cannot be undone.`,
      accept: () => {
        this.api.deleteProfile(profile.id).subscribe({
          next: () => this.refresh(),
          error: () => this.errorMessage.set('Could not delete the profile.'),
        });
      },
    });
  }

  private refresh(): void {
    this.loading.set(true);
    this.api.listMaterials().subscribe({
      next: (materials) => {
        this.materials.set(materials);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load materials.');
        this.loading.set(false);
      },
    });
  }
}
