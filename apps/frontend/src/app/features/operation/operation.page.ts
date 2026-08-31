import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';

@Component({
  selector: 'app-operation-page',
  imports: [Card],
  templateUrl: './operation.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationPage {}
