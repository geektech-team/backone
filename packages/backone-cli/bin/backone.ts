#!/usr/bin/env bun
import { existsSync } from 'node:fs';

const builtCli = new URL('../dist/cli.js', import.meta.url);
const sourceCli = new URL('../src/cli.ts', import.meta.url);
const cli = (await import(
  existsSync(builtCli) ? builtCli.href : sourceCli.href
)) as {
  runCli: () => Promise<void>;
};

await cli.runCli();
