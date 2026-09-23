import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { InputText } from '@openng/optimus-ui/inputtext';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { Select } from '@openng/optimus-ui/select';
import { CreateProfileDto, Material, Profile, ProfileMode } from '@webcutter/shared';
import { PROFILE_COLOR_PALETTE } from './profile-color-palette';
import { InputGroupModule } from '@openng/optimus-ui/inputgroup';
import { InputGroupAddonModule } from '@openng/optimus-ui/inputgroupaddon';

export interface ProfileSaveEvent {
  materialId: string;
  id: string | null;
  payload: CreateProfileDto;
}

interface ModeOption {
  label: string;
  value: ProfileMode;
}

const MODE_OPTIONS: ModeOption[] = [
  { label: 'Line (follow the outline)', value: ProfileMode.LINE },
  { label: 'Fill (sweep the enclosed area)', value: ProfileMode.FILL },
];

interface MaterialOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-profile-form-dialog',
  imports: [Dialog, Button, InputText, InputNumber, Select, PrimeTemplate, ReactiveFormsModule, InputGroupModule, InputGroupAddonModule],
  templateUrl: './profile-form-dialog.html',
  styleUrl: './profile-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileFormDialog {
  readonly materials = input<Material[]>([]);
  readonly save = output<ProfileSaveEvent>();

  protected readonly materialOptions = computed<MaterialOption[]>(() =>
    this.materials().map((material) => ({
      label: `${material.name} (${material.thicknessMm} mm)`,
      value: material.id,
    })),
  );

  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly colorPalette = PROFILE_COLOR_PALETTE;
  protected readonly visible = signal(false);
  private editingId: string | null = null;

  protected readonly form = new FormGroup({
    materialId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
    color: new FormControl(PROFILE_COLOR_PALETTE[0], { nonNullable: true, validators: [Validators.required] }),
    mode: new FormControl<ProfileMode>(ProfileMode.LINE, { nonNullable: true, validators: [Validators.required] }),
    powerPercent: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    speedMmPerMin: new FormControl(600, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    passes: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    lineSpacingMm: new FormControl<number | null>(0.1, { validators: [Validators.min(0)] }),
  });

  protected get isEditing(): boolean {
    return this.editingId !== null;
  }

  protected get isFillMode(): boolean {
    return this.form.controls.mode.value === ProfileMode.FILL;
  }

  openForCreate(materialId?: string): void {
    this.editingId = null;
    this.form.reset({
      materialId: materialId ?? this.materials()[0]?.id ?? '',
      name: '',
      color: PROFILE_COLOR_PALETTE[0],
      mode: ProfileMode.LINE,
      powerPercent: 100,
      speedMmPerMin: 600,
      passes: 1,
      lineSpacingMm: 0.1,
    });
    this.visible.set(true);
  }

  openForEdit(materialId: string, profile: Profile): void {
    this.editingId = profile.id;
    this.form.reset({
      materialId,
      name: profile.name,
      color: profile.color,
      mode: profile.mode,
      powerPercent: profile.powerPercent,
      speedMmPerMin: profile.speedMmPerMin,
      passes: profile.passes,
      lineSpacingMm: profile.lineSpacingMm ?? 0.1,
    });
    this.visible.set(true);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { materialId, ...value } = this.form.getRawValue();
    const payload: CreateProfileDto = {
      ...value,
      lineSpacingMm: value.mode === ProfileMode.FILL ? value.lineSpacingMm : null,
    };

    this.save.emit({ materialId, id: this.editingId, payload });
    this.visible.set(false);
  }

  cancel(): void {
    this.visible.set(false);
  }
}
