import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem, PrimeTemplate } from '@openng/optimus-ui/api';
import { Menubar } from '@openng/optimus-ui/menubar';
import { TablerIcon } from '../shared/tabler-icon/tabler-icon';
import { TablerIconName } from '../shared/tabler-icon/tabler-icon-paths';

interface AppMenuItem extends MenuItem {
  iconName: TablerIconName;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PrimeTemplate, Menubar, TablerIcon],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly menuItems: AppMenuItem[] = [
    { label: 'Gcode', iconName: 'code', routerLink: '/gcode' },
    { label: 'Operation', iconName: 'building-factory-2', routerLink: '/operation' },
    { label: 'Configuration', iconName: 'settings', routerLink: '/configuration' },
  ];
}
