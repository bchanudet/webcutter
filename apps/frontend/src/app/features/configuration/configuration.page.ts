import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';

type ConfigurationTab = 'machine' | 'materials' | 'gcode';

@Component({
  selector: 'app-configuration-page',
  imports: [RouterOutlet, Tab, TabList, Tabs],
  templateUrl: './configuration.page.html',
  styleUrl: './configuration.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPage {
  private readonly router = inject(Router);

  /** Which tab is active, derived from the URL — kept in sync with `/configuration/materials` etc.
   * so navigating directly to a tab's URL activates the matching tab. */
  protected readonly activeTab = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.tabFromUrl()),
      startWith(this.tabFromUrl()),
    ),
    { requireSync: true },
  );

  private tabFromUrl(): ConfigurationTab {
    if (this.router.url.endsWith('/materials')) {
      return 'materials';
    }
    if (this.router.url.endsWith('/gcode')) {
      return 'gcode';
    }
    return 'machine';
  }

  protected navigateToTab(tab: ConfigurationTab): void {
    this.router.navigate(['/configuration', tab]);
  }
}
