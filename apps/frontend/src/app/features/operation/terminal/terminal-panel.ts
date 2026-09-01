import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { TablerIcon } from '../../../shared/tabler-icon/tabler-icon';
import { formatMessageContent, formatTimestamp } from './terminal-message.model';
import { TerminalLogService } from './terminal-log.service';

@Component({
  selector: 'app-terminal-panel',
  imports: [FormsModule, Button, InputText, TablerIcon],
  templateUrl: './terminal-panel.html',
  styleUrl: './terminal-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminalPanel {
  private readonly log = inject(TerminalLogService);
  private readonly logContainer = viewChild<ElementRef<HTMLDivElement>>('logContainer');

  protected readonly messages = this.log.messages;
  protected readonly draft = signal('');

  protected readonly formatTimestamp = formatTimestamp;
  protected readonly formatMessageContent = formatMessageContent;

  constructor() {
    // Keeps the log scrolled to its most recent entry whenever a message is added.
    effect(() => {
      this.messages();
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  protected send(): void {
    const value = this.draft().trim();
    if (!value) {
      return;
    }
    this.log.recordSent(value);
    this.draft.set('');
  }

  private scrollToBottom(): void {
    const element = this.logContainer()?.nativeElement;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }
}
