import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ToggleSwitch } from '@openng/optimus-ui/toggleswitch';

export interface TestPatternParams {
  powerMinPercent: number;
  powerMaxPercent: number;
  speedMinMmPerSec: number;
  speedMaxMmPerSec: number;
  steps: number;
  includeMaterialLabel: boolean;
  includeLegends: boolean;
}

interface TestPatternForm {
  powerMinPercent: FormControl<number>;
  powerMaxPercent: FormControl<number>;
  speedMinMmPerSec: FormControl<number>;
  speedMaxMmPerSec: FormControl<number>;
  steps: FormControl<number>;
  includeMaterialLabel: FormControl<boolean>;
  includeLegends: FormControl<boolean>;
}

@Component({
  selector: 'app-test-pattern-dialog',
  imports: [Dialog, Button, InputNumber, ToggleSwitch, PrimeTemplate, ReactiveFormsModule],
  templateUrl: './test-pattern-dialog.html',
  styleUrl: './test-pattern-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestPatternDialog {
  /** The machine's own max feed rate (the smaller of its X/Y max speeds, same convention as
   * `framing.service.ts` on the backend) — used to seed the speed min/max defaults every time
   * the dialog opens. */
  readonly maxSpeedMmPerSec = input.required<number>();

  /** Fires with the form's current values when "Generate" is clicked — what it actually builds
   * isn't wired up yet. */
  readonly generate = output<TestPatternParams>();

  protected readonly visible = signal(false);

  protected readonly form = new FormGroup<TestPatternForm>({
    powerMinPercent: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    powerMaxPercent: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    speedMinMmPerSec: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.1)],
    }),
    speedMaxMmPerSec: new FormControl(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.1)],
    }),
    steps: new FormControl(5, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(2)],
    }),
    includeMaterialLabel: new FormControl(true, { nonNullable: true }),
    includeLegends: new FormControl(true, { nonNullable: true }),
  });

  /** Resets the form to its defaults (speed min/max seeded from the machine's own max feed rate)
   * and opens the dialog. */
  open(): void {
    const maxSpeed = this.maxSpeedMmPerSec();
    this.form.reset({
      powerMinPercent: 0,
      powerMaxPercent: 100,
      speedMinMmPerSec: Math.round(maxSpeed * 0.1 * 100) / 100,
      speedMaxMmPerSec: maxSpeed,
      steps: 5,
      includeMaterialLabel: true,
      includeLegends: true,
    });
    this.visible.set(true);
  }

  /** Doesn't close the dialog — generating a test pattern is meant to be repeated with tweaked
   * parameters on the same job, not a one-shot action. */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.generate.emit(this.form.getRawValue());
  }

  cancel(): void {
    this.visible.set(false);
  }
}
