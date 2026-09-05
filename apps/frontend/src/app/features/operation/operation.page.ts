import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Splitter } from '@openng/optimus-ui/splitter';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Toolbar } from '@openng/optimus-ui/toolbar';
import { TablerIcon } from '../../shared/tabler-icon/tabler-icon';
import { GcodeFileCard } from './gcode-file/gcode-file-card';
import { GcodeFileService } from './gcode-file/gcode-file.service';
import { MachineStatusCard } from './machine-status/machine-status-card';
import { PositionCard } from './position/position-card';

type OperationTab = 'viewer' | 'code' | 'terminal';

@Component({
  selector: 'app-operation-page',
  imports: [
    PrimeTemplate,
    Button,
    GcodeFileCard,
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
  private readonly gcodeFile = inject(GcodeFileService);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly currentGcodeFile = this.gcodeFile.current;

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
    if (this.router.url.endsWith('/terminal')) {
      return 'terminal';
    }
    if (this.router.url.endsWith('/code')) {
      return 'code';
    }
    return 'viewer';
  }

  protected navigateToTab(tab: OperationTab): void {
    this.router.navigate(['/operation', tab]);
  }

  protected openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.gcodeFile.upload(file).subscribe();
  }

  protected deleteGcodeFile(): void {
    this.gcodeFile.delete();
  }
}
