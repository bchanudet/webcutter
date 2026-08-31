import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TABLER_ICON_PATHS, TablerIconName } from './tabler-icon-paths';

@Component({
  selector: 'app-tabler-icon',
  template: `<svg
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    [attr.fill]="isFilled() ? 'currentColor' : 'none'"
    [attr.stroke]="isFilled() ? 'none' : 'currentColor'"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    [innerHTML]="markup()"
  ></svg>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex; line-height: 0;' },
})
export class TablerIcon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<TablerIconName>();
  readonly size = input(20);

  private readonly definition = computed(() => TABLER_ICON_PATHS[this.name()]);
  protected readonly isFilled = computed(() => this.definition().variant === 'filled');
  protected readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.definition().paths),
  );
}
