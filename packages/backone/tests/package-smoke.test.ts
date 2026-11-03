import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { packageRoot } from './paths';

interface PackageJson {
  name: string;
  version: string;
  type: string;
  files: string[];
  license: string;
  engines: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  ) as PackageJson;
}

function run(command: string[]): void {
  execFileSync(command[0], command.slice(1), {
    cwd: packageRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('package contract', () => {
  it('发布面字段符合规范', () => {
    const pkg = readPackageJson();
    expect(pkg.name).toBe('@geektech/backone');
    expect(pkg.type).toBe('module');
    expect(pkg.files).toEqual(
      expect.arrayContaining(['dist', 'README.md', 'README-zh.md', 'LICENSE'])
    );
    expect(pkg.license).toBe('MIT');
    expect(pkg.engines.bun).toBe('>=1.3.0');
  });

  it('零运行时依赖', () => {
    const pkg = readPackageJson();
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toBeUndefined();
    expect(pkg.optionalDependencies).toBeUndefined();
  });

  it('导出 name/version 与 package.json 一致', async () => {
    const { name, version } = await import('../lib/index');
    expect(name).toBe('@geektech/backone');
    expect(version).toBe(readPackageJson().version);
  });

  it('构建产物包含入口与类型声明，装饰器与主入口可组合使用', async () => {
    run(['bun', 'run', 'build']);
    expect(existsSync(join(packageRoot, 'dist/index.js'))).toBe(true);
    expect(existsSync(join(packageRoot, 'dist/index.d.ts'))).toBe(true);
    expect(existsSync(join(packageRoot, 'dist/decorators/index.d.ts'))).toBe(
      true
    );

    const { createServer, HttpError } = (await import(
      new URL('../dist/index.js', import.meta.url).href
    )) as typeof import('../lib/index');
    const {
      Controller,
      Get,
      Validate,
      Status,
      Header,
      Module,
      registerModules,
    } = (await import(
      new URL('../dist/decorators/index.js', import.meta.url).href
    )) as typeof import('../lib/decorators');
    @Controller('/built')
    class Built {
      @Get() get() {
        throw new HttpError(409, 'Built package conflict');
      }

      @Get('/validation')
      @Validate({
        query: {
          parse() {
            throw new Error('invalid query');
          },
        },
      })
      validation() {
        return 'must not execute';
      }

      @Get('/system')
      @Header('x-built', 'yes')
      @Status(201)
      system() {
        return { works: true };
      }
    }
    @Module<BuiltModule>({ controllers: (module) => [module.controller] })
    class BuiltModule {
      readonly controller = new Built();
    }
    const app = createServer();
    const registration = registerModules(app, [new BuiltModule()]);
    expect(registration.modules).toEqual([{ name: 'BuiltModule', prefix: '' }]);
    expect(registration.routes).toHaveLength(3);
    const response = await app.handle(new Request('http://localhost/built'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Built package conflict',
      status: 409,
    });
    expect(
      (await app.handle(new Request('http://localhost/built/validation')))
        .status
    ).toBe(400);
    const system = await app.handle(
      new Request('http://localhost/built/system')
    );
    expect(system.status).toBe(201);
    expect(system.headers.get('x-built')).toBe('yes');
    expect(await system.json()).toEqual({ works: true });
  });
});
