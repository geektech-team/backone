import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function findRepoRoot(start: string): string {
  let current = start;

  while (current !== dirname(current)) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }

    current = dirname(current);
  }

  throw new Error(`Unable to find repository root from ${start}`);
}

export const repoRoot = findRepoRoot(import.meta.dir);
export const packageRoot = join(repoRoot, 'packages', 'backone');

export function repoPath(...segments: string[]): string {
  return join(repoRoot, ...segments);
}

export function packagePath(...segments: string[]): string {
  return join(packageRoot, ...segments);
}
