/**
 * init 命令：创建 BackOne 项目骨架。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as readline from 'node:readline';
import { TEMPLATES, TEMPLATE_DESCRIPTIONS } from '../templates';
import { controllerRestTemplate } from '../controller-template';
import type { InitOptions, InitResult, TemplateName } from '../types';

/** 创建项目并返回结果 */
export async function initProject(options: InitOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectPath = resolve(cwd, options.name);

  if (existsSync(projectPath) && !lstatSync(projectPath).isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectPath}`);
  }

  const style = options.style ?? 'functional';
  if (style !== 'functional' && style !== 'controller') {
    throw new Error(`Unknown project style: ${style}`);
  }
  const template =
    options.template ??
    (style === 'controller' ? 'rest-api' : await promptTemplate());
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, template)) {
    throw new Error(`Unknown template: ${template}`);
  }
  if (style === 'controller' && template !== 'rest-api') {
    throw new Error('Controller style requires the rest-api template');
  }

  // 写入模板文件
  await mkdir(projectPath, { recursive: true });
  const files =
    style === 'controller'
      ? controllerRestTemplate(options.name)
      : TEMPLATES[template](options.name);
  for (const file of files) {
    const filePath = join(projectPath, file.path);
    await mkdir(join(filePath, '..'), { recursive: true });
    try {
      await writeFile(filePath, file.content, {
        encoding: 'utf-8',
        flag: 'wx',
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (!lstatSync(filePath).isFile()) {
        throw new Error(`Template path is not a regular file: ${filePath}`);
      }

      const overwrite = await (options.confirmOverwrite ?? promptOverwrite)(
        file.path
      );
      if (overwrite) {
        await writeFile(filePath, file.content, 'utf-8');
      } else {
        console.log(`Skipped existing file: ${file.path}`);
      }
    }
  }

  // 安装依赖
  let installed = false;
  if (!options.skipInstall) {
    const proc = Bun.spawn(['bun', 'install'], {
      cwd: projectPath,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    installed = (await proc.exited) === 0;
    if (!installed) {
      console.warn(
        'Warning: bun install failed, you may need to run it manually.'
      );
    }
  }

  return { projectPath, template, installed };
}

/** 逐个确认覆盖已有文件，默认保留（非 TTY 不询问） */
async function promptOverwrite(filePath: string): Promise<boolean> {
  if (
    !process.stdin.isTTY ||
    process.stdin.readableEnded ||
    process.stdin.destroyed
  ) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.once('close', () => resolve(false));
    rl.question(`File already exists: ${filePath}. Overwrite? (y/N): `, (a) => {
      resolve(/^(y|yes)$/i.test(a.trim()));
      rl.close();
    });
  });
}

/** 交互式选择模板（非 TTY 时默认 minimal） */
async function promptTemplate(): Promise<TemplateName> {
  if (!process.stdin.isTTY) {
    return 'minimal';
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Select a template:');
  const entries = Object.entries(TEMPLATE_DESCRIPTIONS) as [
    TemplateName,
    string,
  ][];
  entries.forEach(([, desc], i) => {
    console.log(`  ${i + 1}. ${desc}`);
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Enter choice (1-3, default 1): ', (a) => resolve(a.trim()));
  });
  rl.close();

  const idx = Math.max(
    0,
    Math.min(entries.length - 1, (Number(answer) || 1) - 1)
  );
  return entries[idx][0];
}
