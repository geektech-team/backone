import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
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

  it('throws when directory already exists', async () => {
    const name = 'test-exists';
    await initProject({
      name,
      template: 'minimal',
      skipInstall: true,
      cwd: dir,
    });
    expect(
      initProject({ name, template: 'minimal', skipInstall: true, cwd: dir })
    ).rejects.toThrow('Directory already exists');
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
