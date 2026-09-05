import { ChangeDetectionStrategy, Component, computed, effect, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem, MessageService, PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Menubar } from '@openng/optimus-ui/menubar';
import { Message } from '@openng/optimus-ui/message';
import { OverlayBadge } from '@openng/optimus-ui/overlaybadge';
import { Popover } from '@openng/optimus-ui/popover';
import { Toast } from '@openng/optimus-ui/toast';
import { MessageSeverity } from '@openng/optimus-ui/types/message';
import { CutterSocketService } from '../features/operation/machine-status/cutter-socket.service';
import { describeAlarm } from '../features/operation/machine-status/machine-status.model';
import {
  highestSeverity,
  Notification,
  NotificationService,
  NotificationSeverity,
} from '../shared/notifications/notification.service';
import { TablerIcon } from '../shared/tabler-icon/tabler-icon';
import { TablerIconName } from '../shared/tabler-icon/tabler-icon-paths';
import { MachineStatusFlashcard } from './machine-status-flashcard/machine-status-flashcard';

interface AppMenuItem extends MenuItem {
  iconName: TablerIconName;
}

/** `NotificationSeverity` (this app's own, badge-friendly vocabulary) uses "danger" where Optimus
 * UI's `p-message`/toast severity uses "error" — everything else lines up. */
function toMessageSeverity(severity: NotificationSeverity): MessageSeverity {
  return severity === 'danger' ? 'error' : severity;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    PrimeTemplate,
    Button,
    Menubar,
    Message,
    OverlayBadge,
    Popover,
    Toast,
    TablerIcon,
    MachineStatusFlashcard,
  ],
  providers: [MessageService],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly notificationService = inject(NotificationService);
  private readonly messageService = inject(MessageService);
  private readonly cutterSocket = inject(CutterSocketService);

  private readonly notificationsPopover = viewChild.required(Popover);

  protected readonly menuItems: AppMenuItem[] = [
    { label: 'Design', iconName: 'code', routerLink: '/design' },
    { label: 'Operation', iconName: 'building-factory-2', routerLink: '/operation' },
    { label: 'Configuration', iconName: 'settings', routerLink: '/configuration' },
    { label: 'History', iconName: 'history', routerLink: '/history' },
  ];

  protected readonly notifications = this.notificationService.notifications;
  protected readonly notificationCount = computed(() => this.notifications().length);
  /** `NotificationSeverity` values ('info'/'success'/'warn'/'danger') are all valid `BadgeSeverity`
   * values too, so the bell's overlay badge can use it directly — unlike `p-message`/toast, which
   * need `toMessageSeverity()`'s "danger" -> "error" translation instead. */
  protected readonly notificationBadgeSeverity = computed<NotificationSeverity | undefined>(
    () => highestSeverity(this.notifications()) ?? undefined,
  );

  protected readonly toMessageSeverity = toMessageSeverity;

  constructor() {
    // Every notification the app receives is shown as a toast the moment it comes in — clearing
    // (individually or all) only affects the persistent list in the bell popover, not toasts
    // already shown/dismissed.
    this.notificationService.added$.pipe(takeUntilDestroyed()).subscribe((notification: Notification) => {
      this.messageService.add({
        severity: toMessageSeverity(notification.severity),
        summary: `${notification.origin} — ${notification.summary}`,
        detail: notification.message,
      });
    });

    // The three effects below live here (rather than on the Operation page's own status/file
    // cards) specifically so they fire regardless of which page is currently open — e.g. an alarm
    // tripping, or a job finishing, while the user has gone back to the Gcode page to prepare the
    // next one. `MachineStatusCard`/`GcodeFileCard` still show their own pinned, page-local state.

    // Alarm-transition toast: only on the transition *into* a (new) alarm reason, not on every
    // status poll while it stays alarmed. `CutterGateway.handleConnection` sends the *current*
    // status straight to a freshly (re)connected client, bypassing broadcast dedupe — so on a
    // plain page load, the very first `status()` this client ever sees can already say "Alarm" for
    // something that tripped long before this tab existed. `sawNonAlarmState` guards against
    // exactly that: it only flips true once we've actually observed the machine in a confirmed
    // non-alarm GRBL state (not just "no grbl data yet", which starts `grbl` at `null`), so a
    // pre-existing alarm inherited from the initial sync is never mistaken for a live transition —
    // only an alarm that trips *after* we've seen the machine not-alarmed gets a toast. Connection
    // errors don't get a toast at all — the flashcard's status tag already surfaces those.
    let sawNonAlarmState = false;
    let previousAlarmReason: string | null = null;
    effect(() => {
      const grbl = this.cutterSocket.status().grbl;
      if (grbl && grbl.state !== 'Alarm') {
        sawNonAlarmState = true;
      }
      const reason = grbl?.state === 'Alarm' ? describeAlarm(grbl.alarmCode) : null;
      if (sawNonAlarmState && reason && reason !== previousAlarmReason) {
        this.notificationService.notify({
          severity: 'danger',
          origin: 'Machine',
          summary: 'Alarm triggered',
          message: reason,
        });
      }
      previousAlarmReason = reason;
    });

    // Job-end toast (success or failure) on the transition out of "running" — `jobStatus().error`
    // is only ever set once a job actually stops (see the backend's `JobService`), so `null` there
    // means a clean finish. Unlike the alarm/check effects below, this one doesn't need extra
    // guarding against `CutterGateway`'s connect-time resync: `previousJobRunning` starts `false`,
    // matching the common "nothing running" case, and even if a job actually *is* running at
    // connection time, that's simply observed as the transition's starting edge — there's no way
    // for a job that already fully finished before this tab connected to look like a fresh one.
    let previousJobRunning = false;
    effect(() => {
      const job = this.cutterSocket.jobStatus();
      if (!job.running && previousJobRunning) {
        if (job.error) {
          this.notificationService.notify({
            severity: 'danger',
            origin: 'Job',
            summary: 'Job failed',
            message: job.error,
          });
        } else {
          this.notificationService.notify({
            severity: 'success',
            origin: 'Job',
            summary: 'Job complete',
            message: job.fileName ? `"${job.fileName}" finished successfully.` : 'The job finished successfully.',
          });
        }
      }
      previousJobRunning = job.running;
    });

    // Check-success toast — a failed check stays pinned on `GcodeFileCard` instead (actionable
    // right there next to the "Check" button), but a passing one is only interesting as a
    // heads-up. Same "observed the start" gating as the job effect above, for the same reason:
    // `CutterGateway.handleConnection` also sends the *current* checkResult straight to a freshly
    // (re)connected client, which could otherwise replay a check that finished long before this
    // tab ever connected as if it had just happened.
    let sawCheckRunning = false;
    effect(() => {
      const status = this.cutterSocket.checkStatus();
      if (status.running) {
        sawCheckRunning = true;
        return;
      }
      if (sawCheckRunning && status.result?.ok) {
        this.notificationService.notify({
          severity: 'success',
          origin: 'Check',
          summary: 'Check passed',
          message: status.result.message,
        });
      }
      sawCheckRunning = false;
    });
  }

  protected openNotificationsPopover(event: Event): void {
    this.notificationsPopover().show(event);
  }

  protected clearNotification(id: string): void {
    this.notificationService.clear(id);
  }

  protected clearAllNotifications(): void {
    this.notificationService.clearAll();
  }
}
