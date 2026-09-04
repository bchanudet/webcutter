import { Route } from '@angular/router';
import { Shell } from './shell/shell';
import { SvgToGcodePage } from './features/svg-to-gcode/svg-to-gcode.page';
import { OperationPage } from './features/operation/operation.page';
import { GcodeCodePanel } from './features/operation/gcode-code/gcode-code-panel';
import { GcodeViewerPanel } from './features/operation/gcode-viewer/gcode-viewer-panel';
import { TerminalPanel } from './features/operation/terminal/terminal-panel';
import { ConfigurationPage } from './features/configuration/configuration.page';

export const appRoutes: Route[] = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'gcode', pathMatch: 'full' },
      { path: 'gcode', component: SvgToGcodePage, title: 'Gcode' },
      {
        path: 'operation',
        component: OperationPage,
        title: 'Operation',
        children: [
          { path: '', redirectTo: 'gcode', pathMatch: 'full' },
          { path: 'gcode', component: GcodeViewerPanel, title: 'Operation · Viewer' },
          { path: 'code', component: GcodeCodePanel, title: 'Operation · Code' },
          { path: 'terminal', component: TerminalPanel, title: 'Operation · Terminal' },
        ],
      },
      { path: 'configuration', component: ConfigurationPage, title: 'Configuration' },
    ],
  },
];
