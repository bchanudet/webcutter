import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Accordion, AccordionContent, AccordionHeader, AccordionPanel } from '@openng/optimus-ui/accordion';
import { InputGroupModule } from '@openng/optimus-ui/inputgroup';
import { InputGroupAddonModule } from '@openng/optimus-ui/inputgroupaddon';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { InputText } from '@openng/optimus-ui/inputtext';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { Message } from '@openng/optimus-ui/message';
import { Select } from '@openng/optimus-ui/select';
import { ToggleSwitch } from '@openng/optimus-ui/toggleswitch';
import { parseLbdevProfile } from './lbdev-import';
import { MachineApiService } from './machine-api.service';
import { GcodeOrigin, SerialParity } from '@webcutter/shared';

interface ParityOption {
  label: string;
  value: SerialParity;
}

const PARITY_OPTIONS: ParityOption[] = [
  { label: 'None', value: SerialParity.NONE },
  { label: 'Even', value: SerialParity.EVEN },
  { label: 'Odd', value: SerialParity.ODD },
];

interface OriginOption {
  label: string;
  value: GcodeOrigin;
}

const ORIGIN_OPTIONS: OriginOption[] = [
  { label: 'Bottom Left', value: GcodeOrigin.BOTTOM_LEFT },
  { label: 'Top Left', value: GcodeOrigin.TOP_LEFT },
  { label: 'Top Right', value: GcodeOrigin.TOP_RIGHT },
  { label: 'Bottom Right', value: GcodeOrigin.BOTTOM_RIGHT },
  { label: 'Center', value: GcodeOrigin.CENTER },
];

@Component({
  selector: 'app-machine-section',
  imports: [
    Card,
    Button,
    InputText,
    InputNumber,
    Select,
    Message,
    ToggleSwitch,
    Accordion,
    AccordionPanel,
    AccordionHeader,
    AccordionContent,
    ReactiveFormsModule,
    InputGroupModule, InputGroupAddonModule
  ],
  templateUrl: './machine-section.html',
  styleUrl: './machine-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineSection {
  private readonly api = inject(MachineApiService);

  private readonly lbdevInput = viewChild.required<ElementRef<HTMLInputElement>>('lbdevInput');

  protected readonly parityOptions = PARITY_OPTIONS;
  protected readonly originOptions = ORIGIN_OPTIONS;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savedMessage = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
    bedWidthMm: new FormControl(400, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    bedHeightMm: new FormControl(400, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    serialPortPath: new FormControl('/dev/ttyUSB0', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
    baudRate: new FormControl(115200, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    dataBits: new FormControl(8, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(5)],
    }),
    stopBits: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    parity: new FormControl<SerialParity>(SerialParity.NONE, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    mirrorX: new FormControl(false, { nonNullable: true }),
    mirrorY: new FormControl(false, { nonNullable: true }),
    origin: new FormControl<GcodeOrigin>(GcodeOrigin.BOTTOM_LEFT, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    offsetXMm: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    offsetYMm: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    maxAccelerationXMmPerSec2: new FormControl(500, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    maxAccelerationYMmPerSec2: new FormControl(500, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    maxSpeedXMmPerMin: new FormControl(12000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    maxSpeedYMmPerMin: new FormControl(12000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    travelSpeedXMmPerMin: new FormControl(12000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    travelSpeedYMmPerMin: new FormControl(12000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    sMax: new FormControl(1000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
  });

  constructor() {
    this.refresh();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.savedMessage.set(false);
    this.api.updateMachine(this.form.getRawValue()).subscribe({
      next: (machine) => {
        this.form.reset(machine);
        this.saving.set(false);
        this.savedMessage.set(true);
      },
      error: () => {
        this.errorMessage.set('Could not save the machine settings.');
        this.saving.set(false);
      },
    });
  }

  protected triggerLbdevImport(): void {
    this.lbdevInput().nativeElement.click();
  }

  protected async onLbdevFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const values = parseLbdevProfile(await file.text());
      this.form.patchValue(values);
      this.errorMessage.set(null);
    } catch {
      this.errorMessage.set('The lbdev file is invalid or unreadable.');
    }
  }

  private refresh(): void {
    this.loading.set(true);
    this.api.getMachine().subscribe({
      next: (machine) => {
        this.form.reset(machine);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load the machine settings.');
        this.loading.set(false);
      },
    });
  }
}
