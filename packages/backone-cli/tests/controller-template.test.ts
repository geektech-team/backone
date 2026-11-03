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
import type { TemplateName } from '../src/types';
import type { BackOneServer } from '../../backone/lib/server';
import type { Database } from '../../backone-utils/lib/db/database';

const frameworkRoot = resolve(import.meta.dir, '../../backone');
const utilsRoot = resolve(import.meta.dir, '../../backone-utils');
const root = mkdtempSync(join(tmpdir(), 'backone class template-'));
const applications: GeneratedApplication[] = [];

interface ApplicationOptions {
  port?: number;
  hostname?: string;
  databaseUrl?: string;
}
interface GeneratedApplication {
  server: BackOneServer;
  database?: Database;
  initialize(): Promise<GeneratedApplication>;
  start(): Promise<number>;
  stop(): Promise<void>;
}
interface GeneratedModule {
  Application: new (options?: ApplicationOptions) => GeneratedApplication;
}

beforeAll(() => {
  for (const cwd of [frameworkRoot, utilsRoot]) {
    execFileSync(process.execPath, ['run', 'build'], { cwd, stdio: 'pipe' });
  }
}, 20_000);
afterAll(async () => {
  await Promise.all(applications.map((app) => app.stop()));
  rmSync(root, { recursive: true, force: true });
});

async function scaffold(name: string, template: TemplateName) {
  const result = await initProject({
    name,
    template,
    skipInstall: true,
    cwd: root,
  });
  const scope = join(result.projectPath, 'node_modules/@geektech');
  mkdirSync(scope, { recursive: true });
  symlinkSync(frameworkRoot, join(scope, 'backone'), 'dir');
  symlinkSync(utilsRoot, join(scope, 'backone-utils'), 'dir');
  const typesScope = join(result.projectPath, 'node_modules/@types');
  mkdirSync(typesScope, { recursive: true });
  symlinkSync(
    dirname(Bun.resolveSync('@types/bun/package.json', frameworkRoot)),
    join(typesScope, 'bun'),
    'dir'
  );
  typecheck(result.projectPath);
  const module = (await import(
    pathToFileURL(join(result.projectPath, 'src/app.ts')).href
  )) as GeneratedModule;
  const create = (options?: ApplicationOptions) => {
    const app = new module.Application(
      template === 'rest-api'
        ? { databaseUrl: ':memory:', ...options }
        : options
    );
    applications.push(app);
    return app;
  };
  return { ...result, create };
}

function typecheck(projectPath: string, extra: string[] = []) {
  execFileSync(
    process.execPath,
    [
      Bun.resolveSync('typescript/bin/tsc', frameworkRoot),
      '--project',
      join(projectPath, 'tsconfig.json'),
      ...extra,
    ],
    { stdio: 'pipe' }
  );
}

