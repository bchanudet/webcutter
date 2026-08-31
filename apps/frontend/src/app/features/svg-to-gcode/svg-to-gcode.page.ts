import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PrimeTemplate, TreeNode } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Card } from '@openng/optimus-ui/card';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { Message } from '@openng/optimus-ui/message';
import { Splitter } from '@openng/optimus-ui/splitter';
import { Toolbar } from '@openng/optimus-ui/toolbar';
import { Tree } from '@openng/optimus-ui/tree';
import { TablerIcon } from '../../shared/tabler-icon/tabler-icon';
import { FlattenedShape, SvgFlattenerService, SvgTreeNodeData } from './svg-flattener.service';
import { GcodeGeneratorService } from './gcode-generator.service';

interface CuttingParamsForm {
  targetWidthMm: FormControl<number>;
  feedRateMmMin: FormControl<number>;
  laserPower: FormControl<number>;
  passes: FormControl<number>;
}

interface WorkspaceDocument {
  id: string;
  fileName: string;
  source: string;
  width: number;
  height: number;
  shapes: FlattenedShape[];
  skippedTags: string[];
  treeNode: TreeNode<SvgTreeNodeData>;
}

@Component({
  selector: 'app-svg-to-gcode-page',
  imports: [
    ReactiveFormsModule,
    PrimeTemplate,
    Button,
    Card,
    InputNumber,
    Message,
    Splitter,
    Toolbar,
    Tree,
    TablerIcon,
  ],
  templateUrl: './svg-to-gcode.page.html',
  styleUrl: './svg-to-gcode.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgToGcodePage {
  private readonly flattener = inject(SvgFlattenerService);
  private readonly gcodeGenerator = inject(GcodeGeneratorService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private nextDocumentId = 0;

  // Default cutting surface until the configuration page provides the real machine size.
  protected readonly surfaceWidthMm = 100;
  protected readonly surfaceHeightMm = 100;

  protected readonly documents = signal<WorkspaceDocument[]>([]);
  protected readonly selectedNodes = signal<TreeNode<SvgTreeNodeData>[]>([]);
  protected readonly gcode = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly treeNodes = computed(() => this.documents().map((doc) => doc.treeNode));
  protected readonly skippedTags = computed(() =>
    Array.from(new Set(this.documents().flatMap((doc) => doc.skippedTags))),
  );
  /** Checkbox-selected tree node keys (documents and groups) — Optimus Tree propagates checks
   * up/down by default, so a checked ancestor's descendants are already included here too. */
  protected readonly selectedGroupKeys = computed(
    () => new Set(this.selectedNodes().map((node) => node.key as string)),
  );

  protected readonly form = new FormGroup<CuttingParamsForm>({
    targetWidthMm: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    feedRateMmMin: new FormControl(600, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    laserPower: new FormControl(300, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
    passes: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(20)],
    }),
  });

  openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  async onFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.errorMessage.set(null);
    this.gcode.set(null);

    try {
      const source = await file.text();
      const id = `doc-${this.nextDocumentId++}`;
      const result = this.flattener.flatten(id, source, file.name);

      const workspaceDocument: WorkspaceDocument = {
        id,
        fileName: file.name,
        source,
        width: result.width,
        height: result.height,
        shapes: result.shapes,
        skippedTags: result.skippedTags,
        treeNode: result.tree,
      };

      const isFirstDocument = this.documents().length === 0;
      this.documents.update((docs) => [...docs, workspaceDocument]);
      if (isFirstDocument) {
        this.form.controls.targetWidthMm.setValue(Math.round(result.width) || 100);
      }

      if (result.shapes.length === 0) {
        this.errorMessage.set(`No cuttable shape (path, rect, circle...) found in "${file.name}".`);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Could not read this SVG file.',
      );
    }
  }

  /** Scale factor from a document's own units to the millimeters shown on the grid. */
  protected previewScaleFor(document: WorkspaceDocument): number {
    if (document.width <= 0) {
      return 1;
    }
    return this.form.controls.targetWidthMm.value / document.width;
  }

  protected toPolylinePoints(shape: FlattenedShape): string {
    return shape.points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  protected isShapeSelected(shape: FlattenedShape): boolean {
    return this.selectedGroupKeys().has(shape.groupKey);
  }

  generate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const cuttableDocuments = this.documents().filter((doc) => doc.shapes.length > 0);
    if (cuttableDocuments.length === 0) {
      this.errorMessage.set('No cuttable shape found in the workspace.');
      return;
    }

    try {
      const params = this.form.getRawValue();
      const outputs = cuttableDocuments.map((doc) =>
        this.gcodeGenerator.generate(doc.shapes, doc.width, doc.height, params),
      );
      this.gcode.set(outputs.join('\n\n'));
      this.errorMessage.set(null);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Could not generate the G-code.',
      );
    }
  }

  downloadGcode(): void {
    const gcode = this.gcode();
    if (!gcode) {
      return;
    }

    this.downloadTextFile(gcode, 'workspace.gcode', 'text/plain');
  }

  saveSvg(): void {
    const documents = this.documents();
    if (documents.length === 0) {
      return;
    }

    this.downloadTextFile(this.buildConcatenatedSvg(documents), 'workspace.svg', 'image/svg+xml');
  }

  reset(): void {
    this.documents.set([]);
    this.selectedNodes.set([]);
    this.gcode.set(null);
    this.errorMessage.set(null);
    this.form.reset({ targetWidthMm: 100, feedRateMmMin: 600, laserPower: 300, passes: 1 });
  }

  /** Combines every loaded document into a single file, each kept in its own nested <svg>. */
  private buildConcatenatedSvg(documents: WorkspaceDocument[]): string {
    const serializer = new XMLSerializer();
    const nested = documents
      .map((doc) => {
        const parsed = new DOMParser().parseFromString(doc.source, 'image/svg+xml');
        const inner = Array.from(parsed.documentElement.children)
          .map((child) => serializer.serializeToString(child))
          .join('');
        return `<svg viewBox="0 0 ${doc.width} ${doc.height}" width="${doc.width}" height="${doc.height}">${inner}</svg>`;
      })
      .join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.surfaceWidthMm} ${this.surfaceHeightMm}">\n${nested}\n</svg>`;
  }

  private downloadTextFile(content: string, fileName: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}
