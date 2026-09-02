import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Scroller } from '@openng/optimus-ui/scroller';
import type { ScrollerScrollEvent } from '@openng/optimus-ui/types/scroller';
import { ToggleSwitch } from '@openng/optimus-ui/toggleswitch';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { formatMessageContent, formatTimestamp, TerminalMessage } from './terminal-message.model';
import { TerminalLogService } from './terminal-log.service';

/** Fixed row height (px) every `.terminal__entry` is styled to match — required by the virtual
 * scroller's layout math. */
const ROW_HEIGHT_PX = 22;

/** How far (in px) the log can be from its bottom edge and still count as "at the bottom" — needs
 * to be a few rows tall, not just a rounding fudge factor: sent/received pairs can arrive as
 * little as ~15ms apart, so a new row can land between our own scroll-to-bottom call and the
 * resulting scroll event, making the log briefly (and legitimately) a row or two short of the new
 * bottom. A real manual scroll (wheel or scrollbar) moves by far more than this. Index-based
 * detection (via onScrollIndexChange) isn't an alternative here either: with a small list, the
 * virtual scroller's tolerance buffer keeps the last item "rendered" even when scrolled to the
 * very top, so only the real pixel scroll position can tell manual scroll apart from autoscroll. */
const AUTOSCROLL_BOTTOM_TOLERANCE_PX = ROW_HEIGHT_PX * 3;

@Component({
  selector: 'app-terminal-panel',
  imports: [FormsModule, PrimeTemplate, Button, InputText, Scroller, ToggleSwitch, TablerIcon],
  templateUrl: './terminal-panel.html',
  styleUrl: './terminal-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminalPanel {
  private readonly log = inject(TerminalLogService);
  private readonly cutterSocket = inject(CutterSocketService);
  private readonly scroller = viewChild(Scroller);

  protected readonly messages = this.log.messages;
  protected readonly draft = signal('');
  protected readonly autoscroll = signal(true);
  protected readonly rowHeightPx = ROW_HEIGHT_PX;

  protected readonly formatTimestamp = formatTimestamp;
  protected readonly formatMessageContent = formatMessageContent;

  constructor() {
    // Keeps the log scrolled to its most recent entry whenever a message is added, but only
    // while autoscroll is on — otherwise new messages must not move the scroll position at all.
    // Uses the scroller's own native element directly (scrollTop = scrollHeight) rather than
    // scrollToIndex(): that method positions the target index at the top of the viewport and
    // only gets clamped down to the real bottom by the browser, which left the library's
    // internal state slightly out of sync with the actual scroll position (a ~1 row gap).
    effect(() => {
      const hasMessages = this.messages().length > 0;
      if (hasMessages && this.autoscroll()) {
        queueMicrotask(() => this.scrollToBottom());
      }
    });
  }

  protected send(): void {
    const value = this.draft().trim();
    if (!value) {
      return;
    }
    this.cutterSocket.sendCommand(value);
    this.draft.set('');
  }

  /** Our own auto-scroll always lands exactly at the bottom, so any scroll event that leaves the
   * log short of the bottom can only be a manual one (wheel or scrollbar drag) — turn autoscroll
   * off in that case. A manual scroll that happens to end at the bottom is left alone, since that
   * matches what autoscroll would do anyway. */
  protected onLogScroll(event: ScrollerScrollEvent): void {
    const element = event.originalEvent?.target as HTMLElement | undefined;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom > AUTOSCROLL_BOTTOM_TOLERANCE_PX) {
      this.autoscroll.set(false);
    }
  }

  protected clear(): void {
    this.log.clear();
  }

  /** Scrolls to the bottom, then does it again on the next frame: the virtual scroller can still
   * be settling its internal spacer/content sizing for a row that was just added when the first
   * assignment runs, which would otherwise leave the latest message partially clipped. */
  private scrollToBottom(): void {
    const element = this.scroller()?.elementViewChild?.nativeElement;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }

  /** Downloads the full log as `terminal.log`, one line per message:
   * `[<ISO 8601 timestamp>] <-> <content>`. */
  protected export(): void {
    const lines = this.messages().map((message) => this.formatLogLine(message));
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'terminal.log';
    link.click();
    URL.revokeObjectURL(url);
  }

  private formatLogLine(message: TerminalMessage): string {
    const timestamp = new Date(message.timestampMs).toISOString();
    const arrow = message.direction === 'sent' ? '->' : '<-';
    return `[${timestamp}] ${arrow} ${formatMessageContent(message)}`;
  }
}
