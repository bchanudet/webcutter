import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GcodeSection } from './gcode/gcode-section';
import { MachineSection } from './machine/machine-section';
import { MaterialsSection } from './materials/materials-section';

@Component({
  selector: 'app-configuration-page',
  imports: [MachineSection, MaterialsSection, GcodeSection],
  templateUrl: './configuration.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPage {}
