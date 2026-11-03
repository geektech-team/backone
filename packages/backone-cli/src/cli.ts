/**
 * CLI 入口：解析命令行参数并分发命令。
 */

import { initProject } from './commands/init';
import type { ProjectStyle, TemplateName } from './types';

const VERSION = '0.4.0';

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return;
  }

  if (command === '--help' || command === '-h' || command === undefined) {
    printHelp();
    return;
  }

  if (command === 'init') {
    const name = args[1];
    if (!name) {
      console.error('Error: project name is required');
      console.error(
        'Usage: backone init <project-name> [--template <t>] [--style <s>] [--no-install]'
      );
      process.exit(1);
    }

    const skipInstall = args.includes('--no-install');

    try {
      const template = parseFlag(args, '--template') as
        TemplateName | undefined;
      const style = parseFlag(args, '--style') as ProjectStyle | undefined;
      const result = await initProject({ name, template, style, skipInstall });
      console.log(`\n  Initialized ${name} using ${result.template} template`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${name}`);
      if (!result.installed) console.log(`  bun install`);
      console.log(`  bun run dev`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1) {
    const value = args[idx + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`A value is required for ${flag}`);
    }
    return value;
  }
  return undefined;
}

function printHelp(): void {
  console.log(`BackOne CLI v${VERSION}

Usage:
  backone init <project-name> [options]  Create a new BackOne project
  backone --version                        Show version
  backone --help                           Show this help

Options:
  --template <name>   Template: minimal | rest-api | websocket
  --style <name>      Style: controller (all templates use classes by default)
  --no-install        Skip bun install
`);
}
