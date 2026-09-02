export interface GcodeFileInfo {
  fileName: string;
  sizeBytes: number;
  commandCount: number;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatFileSize(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[unitIndex]}`;
}
