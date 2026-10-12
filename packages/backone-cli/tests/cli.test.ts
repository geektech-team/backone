import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { initProject } from '../src/commands/init';
import { TEMPLATES, TEMPLATE_DESCRIPTIONS } from '../src/templates';
import type { TemplateName } from '../src/types';

describe('initProject', () => {
  const dir = mkdtempSync(join(tmpdir(), 'backone-cli-'));

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const templates: TemplateName[] = ['minimal', 'rest-api', 'websocket'];

  for (const template of templates) {
    it(`creates ${template} project`, async () => {
      const name = `test-${template}`;
      const result = await initProject({
        name,
        template,
        skipInstall: true,
        cwd: dir,
      });

      expect(result.template).toBe(template);
      expect(result.installed).toBe(false);
      expect(existsSync(result.projectPath)).toBe(true);

      // 关键文件存在
      expect(existsSync(join(result.projectPath, 'package.json'))).toBe(true);
      expect(existsSync(join(result.projectPath, 'tsconfig.json'))).toBe(true);
      expect(existsSync(join(result.projectPath, 'src/index.ts'))).toBe(true);
      expect(existsSync(join(result.projectPath, 'README.md'))).toBe(true);
      expect(existsSync(join(result.projectPath, '.gitignore'))).toBe(true);

      // package.json 内容正确
      const pkg = JSON.parse(
        readFileSync(join(result.projectPath, 'package.json'), 'utf-8')
      );
      expect(pkg.name).toBe(name);
      expect(pkg.dependencies['@geektech/backone']).toBeDefined();
      expect(pkg.scripts.dev).toBe('bun --watch src/index.ts');

      // src/index.ts 包含 createServer
      const index = readFileSync(
        join(result.projectPath, 'src/index.ts'),
        'utf-8'
      );
      expect(index).toContain('createServer');
    });
  }

  it('websocket template includes public/index.html', async () => {
    const name = 'test-ws-public';
    const result = await initProject({
      name,
      template: 'websocket',
      skipInstall: true,
      cwd: dir,
    });
    expect(existsSync(join(result.projectPath, 'public/index.html'))).toBe(
      true
    );
  });

  it('rest-api template includes route group', async () => {
    const name = 'test-rest-group';
    const result = await initProject({
      name,
      template: 'rest-api',
      skipInstall: true,
      cwd: dir,
    });
    const index = readFileSync(
      join(result.projectPath, 'src/index.ts'),
      'utf-8'
    );
    expect(index).toContain('app.group');
    expect(index).toContain('/api');
  });

  it('initializes an existing empty directory without confirmation', async () => {
    const name = 'test-empty-directory';
    mkdirSync(join(dir, name));

    const result = await initProject({
      name,
      template: 'minimal',
      skipInstall: true,
      cwd: dir,
      confirmOverwrite: () => {
        throw new Error('Unexpected overwrite confirmation');
      },
    });

    expect(existsSync(join(result.projectPath, 'src/index.ts'))).toBe(true);
  });

  it('overwrites only confirmed files and preserves other existing files', async () => {
    const name = 'test-confirm-overwrite';
    const projectPath = join(dir, name);
    mkdirSync(join(projectPath, 'src'), { recursive: true });
    writeFileSync(join(projectPath, 'package.json'), 'original package');
    writeFileSync(join(projectPath, 'src/index.ts'), 'original source');
    writeFileSync(join(projectPath, 'notes.txt'), 'keep these notes');
    const conflicts: string[] = [];

    await initProject({
      name,
      template: 'minimal',
      skipInstall: true,
      cwd: dir,
      confirmOverwrite: async (filePath) => {
        conflicts.push(filePath);
        return filePath === 'package.json';
      },
    });

    expect(conflicts.sort()).toEqual(['package.json', 'src/index.ts']);
    const pkg = JSON.parse(
      readFileSync(join(projectPath, 'package.json'), 'utf-8')
    );
    expect(pkg.name).toBe(name);
    expect(readFileSync(join(projectPath, 'src/index.ts'), 'utf-8')).toBe(
      'original source'
    );
    expect(readFileSync(join(projectPath, 'notes.txt'), 'utf-8')).toBe(
      'keep these notes'
    );
    expect(existsSync(join(projectPath, 'tsconfig.json'))).toBe(true);
  });

  it('preserves conflicting files without a TTY or overwrite callback', async () => {
    const name = 'test-non-interactive';
    const projectPath = join(dir, name);
    mkdirSync(projectPath);
    writeFileSync(join(projectPath, 'package.json'), 'original package');

    const proc = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { initProject } from ${JSON.stringify(
          join(import.meta.dir, '../src/commands/init.ts')
        )}; await initProject({ name: ${JSON.stringify(name)}, template: 'minimal', skipInstall: true });`,
      ],
      { cwd: dir, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }
    );

    expect(await proc.exited).toBe(0);
    expect(readFileSync(join(projectPath, 'package.json'), 'utf-8')).toBe(
      'original package'
    );
    expect(existsSync(join(projectPath, 'src/index.ts'))).toBe(true);
  });

  it('rejects a file used as the project directory', async () => {
    const name = 'test-file-target';
    writeFileSync(join(dir, name), 'keep target file');

    await expect(
      initProject({ name, template: 'minimal', skipInstall: true, cwd: dir })
    ).rejects.toThrow('not a directory');
    expect(readFileSync(join(dir, name), 'utf-8')).toBe('keep target file');
  });

  it('rejects a directory used as a template file', async () => {
    const name = 'test-directory-conflict';
    mkdirSync(join(dir, name, 'package.json'), { recursive: true });
    writeFileSync(join(dir, name, 'package.json/notes.txt'), 'keep notes');

    await expect(
      initProject({
        name,
        template: 'minimal',
        skipInstall: true,
        cwd: dir,
        confirmOverwrite: () => true,
      })
    ).rejects.toThrow('not a regular file');
    expect(
      readFileSync(join(dir, name, 'package.json/notes.txt'), 'utf-8')
    ).toBe('keep notes');
  });

  it('keeps all files when overwrite confirmation is declined', async () => {
    const name = 'test-decline-overwrite';
    await initProject({
      name,
      template: 'minimal',
      skipInstall: true,
      cwd: dir,
    });
    writeFileSync(join(dir, name, 'README.md'), 'custom readme');

    await initProject({
      name,
      template: 'minimal',
      skipInstall: true,
      cwd: dir,
      confirmOverwrite: () => false,
    });

    expect(readFileSync(join(dir, name, 'README.md'), 'utf-8')).toBe(
      'custom readme'
    );
  });
});

describe('templates', () => {
  it('all templates have descriptions', () => {
    expect(Object.keys(TEMPLATES)).toEqual([
      'minimal',
      'rest-api',
      'websocket',
    ]);
    for (const key of Object.keys(TEMPLATES)) {
      expect(TEMPLATE_DESCRIPTIONS[key as TemplateName]).toBeDefined();
    }
  });

  it('template files are non-empty', () => {
    for (const generator of Object.values(TEMPLATES)) {
      const files = generator('test-project');
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.content.length).toBeGreaterThan(0);
        expect(file.path.length).toBeGreaterThan(0);
      }
    }
  });
});
