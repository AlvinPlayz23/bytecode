export function isWindowsDrivePath(inputPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(inputPath);
}

export function normalizePath(inputPath: string): string {
  if (!inputPath) {
    return inputPath;
  }

  return inputPath.trim();
}

export function normalizeOptionalPath(inputPath?: string): string | undefined {
  if (!inputPath) {
    return undefined;
  }

  const trimmed = inputPath.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
