import { chmod, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dir, '..');
const sourceRoot = resolve(packageRoot, 'src');
const outputDirectory = resolve(packageRoot, 'dist');

async function run(command: string[]): Promise<void> {
  const process = Bun.spawn(command, {
    cwd: packageRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed with exit code ${exitCode}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await run(['bunx', 'tsc', '--project', 'tsconfig.build.json']);

const result = await Bun.build({
  entrypoints: [resolve(sourceRoot, 'index.ts'), resolve(sourceRoot, 'cli.ts')],
  outdir: outputDirectory,
  root: sourceRoot,
  target: 'bun',
  format: 'esm',
  sourcemap: 'linked',
  splitting: true,
  packages: 'bundle',
  naming: {
    entry: '[dir]/[name].js',
    chunk: '[name]-[hash].js',
  },
});

if (!result.success) {
  const messages = result.logs.map((log) => log.message);
  throw new Error(['Bun.build failed', ...messages].join('\n'));
}

await chmod(resolve(outputDirectory, 'cli.js'), 0o755);
console.log(`Built ${result.outputs.length} CLI artifacts with Bun.`);
