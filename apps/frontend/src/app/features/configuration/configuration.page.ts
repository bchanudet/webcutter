import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';

@Component({
  selector: 'app-configuration-page',
  imports: [Card],
  templateUrl: './configuration.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPage {}
