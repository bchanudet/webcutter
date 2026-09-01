import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-gcode-viewer-panel',
  templateUrl: './gcode-viewer-panel.html',
  styleUrl: './gcode-viewer-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeViewerPanel {}
