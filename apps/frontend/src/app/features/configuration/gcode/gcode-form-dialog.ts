import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { InputText } from '@openng/optimus-ui/inputtext';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { Select } from '@openng/optimus-ui/select';
import { Textarea } from '@openng/optimus-ui/textarea';
import { Gcode, GcodeHook, GcodePayload } from './gcode.model';

export interface GcodeSaveEvent {
  id: number | null;
  payload: GcodePayload;
}

interface HookOption {
  label: string;
  value: GcodeHook;
}

const HOOK_OPTIONS: HookOption[] = [
  { label: 'Start of document', value: 'start' },
  { label: 'End of document', value: 'end' },
];

@Component({
  selector: 'app-gcode-form-dialog',
  imports: [Dialog, Button, InputText, InputNumber, Select, Textarea, PrimeTemplate, ReactiveFormsModule],
  templateUrl: './gcode-form-dialog.html',
  styleUrl: './gcode-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeFormDialog {
  readonly save = output<GcodeSaveEvent>();

  protected readonly hookOptions = HOOK_OPTIONS;
  protected readonly visible = signal(false);
  private editingId: number | null = null;

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1), Validators.maxLength(255)],
    }),
    hook: new FormControl<GcodeHook>('start', { nonNullable: true, validators: [Validators.required] }),
    order: new FormControl(0, { nonNullable: true, validators: [Validators.required] }),
    code: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected get isEditing(): boolean {
    return this.editingId !== null;
  }

  openForCreate(): void {
    this.editingId = null;
    this.form.reset({ name: '', hook: 'start', order: 0, code: '' });
    this.visible.set(true);
  }

  openForEdit(gcode: Gcode): void {
    this.editingId = gcode.id;
    this.form.reset({ name: gcode.name, hook: gcode.hook, order: gcode.order, code: gcode.code });
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
