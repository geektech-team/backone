/**
 * init 命令：创建 BackOne 项目骨架。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as readline from 'node:readline';
import { TEMPLATES, TEMPLATE_DESCRIPTIONS } from '../templates';
import type { InitOptions, InitResult, TemplateName } from '../types';

/** 创建项目并返回结果 */
export async function initProject(options: InitOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectPath = resolve(cwd, options.name);

  if (existsSync(projectPath)) {
    throw new Error(`Directory already exists: ${projectPath}`);
  }

  const template = options.template ?? (await promptTemplate());

  // 写入模板文件
  await mkdir(projectPath, { recursive: true });
  const files = TEMPLATES[template](options.name);
  for (const file of files) {
    const filePath = join(projectPath, file.path);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
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
