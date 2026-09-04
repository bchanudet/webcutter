import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';

export type WorkspaceImportChoice = 'replace' | 'import';

/** Asks the user how to load a file they picked that turns out to already be a workspace SVG
 * (has its own `<metadata><webcutter>` block) — see `SvgToGcodePage.onFileInputChange()`, which
 * opens this instead of loading the file immediately, the way a third-party SVG would be. */
@Component({
  selector: 'app-workspace-import-dialog',
  imports: [Dialog, Button, PrimeTemplate],
  templateUrl: './workspace-import-dialog.html',
  styleUrl: './workspace-import-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceImportDialog {
  protected readonly visible = signal(false);
  protected fileName = '';

  /** Fires with the user's choice — `'replace'` (wipe the current workspace, load this one in
   * full, profiles/material included) or `'import'` (merge just this file's paths into the
   * current workspace, with no profile assigned to any of them). Never fires if the user
   * cancels. */
  readonly choice = output<WorkspaceImportChoice>();

  open(fileName: string): void {
    this.fileName = fileName;
    this.visible.set(true);
  }

  protected pick(choice: WorkspaceImportChoice): void {
    this.visible.set(false);
    this.choice.emit(choice);
  }

  protected cancel(): void {
    this.visible.set(false);
  }
}
