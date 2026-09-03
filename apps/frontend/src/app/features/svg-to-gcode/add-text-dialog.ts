import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Message } from '@openng/optimus-ui/message';
import { Slider } from '@openng/optimus-ui/slider';
import { FontApiService } from './font-api.service';

export interface TextInsertedEvent {
  text: string;
  svg: string;
}

/** Bounds for the "Text height" slider — a generous range for a laser-cut/engraved text label,
 * not tied to the machine bed size (a too-tall result is just an oversized document, same as any
 * other loaded SVG). */
const MIN_HEIGHT_MM = 1;
const MAX_HEIGHT_MM = 200;
const DEFAULT_HEIGHT_MM = 10;

@Component({
  selector: 'app-add-text-dialog',
  imports: [Dialog, Button, InputText, Message, Slider, PrimeTemplate, ReactiveFormsModule],
  templateUrl: './add-text-dialog.html',
  styleUrl: './add-text-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddTextDialog {
  private readonly fontApi = inject(FontApiService);

  protected readonly minHeightMm = MIN_HEIGHT_MM;
  protected readonly maxHeightMm = MAX_HEIGHT_MM;

  /** Fires once the backend has turned the typed text into an SVG — the caller inserts it into
   * the workspace exactly like an uploaded file. */
  readonly inserted = output<TextInsertedEvent>();

  protected readonly visible = signal(false);
  protected readonly inserting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = new FormGroup({
    text: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1)] }),
    heightMm: new FormControl(DEFAULT_HEIGHT_MM, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(MIN_HEIGHT_MM), Validators.max(MAX_HEIGHT_MM)],
    }),
  });

  open(): void {
    this.form.reset({ text: '', heightMm: DEFAULT_HEIGHT_MM });
    this.errorMessage.set(null);
    this.visible.set(true);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { text, heightMm } = this.form.getRawValue();
    this.inserting.set(true);
    this.errorMessage.set(null);
    this.fontApi.textToSvg(text, heightMm).subscribe({
      next: ({ svg }) => {
        this.inserting.set(false);
        this.visible.set(false);
        this.inserted.emit({ text, svg });
      },
      error: (error: unknown) => {
        this.inserting.set(false);
        this.errorMessage.set(
          (error as { error?: { message?: string } })?.error?.message ?? 'Could not generate the text.',
        );
      },
    });
  }

  cancel(): void {
    this.visible.set(false);
  }
}
