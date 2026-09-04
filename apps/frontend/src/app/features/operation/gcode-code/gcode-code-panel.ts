import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Message } from '@openng/optimus-ui/message';
import { Scroller } from '@openng/optimus-ui/scroller';
import { SelectButton } from '@openng/optimus-ui/selectbutton';
import { catchError, map, of, switchMap } from 'rxjs';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { GcodeFileService } from '../gcode-file/gcode-file.service';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { CodeLine, parseCodeLines } from './gcode-code.model';

/** Fixed row height (px) every `.code-line` is styled to match — required by the virtual
 * scroller's layout math, same convention as `TerminalPanel`. */
const ROW_HEIGHT_PX = 22;

type LineStatus = 'pending' | 'sent' | 'current';

interface CodeRow extends CodeLine {
  status: LineStatus;
}

const FOLLOW_OPTION = [{ label: 'Follow progression', value: 'follow' }];

/** Read-only, syntax-highlighted view of the currently uploaded G-code file's actual text — the
 * "Viewer" tab shows the toolpath it draws, this one shows the program itself. While a job is
 * running, each line's leading icon reflects whether it's already been sent (green dot), is the
 * one currently in flight (purple arrow), or hasn't been reached yet (plain dot) — see
 * `CodeLine.sendableIndex` / `JobStatusPayload.currentLine` for how a raw line (including blanks
 * and comments, neither of which the job ever sends) is matched up to that count. */
@Component({
  selector: 'app-gcode-code-panel',
  imports: [FormsModule, Message, PrimeTemplate, Scroller, SelectButton, TablerIcon],
  templateUrl: './gcode-code-panel.html',
  styleUrl: './gcode-code-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GcodeCodePanel {
  private readonly gcodeFile = inject(GcodeFileService);
  private readonly cutterSocket = inject(CutterSocketService);
  private readonly scroller = viewChild(Scroller);

  protected readonly file = this.gcodeFile.current;
  protected readonly lines = signal<CodeLine[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly rowHeightPx = ROW_HEIGHT_PX;

  protected readonly followOptions = FOLLOW_OPTION;
  protected readonly followProgress = signal<string[]>(['follow']);

  protected readonly jobStatus = this.cutterSocket.jobStatus;

  protected readonly rows = computed<CodeRow[]>(() => {
    const job = this.jobStatus();
    return this.lines().map((line) => ({ ...line, status: this.statusFor(line, job) }));
  });

  constructor() {
    // Re-fetches the file's content whenever it changes (upload/delete, from any browser) — a
    // `switchMap` so a file changing again while a fetch is still in flight can't let a stale
    // response overwrite newer state.
    toObservable(this.file)
      .pipe(
        switchMap((file) => {
          if (!file) {
            return of({ lines: [] as CodeLine[], error: null as string | null });
          }
          return this.gcodeFile.fetchContent().pipe(
            map(({ content }) => ({ lines: parseCodeLines(content), error: null as string | null })),
            catchError(() => of({ lines: [] as CodeLine[], error: 'Could not load the G-code file.' })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ lines, error }) => {
        this.lines.set(lines);
        this.loadError.set(error);
      });

    // Keeps the currently in-flight line in view while a job is running, but only while "Follow
    // progression" is on — and only actually scrolls when that line isn't already visible, so it
    // doesn't fight a manual scroll the user made to glance elsewhere without turning the toggle
    // off first.
    effect(() => {
      const job = this.jobStatus();
      const following = this.followProgress().includes('follow');
      if (!following || !job.running) {
        return;
      }
      const rowIndex = this.lines().findIndex((line) => line.sendableIndex === job.currentLine);
      if (rowIndex !== -1) {
        this.scrollToRow(rowIndex);
      }
    });
  }

  private statusFor(line: CodeLine, job: { running: boolean; currentLine: number }): LineStatus {
    if (line.sendableIndex === null || !job.running) {
      return 'pending';
    }
    if (line.sendableIndex < job.currentLine) {
      return 'sent';
    }
    return line.sendableIndex === job.currentLine ? 'current' : 'pending';
  }

  /** Scrolls just enough to bring `rowIndex` back into view, roughly centered — a no-op if it's
   * already visible, so this doesn't yank the view on every single line the job advances through. */
  private scrollToRow(rowIndex: number): void {
    const element = this.scroller()?.elementViewChild?.nativeElement;
    if (!element) {
      return;
    }
    const rowTop = rowIndex * ROW_HEIGHT_PX;
    const rowBottom = rowTop + ROW_HEIGHT_PX;
    const viewTop = element.scrollTop;
    const viewBottom = viewTop + element.clientHeight;
    if (rowTop >= viewTop && rowBottom <= viewBottom) {
      return;
    }
    element.scrollTop = Math.max(0, rowTop - element.clientHeight / 2);
  }
}
