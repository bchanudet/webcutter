import { Route } from '@angular/router';
import { Shell } from './shell/shell';
import { SvgToGcodePage } from './features/svg-to-gcode/svg-to-gcode.page';
import { OperationPage } from './features/operation/operation.page';
import { ConfigurationPage } from './features/configuration/configuration.page';

export const appRoutes: Route[] = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'gcode', pathMatch: 'full' },
      { path: 'gcode', component: SvgToGcodePage, title: 'Gcode' },
      { path: 'operation', component: OperationPage, title: 'Operation' },
      { path: 'configuration', component: ConfigurationPage, title: 'Configuration' },
    ],
  },
];
