import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initProject } from '../src/commands/init';
import type { BackOneServer } from '../../backone/lib/server';

const frameworkRoot = resolve(import.meta.dir, '../../backone');
const root = mkdtempSync(join(tmpdir(), 'backone-controller-template-'));

beforeAll(() => {
  execFileSync(process.execPath, ['run', 'build'], {
    cwd: frameworkRoot,
    stdio: 'pipe',
  });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('Controller REST scaffold', () => {
  it('generates a runnable CRUD application using the published subpath', async () => {
    const result = await initProject({
      name: 'controller-api',
      template: 'rest-api',
      style: 'controller',
      skipInstall: true,
      cwd: root,
    });
    const scope = join(result.projectPath, 'node_modules/@geektech');
    mkdirSync(scope, { recursive: true });
    symlinkSync(frameworkRoot, join(scope, 'backone'), 'dir');
    const typesScope = join(result.projectPath, 'node_modules/@types');
    mkdirSync(typesScope, { recursive: true });
    symlinkSync(
      dirname(Bun.resolveSync('@types/bun/package.json', frameworkRoot)),
      join(typesScope, 'bun'),
      'dir'
    );
    execFileSync(
      process.execPath,
      [
        Bun.resolveSync('typescript/bin/tsc', frameworkRoot),
        '--project',
        join(result.projectPath, 'tsconfig.json'),
      ],
      { stdio: 'pipe' }
    );
    const { createApp } = (await import(
      pathToFileURL(join(result.projectPath, 'src/app.ts')).href
    )) as { createApp(): BackOneServer };
    const app = createApp();
    const send = (path: string, method = 'GET', body?: unknown) =>
      app.handle(
        new Request(`http://localhost/api/users${path}`, {
          method,
          headers:
            body === undefined ? {} : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );

    const list = await send('');
    expect(list.headers.get('x-request-id')).toBeTruthy();
    expect(await list.json()).toHaveLength(2);
    const created = await send('', 'POST', {
      name: 'Chris',
      email: 'chris@example.com',
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
      id: 3,
      name: 'Chris',
      email: 'chris@example.com',
    });
    const updated = await send('/3', 'PUT', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });
    expect(await updated.json()).toEqual({
      id: 3,
      name: 'Charlie',
      email: 'charlie@example.com',
    });
    expect((await send('', 'POST', { name: 42 })).status).toBe(400);
    expect((await send('/3', 'DELETE')).status).toBe(204);
    expect((await send('/3')).status).toBe(404);
    expect(await (await send('/1')).json()).toEqual({
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
    });
    const pkg = JSON.parse(
      readFileSync(join(result.projectPath, 'package.json'), 'utf8')
    );
    expect(pkg.engines.bun).toBe('>=1.3.10');
  });

  it('selects rest-api when only controller style is specified and preserves conflicts', async () => {
    const options = {
      name: 'controller-default',
      style: 'controller' as const,
      skipInstall: true,
      cwd: root,
    };
    const result = await initProject(options);
    expect(result.template).toBe('rest-api');
    const source = join(
      result.projectPath,
      'src/controllers/users-controller.ts'
    );
    writeFileSync(source, 'keep custom controller');
    await initProject({ ...options, confirmOverwrite: () => false });
    expect(readFileSync(source, 'utf8')).toBe('keep custom controller');
  });

  it('rejects unsupported template combinations before creating a directory', async () => {
    for (const template of ['minimal', 'websocket'] as const) {
      const name = `invalid-${template}`;
      await expect(
        initProject({
          name,
          template,
          style: 'controller',
          skipInstall: true,
          cwd: root,
        })
      ).rejects.toThrow('rest-api');
      expect(existsSync(join(root, name))).toBe(false);
    }
  });

  it('parses --style and rejects invalid or missing style values', async () => {
    const run = async (args: string[]) => {
      const proc = Bun.spawn(
        [
          process.execPath,
          '-e',
          `import { runCli } from ${JSON.stringify(resolve(import.meta.dir, '../src/cli.ts'))}; process.argv = ['bun', 'backone', ...${JSON.stringify(args)}]; await runCli();`,
        ],
        { cwd: root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }
      );
      const [code, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      return { code, stdout, stderr };
    };
    for (const [name, flags] of [
      ['invalid-style', ['--style', 'invalid']],
      ['missing-style', ['--style']],
      ['style-before-flag', ['--style', '--no-install']],
    ] as const) {
      const output = await run(['init', name, '--no-install', ...flags]);
      expect(output.code).toBe(1);
      expect(output.stderr).toContain('style');
      expect(existsSync(join(root, name))).toBe(false);
    }
    const success = await run([
      'init',
      'from-cli',
      '--template',
      'rest-api',
      '--style',
      'controller',
      '--no-install',
    ]);
    expect(success.code).toBe(0);
    expect(
      existsSync(join(root, 'from-cli/src/controllers/users-controller.ts'))
    ).toBe(true);
  });
});