function send(
  app: GeneratedApplication,
  path = '',
  method = 'GET',
  body?: unknown
) {
  return app.server.handle(
    new Request(`http://localhost/api/users${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

async function json(response: Promise<Response>) {
  return (await response).json();
}

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('WebSocket message timeout')),
      2000
    );
    socket.addEventListener(
      'message',
      (event) => {
        clearTimeout(timer);
        resolve(String(event.data));
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('WebSocket failed'));
      },
      { once: true }
    );
  });
}

describe('Class based scaffolds', () => {
  it('generates a default SQLite REST application with published packages and CRUD policy', async () => {
    const generated = await scaffold('rest-default', 'rest-api');
    const app = generated.create();
    expect(app.server.port).toBeNull();
    await app.initialize();
    const list = await send(app);
    expect(list.headers.get('x-controller-style')).toBe('system');
    expect(list.headers.get('x-request-id')).toBeTruthy();
    expect(await list.json()).toHaveLength(2);
    const created = await send(app, '', 'POST', {
      name: ' Chris ',
      email: 'chris@example.com',
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
      id: 3,
      name: 'Chris',
      email: 'chris@example.com',
    });
    expect(
      await json(
        send(app, '/3', 'PUT', {
          name: 'Charlie',
          email: 'charlie@example.com',
        })
      )
    ).toEqual({ id: 3, name: 'Charlie', email: 'charlie@example.com' });
    expect((await send(app, '', 'POST', { name: 42 })).status).toBe(400);
    expect((await send(app, '/bad')).status).toBe(400);
    expect((await send(app, '/3', 'DELETE')).status).toBe(204);
    expect((await send(app, '/3')).status).toBe(404);
    expect(await json(send(app, '/1'))).toEqual({
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
    });
    const pkg = JSON.parse(
      readFileSync(join(generated.projectPath, 'package.json'), 'utf8')
    );
    expect(pkg.engines.bun).toBe('>=1.3.10');
    expect(pkg.dependencies['@geektech/backone-utils']).toBeDefined();

    // Standard metadata works after tsc emit as well as direct Bun source loading.
    typecheck(generated.projectPath, [
      '--noEmit',
      'false',
      '--outDir',
      join(generated.projectPath, 'compiled'),
    ]);
    const compiled = (await import(
      pathToFileURL(join(generated.projectPath, 'compiled/app.js')).href
    )) as GeneratedModule;
    const emitted = new compiled.Application({ databaseUrl: ':memory:' });
    applications.push(emitted);
    await emitted.initialize();
    expect(await json(send(emitted))).toHaveLength(2);
    expect((await send(emitted)).headers.get('x-controller-style')).toBe(
      'system'
    );
  });

  it('exposes a feature module that mounts independently under the caller prefix', async () => {
    const generated = await scaffold('rest-module-mount', 'rest-api');
    const owner = generated.create();
    const database = owner.database;
    if (!database) throw new Error('REST scaffold must own a database');
    const { UsersModule } = (await import(
      pathToFileURL(
        join(generated.projectPath, 'src/modules/users/users-module.ts')
      ).href
    )) as {
      UsersModule: new (database: Database) => { initialize(): Promise<void> };
    };
    const { BackOneServer } = (await import(
      pathToFileURL(join(frameworkRoot, 'dist/index.js')).href
    )) as typeof import('../../backone/lib/index');
    const { registerModules } = (await import(
      pathToFileURL(join(frameworkRoot, 'dist/decorators/index.js')).href
    )) as typeof import('../../backone/lib/decorators');
    const server = new BackOneServer();
    server.usePrefix('/v2');
    const users = new UsersModule(database);
    await users.initialize();
    const registration = registerModules(server, [users]);
    expect(registration.modules).toEqual([
      { name: 'UsersModule', prefix: '/v2/api' },
    ]);
    expect(registration.routes).toHaveLength(5);
    expect(server.prefix).toBe('/v2');
    const response = await server.handle(
      new Request('http://localhost/v2/api/users')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(2);
    expect(
      (await server.handle(new Request('http://localhost/api/users'))).status
    ).toBe(404);
    expect(registerModules(server, [users]).routes).toEqual([]);
    await server.close();
  });

  it('shares concurrent initialization, isolates application data, and closes once', async () => {
    const generated = await scaffold('isolated-rest', 'rest-api');
    const first = generated.create();
    const second = generated.create();
    await Promise.all([
      first.initialize(),
      first.initialize(),
      first.initialize(),
      second.initialize(),
    ]);
    expect(await json(send(first))).toHaveLength(2);
    await send(first, '', 'POST', {
      name: 'Third',
      email: 'third@example.com',
    });
    expect(await json(send(first))).toHaveLength(3);
    expect(await json(send(second))).toHaveLength(2);
    const stopping = first.stop();
    expect(first.stop()).toBe(stopping);
    await stopping;
    expect(first.database?.isClosed).toBe(true);
    await expect(first.initialize()).rejects.toThrow('closed');
    await expect(first.start()).rejects.toThrow('closed');
  });

  it('persists SQLite data between application instances without duplicating seeds', async () => {
    const generated = await scaffold('persistent-rest', 'rest-api');
    const databaseUrl = join(generated.projectPath, 'users.sqlite');
    const first = generated.create({ databaseUrl });
    await first.initialize();
    await send(first, '', 'POST', {
      name: 'Persisted',
      email: 'persisted@example.com',
    });
    await first.stop();
    const second = generated.create({ databaseUrl });
    await second.initialize();
    const users = (await json(send(second))) as Array<{ name: string }>;
    expect(users).toHaveLength(3);
    expect(users[2]?.name).toBe('Persisted');
  });

  it('closes owned resources on failed initialization or failed listen', async () => {
    const generated = await scaffold('failed-rest', 'rest-api');
    const brokenSchema = generated.create();
    await brokenSchema.database?.raw('CREATE TABLE users (bad TEXT)');
    await expect(brokenSchema.initialize()).rejects.toThrow();
    expect(brokenSchema.database?.isClosed).toBe(true);
    await brokenSchema.stop();
    const invalidPort = generated.create({ port: -1 });
    await expect(invalidPort.start()).rejects.toThrow();
    expect(invalidPort.database?.isClosed).toBe(true);
    expect(invalidPort.server.port).toBeNull();
  });

  it('coordinates stop with unfinished initialization and startup', async () => {
    const generated = await scaffold('stopped-rest', 'rest-api');
    const initializing = generated.create();
    const pending = initializing.initialize();
    const closed = initializing.stop();
    await expect(pending).rejects.toThrow('closed');
    await closed;
    expect(initializing.database?.isClosed).toBe(true);
    const starting = generated.create({ port: 0, hostname: '127.0.0.1' });
    const pendingStart = starting.start();
    await starting.stop();
    await expect(pendingStart).rejects.toThrow('closed');
    expect(starting.server.port).toBeNull();
    expect(starting.database?.isClosed).toBe(true);
  });

  it('generates a typechecked minimal controller with a side effect free application', async () => {
    const generated = await scaffold('minimal-default', 'minimal');
    const app = generated.create();
    expect(app.server.port).toBeNull();
    await app.initialize();
    const response = await app.server.handle(new Request('http://localhost/'));
    expect(await response.text()).toBe('Hello, BackOne!');
    await app.stop();
    await expect(app.start()).rejects.toThrow('closed');
  });

  it('generates a typechecked Gateway and service that serve the browser client and broadcast', async () => {
    const generated = await scaffold('websocket-default', 'websocket');
    const app = generated.create({ port: 0, hostname: '127.0.0.1' });
    expect(app.server.port).toBeNull();
    const [port, samePort] = await Promise.all([app.start(), app.start()]);
    expect(port).toBe(samePort);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('BackOne WebSocket Chat');
    const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`);
    try {
      expect(await nextMessage(socket)).toContain('1 online');
      const message = nextMessage(socket);
      socket.send('hello');
      expect(await message).toBe('User: hello');
    } finally {
      socket.close();
      await app.stop();
    }
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
      'src/modules/users/users-controller.ts'
    );
    writeFileSync(source, 'keep custom controller');
    await initProject({ ...options, confirmOverwrite: () => false });
    expect(readFileSync(source, 'utf8')).toBe('keep custom controller');
  });

  it('supports explicit controller style across all templates', async () => {
    for (const template of ['minimal', 'websocket'] as const) {
      const name = `explicit-${template}`;
      await initProject({
        name,
        template,
        style: 'controller',
        skipInstall: true,
        cwd: root,
      });
      expect(existsSync(join(root, name, 'src/app.ts'))).toBe(true);
    }
  });

  it('parses --style, reports the removed functional scaffold, and rejects missing values', async () => {
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
      ['legacy-functional', ['--style', 'functional']],
    ] as const) {
      const output = await run(['init', name, '--no-install', ...flags]);
      expect(output.code).toBe(1);
      expect(output.stderr).toContain('style');
      expect(existsSync(join(root, name))).toBe(false);
      if (name === 'legacy-functional')
        expect(output.stderr).toContain('class-based templates');
    }
    const success = await run(['init', 'from-cli', '--no-install']);
    expect(success.code).toBe(0);
    expect(
      existsSync(join(root, 'from-cli/src/modules/home/home-controller.ts'))
    ).toBe(true);
  });
});
