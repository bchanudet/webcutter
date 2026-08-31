import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MaterialsSection } from './materials/materials-section';

@Component({
  selector: 'app-configuration-page',
  imports: [MaterialsSection],
  templateUrl: './configuration.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPage {}
