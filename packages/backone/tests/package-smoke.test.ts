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

  it('构建产物包含入口与类型声明', () => {
    run(['bun', 'run', 'build']);
    expect(existsSync(join(packageRoot, 'dist/index.js'))).toBe(true);
    expect(existsSync(join(packageRoot, 'dist/index.d.ts'))).toBe(true);
  });
});
