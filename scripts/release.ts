#!/usr/bin/env bun
/**
 * BackOne monorepo 外层发布脚本。
 *
 * 在仓库根目录使用：
 *   bun run release --package <backone|backone-utils|backone-cli> --bump <major|minor|patch>
 *
 * 操作（执行顺序固定为 bump → build → publish）：
 *   --package <pkg>             必填，目标包
 *   --bump <major|minor|patch>  升级主 / 功能 / 修复版本号并同步硬编码引用；
 *                               未加 --no-* 时隐含执行构建与发布（一条命令完成全流程）
 *   --build                     仅构建目标包（不升版本）
 *   --publish                   仅发布目标包（不升版本，发布前自动构建）
 *   --no-build / --no-publish   与 --bump 组合时跳过对应阶段
 *   --dry-run                   只打印将要执行的步骤，不写入任何文件、不发布
 *
 * 示例：
 *   bun run release --package backone --bump patch            # 升版本 + 构建 + 发布
 *   bun run release --package backone-utils --bump minor --no-publish
 *   bun run release --package backone-cli --build             # 仅构建
 *   bun run release --package backone --bump major --dry-run  # 演练，不落盘
 *
 * 说明：
 *   - 版本升级时会同步该包已知的硬编码版本引用：
 *       backone        packages/backone/package.json、lib/index.ts，
 *                      以及 backone-cli 模板中 @geektech/backone 的 caret 范围
 *       backone-utils  packages/backone-utils/package.json、lib/index.ts
 *       backone-cli     packages/backone-cli/package.json、src/cli.ts
 *   - 发布使用 Bun 原生的 `bun publish`，需要已登录 npm（bun pm whoami）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');

const PACKAGES: Record<string, { dir: string; name: string }> = {
  backone: { dir: 'packages/backone', name: '@geektech/backone' },
  'backone-utils': { dir: 'packages/backone-utils', name: '@geektech/backone-utils' },
  'backone-cli': { dir: 'packages/backone-cli', name: '@geektech/backone-cli' },
};

const BUMP_TYPES = ['major', 'minor', 'patch'] as const;
type BumpType = (typeof BUMP_TYPES)[number];

interface CliArgs {
  pkg: string | null;
  bump: BumpType | null;
  build: boolean;
  publish: boolean;
  noBuild: boolean;
  noPublish: boolean;
  dryRun: boolean;
}

function printHelp(): void {
  console.log(
    [
      '用法：bun run release --package <backone|backone-utils|backone-cli> --bump <major|minor|patch>',
      '',
      '操作（执行顺序：bump → build → publish）：',
      '  --package <pkg>             必填，目标包',
      '  --bump <major|minor|patch>  升级版本号并同步硬编码引用；隐含构建与发布',
      '  --build                     仅构建目标包',
      '  --publish                   仅发布目标包（发布前自动构建）',
      '  --no-build / --no-publish   与 --bump 组合时跳过对应阶段',
      '  --dry-run                   演练模式：不写入文件、不发布',
      '',
      '示例：',
      '  bun run release --package backone --bump patch',
      '  bun run release --package backone-utils --bump minor --no-publish',
      '  bun run release --package backone-cli --build',
      '  bun run release --package backone --bump major --dry-run',
    ].join('\n')
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    pkg: null,
    bump: null,
    build: false,
    publish: false,
    noBuild: false,
    noPublish: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--package':
      case '--pkg': {
        const value = argv[++i];
        if (value === undefined) {
          fail(`参数 ${arg} 需要包名`);
        }
        args.pkg = normalizePackage(value);
        if (!args.pkg) {
          fail(`未知包：${value}（可选 backone | backone-utils | backone-cli）`);
        }
        break;
      }
      case '--build':
        args.build = true;
        break;
      case '--publish':
        args.publish = true;
        break;
      case '--no-build':
        args.noBuild = true;
        break;
      case '--no-publish':
        args.noPublish = true;
        break;
      case '--bump': {
        const value = argv[++i];
        if (!value || !(BUMP_TYPES as readonly string[]).includes(value)) {
          fail(`--bump 需要 major | minor | patch，收到：${value}`);
        }
        args.bump = value as BumpType;
        break;
      }
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        fail(`未知参数：${arg}`);
    }
  }
  return args;
}

function fail(message: string): never {
  console.error(`错误：${message}`);
  console.error('');
  printHelp();
  process.exit(1);
}

function normalizePackage(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/^@geektech\//, '');
  return key in PACKAGES ? key : null;
}

function readManifest(dir: string): { version: string } {
  const path = join(REPO_ROOT, dir, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8')) as { version: string };
}

function bumpVersion(version: string, type: BumpType): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    fail(`无法解析语义化版本号：${version}`);
  }
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function runBun(args: string[], cwd: string): void {
  const result = spawnSync('bun', args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

interface SyncTarget {
  file: string;
  from: string;
  to: string;
}

function syncFile(target: SyncTarget, dryRun: boolean): void {
  const abs = join(REPO_ROOT, target.file);
  if (!existsSync(abs)) {
    fail(`同步失败：文件不存在 ${target.file}`);
  }
  const content = readFileSync(abs, 'utf8');
  if (!content.includes(target.from)) {
    fail(`同步失败：${target.file} 中未找到「${target.from}」`);
  }
  if (dryRun) {
    console.log(`  [dry-run] ${target.file}`);
    console.log(`      ${target.from} -> ${target.to}`);
    return;
  }
  writeFileSync(abs, content.split(target.from).join(target.to));
  console.log(`  已更新 ${target.file}`);
  console.log(`      ${target.from} -> ${target.to}`);
}

function syncForBump(pkgKey: string, oldVersion: string, newVersion: string, dryRun: boolean): void {
  const targets: SyncTarget[] = [];

  if (pkgKey === 'backone') {
    targets.push(
      { file: 'packages/backone/package.json', from: `"version": "${oldVersion}"`, to: `"version": "${newVersion}"` },
      { file: 'packages/backone/lib/index.ts', from: `export const version = '${oldVersion}';`, to: `export const version = '${newVersion}';` },
      // backone-cli 模板对 @geektech/backone 的 caret 范围随 backone 版本同步
      { file: 'packages/backone-cli/src/templates.ts', from: `'@geektech/backone': '^${oldVersion}',`, to: `'@geektech/backone': '^${newVersion}',` }
    );
  } else if (pkgKey === 'backone-utils') {
    targets.push(
      { file: 'packages/backone-utils/package.json', from: `"version": "${oldVersion}"`, to: `"version": "${newVersion}"` },
      { file: 'packages/backone-utils/lib/index.ts', from: `export const version = '${oldVersion}';`, to: `export const version = '${newVersion}';` }
    );
  } else if (pkgKey === 'backone-cli') {
    targets.push(
      { file: 'packages/backone-cli/package.json', from: `"version": "${oldVersion}"`, to: `"version": "${newVersion}"` },
      { file: 'packages/backone-cli/src/cli.ts', from: `const VERSION = '${oldVersion}';`, to: `const VERSION = '${newVersion}';` }
    );
  }

  for (const target of targets) {
    syncFile(target, dryRun);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.pkg) {
    fail('请用 --package 指定目标包（backone | backone-utils | backone-cli）');
  }

  const bumpRequested = args.bump !== null;
  // --bump 默认隐含构建与发布；--no-build / --no-publish 可跳过对应阶段
  const buildRequested = args.build || (bumpRequested && !args.noBuild);
  const publishRequested = args.publish || (bumpRequested && !args.noPublish);

  if (!bumpRequested && !buildRequested && !publishRequested) {
    fail('请至少指定一个操作：--bump <major|minor|patch> / --build / --publish');
  }

  const pkg = PACKAGES[args.pkg];
  const version = readManifest(pkg.dir).version;
  console.log(`目标包：${pkg.name}（${pkg.dir}）  当前版本：${version}`);
  if (args.dryRun) {
    console.log('[演练模式 --dry-run，不会写入或发布]');
  }

  const totalSteps = [bumpRequested, buildRequested, publishRequested].filter(Boolean).length;
  let step = 0;

  if (args.bump) {
    step += 1;
    const newVersion = bumpVersion(version, args.bump);
    console.log(`\n== ${step}/${totalSteps} 升级版本号：${version} -> ${newVersion}（${args.bump}）==`);
    syncForBump(args.pkg, version, newVersion, args.dryRun);
    if (args.dryRun) {
      console.log('  [dry-run] 运行 bun install 同步 lockfile');
    } else {
      console.log('  运行 bun install 同步 lockfile…');
      runBun(['install'], REPO_ROOT);
      console.log('  版本升级完成。');
    }
  }

  if (buildRequested) {
    step += 1;
    console.log(`\n== ${step}/${totalSteps} 构建 ${pkg.name} ==`);
    if (args.dryRun) {
      console.log(`  [dry-run] bun run --cwd ${pkg.dir} build`);
    } else {
      runBun(['run', 'build'], join(REPO_ROOT, pkg.dir));
      console.log('  构建完成。');
    }
  }

  if (publishRequested) {
    step += 1;
    console.log(`\n== ${step}/${totalSteps} 发布 ${pkg.name} ==`);
    if (args.dryRun) {
      console.log(`  [dry-run] bun publish（cwd: ${pkg.dir}）`);
    } else {
      if (!buildRequested) {
        console.log('  未执行构建，发布前自动构建…');
        runBun(['run', 'build'], join(REPO_ROOT, pkg.dir));
      }
      console.log('  执行 bun publish…（需要已登录 npm）');
      runBun(['publish'], join(REPO_ROOT, pkg.dir));
      console.log('  发布完成。');
    }
  }

  console.log('\n全部完成。');
}

main();
