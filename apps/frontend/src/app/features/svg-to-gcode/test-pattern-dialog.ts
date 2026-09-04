import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { Select } from '@openng/optimus-ui/select';
import { SelectButton } from '@openng/optimus-ui/selectbutton';
import { ToggleSwitch } from '@openng/optimus-ui/toggleswitch';
import { Material, ProfileMode } from '@webcutter/shared';
import { TestPatternShape } from './test-pattern-generator.service';

export interface TestPatternParams {
  mode: ProfileMode;
  shape: TestPatternShape;
  materialId: string;
  powerMinPercent: number;
  powerMaxPercent: number;
  speedMinMmPerMin: number;
  speedMaxMmPerMin: number;
  steps: number;
  includeMaterialLabel: boolean;
  includeLegends: boolean;
}

interface TestPatternForm {
  mode: FormControl<ProfileMode>;
  shape: FormControl<TestPatternShape>;
  materialId: FormControl<string | null>;
  powerMinPercent: FormControl<number>;
  powerMaxPercent: FormControl<number>;
  speedMinMmPerMin: FormControl<number>;
  speedMaxMmPerMin: FormControl<number>;
  steps: FormControl<number>;
  includeMaterialLabel: FormControl<boolean>;
  includeLegends: FormControl<boolean>;
}

const MODE_OPTIONS: { label: string; value: ProfileMode }[] = [
  { label: 'Cut', value: ProfileMode.LINE },
  { label: 'Fill', value: ProfileMode.FILL },
];

const SHAPE_OPTIONS: { label: string; value: TestPatternShape }[] = [
  { label: 'Square', value: 'square' },
  { label: 'Circle', value: 'circle' },
];

@Component({
  selector: 'app-test-pattern-dialog',
  imports: [Dialog, Button, InputNumber, Select, SelectButton, ToggleSwitch, PrimeTemplate, ReactiveFormsModule],
  templateUrl: './test-pattern-dialog.html',
  styleUrl: './test-pattern-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestPatternDialog {
  /** The machine's own max feed rate (the smaller of its X/Y max speeds, same convention as
   * `framing.service.ts` on the backend) — used to seed the speed min/max defaults every time
   * the dialog opens. */
  readonly maxSpeedMmPerMin = input.required<number>();
  /** Materials available to generate the pattern for — the same list the workspace's own
   * material dropdown uses. */
  readonly materials = input.required<Material[]>();
  /** Whether generation is currently in flight (legend text is rendered by the backend, see
   * `TestPatternGeneratorService`) — disables "Generate" and shows a spinner instead of letting
   * the user fire off overlapping requests. */
  readonly generating = input(false);

  /** Fires with the form's current values when "Generate" is clicked. */
  readonly generate = output<TestPatternParams>();

  protected readonly visible = signal(false);
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly shapeOptions = SHAPE_OPTIONS;
  protected readonly materialOptions = computed(() =>
    this.materials().map((material) => ({
      label: `${material.name} (${material.thicknessMm} mm)`,
      value: material.id,
    })),
  );

  protected readonly form = new FormGroup<TestPatternForm>({
    mode: new FormControl<ProfileMode>(ProfileMode.LINE, { nonNullable: true }),
    shape: new FormControl<TestPatternShape>('square', { nonNullable: true }),
    materialId: new FormControl<string | null>(null, { validators: [Validators.required] }),
    powerMinPercent: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    powerMaxPercent: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    speedMinMmPerMin: new FormControl(60, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(6)],
    }),
    speedMaxMmPerMin: new FormControl(600, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(6)],
    }),
    steps: new FormControl(5, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(2)],
    }),
    includeMaterialLabel: new FormControl(true, { nonNullable: true }),
    includeLegends: new FormControl(true, { nonNullable: true }),
  });

  /** Resets the form to its defaults (speed min/max seeded from the machine's own max feed rate,
   * material defaulting to the first one available) and opens the dialog. */
  open(): void {
    const maxSpeed = this.maxSpeedMmPerMin();
    this.form.reset({
      mode: ProfileMode.LINE,
      shape: 'square',
      materialId: this.materials()[0]?.id ?? null,
      powerMinPercent: 10,
      powerMaxPercent: 100,
      speedMinMmPerMin: Math.round(maxSpeed * 0.1 * 100) / 100,
      speedMaxMmPerMin: maxSpeed,
      steps: 5,
      includeMaterialLabel: true,
      includeLegends: true,
    });
    this.visible.set(true);
  }

  /** Doesn't close the dialog on its own — the caller calls `close()` once generation actually
   * succeeds (see `SvgToGcodePage.onGenerateTestPattern`), so a failed attempt (surfaced as a
   * notification, not an inline error here) leaves the form as-is to retry. */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.generate.emit({ ...raw, materialId: raw.materialId as string });
  }

  close(): void {
    this.visible.set(false);
  }

  cancel(): void {
    this.visible.set(false);
  }
}
