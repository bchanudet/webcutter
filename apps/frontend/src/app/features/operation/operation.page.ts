import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { DividerModule } from '@openng/optimus-ui/divider';
import { Splitter } from '@openng/optimus-ui/splitter';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Toolbar } from '@openng/optimus-ui/toolbar';
import { TablerIcon } from '../../shared/tabler-icon/tabler-icon';
import { MachineStatusCard } from './machine-status/machine-status-card';
import { PositionCard } from './position/position-card';

type OperationTab = 'gcode' | 'terminal';

@Component({
  selector: 'app-operation-page',
  imports: [
    PrimeTemplate,
    Button,
    Card,
    DividerModule,
    MachineStatusCard,
    PositionCard,
    RouterOutlet,
    Splitter,
    Tab,
    TabList,
    Tabs,
    Toolbar,
    TablerIcon,
  ],
  templateUrl: './operation.page.html',
  styleUrl: './operation.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationPage {
  private readonly router = inject(Router);

  /** Which tab is active, derived from the URL — kept in sync with `/operation/gcode` and
   * `/operation/terminal` so navigating directly to either activates the matching tab. */
  protected readonly activeTab = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.tabFromUrl()),
      startWith(this.tabFromUrl()),
    ),
    { requireSync: true },
  );

  private tabFromUrl(): OperationTab {
    return this.router.url.endsWith('/terminal') ? 'terminal' : 'gcode';
  }

  protected navigateToTab(tab: OperationTab): void {
    this.router.navigate(['/operation', tab]);
  }
}
