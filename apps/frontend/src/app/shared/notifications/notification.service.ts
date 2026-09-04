import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export type NotificationSeverity = 'info' | 'success' | 'warn' | 'danger';

export interface Notification {
  id: string;
  severity: NotificationSeverity;
  /** Short label identifying where the notification came from (e.g. "GRBL connection", "Job"). */
  origin: string;
  /** Short headline. */
  summary: string;
  /** Longer, free-form description. */
  message: string;
}

export type NotificationInput = Omit<Notification, 'id'>;

/** Highest-to-lowest urgency, used to rank the worst severity among several notifications (see
 * `Shell`'s bell badge, which needs a single severity to color itself with). */
const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  danger: 3,
  warn: 2,
  success: 1,
  info: 0,
};

let nextId = 0;

/** App-wide notification store, injectable from any component/service. Notifications pile up
 * here until individually or fully cleared — `Shell` is the only thing that actually renders them
 * (as toasts as they come in, and as a list in the bell popover), so anything else that needs to
 * surface something to the user just calls `notify()` without knowing/caring how it's displayed. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _notifications = signal<Notification[]>([]);
  readonly notifications = this._notifications.asReadonly();

  /** Fires once per `notify()` call — unlike `notifications`, clearing doesn't emit here, so this
   * is what a toast bridge (see `Shell`) should subscribe to instead of diffing the list itself. */
  readonly added$ = new Subject<Notification>();

  notify(notification: NotificationInput): void {
    const entry: Notification = { id: `notification-${nextId++}`, ...notification };
    this._notifications.update((notifications) => [...notifications, entry]);
    this.added$.next(entry);
  }

  clear(id: string): void {
    this._notifications.update((notifications) => notifications.filter((notification) => notification.id !== id));
  }

  clearAll(): void {
    this._notifications.set([]);
  }
}

/** The most urgent severity among `notifications`, for a single badge/icon color — `null` if the
 * list is empty. */
export function highestSeverity(notifications: readonly Notification[]): NotificationSeverity | null {
  return notifications.reduce<NotificationSeverity | null>((worst, notification) => {
    if (!worst || SEVERITY_RANK[notification.severity] > SEVERITY_RANK[worst]) {
      return notification.severity;
    }
    return worst;
  }, null);
}
