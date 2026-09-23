import { Route } from '@angular/router';
import { Shell } from './shell/shell';
import { SvgToGcodePage } from './features/svg-to-gcode/svg-to-gcode.page';
import { OperationPage } from './features/operation/operation.page';
import { GcodeCodePanel } from './features/operation/gcode-code/gcode-code-panel';
import { GcodeViewerPanel } from './features/operation/gcode-viewer/gcode-viewer-panel';
import { TerminalPanel } from './features/operation/terminal/terminal-panel';
import { ConfigurationPage } from './features/configuration/configuration.page';
import { GcodeSection } from './features/configuration/gcode/gcode-section';
import { MachineSection } from './features/configuration/machine/machine-section';
import { MaterialsSection } from './features/configuration/materials/materials-section';
import { HistoryPage } from './features/history/history.page';

export const appRoutes: Route[] = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'design', pathMatch: 'full' },
      { path: 'design', component: SvgToGcodePage, title: 'Design' },
      {
        path: 'operation',
        component: OperationPage,
        title: 'Operation',
        children: [
          { path: '', redirectTo: 'viewer', pathMatch: 'full' },
          { path: 'viewer', component: GcodeViewerPanel, title: 'Operation · Viewer' },
          { path: 'code', component: GcodeCodePanel, title: 'Operation · Code' },
          { path: 'terminal', component: TerminalPanel, title: 'Operation · Terminal' },
        ],
      },
      {
        path: 'configuration',
        component: ConfigurationPage,
        title: 'Configuration',
        children: [
          { path: '', redirectTo: 'machine', pathMatch: 'full' },
          { path: 'machine', component: MachineSection, title: 'Configuration · Machine' },
          { path: 'materials', component: MaterialsSection, title: 'Configuration · Materials' },
          { path: 'gcode', component: GcodeSection, title: 'Configuration · Custom G-code' },
        ],
      },
      { path: 'history', component: HistoryPage, title: 'History' },
    ],
  },
];
