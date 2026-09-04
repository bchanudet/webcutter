import { ChangeDetectionStrategy, Component, output, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Popover } from '@openng/optimus-ui/popover';

/** Small popover prompting for a file name before a download actually happens — without it, the
 * toolbar's "Save workspace SVG"/"Download G-code" buttons always saved as a literal
 * "workspace.svg"/"workspace.gcode", which the browser then silently disambiguates
 * ("workspace (1).svg", ...) on every repeat download, making the files hard to tell apart or
 * rename afterwards. Shared by both buttons — see `SvgToGcodePage`, which tracks which one is
 * pending and branches on the confirmed name accordingly. */
@Component({
  selector: 'app-filename-popover',
  imports: [Button, InputText, Popover, ReactiveFormsModule],
  templateUrl: './filename-popover.html',
  styleUrl: './filename-popover.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilenamePopover {
  private readonly popover = viewChild.required(Popover);

  /** Fires with the final file name (base name + extension) once the user confirms. */
  readonly confirmed = output<string>();

  protected extension = '';

  // A lone `FormControl` bound via `[formControl]` on the `<input>` with no `[formGroup]` on the
  // `<form>` itself leaves nothing to intercept the native `submit` event — `(ngSubmit)` never
  // fires and the browser falls back to actually submitting the form (a page reload). Wrapping it
  // in a `FormGroup` bound via `[formGroup]` on the `<form>`, the same pattern every other form in
  // this app uses, is what lets Angular's `FormGroupDirective` call `preventDefault()`.
  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
  });

  /** Opens the popover anchored to the triggering click event, seeding the field with
   * `defaultName` (without its extension — `extension`, e.g. ".svg", is fixed and appended back
   * on confirm rather than being itself editable, so the download always keeps the right file
   * type). */
  open(event: Event, defaultName: string, extension: string): void {
    this.extension = extension;
    this.form.setValue({ name: defaultName });
    this.popover().show(event);
  }

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.popover().hide();
    this.confirmed.emit(`${this.form.controls.name.value.trim()}${this.extension}`);
  }

  protected cancel(): void {
    this.popover().hide();
  }
}
