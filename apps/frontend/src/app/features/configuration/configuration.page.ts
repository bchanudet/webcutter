import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MachineSection } from './machine/machine-section';
import { MaterialsSection } from './materials/materials-section';

@Component({
  selector: 'app-configuration-page',
  imports: [MachineSection, MaterialsSection],
  templateUrl: './configuration.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPage {}
