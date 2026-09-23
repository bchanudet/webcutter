import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { ConfirmationService, PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { ConfirmDialog } from '@openng/optimus-ui/confirmdialog';
import { Message } from '@openng/optimus-ui/message';
import { Panel } from '@openng/optimus-ui/panel';
import { TableModule } from '@openng/optimus-ui/table';
import { NotificationService } from '../../../shared/notifications/notification.service';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { MaterialsApiService } from './materials-api.service';
import { Material, Profile } from '@webcutter/shared';
import { MaterialFormDialog, MaterialSaveEvent } from './material-form-dialog';
import { ProfileFormDialog, ProfileSaveEvent } from './profile-form-dialog';

interface ProfileRow extends Profile {
  materialName: string;
  materialThicknessMm: number;
}

@Component({
  selector: 'app-materials-section',
  imports: [
    Panel,
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
  private readonly notificationService = inject(NotificationService);

  private readonly materialDialog = viewChild.required(MaterialFormDialog);
  private readonly profileDialog = viewChild.required(ProfileFormDialog);

  protected readonly materials = signal<Material[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedMaterialId = signal<string | null>(null);

  protected readonly profiles = computed<ProfileRow[]>(() => {
    const selectedId = this.selectedMaterialId();
    const materials = selectedId === null ? this.materials() : this.materials().filter((m) => m.id === selectedId);
    return materials.flatMap((material) =>
      material.profiles.map((profile) => ({
        ...profile,
        materialName: material.name,
        materialThicknessMm: material.thicknessMm,
      })),
    );
  });

  constructor() {
    this.refresh();
  }

  protected isSelected(material: Material): boolean {
    return this.selectedMaterialId() === material.id;
  }

  protected toggleSelectMaterial(material: Material): void {
    this.selectedMaterialId.update((id) => (id === material.id ? null : material.id));
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
      error: () =>
        this.notificationService.notify({
          severity: 'danger',
          origin: 'Materials',
          summary: 'Save failed',
          message: 'Could not save the material.',
        }),
    });
  }

  protected confirmDeleteMaterial(material: Material): void {
    this.confirmation.confirm({
      header: 'Delete material',
      message: `Delete "${material.name}" and its ${material.profiles.length} profile(s)? This cannot be undone.`,
      accept: () => {
        this.api.deleteMaterial(material.id).subscribe({
          next: () => {
            if (this.selectedMaterialId() === material.id) {
              this.selectedMaterialId.set(null);
            }
            this.refresh();
          },
          error: () =>
            this.notificationService.notify({
              severity: 'danger',
              origin: 'Materials',
              summary: 'Delete failed',
              message: 'Could not delete the material.',
            }),
        });
      },
    });
  }

  protected openCreateProfile(): void {
    this.profileDialog().openForCreate(this.selectedMaterialId() ?? undefined);
  }

  protected openEditProfile(profile: ProfileRow): void {
    this.profileDialog().openForEdit(profile.materialId, profile);
  }

  protected onProfileSave(event: ProfileSaveEvent): void {
    const request =
      event.id === null
        ? this.api.createProfile(event.materialId, event.payload)
        : this.api.updateProfile(event.id, event.payload);
    request.subscribe({
      next: () => this.refresh(),
      error: () =>
        this.notificationService.notify({
          severity: 'danger',
          origin: 'Materials',
          summary: 'Save failed',
          message: 'Could not save the profile.',
        }),
    });
  }

  protected confirmDeleteProfile(profile: ProfileRow): void {
    this.confirmation.confirm({
      header: 'Delete profile',
      message: `Delete profile "${profile.name}"? This cannot be undone.`,
      accept: () => {
        this.api.deleteProfile(profile.id).subscribe({
          next: () => this.refresh(),
          error: () =>
            this.notificationService.notify({
              severity: 'danger',
              origin: 'Materials',
              summary: 'Delete failed',
              message: 'Could not delete the profile.',
            }),
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
