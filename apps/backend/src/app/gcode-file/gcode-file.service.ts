import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
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
 * meant to be replaced by real job history, not a permanent record. */
@Injectable()
export class GcodeFileService {
  private current: GcodeFileInfo | null = null;

  constructor() {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  get(): GcodeFileInfo | null {
    return this.current;
  }

  upload(file: Express.Multer.File): GcodeFileInfo {
    writeFileSync(STORED_FILE_PATH, file.buffer);
    this.current = {
      fileName: file.originalname,
      sizeBytes: file.size,
      commandCount: this.countCommands(file.buffer.toString('utf-8')),
    };
    return this.current;
  }

  delete(): void {
    if (existsSync(STORED_FILE_PATH)) {
      unlinkSync(STORED_FILE_PATH);
    }
    this.current = null;
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
