import { EventEmitter } from 'events';
import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface GcodeFileInfo {
  fileName: string;
  sizeBytes: number;
  commandCount: number;
}

const UPLOAD_DIR = join(tmpdir(), 'webcutter-gcode');
const STORED_FILE_PATH = join(UPLOAD_DIR, 'current.gcode');

/** Holds the single G-code file currently uploaded, ready to be sent to the cutter — stored on
 * disk (in the OS temp dir) so it survives being referenced again by a later "start job" action
 * without keeping its whole content in memory, but only in-process (not in the database): this is
 * meant to be replaced by real job history, not a permanent record.
 *
 * Emits 'changed' (`GcodeFileInfo | null`) whenever the file is uploaded or deleted, so `CutterGateway`
 * can broadcast the new state to every browser looking at the Operation page. */
@Injectable()
export class GcodeFileService extends EventEmitter {
  private current: GcodeFileInfo | null = null;

  constructor() {
    super();
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  get(): GcodeFileInfo | null {
    return this.current;
  }

  /** The stored program's full text, or `null` if there's no file currently uploaded (e.g. for
   * `FramingService` to scan for its bounding box). */
  readContent(): string | null {
    return this.current ? readFileSync(STORED_FILE_PATH, 'utf-8') : null;
  }

  upload(file: Express.Multer.File): GcodeFileInfo {
    return this.save(file.buffer.toString('utf-8'), file.originalname);
  }

  /** Same storage + broadcast as `upload()`, for G-code that already exists as a string in this
   * process (e.g. freshly generated from a workspace SVG) — skips the round trip of the browser
   * downloading it just to immediately re-upload it as a file. */
  save(content: string, fileName: string): GcodeFileInfo {
    const buffer = Buffer.from(content, 'utf-8');
    writeFileSync(STORED_FILE_PATH, buffer);
    this.current = {
      fileName,
      sizeBytes: buffer.byteLength,
      commandCount: this.countCommands(content),
    };
    this.emit('changed', this.current);
    return this.current;
  }

  delete(): void {
    if (existsSync(STORED_FILE_PATH)) {
      unlinkSync(STORED_FILE_PATH);
    }
    this.current = null;
    this.emit('changed', this.current);
  }

  /** Number of lines that are an actual G-code instruction — skips blank lines and full-line
   * comments (`;...` or `(...)`), the two comment styles GRBL recognizes. */
  private countCommands(content: string): number {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith(';') && !line.startsWith('(')).length;
  }
}
