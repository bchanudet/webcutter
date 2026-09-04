import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { InputText } from '@openng/optimus-ui/inputtext';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { CreateMaterialDto, Material } from '@webcutter/shared';

export interface MaterialSaveEvent {
  id: string | null;
  payload: CreateMaterialDto;
}

@Component({
  selector: 'app-material-form-dialog',
  imports: [Dialog, Button, InputText, InputNumber, PrimeTemplate, ReactiveFormsModule],
  templateUrl: './material-form-dialog.html',
  styleUrl: './material-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialFormDialog {
  readonly save = output<MaterialSaveEvent>();

  protected readonly visible = signal(false);
  private editingId: string | null = null;

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
    thicknessMm: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });

  protected get isEditing(): boolean {
    return this.editingId !== null;
  }

  openForCreate(): void {
    this.editingId = null;
    this.form.reset({ name: '', thicknessMm: 1 });
    this.visible.set(true);
  }

  openForEdit(material: Material): void {
    this.editingId = material.id;
    this.form.reset({ name: material.name, thicknessMm: material.thicknessMm });
    this.visible.set(true);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.save.emit({ id: this.editingId, payload: this.form.getRawValue() });
    this.visible.set(false);
  }

  cancel(): void {
    this.visible.set(false);
  }
}
