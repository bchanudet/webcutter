import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { ToggleSwitch } from '@openng/optimus-ui/toggleswitch';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { CutterSocketService } from '../machine-status/cutter-socket.service';
import { formatMessageContent, formatTimestamp } from './terminal-message.model';
import { TerminalLogService } from './terminal-log.service';

/** How far (in px) the log can be from its bottom edge and still count as "at the bottom" —
 * accounts for sub-pixel rounding, not meant to tolerate an actual manual scroll. */
const AUTOSCROLL_BOTTOM_TOLERANCE_PX = 2;

@Component({
  selector: 'app-terminal-panel',
  imports: [FormsModule, Button, InputText, ToggleSwitch, TablerIcon],
  templateUrl: './terminal-panel.html',
  styleUrl: './terminal-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminalPanel {
  private readonly log = inject(TerminalLogService);
  private readonly cutterSocket = inject(CutterSocketService);
  private readonly logContainer = viewChild<ElementRef<HTMLDivElement>>('logContainer');

  protected readonly messages = this.log.messages;
  protected readonly draft = signal('');
  protected readonly autoscroll = signal(true);

  protected readonly formatTimestamp = formatTimestamp;
  protected readonly formatMessageContent = formatMessageContent;

  constructor() {
    // Keeps the log scrolled to its most recent entry whenever a message is added, but only
    // while autoscroll is on — otherwise new messages must not move the scroll position at all.
    effect(() => {
      this.messages();
      if (this.autoscroll()) {
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
  protected onLogScroll(): void {
    const element = this.logContainer()?.nativeElement;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom > AUTOSCROLL_BOTTOM_TOLERANCE_PX) {
      this.autoscroll.set(false);
    }
  }

  private scrollToBottom(): void {
    const element = this.logContainer()?.nativeElement;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }
}
