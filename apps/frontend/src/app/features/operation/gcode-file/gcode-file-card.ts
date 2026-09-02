import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { formatFileSize } from './gcode-file.model';
import { GcodeFileService } from './gcode-file.service';

@Component({
  selector: 'app-gcode-file-card',
  imports: [Button, Card],
  templateUrl: './gcode-file-card.html',
  styleUrl: './gcode-file-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeFileCard {
  private readonly gcodeFile = inject(GcodeFileService);

  protected readonly file = this.gcodeFile.current;
  protected readonly formatFileSize = formatFileSize;
}
